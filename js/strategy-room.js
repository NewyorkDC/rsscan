/**
 * RSSCAN v3 - Strategy Room v5 포트폴리오
 * strategy_room_portfolio.json을 기반으로 포트폴리오 렌더링
 */

class StrategyRoomBinder {
    constructor() {
        this.portfolio = null;
        this.holdings = [];
        this.closedTrades = [];
        this.statistics = null;
    }

    /**
     * 포트폴리오 데이터 로드 및 렌더링
     */
    async loadAndRender() {
        try {
            const response = await fetch('results/strategy_room_portfolio.json');
            if (!response.ok) throw new Error('전략실 포트폴리오 로드 실패');
            
            this.portfolio = await response.json();
            this.holdings = this.portfolio.holdings || [];
            this.closedTrades = this.portfolio.closed_trades || [];
            this.statistics = this.portfolio.statistics || {};

            console.log(`✅ Strategy Room 데이터 로드: ${this.holdings.length}개 보유, ${this.closedTrades.length}개 종료`);

            // 렌더링
            this.renderPortfolioSummary();
            this.renderHoldingsTable();
            this.renderClosedTradesTable();
            this.renderStatistics();

        } catch (error) {
            console.error(`❌ Strategy Room 로드 실패: ${error.message}`);
        }
    }

    /**
     * 포트폴리오 요약 정보 (NAV, Cash, Holdings)
     */
    renderPortfolioSummary() {
        if (!this.portfolio) return;

        const navElement = document.getElementById('strategy-nav');
        const cashElement = document.getElementById('strategy-cash');
        const holdingsValueElement = document.getElementById('strategy-holdings-value');

        const nav = this.portfolio.nav || 100000;
        const cash = this.portfolio.cash || 0;
        const holdingsValue = nav - cash;
        const holdingsPct = ((holdingsValue / nav) * 100).toFixed(1);

        if (navElement) navElement.textContent = `$${nav.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        if (cashElement) {
            cashElement.innerHTML = `
                <strong>$${cash.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
                <span style="font-size: 0.75rem; color: var(--color-text-tertiary); margin-left: 4px;">
                    (${((cash / nav) * 100).toFixed(1)}%)
                </span>
            `;
        }
        if (holdingsValueElement) {
            holdingsValueElement.innerHTML = `
                <strong>$${holdingsValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                <span style="font-size: 0.75rem; color: var(--color-text-tertiary); margin-left: 4px;">
                    (${holdingsPct}%)
                </span>
            `;
        }

        console.log(`✅ 포트폴리오 요약: NAV ${nav}, Cash ${cash}, Holdings ${holdingsPct}%`);
    }

    /**
     * 현재 보유 종목 테이블 렌더링
     */
    renderHoldingsTable() {
        const container = document.getElementById('strategy-holdings-table');
        if (!container || this.holdings.length === 0) {
            if (container) {
                container.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: center; padding: var(--spacing-lg); color: var(--color-text-tertiary);">
                            보유 종목이 없습니다
                        </td>
                    </tr>
                `;
            }
            return;
        }

        let html = '';
        let totalCost = 0;
        let totalProfit = 0;

        this.holdings.forEach((holding, idx) => {
            const { ticker, entry_date, entry_price, shares, entry_cost, phase, rs_score, status, profit_pct, entry_reason } = holding;
            
            const statusColor = status === 'ACTIVE' ? '#10b981' : '#ef4444';
            const phaseColor = phase === 4 ? '#0f766e' : '#666';
            const profitColor = profit_pct >= 0 ? '#10b981' : '#ef4444';

            totalCost += entry_cost || 0;
            totalProfit += holding.profit_usd || 0;

            html += `
                <tr style="border-bottom: 1px solid var(--color-border-light);">
                    <td style="padding: var(--spacing-md); font-weight: 600; color: #0f766e;">${ticker}</td>
                    <td style="padding: var(--spacing-md); text-align: right;">
                        <span style="font-size: 0.85rem; color: var(--color-text-secondary);">$${entry_price.toFixed(2)}</span>
                        <span style="display: block; font-size: 0.75rem; color: var(--color-text-tertiary); margin-top: 2px;">${entry_date}</span>
                    </td>
                    <td style="padding: var(--spacing-md); text-align: center;">
                        <strong>${shares}주</strong>
                    </td>
                    <td style="padding: var(--spacing-md); text-align: right;">
                        <strong>$${entry_cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                    </td>
                    <td style="padding: var(--spacing-md); text-align: center;">
                        <span style="padding: 3px 8px; border-radius: 4px; background: #f0fdf4; color: ${phaseColor}; font-weight: 600; font-size: 0.85rem;">
                            Phase ${phase}
                        </span>
                    </td>
                    <td style="padding: var(--spacing-md); text-align: center;">
                        <span style="padding: 3px 8px; border-radius: 4px; background: #f3f4f6; color: #666; font-weight: 600; font-size: 0.85rem;">
                            ${rs_score}
                        </span>
                    </td>
                    <td style="padding: var(--spacing-md); text-align: right;">
                        <span style="font-weight: 600; color: ${profitColor};">
                            ${profit_pct >= 0 ? '+' : ''}${profit_pct.toFixed(2)}%
                        </span>
                        <span style="display: block; font-size: 0.75rem; color: var(--color-text-tertiary); margin-top: 2px;">
                            ${profit_pct >= 0 ? '+' : ''}$${holding.profit_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                    </td>
                    <td style="padding: var(--spacing-md); text-align: center;">
                        <span style="padding: 4px 8px; border-radius: 4px; background: ${status === 'ACTIVE' ? '#dbeafe' : '#fee'}; color: ${statusColor}; font-weight: 600; font-size: 0.75rem;">
                            ${status}
                        </span>
                    </td>
                </tr>
            `;
        });

        container.innerHTML = html;
        console.log(`✅ Holdings 테이블 렌더링: ${this.holdings.length}개 종목`);
    }

    /**
     * 종료된 거래 테이블 렌더링
     */
    renderClosedTradesTable() {
        const container = document.getElementById('strategy-closed-trades-table');
        if (!container) return;

        if (this.closedTrades.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: var(--spacing-lg); color: var(--color-text-tertiary);">
                        종료된 거래가 없습니다
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';

        this.closedTrades.forEach(trade => {
            const { ticker, entry_date, entry_price, exit_date, exit_price, shares, profit_pct, profit_usd, exit_reason } = trade;
            const profitColor = profit_pct >= 0 ? '#10b981' : '#ef4444';

            html += `
                <tr style="border-bottom: 1px solid var(--color-border-light);">
                    <td style="padding: var(--spacing-md); font-weight: 600; color: #0f766e;">${ticker}</td>
                    <td style="padding: var(--spacing-md); text-align: right;">
                        <span style="font-size: 0.85rem;">$${entry_price.toFixed(2)}</span>
                        <span style="display: block; font-size: 0.75rem; color: var(--color-text-tertiary);">${entry_date}</span>
                    </td>
                    <td style="padding: var(--spacing-md); text-align: right;">
                        <span style="font-size: 0.85rem;">$${exit_price.toFixed(2)}</span>
                        <span style="display: block; font-size: 0.75rem; color: var(--color-text-tertiary);">${exit_date}</span>
                    </td>
                    <td style="padding: var(--spacing-md); text-align: center;">
                        <strong>${shares}주</strong>
                    </td>
                    <td style="padding: var(--spacing-md); text-align: right;">
                        <span style="font-weight: 600; color: ${profitColor};">
                            ${profit_pct >= 0 ? '+' : ''}${profit_pct.toFixed(2)}%
                        </span>
                    </td>
                    <td style="padding: var(--spacing-md); text-align: right;">
                        <span style="font-weight: 600; color: ${profitColor};">
                            ${profit_usd >= 0 ? '+' : ''}$${profit_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                    </td>
                    <td style="padding: var(--spacing-md); text-align: center; font-size: 0.85rem; color: var(--color-text-secondary);">
                        ${exit_reason || 'N/A'}
                    </td>
                </tr>
            `;
        });

        container.innerHTML = html;
        console.log(`✅ Closed Trades 테이블 렌더링: ${this.closedTrades.length}개 거래`);
    }

    /**
     * 거래 통계 렌더링
     */
    renderStatistics() {
        const stats = this.statistics;
        if (!stats) return;

        const totalTradesElem = document.getElementById('strategy-stat-total-trades');
        const winRateElem = document.getElementById('strategy-stat-win-rate');
        const avgWinElem = document.getElementById('strategy-stat-avg-win');
        const avgLossElem = document.getElementById('strategy-stat-avg-loss');
        const cumulativeReturnElem = document.getElementById('strategy-stat-cumulative-return');

        if (totalTradesElem) totalTradesElem.textContent = stats.total_trades || 0;
        if (winRateElem) winRateElem.textContent = `${(stats.win_rate || 0).toFixed(1)}%`;
        if (avgWinElem) avgWinElem.textContent = `$${(stats.avg_win || 0).toFixed(2)}`;
        if (avgLossElem) avgLossElem.textContent = `$${Math.abs(stats.avg_loss || 0).toFixed(2)}`;
        
        if (cumulativeReturnElem) {
            const cumReturn = stats.cumulative_return || 0;
            const returnColor = cumReturn >= 0 ? '#10b981' : '#ef4444';
            cumulativeReturnElem.innerHTML = `
                <span style="color: ${returnColor}; font-weight: 600;">
                    ${cumReturn >= 0 ? '+' : ''}${cumReturn.toFixed(2)}%
                </span>
            `;
        }

        console.log(`✅ 통계 렌더링: 승률 ${stats.win_rate}%, 누적 수익 ${stats.cumulative_return}%`);
    }

    /**
     * 초기화 및 정기 업데이트
     */
    init() {
        this.loadAndRender();

        // 1분마다 자동 업데이트
        setInterval(() => {
            console.log('🔄 Strategy Room 자동 새로고침');
            this.loadAndRender();
        }, 60000);
    }
}

/**
 * DOMContentLoaded 이벤트
 */
document.addEventListener('DOMContentLoaded', () => {
    const strategyRoom = new StrategyRoomBinder();
    strategyRoom.init();
    window.strategyRoomBinder = strategyRoom;
});
