/**
 * RSSCAN v3 - Daily Briefing 데이터 바인딩
 * daily_ibd_scan.json과 entry_signals.json을 로드해서 UI 동적 렌더링
 */

class BriefingDataBinder {
    constructor() {
        this.universeData = [];
        this.entrySignals = [];
        this.marketPulse = null;
        this.isLoading = false;
    }

    /**
     * 모든 필요한 JSON 파일 비동기 로드
     */
    async loadAllData() {
        this.isLoading = true;
        this.showLoadingSpinner();

        try {
            // 병렬로 세 파일 로드
            const [universeData, signalsData, pulseData] = await Promise.all([
                this.fetchJSON('results/daily_ibd_scan.json'),
                this.fetchJSON('results/entry_signals.json'),
                this.fetchJSON('results/market_pulse.json').catch(() => null)
            ]);

            // 데이터 파싱
            this.universeData = Array.isArray(universeData) ? universeData : universeData.universe || [];
            this.entrySignals = signalsData.signals || [];
            this.marketPulse = pulseData;

            console.log(`✅ Daily Briefing 데이터 로드 완료`);
            console.log(`   - Universe: ${this.universeData.length}개 종목`);
            console.log(`   - Entry Signals: ${this.entrySignals.length}개 진입신호`);
            console.log(`   - Market Pulse: ${this.marketPulse ? '로드됨' : '없음(하드코딩 유지)'}`);

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

        // 섹션 ③ 섹터별 RS Line 지표 테이블 렌더링
        this.renderSectorRSLineTable();

        // Market Pulse 기반: 오늘의 시장 상태 + 사이드바
        this.renderMarketState();
        this.renderSidebar();
    }

    /**
     * 오늘의 시장 상태 (① 영역) + 지수 등락률 — market_pulse.json 기반
     */
    renderMarketState() {
        const mp = this.marketPulse;
        if (!mp) return;  // 데이터 없으면 하드코딩 유지

        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        const setHTML = (id, html) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        };

        // 지수 등락률 (S&P/NASDAQ/Russell)
        const idx = mp.indices || {};
        const fmtPct = (v) => {
            if (v === null || v === undefined) return '—';
            const sign = v >= 0 ? '+' : '';
            return `${sign}${v.toFixed(2)}%`;
        };
        const pctColor = (v) => (v >= 0 ? 'var(--color-primary)' : '#ef4444');

        [['sp500', 'SP500'], ['nasdaq', 'NASDAQ'], ['russell', 'RUSSELL']].forEach(([domId, key]) => {
            const d = idx[key];
            if (!d) return;
            const el = document.getElementById(`market-${domId}-change`);
            if (el) {
                el.textContent = fmtPct(d.change_pct);
                el.style.color = pctColor(d.change_pct);
            }
        });

        // 시장 상태 텍스트 + 투자비중
        setText('market-regime-label', mp.regime || '');
        setText('market-regime-ratio', mp.investment_ratio || '');

        console.log(`📈 시장 상태 렌더링: ${mp.regime} / 투자비중 ${mp.investment_ratio}`);
    }

    /**
     * 좌측 사이드바 — market_pulse.json 기반 (regime, breadth, DD, Stage/Phase 분포)
     */
    renderSidebar() {
        const mp = this.marketPulse;
        if (!mp) return;

        const setText = (sel, text) => {
            const el = document.querySelector(sel);
            if (el) el.textContent = text;
        };

        // Market Regime 카드
        setText('.regime-text', mp.regime || '');
        const ratioEl = document.querySelector('.regime-detail .detail-value');
        if (ratioEl) ratioEl.textContent = mp.investment_ratio || '';

        // DD Count / Breadth
        const condRows = document.querySelectorAll('.regime-conditions .condition-row strong');
        if (condRows.length >= 2) {
            condRows[0].textContent = mp.dd_count;
            condRows[1].textContent = `${mp.breadth_pct}%`;
        }

        // Market Pulse 카드 (Stage 2/3/4)
        const stages = mp.stages || {};
        const pulseVals = document.querySelectorAll('.pulse-grid .pulse-value');
        if (pulseVals.length >= 3) {
            pulseVals[0].textContent = stages.stage2 ?? 0;
            pulseVals[1].textContent = stages.stage3 ?? 0;
            pulseVals[2].textContent = stages.stage4 ?? 0;
        }

        // Phase Distribution 막대
        const pd = mp.phase_distribution || {};
        const total = mp.total_stocks || 1;
        const phaseRows = document.querySelectorAll('.phase-bars .phase-bar-row');
        const phaseVals = [pd.p4plus, pd.p4, pd.p3, pd.p67];
        phaseRows.forEach((row, i) => {
            const count = phaseVals[i] ?? 0;
            const fill = row.querySelector('.phase-bar-fill');
            const cnt = row.querySelector('.phase-count');
            if (fill) fill.style.width = `${Math.round(count / total * 100)}%`;
            if (cnt) cnt.textContent = count;
        });

        console.log(`📊 사이드바 렌더링: Breadth ${mp.breadth_pct}%, DD ${mp.dd_count}`);
    }

    /**
     * 섹션 ③ 섹터별 RS Line 지표 - 상위 RS Score 종목 동적 렌더링
     */
    renderSectorRSLineTable() {
        const tbody = document.getElementById('sector-rs-line-table');
        if (!tbody) {
            console.warn('⚠️ sector-rs-line-table ID를 찾을 수 없습니다');
            return;
        }

        // total_score 기준 상위 15개 종목 정렬
        const topStocks = [...this.universeData]
            .sort((a, b) => (b.total_score || 0) - (a.total_score || 0))
            .slice(0, 15);

        if (topStocks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: var(--spacing-lg); color: var(--color-text-tertiary);">데이터가 없습니다</td></tr>`;
            return;
        }

        let html = '';
        topStocks.forEach(stock => {
            const ticker = stock.ticker || '-';
            const close = stock.close ? `$${stock.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
            const totalScore = stock.total_score || 0;
            const phase = stock.phase || 0;
            const ibdRs = stock.ibd_rs_rating || 0;
            const change1w = stock.rs_6w_change || 0;
            const change3w = stock.rs_10w_change || 0;

            // RS Score 뱃지 색상 (80+ 초록, 60+ 주황, 그외 회색)
            const scoreBadgeClass = totalScore >= 80 ? 'green' : totalScore >= 60 ? 'orange' : 'gray';

            // Phase 뱃지 색상 및 라벨
            const phaseBadge = this.getPhaseBadge(phase);

            // 패턴 라벨
            const patternLabel = stock.top_pattern ? 'Top Pattern' : (stock.breakout ? 'Breakout' : '—');

            // 변화율 색상
            const change1wClass = change1w >= 0 ? 'price-up' : 'price-down';
            const change3wClass = change3w >= 0 ? 'price-up' : 'price-down';
            const change1wStr = `${change1w >= 0 ? '+' : ''}${change1w.toFixed(2)}%`;
            const change3wStr = `${change3w >= 0 ? '+' : ''}${change3w.toFixed(2)}%`;

            html += `
                <tr>
                    <td class="ticker-cell">${ticker}</td>
                    <td>${close}</td>
                    <td><span class="score-badge ${scoreBadgeClass}">${totalScore}</span></td>
                    <td>${phaseBadge}</td>
                    <td><span class="badge badge-gray">${patternLabel}</span></td>
                    <td><span class="score-badge gold">${ibdRs}</span></td>
                    <td class="${change1wClass}">${change1wStr}</td>
                    <td class="${change3wClass}">${change3wStr}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        console.log(`✅ 섹터별 RS Line 지표 렌더링 완료: ${topStocks.length}개 종목`);
    }

    /**
     * Phase 번호 → 뱃지 HTML
     */
    getPhaseBadge(phase) {
        if (phase >= 5) return `<span class="badge badge-green">${phase}+</span>`;
        if (phase === 4) return `<span class="badge badge-green">4</span>`;
        if (phase === 3) return `<span class="badge badge-blue">3</span>`;
        if (phase === 2) return `<span class="badge badge-gray">2</span>`;
        return `<span class="badge badge-gray">${phase}</span>`;
    }

    /**
     * 섹션 ② 시장 환경 평가 - 카드 동적 계산
     */
    renderUniverseBreadth() {
        const totalUniverse = this.universeData.length;
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        // === RS Rating 기반 분포 (IBD RS Rating 사용) ===
        // RS 90+ 종목
        const rs90Count = this.universeData.filter(item => (item.ibd_rs_rating || 0) >= 90).length;
        // RS 80-89 (스트롱)
        const rs80to89Count = this.universeData.filter(item => {
            const rs = item.ibd_rs_rating || 0;
            return rs >= 80 && rs < 90;
        }).length;
        // RS 80+ 전체 (랭크 비중 계산용)
        const rs80PlusCount = this.universeData.filter(item => (item.ibd_rs_rating || 0) >= 80).length;

        // === Trend Pass(추세 통과) 분포 ===
        const trend8Count = this.universeData.filter(item => item.trend_pass === 8).length;
        const trend7Count = this.universeData.filter(item => item.trend_pass >= 7).length;

        // === 비율 ===
        const pct = (n) => totalUniverse > 0 ? ((n / totalUniverse) * 100).toFixed(1) : '0.0';
        const trend8Pct = pct(trend8Count);
        const rs80Rank = pct(rs80PlusCount);  // RS 80+ 비중 = "RS 랭크"

        // === DOM 업데이트 ===
        // SETUP 카드
        setText('trend8-count', `${trend8Count}개`);          // 8/8 통과 증폭
        setText('trend8-percentage', `${trend8Pct}%`);        // 8/8 통과 비중
        setText('trend7-count', `${trend7Count}개`);          // 7-/8 파차리스트(7+ 통과)
        // STRENGTH 카드
        setText('rs90-count', `${rs90Count}개`);              // RS 90+ 종목
        setText('rs80-count', `${rs80to89Count}개`);          // RS 80-89 (스트롱)
        setText('rs80-percentage', `${rs80Rank}%`);           // RS 랭크 (RS 80+ 비중)

        console.log(`📊 시장 환경 평가 계산 완료 (전체 ${totalUniverse}개)`);
        console.log(`   - Trend 8: ${trend8Count}개 (${trend8Pct}%) / Trend 7+: ${trend7Count}개`);
        console.log(`   - RS 90+: ${rs90Count}개 / RS 80-89: ${rs80to89Count}개 / RS 80+ 비중: ${rs80Rank}%`);
    }

    /**
     * 신규 진입 시그널 테이블 동적 렌더링
     */
    renderEntrySignalsTable() {
        const tableContainer = document.getElementById('entry-signals-table');
        
        if (!tableContainer) {
            // 이 영역은 현재 레이아웃에서 사용되지 않음 (전략실 탭으로 이동)
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
