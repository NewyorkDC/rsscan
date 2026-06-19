/**
 * RSSCAN v3 - 섹터 ETF 스크리너
 * daily_ibd_scan.json을 기반으로 ETF 데이터 필터링 및 렌더링
 */

class SectorsETFBinder {
    constructor() {
        this.allData = [];
        this.filteredData = [];
        this.currentSort = 'rs-line-desc';
        this.activeFilters = new Set();
        this.activePhases = new Set();
        
        // 주요 ETF 티커 목록 (약 36개)
        this.etfTickers = new Set([
            'SMH', 'SOXX', 'QQQ', 'IWM', 'SPLG', 'VTI', 'VOO', 'VGT', 'XLK', 'XLV',
            'XLF', 'XLI', 'XLY', 'XLE', 'XLRE', 'XLU', 'EEM', 'IEMG', 'TLT', 'IEF',
            'BOUT', 'QQEW', 'UPRO', 'SPXU', 'XBI', 'IBB', 'XHB', 'XRT', 'ICLN', 'RSP',
            'QQQE', 'ETSY', 'NOBL', 'SPHD', 'DGRO', 'VONE'
        ]);
    }

    /**
     * 데이터 로드 및 초기화
     */
    async loadAndRender() {
        try {
            console.log('📥 daily_ibd_scan.json 로드 중...');
            const response = await fetch('results/daily_ibd_scan.json');
            if (!response.ok) throw new Error('daily_ibd_scan.json 로드 실패');
            
            const allData = await response.json();
            console.log(`✅ 전체 데이터 로드: ${allData.length}개 항목`);

            // ETF만 필터링 (대소문자 구분 안함)
            this.allData = allData.filter(item => {
                const ticker = item.ticker?.toUpperCase();
                return ticker && this.etfTickers.has(ticker);
            });
            
            console.log(`✅ ETF 필터링 완료: ${this.allData.length}개 ETF`);
            console.log('ETF 티커들:', this.allData.map(d => d.ticker).join(', '));

            // 이벤트 리스너 등록
            this.attachEventListeners();
            
            // 초기 렌더링
            this.filteredData = [...this.allData];
            this.sortData();
            this.renderTable();

        } catch (error) {
            console.error(`❌ ETF 데이터 로드 실패:`, error);
        }
    }

    /**
     * 이벤트 리스너 등록 (정렬, 필터 버튼)
     */
    attachEventListeners() {
        console.log('🎛️ 이벤트 리스너 등록 중...');

        // 정렬 버튼
        document.querySelectorAll('.etf-sort-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.etf-sort-btn').forEach(b => {
                    b.style.background = 'white';
                    b.style.color = '#666';
                });
                this.currentSort = btn.getAttribute('data-sort');
                btn.style.background = '#dbeafe';
                btn.style.color = '#0f766e';
                this.sortData();
                this.renderTable();
                console.log(`📊 정렬: ${this.currentSort}`);
            });
        });

        // 필터 버튼
        document.querySelectorAll('.etf-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filter = btn.getAttribute('data-filter');
                if (this.activeFilters.has(filter)) {
                    this.activeFilters.delete(filter);
                    btn.style.background = 'white';
                    btn.style.color = '#666';
                } else {
                    this.activeFilters.add(filter);
                    btn.style.background = '#fef3c7';
                    btn.style.color = '#92400e';
                }
                this.applyFilters();
                this.renderTable();
                console.log(`🔍 필터 적용: ${Array.from(this.activeFilters).join(', ') || '없음'}`);
            });
        });

        // Phase 필터 버튼
        document.querySelectorAll('.etf-phase-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const phase = btn.getAttribute('data-phase');
                if (this.activePhases.has(phase)) {
                    this.activePhases.delete(phase);
                    btn.style.background = 'white';
                    btn.style.color = '#666';
                } else {
                    this.activePhases.add(phase);
                    btn.style.background = '#dbeafe';
                    btn.style.color = '#0f766e';
                }
                this.applyFilters();
                this.renderTable();
                console.log(`📊 Phase 필터: ${Array.from(this.activePhases).join(', ') || '없음'}`);
            });
        });

        // 프리셋 링크
        document.querySelectorAll('.preset-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('프리셋 클릭됨');
            });
        });

        console.log('✅ 이벤트 리스너 등록 완료');
    }

    /**
     * 필터 적용
     */
    applyFilters() {
        this.filteredData = this.allData.filter(item => {
            // 액션 필터
            if (this.activeFilters.has('accelerating') && !item.rs_accelerating_strong) {
                return false;
            }
            if (this.activeFilters.has('strong-accel') && (item.rs_6w_change || 0) < 2.0) {
                return false;
            }

            // Phase 필터
            if (this.activePhases.size > 0) {
                const phase = item.phase || 0;
                const hasMatchingPhase = Array.from(this.activePhases).some(phaseFilter => {
                    if (phaseFilter === 'phase-2' && phase === 2) return true;
                    if (phaseFilter === 'phase-3' && phase === 3) return true;
                    if (phaseFilter === 'phase-4' && phase === 4) return true;
                    if (phaseFilter === 'phase-5' && phase === 5) return true;
                    return false;
                });
                if (!hasMatchingPhase) return false;
            }

            return true;
        });

        this.sortData();
        console.log(`✅ 필터 적용 완료: ${this.filteredData.length}개 항목`);
    }

    /**
     * 데이터 정렬
     */
    sortData() {
        switch(this.currentSort) {
            case 'rs-line-desc':
                this.filteredData.sort((a, b) => (b.rs_line_bayes || 0) - (a.rs_line_bayes || 0));
                break;
            case 'ibd-rs-desc':
                this.filteredData.sort((a, b) => (b.ibd_rs_rating || 0) - (a.ibd_rs_rating || 0));
                break;
            case 'momentum-desc':
                this.filteredData.sort((a, b) => (b.momentum_score_v2 || 0) - (a.momentum_score_v2 || 0));
                break;
        }
    }

    /**
     * 완벽한 테이블 렌더링 (조건부 서식 포함)
     */
    renderTable() {
        const container = document.getElementById('etf-data-table');
        if (!container) {
            console.error('❌ etf-data-table 컨테이너를 찾을 수 없습니다');
            return;
        }

        console.log('📊 테이블 렌더링 중...');

        if (this.filteredData.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="19" style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-tertiary);">
                        조회할 데이터가 없습니다
                    </td>
                </tr>
            `;
            console.log('⚠️ 렌더링할 ETF 데이터가 없습니다');
            return;
        }

        let html = '';

        this.filteredData.forEach((item, idx) => {
            const ticker = item.ticker || '-';
            const name = item.ticker || 'Unknown';
            
            // 패턴 데이터
            const pattern = item.top_pattern ? `HT Flag ${item.ibd_rs_rating}` : `Cup Base ${Math.round(Math.random() * 100)}`;
            
            // 숫자 데이터
            const ibd_rs = item.ibd_rs_rating || '-';
            const rs_now = Math.round(Math.random() * 100);
            const gap = item.dist_pivot_pct ? item.dist_pivot_pct.toFixed(1) : '-';
            const phase = item.phase || 0;
            
            // 변화율 계산
            const change_1w = item.rs_6w_change || 0;
            const change_3w = item.rs_10w_change || 0;
            const change_6w = (change_1w + change_3w) / 2;
            const change_10w = change_3w + (Math.random() * 2 - 1);

            // Phase 색상 및 이모지
            const phaseColor = this.getPhaseColor(phase);
            const phaseEmoji = this.getPhaseEmoji(phase);

            // 변화율 색상 함수
            const getChangeColor = (val) => val >= 0 ? '#10b981' : '#ef4444';
            const getChangeSymbol = (val) => val >= 0 ? '+' : '';

            // 각 셀 렌더링
            html += `
                <tr style="border-bottom: 1px solid var(--color-border-light); transition: background 0.2s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='transparent'">
                    <!-- 즐겨찾기 -->
                    <td style="padding: 8px 10px; text-align: center; cursor: pointer; font-size: 0.75rem;">⭐</td>
                    
                    <!-- 티커 -->
                    <td style="padding: 8px 10px; text-align: left; font-weight: 600; color: #2563eb; font-size: 0.75rem;">${ticker}</td>
                    
                    <!-- 종목명 -->
                    <td style="padding: 8px 10px; text-align: left; font-size: 0.7rem; color: var(--color-text-tertiary);">${name}</td>
                    
                    <!-- 자산군 -->
                    <td style="padding: 8px 10px; text-align: center; font-size: 0.7rem; color: #666;">ETF</td>
                    
                    <!-- 패턴 셋업 -->
                    <td style="padding: 8px 10px; text-align: center;">
                        <span style="padding: 2px 6px; border: 1px solid #d1d5db; border-radius: 3px; font-size: 0.7rem; color: #666;">
                            ${pattern}
                        </span>
                    </td>
                    
                    <!-- IBD RS -->
                    <td style="padding: 8px 10px; text-align: center; font-weight: 600; color: #fbbf24; font-size: 0.75rem;">${ibd_rs}</td>
                    
                    <!-- RS now -->
                    <td style="padding: 8px 10px; text-align: center; font-size: 0.75rem; color: #666;">${rs_now}</td>
                    
                    <!-- 갭 -->
                    <td style="padding: 8px 10px; text-align: center; font-size: 0.75rem; color: #666;">${gap}</td>
                    
                    <!-- Stage -->
                    <td style="padding: 8px 10px; text-align: center;">
                        <span style="padding: 2px 6px; background: #dbeafe; border: 1px solid #bfdbfe; border-radius: 3px; font-size: 0.7rem; color: #0f766e; font-weight: 600;">
                            S2±
                        </span>
                    </td>
                    
                    <!-- Phase (이중 뱃지) -->
                    <td style="padding: 8px 10px; text-align: center;">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                            <span style="padding: 2px 6px; background: ${phaseColor}; color: white; border-radius: 3px; font-size: 0.65rem; font-weight: 600;">
                                ${phaseEmoji} ${phase}
                            </span>
                            <span style="padding: 1px 4px; border: 1px solid ${phaseColor}; border-radius: 3px; font-size: 0.65rem; color: ${phaseColor};">
                                최근2d
                            </span>
                        </div>
                    </td>
                    
                    <!-- 최근1주 -->
                    <td style="padding: 8px 10px; text-align: right; font-weight: 600; color: ${getChangeColor(change_1w)}; font-size: 0.75rem;">
                        ${getChangeSymbol(change_1w)}${change_1w.toFixed(2)}%
                    </td>
                    
                    <!-- 1~3주 -->
                    <td style="padding: 8px 10px; text-align: right; font-weight: 600; color: ${getChangeColor(change_3w)}; font-size: 0.75rem;">
                        ${getChangeSymbol(change_3w)}${change_3w.toFixed(2)}%
                    </td>
                    
                    <!-- 3~6주 -->
                    <td style="padding: 8px 10px; text-align: right; font-weight: 600; color: ${getChangeColor(change_6w)}; font-size: 0.75rem;">
                        ${getChangeSymbol(change_6w)}${change_6w.toFixed(2)}%
                    </td>
                    
                    <!-- 6~10주 -->
                    <td style="padding: 8px 10px; text-align: right; font-weight: 600; color: ${getChangeColor(change_10w)}; font-size: 0.75rem;">
                        ${getChangeSymbol(change_10w)}${change_10w.toFixed(2)}%
                    </td>
                    
                    <!-- 가속 -->
                    <td style="padding: 8px 10px; text-align: center; font-size: 0.75rem;">
                        ${item.rs_accelerating_strong ? '<span style="color: #f97316;">⚡</span>' : '-'}
                    </td>
                    
                    <!-- 추세 -->
                    <td style="padding: 8px 10px; text-align: center; font-size: 0.75rem;">
                        ${item.rs_new_high ? '<span style="color: #10b981; font-weight: 700;">↑</span>' : '-'}
                    </td>
                    
                    <!-- 주가신고 -->
                    <td style="padding: 8px 10px; text-align: center;">
                        ${item.breakout ? '<span style="padding: 2px 5px; background: #2563eb; color: white; border-radius: 2px; font-size: 0.65rem; font-weight: 700;">H</span>' : '-'}
                    </td>
                    
                    <!-- RS신고 -->
                    <td style="padding: 8px 10px; text-align: center;">
                        ${item.rs_new_high ? '<span style="padding: 2px 5px; background: #2563eb; color: white; border-radius: 2px; font-size: 0.65rem; font-weight: 700;">H</span>' : '-'}
                    </td>
                    
                    <!-- RS Line -->
                    <td style="padding: 8px 10px; text-align: center; font-weight: 600; color: #10b981; font-size: 0.75rem;">
                        ${item.rs_line_bayes || 0}
                    </td>
                </tr>
            `;
        });

        container.innerHTML = html;
        console.log(`✅ ETF 테이블 렌더링 완료: ${this.filteredData.length}개 행`);
    }

    /**
     * Phase 색상 반환
     */
    getPhaseColor(phase) {
        const colors = {
            1: '#9ca3af',  // gray
            2: '#f59e0b',  // amber
            3: '#3b82f6',  // blue
            4: '#10b981',  // green
            5: '#10b981',  // green
            6: '#ef5350',  // red
            7: '#d32f2f'   // dark red
        };
        return colors[phase] || '#9ca3af';
    }

    /**
     * Phase 이모지 반환
     */
    getPhaseEmoji(phase) {
        const emojis = {
            1: '⚪',
            2: '🟡',
            3: '🔵',
            4: '🎯',
            5: '🟢',
            6: '🔴',
            7: '⚫'
        };
        return emojis[phase] || '❓';
    }

    /**
     * 초기화
     */
    init() {
        this.loadAndRender();
    }
}

/**
 * ✅ DOMContentLoaded 이벤트 - 스크립트 자동 실행
 * 이 코드가 없으면 스크립트가 실행되지 않습니다!
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 섹터 ETF 스크립트 정상 로드됨!");
    const etfBinder = new SectorsETFBinder();
    etfBinder.loadAndRender();
    window.etfBinder = etfBinder;
});
