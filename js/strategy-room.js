/**
 * RSSCAN v3 - Strategy Room v6 데이터 바인딩
 * strategy_room_portfolio.json (stateful paper-trade) 렌더링
 * A: 보유종목 고도화 / B: 요약카드 / C: NAV곡선 / D: 위험지표
 */

class StrategyRoomBinder {
    constructor() {
        this.portfolio = null;
        this.holdings = [];
        this.closedTrades = [];
        this.statistics = {};
        this.navHistory = [];
        this.entrySignals = [];
        this.navChart = null;
        this.maxPositions = 12;
    }

    async loadAndRender() {
        try {
            const [portfolioRes, signalsRes] = await Promise.all([
                fetch('results/strategy_room_portfolio.json'),
                fetch('results/entry_signals.json').catch(() => null)
            ]);

            if (!portfolioRes.ok) throw new Error('전략실 포트폴리오 로드 실패');

            this.portfolio = await portfolioRes.json();
            this.holdings = this.portfolio.holdings || [];
            this.closedTrades = this.portfolio.closed_trades || [];
            this.statistics = this.portfolio.statistics || {};
            this.navHistory = this.portfolio.nav_history || [];

            // IBD 노출도 (백엔드가 계산한 값)
            this.exposure = this.portfolio.exposure || null;
            if (this.exposure && this.exposure.max_positions != null) {
                this.maxPositions = this.exposure.max_positions;
            }

            // 진입 신호 (있으면)
            if (signalsRes && signalsRes.ok) {
                const sig = await signalsRes.json();
                this.entrySignals = sig.signals || [];
                this.signalsDate = sig.timestamp ? sig.timestamp.split(' ')[0] : '';
            }

            console.log(`✅ Strategy Room v6 로드: 보유 ${this.holdings.length}개, 청산 ${this.closedTrades.length}건, 신호 ${this.entrySignals.length}개, NAV포인트 ${this.navHistory.length}개`);

            // 상단 블록 (스크린샷 순서)
            this.renderExposureBanner(); // 0. IBD 노출도 배너
            this.renderProgressiveExposure(); // 0.5 점진적 노출 신호등
            this.renderOOS();              // 1. 전방향 검증
            this.renderEntrySignals();     // 3. 진입 조건
            this.renderSwitching();        // 4. 종목 스위칭
            this.renderPositionCap();      // 5. Position Cap
            // 하단 블록
            this.renderSummary();          // B
            this.renderNavChart();         // C
            this.renderHoldingsTable();    // A
            this.renderClosedTradesTable();
            this.renderRiskMetrics();      // D
        } catch (error) {
            console.error(`❌ Strategy Room 로드 실패: ${error.message}`);
        }
    }

    // ===== 0. IBD 노출도 배너 =====
    renderExposureBanner() {
        const banner = document.getElementById('strategy-exposure-banner');
        const textEl = document.getElementById('strategy-exposure-text');
        if (!banner || !textEl || !this.exposure) return;

        const count = this.exposure.count != null ? this.exposure.count : 5;
        const ratio = this.exposure.max_ratio != null ? Math.round(this.exposure.max_ratio * 100) : 100;
        const maxPos = this.exposure.max_positions != null ? this.exposure.max_positions : 12;

        const labelMap = {
            0: 'Correction (신규 매수 중단)', 1: 'FTD 직후 (초기 진입)', 2: '상승 지속 확인',
            3: 'Power Trend 초기', 4: '강한 상승 추세', 5: 'Full Exposure (최대 노출)',
        };
        textEl.textContent = `Count ${count}/5 · 권장 노출 ${ratio}% · 최대 보유 ${maxPos}개 — ${labelMap[count] || ''}`;

        // 색상 (노출도별)
        const bg = count >= 4 ? '#f0fdf4' : count >= 2 ? '#fffbeb' : '#fef2f2';
        const border = count >= 4 ? '#bbf7d0' : count >= 2 ? '#fde68a' : '#fecaca';
        const color = count >= 4 ? '#166534' : count >= 2 ? '#92400e' : '#991b1b';
        banner.style.background = bg;
        banner.style.borderColor = border;
        banner.style.color = color;
        banner.style.display = 'block';
    }

    renderProgressiveExposure() {
        const banner = document.getElementById('progressive-exposure-banner');
        if (!banner) return;

        const pe = this.portfolio && this.portfolio.progressive_exposure;
        // 데이터 없으면 정상(level 1)으로 처리
        const level = pe && pe.level ? pe.level : 1;
        const hardStops = pe && pe.hard_stops_recent5 != null ? pe.hard_stops_recent5 : 0;
        const sample = pe && pe.sample_size != null ? pe.sample_size : 0;

        const config = {
            1: {
                icon: '🟢', bg: '#f0fdf4', border: '#bbf7d0', color: '#166534',
                title: '정상 궤도',
                desc: '시스템 타격감 양호. 100% 정상 비중으로 진입하세요.',
            },
            2: {
                icon: '🟡', bg: '#fffbeb', border: '#fde68a', color: '#92400e',
                title: '점진적 노출 (경고)',
                desc: '최근 연이은 손절 발생. 신규 진입 비중을 1/2로 줄이세요.',
            },
            3: {
                icon: '🔴', bg: '#fef2f2', border: '#fecaca', color: '#991b1b',
                title: '매매 최소화 (위험)',
                desc: '연속 하드스탑! 시장이 맞지 않습니다. 신규 비중을 1/4로 줄이거나 매매를 쉬세요.',
            },
        };
        const c = config[level] || config[1];

        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setText('pe-icon', c.icon);
        setText('pe-title', c.title);
        setText('pe-desc', c.desc);
        setText('pe-meta', `최근 청산 ${sample}건 중 하드스탑 ${hardStops}건 기준 (Level ${level})`);

        banner.style.background = c.bg;
        banner.style.borderColor = c.border;
        banner.style.color = c.color;
        banner.style.display = 'block';
    }

    // ===== 1. 전방향 검증 (OOS) =====
    renderOOS() {
        // OOS는 청산 거래 기반. inception 이후 첫 청산부터 N건 집계.
        const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        const setWidth = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = `${Math.min(pct, 100)}%`; };

        const N = this.closedTrades.length;
        const targetN = 30;
        setText('oos-sample-count', N);
        setWidth('oos-sample-bar', (N / targetN) * 100);

        // 기간 진행: NAV 히스토리 첫 날짜 ~ 오늘 (6개월=180일 기준)
        let periodMonths = 0;
        if (this.navHistory.length >= 1) {
            const first = new Date(this.navHistory[0].date);
            const last = new Date(this.navHistory[this.navHistory.length - 1].date);
            periodMonths = (last - first) / (1000 * 60 * 60 * 24 * 30);
        }
        setText('oos-period', periodMonths.toFixed(1));
        setWidth('oos-period-bar', (periodMonths / 6) * 100);

        // 상태 텍스트
        const statusEl = document.getElementById('oos-status');
        if (statusEl) {
            if (N === 0) statusEl.textContent = '🔵 검증 시작 — 표본 수집 중 (N=0)';
            else if (N < targetN) statusEl.textContent = `🔵 표본 수집 중 (N=${N} / ${targetN})`;
            else {
                const avgPct = this.closedTrades.reduce((s, t) => s + (t.profit_pct || 0), 0) / N;
                statusEl.textContent = `✅ 검증 진행 (N=${N}) · 기대값 ${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(1)}%`;
            }
        }

        // seed (개발용 in-sample = 현재까지 누적 거래)
        const seedEl = document.getElementById('oos-seed');
        if (seedEl) {
            if (N === 0) seedEl.textContent = '집계 대기';
            else {
                const avgPct = this.closedTrades.reduce((s, t) => s + (t.profit_pct || 0), 0) / N;
                const winRate = this.statistics.win_rate || 0;
                seedEl.textContent = `${N}건 · 기대값 ${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(1)}% · 승률 ${winRate.toFixed(0)}%`;
            }
        }
    }

    // ===== 3. 진입 조건 (신규 시그널) =====
    renderEntrySignals() {
        const container = document.getElementById('entry-signals-table-body');
        const countEl = document.getElementById('entry-signals-count');
        const dateEl = document.getElementById('entry-signals-date');
        if (!container) return;

        if (dateEl && this.signalsDate) dateEl.textContent = `— ${this.signalsDate} 기준`;

        if (this.entrySignals.length === 0) {
            if (countEl) countEl.textContent = `신규 시그널 0건`;
            container.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:var(--spacing-lg); color:var(--color-text-tertiary);">진입 신호가 없습니다</td></tr>`;
            return;
        }

        // 우선순위 정렬: total_score 우선, 없으면 RS Rating
        const score = (s) => (s.total_score || 0) * 100 + (s.ibd_rs_rating || 0);
        const sorted = [...this.entrySignals].sort((a, b) => score(b) - score(a));

        // 우선순위 상위 10개만 진입 조건에 표시
        const TOP_N = 10;
        const topSignals = sorted.slice(0, TOP_N);

        if (countEl) countEl.textContent = `전체 ${this.entrySignals.length}건 중 우선순위 ${topSignals.length}건`;

        let html = '';
        topSignals.forEach(s => {
            const pivotPct = s.dist_pivot_pct != null ? s.dist_pivot_pct : null;
            const pivotStr = pivotPct != null
                ? `<span style="color:${pivotPct <= 0 ? '#10b981' : '#6b7280'};">${pivotPct >= 0 ? '+' : ''}${pivotPct.toFixed(1)}%</span>`
                : '–';
            html += `
                <tr style="border-bottom:1px solid var(--color-border-light);">
                    <td style="text-align:left; font-weight:600;"><span class="ticker-link" style="color:#2563eb;" onclick="window.strategyRoomBinder.openModal('${s.ticker}')">${s.ticker}</span></td>
                    <td style="text-align:left; font-size:0.75rem;">${s.chart_pattern || (s.top_pattern ? 'Top Pattern' : (s.breakout ? 'Breakout' : '–'))}</td>
                    <td style="text-align:right;">$${(s.close || 0).toFixed(2)}</td>
                    <td style="text-align:right; font-size:0.75rem;">${pivotStr}</td>
                    <td style="text-align:center; font-weight:600; color:#fbbf24;">${s.ibd_rs_rating || 0}</td>
                    <td style="text-align:right;">${(s.total_score || 0).toFixed(1)}</td>
                    <td style="text-align:right; color:#6b7280;">${(s.theme_score || 0).toFixed(1)}</td>
                    <td style="text-align:right; color:#6b7280;">${(s.ad_score || 0).toFixed(1)}</td>
                </tr>`;
        });
        container.innerHTML = html;

        // 차순위(11~20위)를 Position Cap에 넘기기 위해 저장
        this._nextTier = sorted.slice(TOP_N, TOP_N + 10);
    }

    // ===== 4. 종목 스위칭 =====
    renderSwitching() {
        const container = document.getElementById('switching-table-body');
        const countEl = document.getElementById('switching-count');
        if (!container) return;

        // 청산이력 중 스위칭(🔄) 사유만 추출
        const switches = this.closedTrades.filter(t =>
            (t.exit_reason || '').includes('스위칭') || (t.exit_reason || '').includes('🔄'));

        if (countEl) countEl.textContent = `${switches.length}건`;

        if (switches.length === 0) {
            container.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:var(--spacing-lg); color:var(--color-text-tertiary);">스위칭 내역이 없습니다</td></tr>`;
            return;
        }

        let html = '';
        switches.reverse().forEach(t => {
            // exit_reason 예: "🔄 스위칭→BHE"
            const target = (t.exit_reason || '').split('→')[1] || '?';
            const pnl = t.profit_pct || 0;
            html += `
                <tr style="border-bottom:1px solid var(--color-border-light);">
                    <td style="text-align:left; font-weight:600;">${t.ticker} <span style="font-size:0.7rem; color:${pnl >= 0 ? '#10b981' : '#ef4444'};">(${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%)</span></td>
                    <td style="text-align:center; color:var(--color-text-tertiary);">→</td>
                    <td style="text-align:left; font-weight:600; color:#2563eb;">${target}</td>
                    <td style="text-align:left; font-size:0.75rem;">${t.pattern || '–'}</td>
                    <td style="text-align:right; color:#10b981; font-weight:600;">강신호 교체</td>
                </tr>`;
        });
        container.innerHTML = html;
    }

    // ===== 5. 차순위 후보 (우선순위 다음 10개) =====
    renderPositionCap() {
        const container = document.getElementById('poscap-table-body');
        const countEl = document.getElementById('poscap-count');
        if (!container) return;

        // renderEntrySignals에서 저장한 차순위(11~20위)
        const nextTier = this._nextTier || [];

        if (countEl) countEl.textContent = `${nextTier.length}건`;

        if (nextTier.length === 0) {
            container.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:var(--spacing-lg); color:var(--color-text-tertiary);">차순위 후보가 없습니다</td></tr>`;
            return;
        }

        let html = '';
        nextTier.forEach(s => {
            html += `
                <tr style="border-bottom:1px solid var(--color-border-light);">
                    <td style="text-align:left; font-weight:600;"><span class="ticker-link" style="color:#2563eb;" onclick="window.strategyRoomBinder.openModal('${s.ticker}')">${s.ticker}</span></td>
                    <td style="text-align:left; font-size:0.75rem;">${s.top_pattern ? 'Top Pattern' : (s.breakout ? 'Breakout' : '–')}</td>
                    <td style="text-align:right;">${(s.total_score || 0).toFixed(1)}</td>
                    <td style="text-align:center; font-weight:600; color:#fbbf24;">${s.ibd_rs_rating || 0}</td>
                </tr>`;
        });
        container.innerHTML = html;
    }

    // ===== B. 요약 카드 (NAV 배수 표시) =====
    renderSummary() {
        if (!this.portfolio) return;
        const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

        const initialCapital = 100000;
        const nav = this.portfolio.nav || initialCapital;
        const navRatio = nav / initialCapital;              // 1.0 기준 배수
        const cumReturn = this.statistics.cumulative_return || (navRatio - 1) * 100;
        const unrealizedPct = this.holdings.length > 0
            ? this.holdings.reduce((sum, h) => sum + (h.profit_pct || 0), 0) / this.holdings.length
            : 0;

        // PORTFOLIO NAV (배수 + 수익률)
        setText('strategy-nav', navRatio.toFixed(4));
        const navReturnEl = document.getElementById('strategy-nav-return');
        if (navReturnEl) {
            navReturnEl.textContent = `${cumReturn >= 0 ? '+' : ''}${cumReturn.toFixed(2)}%`;
            navReturnEl.style.color = cumReturn >= 0 ? '#10b981' : '#ef4444';
        }

        // ACTIVE HOLDINGS (n / 12 + 미실현 평균)
        const posEl = document.getElementById('strategy-positions');
        if (posEl) posEl.innerHTML = `${this.holdings.length} <span style="font-size:0.9rem; color:#9ca3af;">/ ${this.maxPositions}</span>`;
        const unrealEl = document.getElementById('strategy-unrealized');
        if (unrealEl) {
            unrealEl.textContent = `미실현 ${unrealizedPct >= 0 ? '+' : ''}${unrealizedPct.toFixed(2)}%`;
            unrealEl.style.color = unrealizedPct >= 0 ? '#10b981' : '#ef4444';
        }

        // CLOSED TRADES (건수 + Hit/Avg)
        setText('strategy-stat-total-trades', `${this.statistics.total_trades || 0}`);
        const closedSummaryEl = document.getElementById('strategy-closed-summary');
        if (closedSummaryEl) {
            const winRate = this.statistics.win_rate || 0;
            const avgWinPct = this.closedTrades.length > 0
                ? this.closedTrades.reduce((s, t) => s + (t.profit_pct || 0), 0) / this.closedTrades.length
                : 0;
            closedSummaryEl.textContent = `Hit ${winRate.toFixed(1)}% · Avg ${avgWinPct >= 0 ? '+' : ''}${avgWinPct.toFixed(1)}%`;
        }

        // LAST UPDATE
        const ts = this.portfolio.timestamp || '';
        setText('strategy-last-update', ts ? ts.split(' ')[0] : '—');
    }

    // ===== C. NAV 곡선 차트 =====
    renderNavChart() {
        const canvas = document.getElementById('strategy-nav-chart');
        const emptyMsg = document.getElementById('strategy-nav-empty');
        if (!canvas) return;

        // 데이터 2포인트 미만이면 안내 메시지
        if (this.navHistory.length < 2) {
            canvas.style.display = 'none';
            if (emptyMsg) emptyMsg.style.display = 'block';
            return;
        }
        canvas.style.display = 'block';
        if (emptyMsg) emptyMsg.style.display = 'none';

        if (typeof Chart === 'undefined') {
            console.warn('Chart.js 미로드 — NAV 곡선 생략');
            return;
        }

        const labels = this.navHistory.map(p => p.date);
        const data = this.navHistory.map(p => ((p.nav - 1) * 100).toFixed(2));  // 누적수익률 %

        if (this.navChart) this.navChart.destroy();

        this.navChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '전략실 누적수익률 (%)',
                    data: data,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.25,
                    pointRadius: this.navHistory.length > 30 ? 0 : 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { ticks: { callback: v => v + '%', font: { size: 10 } }, grid: { color: '#f3f4f6' } },
                    x: { ticks: { font: { size: 9 }, maxTicksLimit: 8 }, grid: { display: false } }
                }
            }
        });
    }

    // ===== A. 보유종목 고도화 표 =====
    renderHoldingsTable() {
        const container = document.getElementById('strategy-holdings-table');
        const countEl = document.getElementById('strategy-holdings-count');
        if (!container) return;
        if (countEl) countEl.textContent = `(${this.holdings.length}개)`;

        if (this.holdings.length === 0) {
            container.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: var(--spacing-lg); color: var(--color-text-tertiary);">보유 종목이 없습니다</td></tr>`;
            return;
        }

        // P&L 내림차순 정렬
        const sorted = [...this.holdings].sort((a, b) => (b.profit_pct || 0) - (a.profit_pct || 0));

        let html = '';
        sorted.forEach(h => {
            const pnl = h.profit_pct || 0;
            const maxPct = h.max_pct || 0;
            const pnlColor = pnl >= 0 ? '#10b981' : '#ef4444';
            const phase = h.phase || 0;
            const phaseColor = phase >= 5 ? '#10b981' : phase === 4 ? '#059669' : phase === 3 ? '#3b82f6' : phase >= 6 ? '#ef4444' : '#9ca3af';
            const flags = h.flags || [];

            const flagBadges = flags.map(f => {
                let bg = '#e5e7eb', color = '#374151';
                if (f === 'BE') { bg = '#dbeafe'; color = '#1e40af'; }
                else if (f === 'Lock') { bg = '#dcfce7'; color = '#15803d'; }
                else if (f === 'Bw') { bg = '#fee2e2'; color = '#b91c1c'; }
                return `<span style="display:inline-block; padding:1px 5px; margin:0 1px; background:${bg}; color:${color}; border-radius:3px; font-size:0.6rem; font-weight:700;">${f}</span>`;
            }).join('');

            html += `
                <tr style="border-bottom:1px solid var(--color-border-light);">
                    <td style="text-align:left; font-weight:600;"><span class="ticker-link" style="color:#2563eb;" onclick="window.strategyRoomBinder.openModal('${h.ticker}')">${h.ticker}</span></td>
                    <td style="text-align:left; font-size:0.7rem; color:var(--color-text-tertiary);">${h.entry_date || '-'}</td>
                    <td style="text-align:right;">${h.days_held || 0}d</td>
                    <td style="text-align:right;">$${(h.entry_price || 0).toFixed(2)}</td>
                    <td style="text-align:right; font-weight:600;">$${(h.current_price || h.entry_price || 0).toFixed(2)}</td>
                    <td style="text-align:right; font-weight:700; color:${pnlColor};">${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%</td>
                    <td style="text-align:right; color:#6b7280;">${maxPct >= 0 ? '+' : ''}${maxPct.toFixed(1)}%</td>
                    <td style="text-align:right; font-size:0.7rem; color:#6b7280;">$${(h.stop_price || 0).toFixed(2)}<br><span style="font-size:0.65rem;">(${(h.stop_pct || 0).toFixed(1)}%)</span></td>
                    <td style="text-align:center;"><span style="padding:2px 6px; background:${phaseColor}; color:white; border-radius:3px; font-size:0.65rem; font-weight:600;">P${phase}</span></td>
                    <td style="text-align:center; font-weight:600; color:#fbbf24;">${h.rs_score || 0}</td>
                    <td style="text-align:center;">${flagBadges || '<span style="color:#d1d5db;">–</span>'}</td>
                </tr>`;
        });
        container.innerHTML = html;
    }

    // 청산 이력
    renderClosedTradesTable() {
        const container = document.getElementById('strategy-closed-trades-table');
        const countEl = document.getElementById('strategy-closed-count');
        if (!container) return;
        if (countEl) countEl.textContent = `(${this.closedTrades.length}건)`;

        if (this.closedTrades.length === 0) {
            container.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: var(--spacing-lg); color: var(--color-text-tertiary);">종료된 거래가 없습니다</td></tr>`;
            return;
        }

        // 최신순 (배열 뒤가 최신)
        const sorted = [...this.closedTrades].reverse();

        let html = '';
        sorted.forEach(t => {
            const pnl = t.profit_pct || 0;
            const pnlUsd = t.profit_usd || 0;
            const color = pnl >= 0 ? '#10b981' : '#ef4444';
            html += `
                <tr style="border-bottom:1px solid var(--color-border-light);">
                    <td style="text-align:left; font-weight:600; color:#2563eb;">${t.ticker}</td>
                    <td style="text-align:left; font-size:0.7rem; color:var(--color-text-tertiary);">${t.entry_date || '-'}</td>
                    <td style="text-align:left; font-size:0.7rem; color:var(--color-text-tertiary);">${t.exit_date || '-'}</td>
                    <td style="text-align:right;">$${(t.entry_price || 0).toFixed(2)}</td>
                    <td style="text-align:right;">$${(t.exit_price || 0).toFixed(2)}</td>
                    <td style="text-align:right; font-weight:700; color:${color};">${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%</td>
                    <td style="text-align:right; color:${color};">${pnlUsd >= 0 ? '+' : ''}$${Math.abs(pnlUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    <td style="text-align:left; font-size:0.75rem;">${t.exit_reason || '-'}</td>
                </tr>`;
        });
        container.innerHTML = html;
    }

    // ===== D. 위험지표 =====
    renderRiskMetrics() {
        const s = this.statistics;
        const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

        const cum = s.cumulative_return || 0;
        const cumEl = document.getElementById('strategy-stat-cumulative-return');
        if (cumEl) {
            cumEl.textContent = `${cum >= 0 ? '+' : ''}${cum.toFixed(2)}%`;
            cumEl.style.color = cum >= 0 ? '#10b981' : '#ef4444';
        }
        setText('strategy-stat-mdd', `${(s.mdd || 0).toFixed(1)}%`);
        setText('strategy-stat-sharpe', `${(s.sharpe || 0).toFixed(2)}`);
        setText('strategy-stat-winrate', `${(s.win_rate || 0).toFixed(1)}%`);
        setText('strategy-stat-avg-win', `$${(s.avg_win || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
        setText('strategy-stat-avg-loss', `$${Math.abs(s.avg_loss || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);

        const bestEl = document.getElementById('strategy-stat-best');
        if (bestEl) bestEl.textContent = `${(s.best_trade || 0) >= 0 ? '+' : ''}${(s.best_trade || 0).toFixed(1)}%`;
        const worstEl = document.getElementById('strategy-stat-worst');
        if (worstEl) worstEl.textContent = `${(s.worst_trade || 0).toFixed(1)}%`;
    }

    init() {
        this.loadAndRender();
    }

    // ===== 종목 상세 모달 =====
    openModal(ticker) {
        // 보유종목/신호/스캔에서 해당 종목 데이터 찾기
        const fromHolding = this.holdings.find(h => h.ticker === ticker);
        const fromSignal = this.entrySignals.find(s => s.ticker === ticker);
        const data = fromSignal || fromHolding || { ticker };

        const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

        const phase = data.phase || (fromHolding ? fromHolding.phase : 0) || 0;
        const rs = data.ibd_rs_rating || (fromHolding ? fromHolding.rs_score : 0) || 0;
        const close = data.close || (fromHolding ? fromHolding.current_price || fromHolding.entry_price : 0) || 0;
        const pivot = data.dist_pivot_pct;
        const chg6w = data.rs_6w_change;
        // A그룹 지표
        const comp = data.composite_rating || 0;
        const accGrade = data.acc_dis_grade || '—';
        const chartPattern = data.chart_pattern || null;
        const patternScore = data.pattern_score || 0;
        const supplyAbove = data.supply_above_pct;
        const pattern = chartPattern || (data.top_pattern ? 'Top Pattern' : (data.breakout ? 'Breakout' : (fromHolding ? fromHolding.pattern : null)));

        setText('modal-ticker', ticker);
        setText('modal-price', `$${close.toFixed(2)}`);
        setText('modal-rs', rs);
        setText('modal-phase', `P${phase}`);
        setText('modal-pivot', pivot != null ? `${pivot >= 0 ? '+' : ''}${pivot.toFixed(1)}%` : '—');
        setText('modal-chg', chg6w != null ? `${chg6w >= 0 ? '+' : ''}${chg6w.toFixed(1)}%` : '—');
        // A그룹 지표 표시
        setText('modal-comp', comp || '—');
        setText('modal-accdis', accGrade);
        setText('modal-supply', supplyAbove != null ? `${supplyAbove.toFixed(0)}%` : '—');
        // B그룹 재무 지표 표시
        const epsRating = data.eps_rating;
        const smrGrade = data.smr_grade;
        const salesGrowth = data.sales_growth;
        const instOwn = data.inst_ownership;
        setText('modal-eps', epsRating != null ? epsRating : '—');
        setText('modal-smr', smrGrade || '—');
        setText('modal-sales', salesGrowth != null ? `${salesGrowth >= 0 ? '+' : ''}${salesGrowth.toFixed(0)}%` : '—');
        setText('modal-inst', instOwn != null ? `${instOwn.toFixed(0)}%` : '—');

        // Phase 뱃지 색
        const phaseColor = phase >= 5 ? '#10b981' : phase === 4 ? '#059669' : phase === 3 ? '#3b82f6' : phase >= 6 ? '#ef4444' : '#9ca3af';
        const badge = document.getElementById('modal-phase-badge');
        if (badge) { badge.textContent = `P${phase}`; badge.style.background = phaseColor; }

        // 패턴 뱃지 (실제 차트 패턴 + 점수)
        setHTML('modal-pattern', pattern
            ? `<span style="display:inline-block; padding:2px 8px; background:#fef3c7; color:#92400e; border-radius:4px; font-size:0.7rem; font-weight:600;">${pattern}${patternScore ? ` ${patternScore}점` : ''}</span>`
            : '');

        // 종목명 (있으면)
        setText('modal-name', data.name || ticker);

        // 선정 이유 생성 (A그룹 반영)
        const reasons = [];
        if (rs >= 90) reasons.push(`IBD RS ${rs} (상위 ${100 - rs}%)`);
        else if (rs >= 80) reasons.push(`IBD RS ${rs} (강세)`);
        if (comp >= 90) reasons.push(`Composite ${comp}`);
        if (phase >= 5) reasons.push('Phase 5+ 완숙 리더 (강한 정배열)');
        else if (phase === 4) reasons.push('Phase 4 돌파 임박');
        if (chartPattern) reasons.push(`${chartPattern} 패턴 (${patternScore}점)`);
        if (data.rs_new_high) reasons.push('RS 신고가');
        if (data.rs_accelerating_strong) reasons.push('가속 추세');
        if (data.breakout) reasons.push('피벗 돌파');
        else if (pivot != null && pivot >= -3) reasons.push('피벗 근접 (3% 이내)');
        if (accGrade && ['A+', 'A', 'B+'].includes(accGrade)) reasons.push(`기관 매집 ${accGrade}`);
        if (supplyAbove != null && supplyAbove < 15) reasons.push(`위 매물 적음 (${supplyAbove.toFixed(0)}%)`);
        // B그룹 재무 강점
        if (epsRating != null && epsRating >= 80) reasons.push(`EPS Rating ${epsRating} (실적 강세)`);
        if (smrGrade && ['A', 'B'].includes(smrGrade)) reasons.push(`SMR ${smrGrade} (매출·마진 우수)`);
        if (salesGrowth != null && salesGrowth >= 25) reasons.push(`매출성장 +${salesGrowth.toFixed(0)}%`);
        setText('modal-reason', reasons.length ? reasons.join(' · ') : '5-Gate Funnel 통과 종목');

        // 모달 표시
        const modal = document.getElementById('ticker-modal');
        if (modal) modal.style.display = 'flex';

        // TradingView 차트 로드
        this.loadChart(ticker);
    }

    loadChart(ticker) {
        const container = document.getElementById('modal-chart');
        if (!container) return;
        container.innerHTML = '';

        const render = () => {
            try {
                new TradingView.widget({
                    container_id: 'modal-chart',
                    symbol: ticker,
                    interval: 'D',
                    theme: 'light',
                    style: '1',
                    locale: 'kr',
                    autosize: true,
                    hide_side_toolbar: true,
                    hide_top_toolbar: false,
                    studies: ['MASimple@tv-basicstudies'],
                });
            } catch (e) {
                container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--color-text-tertiary); font-size:0.8rem;">차트를 불러올 수 없습니다 (${ticker})</div>`;
            }
        };

        // TradingView 스크립트 동적 로드
        if (typeof TradingView === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://s3.tradingview.com/tv.js';
            script.onload = render;
            script.onerror = () => {
                container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--color-text-tertiary); font-size:0.8rem;">차트 라이브러리 로드 실패</div>`;
            };
            document.head.appendChild(script);
        } else {
            render();
        }
    }

    closeModal() {
        const modal = document.getElementById('ticker-modal');
        if (modal) modal.style.display = 'none';
        const chart = document.getElementById('modal-chart');
        if (chart) chart.innerHTML = '';  // 차트 정리
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const strategyRoom = new StrategyRoomBinder();
    strategyRoom.init();
    window.strategyRoomBinder = strategyRoom;

    // 모달 배경 클릭 시 닫기
    const modal = document.getElementById('ticker-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) strategyRoom.closeModal();
        });
    }
    // ESC 키로 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') strategyRoom.closeModal();
    });
});
