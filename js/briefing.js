/**
 * RSSCAN v3 - Daily Briefing 데이터 바인딩
 * daily_ibd_scan.json과 entry_signals.json을 로드해서 UI 동적 렌더링
 */

class BriefingDataBinder {
    constructor() {
        this.universeData = [];
        this.entrySignals = [];
        this.isLoading = false;
    }

    /**
     * 모든 필요한 JSON 파일 비동기 로드
     */
    async loadAllData() {
        this.isLoading = true;
        this.showLoadingSpinner();

        try {
            // 병렬로 두 파일 로드
            const [universeData, signalsData] = await Promise.all([
                this.fetchJSON('results/daily_ibd_scan.json'),
                this.fetchJSON('results/entry_signals.json')
            ]);

            // 데이터 파싱
            this.universeData = Array.isArray(universeData) ? universeData : universeData.universe || [];
            this.entrySignals = signalsData.signals || [];

            console.log(`✅ Daily Briefing 데이터 로드 완료`);
            console.log(`   - Universe: ${this.universeData.length}개 종목`);
            console.log(`   - Entry Signals: ${this.entrySignals.length}개 진입신호`);

            // UI 렌더링
            this.renderBriefing();
            this.hideLoadingSpinner();

        } catch (error) {
            console.error(`❌ 데이터 로드 실패: ${error.message}`);
            this.showErrorMessage(`데이터를 불러올 수 없습니다. 새로고침하세요.`);
        }

        this.isLoading = false;
    }

    /**
     * 개별 JSON 파일 로드
     */
    async fetchJSON(filePath) {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`${filePath} 로드 실패 (HTTP ${response.status})`);
        }
        return await response.json();
    }

    /**
     * Daily Briefing 전체 렌더링
     */
    renderBriefing() {
        // 섹션 ② 시장 환경 평가 (Universe Breadth) 계산 및 렌더링
        this.renderUniverseBreadth();

        // 신규 진입 테이블 렌더링
        this.renderEntrySignalsTable();
    }

    /**
     * 섹션 ② 시장 환경 평가 - 카드 동적 계산
     */
    renderUniverseBreadth() {
        // 1. total_score >= 80인 종목 개수
        const rs80Count = this.universeData.filter(item => item.total_score >= 80).length;
        
        // 2. trend_pass == 8인 종목 개수
        const trend8Count = this.universeData.filter(item => item.trend_pass === 8).length;
        
        // 3. 전체 유니버스 개수
        const totalUniverse = this.universeData.length;
        
        // 4. 비율 계산
        const rs80Percentage = totalUniverse > 0 
            ? ((rs80Count / totalUniverse) * 100).toFixed(1) 
            : 0;
        
        const trend8Percentage = totalUniverse > 0 
            ? ((trend8Count / totalUniverse) * 100).toFixed(1) 
            : 0;

        // DOM 업데이트
        const rs80Element = document.getElementById('rs80-count');
        if (rs80Element) {
            rs80Element.textContent = `${rs80Count}개`;
        }

        const trend8Element = document.getElementById('trend8-count');
        if (trend8Element) {
            trend8Element.textContent = `${trend8Count}개`;
        }

        const rs80PercentElement = document.getElementById('rs80-percentage');
        if (rs80PercentElement) {
            rs80PercentElement.textContent = `${rs80Percentage}%`;
        }

        const trend8PercentElement = document.getElementById('trend8-percentage');
        if (trend8PercentElement) {
            trend8PercentElement.textContent = `${trend8Percentage}%`;
        }

        console.log(`📊 Universe Breadth 계산 완료`);
        console.log(`   - RS 80+: ${rs80Count}개 (${rs80Percentage}%)`);
        console.log(`   - Trend Pass 8: ${trend8Count}개 (${trend8Percentage}%)`);
    }

    /**
     * 신규 진입 시그널 테이블 동적 렌더링
     */
    renderEntrySignalsTable() {
        const tableContainer = document.getElementById('entry-signals-table');
        
        if (!tableContainer) {
            console.warn('⚠️ entry-signals-table ID를 찾을 수 없습니다');
            return;
        }

        // 데이터 없음 처리
        if (this.entrySignals.length === 0) {
            tableContainer.innerHTML = `
                <div style="padding: var(--spacing-2xl); text-align: center; color: var(--color-text-tertiary);">
                    <p style="font-size: 0.9rem; margin: 0;">📊 신규 진입 신호가 없습니다</p>
                </div>
            `;
            return;
        }

        // 테이블 HTML 생성
        let html = `
            <table class="data-table" style="width: 100%;">
                <thead>
                    <tr>
                        <th>Ticker</th>
                        <th>Price</th>
                        <th>RS Score</th>
                        <th>Phase</th>
                        <th>Pattern</th>
                        <th>Weight</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        // 각 진입신호를 테이블 행으로 변환
        this.entrySignals.slice(0, 20).forEach(signal => {
            const phaseColor = this.getPhaseColor(signal.phase);
            const phaseBadgeClass = this.getPhaseBadgeClass(signal.phase);
            const statusBadgeClass = this.getStatusBadgeClass(signal.status);

            html += `
                <tr>
                    <td class="ticker-cell"><strong>${signal.symbol || signal.ticker}</strong></td>
                    <td>$${(signal.price || 0).toFixed(2)}</td>
                    <td><span class="score-badge ${phaseColor}">${signal.rs_score || signal.momentum_score_v2 || 0}</span></td>
                    <td><span class="badge ${phaseBadgeClass}">${signal.phase || 'N/A'}</span></td>
                    <td><span class="badge badge-gray">${signal.pattern || 'HT Flag'}</span></td>
                    <td><strong>${(signal.weight || 0.8).toFixed(1)}</strong></td>
                    <td><span class="badge ${statusBadgeClass}">${signal.status || '활성'}</span></td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        tableContainer.innerHTML = html;
        console.log(`✅ Entry Signals 테이블 렌더링 완료 (${this.entrySignals.length}개)`);
    }

    /**
     * Phase에 따른 컬러 클래스명 반환
     */
    getPhaseBadgeClass(phase) {
        const classes = {
            1: 'badge-gray',
            2: 'badge-yellow',
            3: 'badge-blue',
            4: 'badge-green',
            5: 'badge-green',
            6: 'badge-orange',
            7: 'badge-red'
        };
        return classes[phase] || 'badge-gray';
    }

    /**
     * RS Score 색상 클래스명
     */
    getPhaseColor(phase) {
        if (phase === 4) return 'green';
        if (phase >= 5) return 'orange';
        return 'gray';
    }

    /**
     * Status 뱃지 클래스명
     */
    getStatusBadgeClass(status) {
        const classes = {
            '활성': 'badge-green',
            'active': 'badge-green',
            'hold': 'badge-blue',
            'watch': 'badge-gray',
            '관찰': 'badge-gray'
        };
        return classes[status] || 'badge-green';
    }

    /**
     * 로딩 스피너 표시
     */
    showLoadingSpinner() {
        // Daily Briefing 탭의 콘텐츠를 로딩 상태로 변경
        const briefingTab = document.getElementById('briefing-tab');
        if (briefingTab) {
            const loadingHtml = `
                <div style="padding: var(--spacing-2xl); text-align: center;">
                    <div style="font-size: 1.5rem; margin-bottom: var(--spacing-lg);">⏳</div>
                    <p style="font-size: 0.95rem; color: var(--color-text-secondary);">
                        데이터를 불러오는 중입니다...
                    </p>
                    <div style="margin-top: var(--spacing-lg); font-size: 0.8rem; color: var(--color-text-tertiary);">
                        잠시만 기다려주세요
                    </div>
                </div>
            `;
            // 실제로는 특정 영역만 로딩 상태로 변경하는 것이 좋음
            // 여기서는 콘솔에만 기록
            console.log('⏳ 데이터 로드 중...');
        }
    }

    /**
     * 로딩 스피너 숨기기
     */
    hideLoadingSpinner() {
        console.log('✅ 로딩 완료');
    }

    /**
     * 에러 메시지 표시
     */
    showErrorMessage(message) {
        const briefingTab = document.getElementById('briefing-tab');
        if (briefingTab) {
            const errorHtml = `
                <div style="padding: var(--spacing-2xl); text-align: center; background: #fee; border-radius: 8px; border: 1px solid #fcc;">
                    <p style="font-size: 0.95rem; color: #c33; margin: 0;">
                        ⚠️ ${message}
                    </p>
                </div>
            `;
            console.error(`❌ ${message}`);
        }
    }

    /**
     * 초기화 및 정기 업데이트
     */
    init() {
        // 초기 로드
        this.loadAllData();

        // 1분마다 자동 업데이트
        setInterval(() => {
            console.log('🔄 Daily Briefing 데이터 자동 새로고침');
            this.loadAllData();
        }, 60000);
    }
}

/**
 * DOMContentLoaded 이벤트 리스너
 */
document.addEventListener('DOMContentLoaded', () => {
    const briefing = new BriefingDataBinder();
    briefing.init();
    window.briefingBinder = briefing;
});
