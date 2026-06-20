/**
 * RSSCAN v3 - Market Pulse 데이터 바인딩 (v2.1 + Chart.js)
 * results/market_pulse.json 실데이터 → 히어로/사이드바/지수카드/Stage·Phase + 차트.
 * - 지수 미니 스파크라인 3개 (초록 곡선, 격자/툴팁/범례 숨김)
 * - Breadth 추이 차트 (S&P 파랑 / NASDAQ 주황 / 시스템 초록 점선, 하단 범례)
 * - 데이터 없으면 폴백 (차트 미생성, 안내 표시)
 */

class MarketPulseBinder {
    constructor() {
        this.pulse = null;
        this.charts = {};   // Chart 인스턴스 보관 (재렌더 시 destroy)
    }

    async loadAndRender() {
        try {
            const res = await fetch('results/market_pulse.json?nc=' + Date.now());
            if (!res.ok) throw new Error('market_pulse.json 로드 실패');
            this.pulse = await res.json();
            console.log('✅ Market Pulse 로드:', this.pulse.date);

            this.renderHero();
            this.renderSidebar();
            this.renderIndices();   // 지수 카드 (canvas 포함) 생성
            this.renderStages();
            this.renderCharts();    // canvas에 차트 그리기 (DOM 생성 후)
        } catch (err) {
            console.error('❌ Market Pulse 렌더 실패:', err.message);
        }
    }

    setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

    regimeColors(code) {
        const map = {
            'uptrend':    { color: '#10b981', bg: '#f0fdf4', border: '#dcfce7', icon: '🟢' },
            'confirmed':  { color: '#10b981', bg: '#f0fdf4', border: '#dcfce7', icon: '🟢' },
            'pressure':   { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: '🟡' },
            'rally':      { color: '#f59e0b', bg: '#fff7ed', border: '#fed7aa', icon: '🟠' },
            'correction': { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '🔴' },
            'unknown':    { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', icon: '⚪' },
        };
        return map[code] || map['unknown'];
    }

    renderHero() {
        const p = this.pulse;
        const hero = document.querySelector('.market-status-hero');
        if (!hero) return;
        const c = this.regimeColors(p.regime_code);
        hero.style.background = c.bg;
        hero.style.borderColor = c.border;
        hero.innerHTML = `
            <div>
                <div style="display: flex; align-items: center; gap: var(--spacing-lg); margin-bottom: var(--spacing-lg);">
                    <span style="font-size: 48px;">${p.regime_icon || c.icon}</span>
                    <div>
                        <h2 style="font-size: 1.75rem; font-weight: 700; color: ${c.color}; margin: 0 0 var(--spacing-sm) 0;">${p.regime || 'Unknown'}</h2>
                        <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin: 0;">${p.exposure_label || ''} · 분산일 ${p.dd_count != null ? p.dd_count : '—'}개</p>
                    </div>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.75rem; color: var(--color-text-tertiary); text-transform: uppercase; font-weight: 600; margin-bottom: var(--spacing-sm);">권장 투자 비중</div>
                <div style="font-size: 2.5rem; font-weight: 700; color: ${c.color};">${p.investment_ratio || '—'}</div>
                <div style="font-size: 0.8rem; color: var(--color-text-tertiary); margin-top: 4px;">Exposure ${p.exposure_count != null ? p.exposure_count : 0}/5</div>
            </div>
        `;
    }

    renderSidebar() {
        const p = this.pulse;
        const c = this.regimeColors(p.regime_code);
        const badge = document.querySelector('.regime-badge .regime-text');
        if (badge) badge.textContent = p.regime || 'Unknown';
        const dot = document.querySelector('.regime-badge .regime-dot');
        if (dot) dot.style.color = c.color;
        this.setText('sidebar-regime-ratio', p.investment_ratio || '—');
        const ratioEl = document.getElementById('sidebar-regime-ratio');
        if (ratioEl) ratioEl.style.color = c.color;
        this.setText('sidebar-exposure', `${p.exposure_count != null ? p.exposure_count : 0}/5 · ${p.exposure_pct || '—'}`);
        const expEl = document.getElementById('sidebar-exposure');
        if (expEl) expEl.style.color = c.color;
        this.setText('sidebar-dd-count', p.dd_count != null ? p.dd_count : '—');
        this.setText('sidebar-breadth', p.breadth_pct != null ? p.breadth_pct + '%' : '—');
    }

    renderIndices() {
        const p = this.pulse;
        const container = document.querySelector('.indices-cards');
        if (!container || !p.indices) return;
        const order = ['SP500', 'NASDAQ', 'RUSSELL'];
        const tickerMap = { SP500: '^GSPC', NASDAQ: '^IXIC', RUSSELL: '^RUT' };
        const canvasMap = { SP500: 'chart-sp500', NASDAQ: 'chart-nasdaq', RUSSELL: 'chart-russell' };
        let html = '';

        order.forEach(key => {
            const idx = p.indices[key];
            if (!idx) return;
            const hasData = idx.close != null;
            const chg = idx.change_pct || 0;
            const chgColor = chg >= 0 ? 'var(--color-primary)' : '#ef4444';
            const staleTag = idx.stale ? ' <span style="font-size:0.6rem; color:#92400e; background:#fef3c7; padding:1px 5px; border-radius:4px;">과거</span>' : '';
            const maList = [
                { label: '21MA', on: idx.above_ma21 },
                { label: '50MA', on: idx.above_ma50 },
                { label: '200MA', on: idx.above_ma200 },
            ];
            const maCount = maList.filter(m => m.on).length;
            const maBadges = maList.map(m => `<span style="padding: 3px 8px; background: ${m.on ? '#d1fae5' : '#f3f4f6'}; color: ${m.on ? '#065f46' : '#9ca3af'}; border-radius: 12px; font-size: 0.68rem; font-weight: 600;">${m.on ? '✓' : '✗'} ${m.label}</span>`).join('');

            html += `
                <div style="background: var(--color-bg-card); border: 1px solid var(--color-border-light); border-radius: 8px; padding: var(--spacing-lg); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: var(--spacing-md);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div style="font-weight: 600; font-size: 0.9rem; color: var(--color-text-primary);">${idx.name}${staleTag}</div>
                            <div style="font-size: 0.7rem; color: var(--color-text-tertiary);">${tickerMap[key]}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.4rem; font-weight: 700; color: var(--color-text-primary);">${hasData ? idx.close.toLocaleString() : '—'}</div>
                            <div style="font-size: 0.8rem; font-weight: 600; color: ${chgColor};">${hasData ? (chg > 0 ? '+' : '') + chg + '%' : '데이터 없음'}</div>
                        </div>
                    </div>
                    ${hasData ? `
                    <div style="width: 100%; height: 50px;"><canvas id="${canvasMap[key]}"></canvas></div>
                    <div style="display: flex; gap: 6px;">${maBadges}</div>
                    <div style="background: ${maCount >= 2 ? '#d1fae5' : '#fef3c7'}; border: 1px solid ${maCount >= 2 ? '#a7f3d0' : '#fde68a'}; border-radius: 6px; padding: 6px; text-align: center; font-size: 0.72rem; font-weight: 600; color: ${maCount >= 2 ? '#065f46' : '#92400e'};">MA ${maCount}/3 통과</div>` : `
                    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px; text-align: center; font-size: 0.72rem; font-weight: 600; color: #991b1b;">⚠️ 지수 데이터 수집 실패 (yfinance 제한)</div>`}
                </div>
            `;
        });
        container.innerHTML = html;
    }

    renderStages() {
        const p = this.pulse;
        if (p.stages) {
            const pulseVals = document.querySelectorAll('.pulse-grid .pulse-value');
            if (pulseVals.length >= 3) {
                pulseVals[0].textContent = p.stages.stage2 != null ? p.stages.stage2 : '—';
                pulseVals[1].textContent = p.stages.stage3 != null ? p.stages.stage3 : '—';
                pulseVals[2].textContent = p.stages.stage4 != null ? p.stages.stage4 : '—';
            }
        }
        if (p.phase_distribution) {
            const pd = p.phase_distribution;
            const total = (pd.p4plus || 0) + (pd.p4 || 0) + (pd.p3 || 0) + (pd.p67 || 0);
            const rows = document.querySelectorAll('.phase-bars .phase-bar-row');
            const vals = [pd.p4plus, pd.p4, pd.p3, pd.p67];
            rows.forEach((row, i) => {
                const fill = row.querySelector('.phase-bar-fill');
                const count = row.querySelector('.phase-count');
                if (count) count.textContent = vals[i] != null ? vals[i] : '—';
                if (fill && total > 0) fill.style.width = Math.round((vals[i] || 0) / total * 100) + '%';
            });
        }
    }

    // ===== 차트 렌더링 =====
    renderCharts() {
        if (typeof Chart === 'undefined') { console.warn('Chart.js 미로드 — 차트 스킵'); return; }
        const p = this.pulse;
        const idx = p.indices || {};

        // 지수 미니 스파크라인 (초록 곡선, 격자/툴팁/범례 숨김)
        const sparkDefs = [
            { canvas: 'chart-sp500', data: (idx.SP500 || {}).spark },
            { canvas: 'chart-nasdaq', data: (idx.NASDAQ || {}).spark },
            { canvas: 'chart-russell', data: (idx.RUSSELL || {}).spark },
        ];
        sparkDefs.forEach(d => this.drawSparkline(d.canvas, d.data));

        // Breadth 추이 차트
        this.drawBreadthChart();
    }

    drawSparkline(canvasId, data) {
        const el = document.getElementById(canvasId);
        if (!el) return;
        if (!Array.isArray(data) || data.length < 2) return;  // 폴백: 데이터 없으면 미생성
        if (this.charts[canvasId]) this.charts[canvasId].destroy();
        const up = data[data.length - 1] >= data[0];
        const color = up ? '#10b981' : '#ef4444';
        this.charts[canvasId] = new Chart(el.getContext('2d'), {
            type: 'line',
            data: {
                labels: data.map((_, i) => i),
                datasets: [{
                    data: data,
                    borderColor: color,
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: false,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } },
                elements: { line: { borderJoinStyle: 'round' } },
            },
        });
    }

    drawBreadthChart() {
        const el = document.getElementById('chart-breadth');
        const empty = document.getElementById('chart-breadth-empty');
        if (!el) return;
        const ch = (this.pulse.charts) || {};
        const sp = ch.sp500_norm || [];
        const nq = ch.nasdaq_norm || [];
        const sys = ch.system_breadth || [];

        // 셋 다 비면 폴백 안내
        if (sp.length < 2 && nq.length < 2 && sys.length < 2) {
            el.style.display = 'none';
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';
        el.style.display = 'block';
        if (this.charts['chart-breadth']) this.charts['chart-breadth'].destroy();

        const maxLen = Math.max(sp.length, nq.length, sys.length);
        const labels = Array.from({ length: maxLen }, (_, i) => i - maxLen + 1); // -89..0
        const pad = (arr) => {
            if (arr.length === maxLen) return arr;
            return Array(maxLen - arr.length).fill(null).concat(arr);
        };
        const datasets = [];
        if (sp.length >= 2) datasets.push({ label: 'S&P 500', data: pad(sp), borderColor: '#3b82f6', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false });
        if (nq.length >= 2) datasets.push({ label: 'NASDAQ', data: pad(nq), borderColor: '#f59e0b', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false });
        if (sys.length >= 2) datasets.push({ label: '시스템 Breadth(%)', data: pad(sys), borderColor: '#10b981', borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: 0.3, fill: false, yAxisID: 'y1' });

        this.charts['chart-breadth'] = new Chart(el.getContext('2d'), {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true } },
                    tooltip: { enabled: true },
                },
                scales: {
                    x: { display: true, grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 10 } } },
                    y: { display: true, position: 'left', title: { display: true, text: '정규화(100=시작)', font: { size: 10 } }, grid: { color: '#f3f4f6' } },
                    y1: { display: true, position: 'right', min: 0, max: 100, title: { display: true, text: 'Breadth %', font: { size: 10 } }, grid: { drawOnChartArea: false } },
                },
            },
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.marketPulseBinder = new MarketPulseBinder();
    window.marketPulseBinder.loadAndRender();
});
