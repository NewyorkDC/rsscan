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
        this.navChart = null;
        this.maxPositions = 12;
    }

    async loadAndRender() {
        try {
            const response = await fetch('results/strategy_room_portfolio.json');
            if (!response.ok) throw new Error('전략실 포트폴리오 로드 실패');

            this.portfolio = await response.json();
            this.holdings = this.portfolio.holdings || [];
            this.closedTrades = this.portfolio.closed_trades || [];
            this.statistics = this.portfolio.statistics || {};
            this.navHistory = this.portfolio.nav_history || [];

            console.log(`✅ Strategy Room v6 로드: 보유 ${this.holdings.length}개, 청산 ${this.closedTrades.length}건, NAV포인트 ${this.navHistory.length}개`);

            this.renderSummary();        // B
            this.renderNavChart();       // C
            this.renderHoldingsTable();  // A
            this.renderClosedTradesTable();
            this.renderRiskMetrics();    // D
        } catch (error) {
            console.error(`❌ Strategy Room 로드 실패: ${error.message}`);
        }
    }

    // ===== B. 요약 카드 =====
    renderSummary() {
        if (!this.portfolio) return;
        const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        const setHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

        const nav = this.portfolio.nav || 100000;
        const cash = this.portfolio.cash || 0;
        const holdingsValue = this.holdings.reduce((sum, h) =>
            sum + (h.current_price || h.entry_price) * h.shares, 0);
        const cumReturn = this.statistics.cumulative_return || 0;
        const unrealized = this.holdings.reduce((sum, h) => sum + (h.profit_usd || 0), 0);

        setText('strategy-nav', `$${nav.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);

        const navReturnEl = document.getElementById('strategy-nav-return');
        if (navReturnEl) {
            navReturnEl.textContent = `${cumReturn >= 0 ? '+' : ''}${cumReturn.toFixed(2)}%`;
            navReturnEl.style.color = cumReturn >= 0 ? '#10b981' : '#ef4444';
        }

        setText('strategy-cash', `$${cash.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
        setText('strategy-holdings-value', `$${holdingsValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
        setText('strategy-positions', `${this.holdings.length} / ${this.maxPositions}`);

        const unrealizedEl = document.getElementById('strategy-unrealized');
        if (unrealizedEl) {
            unrealizedEl.textContent = `${unrealized >= 0 ? '+' : ''}$${Math.abs(unrealized).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
            unrealizedEl.style.color = unrealized >= 0 ? '#10b981' : '#ef4444';
        }

        setText('strategy-winrate', `${(this.statistics.win_rate || 0).toFixed(1)}%`);
        setText('strategy-trades-count', `${this.statistics.total_trades || 0}건`);
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
                    <td style="text-align:left; font-weight:600; color:#2563eb;">${h.ticker}</td>
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
        setText('strategy-stat-total-trades', `${s.total_trades || 0}`);
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
}

document.addEventListener('DOMContentLoaded', () => {
    const strategyRoom = new StrategyRoomBinder();
    strategyRoom.init();
    window.strategyRoomBinder = strategyRoom;
});
