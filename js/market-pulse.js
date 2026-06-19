/**
 * RSSCAN v3 - Market Pulse 데이터 바인딩
 * daily_ibd_scan.json을 기반으로 시장 상태, IBD 정렬 진단, 지수 정보 렌더링
 */

class MarketPulseBinder {
    constructor() {
        this.universeData = [];
        this.marketStatus = null;
        this.indices = {
            'SP500': { ticker: '^GSPC', name: 'S&P 500', price: 7554.29, change: 1.65, ma: [true, true, true] },
            'NASDAQ': { ticker: '^IXIC', name: 'NASDAQ', price: 26683.94, change: 3.07, ma: [true, true, true] },
            'RUSSELL': { ticker: '^RUT', name: 'Russell 2000', price: 2965.09, change: 0.72, ma: [true, true, true] }
        };
    }

    /**
     * 데이터 로드 및 렌더링
     */
    async loadAndRender() {
        try {
            // daily_ibd_scan.json 로드
            const response = await fetch('results/daily_ibd_scan.json');
            if (!response.ok) throw new Error('daily_ibd_scan.json 로드 실패');
            
            this.universeData = await response.json();
            console.log(`✅ Market Pulse 데이터 로드: ${this.universeData.length}개 종목`);

            // 시장 상태 분석 및 렌더링
            this.analyzeMarketStatus();
            this.renderMarketStatus();
            this.renderIBDDiagnosis();
            this.renderIndices();

        } catch (error) {
            console.error(`❌ Market Pulse 로드 실패: ${error.message}`);
        }
    }

    /**
     * 시장 상태 분석 (데이터 기반)
     */
    analyzeMarketStatus() {
        if (this.universeData.length === 0) {
            this.marketStatus = {
                state: 'Unknown',
                description: 'Data unavailable',
                icon: '❓',
                color: 'gray',
                investmentRatio: '0%',
                confidence: 0
            };
            return;
        }

        // 1. trend_pass 분포 계산
        const trend8 = this.universeData.filter(d => d.trend_pass === 8).length;
        const trend7 = this.universeData.filter(d => d.trend_pass === 7).length;
        const trend6 = this.universeData.filter(d => d.trend_pass === 6).length;
        const trendLess6 = this.universeData.filter(d => d.trend_pass < 6).length;
        
        const total = this.universeData.length;
        const trend8Pct = (trend8 / total) * 100;
        const trend7Pct = (trend7 / total) * 100;

        // 2. RS Score 분포 계산
        const rs90Plus = this.universeData.filter(d => d.total_score >= 90).length;
        const rs80Plus = this.universeData.filter(d => d.total_score >= 80).length;
        const rs70Plus = this.universeData.filter(d => d.total_score >= 70).length;

        // 3. 시장 상태 판단 로직
        // trend_pass 8이 50% 이상이고 RS 80+ 비중이 높으면 Uptrend
        // trend_pass 7이 우위이면 Under Pressure
        // 그 외 Correction 등

        let state, description, icon, color, investmentRatio;

        if (trend8Pct >= 50 && rs80Plus / total >= 0.30) {
            state = 'Uptrend Resumed';
            description = 'FTD 적극 활금 구간, 지적 기반의 신금 진입 적금';
            icon = '🟢';
            color = 'green';
            investmentRatio = '75~95%';
        } else if (trend8Pct >= 40 && rs80Plus / total >= 0.25) {
            state = 'Confirmed Uptrend';
            description = '확인된 상승장, 선별적 진입 가능';
            icon = '🟢';
            color = 'green';
            investmentRatio = '50~75%';
        } else if (trend7Pct >= 40) {
            state = 'Uptrend Under Pressure';
            description = '상승장이지만 압력 중, 신중한 접근 필요';
            icon = '🟡';
            color = 'yellow';
            investmentRatio = '30~50%';
        } else if (trend8Pct < 20 || trend6 / total >= 0.30) {
            state = 'Market in Correction';
            description = '조정 구간, 현금 보유 권장';
            icon = '🔴';
            color = 'red';
            investmentRatio = '10~30%';
        } else {
            state = 'Rally Attempt';
            description = '반등 시도 중, 관찰 필요';
            icon = '🟠';
            color = 'orange';
            investmentRatio = '30~50%';
        }

        this.marketStatus = {
            state,
            description,
            icon,
            color,
            investmentRatio,
            confidence: Math.min(100, Math.round((rs80Plus / total) * 100 * 1.2)),
            statistics: {
                trend8,
                trend7,
                trend6,
                trendLess6,
                rs90Plus,
                rs80Plus,
                rs70Plus,
                trend8Pct: trend8Pct.toFixed(1),
                trend7Pct: trend7Pct.toFixed(1)
            }
        };

        console.log(`📊 시장 상태: ${state} (신뢰도: ${this.marketStatus.confidence}%)`);
    }

    /**
     * 시장 상태 카드 렌더링
     */
    renderMarketStatus() {
        const container = document.querySelector('.market-status-hero');
        if (!container || !this.marketStatus) return;

        const { state, description, icon, investmentRatio, confidence } = this.marketStatus;
        
        // 배경색 결정
        const bgColor = {
            'green': '#f0fdf4',
            'yellow': '#fffbeb',
            'orange': '#fff7ed',
            'red': '#fef2f2',
            'gray': '#f9fafb'
        }[this.marketStatus.color] || '#f9fafb';

        const borderColor = {
            'green': '#dcfce7',
            'yellow': '#fef3c7',
            'orange': '#fedba8',
            'red': '#fecaca',
            'gray': '#e5e7eb'
        }[this.marketStatus.color] || '#e5e7eb';

        const textColor = {
            'green': '#0f766e',
            'yellow': '#92400e',
            'orange': '#9a3412',
            'red': '#7f1d1d',
            'gray': '#374151'
        }[this.marketStatus.color] || '#374151';

        container.innerHTML = `
            <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 10px; padding: var(--spacing-2xl); display: grid; grid-template-columns: 1fr auto; gap: var(--spacing-2xl); align-items: center;">
                <div>
                    <div style="display: flex; align-items: center; gap: var(--spacing-lg); margin-bottom: var(--spacing-lg);">
                        <span style="font-size: 48px;">${icon}</span>
                        <div>
                            <h2 style="font-size: 1.75rem; font-weight: 700; color: ${textColor}; margin: 0 0 var(--spacing-sm) 0;">${state}</h2>
                            <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin: 0;">${description}</p>
                        </div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.75rem; color: var(--color-text-tertiary); text-transform: uppercase; font-weight: 600; margin-bottom: var(--spacing-sm);">권용 투자 비중</div>
                    <div style="font-size: 2.5rem; font-weight: 700; color: ${textColor}; margin-bottom: var(--spacing-sm);">${investmentRatio}</div>
                    <div style="font-size: 0.75rem; color: var(--color-text-tertiary);">신뢰도: ${confidence}%</div>
                </div>
            </div>
        `;

        console.log(`✅ 시장 상태 카드 렌더링 완료`);
    }

    /**
     * IBD 정렬 진단 (아코디언) 렌더링
     */
    renderIBDDiagnosis() {
        if (!this.marketStatus || !this.marketStatus.statistics) return;

        const { state, statistics } = this.marketStatus;
        const { trend8, trend7, trend6, trendLess6, trend8Pct, trend7Pct } = statistics;

        // 아코디언 항목들
        const diagnoses = [
            {
                name: 'Uptrend Resumed',
                emoji: '🟢',
                criteria: trend8 > 0 ? `${trend8}개 종목 (${trend8Pct}%)` : '0개',
                condition: state === 'Uptrend Resumed',
                checks: [
                    `✓ FTD active: Trend Pass 8 = ${trend8}개`,
                    `✓ RS 강도: 80+ = ${statistics.rs80Plus}개 (${((statistics.rs80Plus / this.universeData.length) * 100).toFixed(1)}%)`
                ]
            },
            {
                name: 'Confirmed Uptrend',
                emoji: '🟢',
                criteria: trend8 > 0 ? `${trend8}개 종목` : '0개',
                condition: false,
                checks: ['기준 미충족']
            },
            {
                name: 'Uptrend Under Pressure',
                emoji: '🟡',
                criteria: trend7 > 0 ? `${trend7}개 종목 (${trend7Pct}%)` : '0개',
                condition: state === 'Uptrend Under Pressure',
                checks: [`✓ Trend Pass 7 = ${trend7}개`]
            },
            {
                name: 'Rally Attempt',
                emoji: '🟠',
                criteria: '2/2 미충족',
                condition: state === 'Rally Attempt',
                checks: ['조정 후 반등 신호']
            },
            {
                name: 'Market in Correction',
                emoji: '🔴',
                criteria: trend6 > 0 ? `${trend6}개 (${((trend6 / this.universeData.length) * 100).toFixed(1)}%)` : '0개',
                condition: state === 'Market in Correction',
                checks: [`✓ Trend Pass 6 이하 = ${trendLess6}개`]
            }
        ];

        const container = document.querySelector('.ibd-diagnosis-list');
        if (!container) return;

        let html = '';
        diagnoses.forEach((diag, idx) => {
            if (diag.condition) {
                // 펼쳐진 상태
                html += `
                    <div style="margin-bottom: var(--spacing-lg); background: #f0fdf4; border: 1px solid #dcfce7; border-left: 4px solid var(--color-primary); border-radius: 8px; padding: var(--spacing-lg);">
                        <div style="display: flex; align-items: center; gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                            <span style="font-size: 20px;">${diag.emoji}</span>
                            <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--color-primary); margin: 0;">${diag.name}</h4>
                            <span style="margin-left: auto; padding: 2px 6px; background: var(--color-primary); color: white; font-size: 0.65rem; font-weight: 600; border-radius: 4px;">활성</span>
                        </div>
                        <div style="border-top: 1px solid #dcfce7; padding-top: var(--spacing-lg);">
                            ${diag.checks.map(check => `
                                <div style="display: flex; align-items: flex-start; gap: var(--spacing-md); margin-bottom: var(--spacing-md);">
                                    <span style="color: var(--color-primary); font-weight: 700;">✓</span>
                                    <div><div style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-primary);">${check}</div></div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                // 접혀있는 상태
                const statusIcon = diag.emoji;
                html += `
                    <div style="background: white; border: 1px solid var(--color-border-light); border-radius: 8px; padding: var(--spacing-lg); margin-bottom: var(--spacing-sm); box-shadow: 0 1px 3px rgba(0,0,0,0.05); cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                            <span style="font-weight: 600;">▶</span>
                            <span>${statusIcon}</span>
                            <h5 style="font-size: 0.9rem; font-weight: 600; color: var(--color-text-primary); margin: 0; flex: 1;">${diag.name}</h5>
                            <span style="font-size: 0.75rem; color: var(--color-text-tertiary);">${diag.criteria}</span>
                        </div>
                    </div>
                `;
            }
        });

        container.innerHTML = html;
        console.log(`✅ IBD 정렬 진단 렌더링 완료`);
    }

    /**
     * 주요 지수 정보 렌더링
     */
    renderIndices() {
        const container = document.querySelector('.indices-cards');
        if (!container) return;

        let html = '';
        Object.values(this.indices).forEach(idx => {
            const changeColor = idx.change >= 0 ? 'var(--color-primary)' : '#ef4444';
            const maCount = idx.ma.filter(m => m).length;

            html += `
                <div style="background: white; border: 1px solid var(--color-border-light); border-radius: 8px; padding: var(--spacing-lg); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: var(--spacing-md);">
                        <div>
                            <div style="font-size: 0.75rem; color: var(--color-text-tertiary); text-transform: uppercase; font-weight: 600;">Index</div>
                            <div style="font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin-top: 4px;">${idx.price.toLocaleString()}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.1rem; font-weight: 700; color: ${changeColor};">${idx.change > 0 ? '+' : ''}${idx.change}%</div>
                        </div>
                    </div>
                    <div style="height: 60px; background: var(--color-bg-main); border-radius: 6px; margin-bottom: var(--spacing-md); border: 1px dashed var(--color-border-light);"></div>
                    <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
                        <span style="padding: 4px 8px; background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 12px; font-size: 0.65rem; font-weight: 600; color: var(--color-primary);">✓ 21MA</span>
                        <span style="padding: 4px 8px; background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 12px; font-size: 0.65rem; font-weight: 600; color: var(--color-primary);">✓ 50MA</span>
                        <span style="padding: 4px 8px; background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 12px; font-size: 0.65rem; font-weight: 600; color: var(--color-primary);">✓ 200MA</span>
                    </div>
                    <div style="padding: var(--spacing-sm) var(--spacing-md); background: var(--color-primary); color: white; border-radius: 6px; font-size: 0.75rem; font-weight: 600; text-align: center;">
                        ✓ MA ${maCount}/3 통과
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        console.log(`✅ 주요 지수 렌더링 완료`);
    }

    /**
     * 초기화 및 정기 업데이트
     */
    init() {
        this.loadAndRender();

        // 1분마다 자동 업데이트
        setInterval(() => {
            console.log('🔄 Market Pulse 자동 새로고침');
            this.loadAndRender();
        }, 60000);
    }
}

/**
 * DOMContentLoaded 이벤트
 */
document.addEventListener('DOMContentLoaded', () => {
    const marketPulse = new MarketPulseBinder();
    marketPulse.init();
    window.marketPulseBinder = marketPulse;
});
