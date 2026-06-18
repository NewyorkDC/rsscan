/**
 * RSSCAN v3 - Entry Signals JSON 로더
 * generate_entry_signals.py로 생성된 JSON을 HTML 대시보드에 로드
 */

class RSCANDataLoader {
    constructor() {
        this.data = null;
        this.signals = [];
    }
    
    async loadJSON(filePath = 'entry_signals.json') {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                console.warn(`⚠️ ${filePath} not found. Using sample data.`);
                this.loadSampleData();
                this.updateUI();
                return;
            }
            this.data = await response.json();
            this.signals = this.data.signals || [];
            console.log(`✅ 로드 완료: ${this.signals.length}개 진입 신호`);
            this.updateUI();
        } catch (error) {
            console.warn(`⚠️ JSON 로드 실패: ${error.message}`);
            this.loadSampleData();
            this.updateUI();
        }
    }
    
    loadSampleData() {
        this.data = {
            timestamp: new Date().toISOString().split('T')[0],
            market_health: "🟢 Uptrend Resumed",
            market_regime: "75~95%",
            total_scanned: 0,
            phase_4_count: 0,
            phase_4_plus_count: 0,
            signals: []
        };
        this.signals = [];
        console.log("📋 샘플 데이터 사용 (run_daily.bat 실행 필요)");
    }
    
    updateUI() {
        this.displaySignals();
        this.displaySummary();
        if (window.screener) {
            window.screener.init(this.signals);
        }
    }
    
    getPhaseEmoji(phase) {
        const phases = {
            0: "🔴", 1: "⚪", 2: "🟡", 3: "🟢", 
            4: "🎯", 5: "🟢", 6: "🟠", 7: "🔴"
        };
        return phases[phase] || "❓";
    }
    
    getPhaseName(phase) {
        const names = {
            0: "회피", 1: "관찰", 2: "바닥 매집", 3: "베이스 성숙",
            4: "돌파 임박", 5: "본격 리더", 6: "후반 피로", 7: "분배 의심"
        };
        return names[phase] || "Unknown";
    }
    
    displaySignals() {
        const container = document.getElementById('entry-signals-table');
        if (!container) return;
        
        if (this.signals.length === 0) {
            container.innerHTML = `<div style="padding: 20px; text-align: center; color: #888;">
                <p>📊 신규 진입 신호가 없습니다</p>
                <p style="font-size: 0.9em; margin-top: 10px;">run_daily.bat 실행 후 새로고침하세요</p></div>`;
            return;
        }
        
        let html = `<table class="signals-table" style="width: 100%; border-collapse: collapse; color: #ccc;">
            <thead><tr style="border-bottom: 2px solid #444;">
                <th style="padding: 12px; text-align: left; width: 10%; font-weight: bold;">티커</th>
                <th style="padding: 12px; text-align: right; width: 10%;">현재가</th>
                <th style="padding: 12px; text-align: center; width: 10%;">RS Score</th>
                <th style="padding: 12px; text-align: center; width: 10%;">Phase</th>
                <th style="padding: 12px; text-align: center; width: 12%;">패턴</th>
                <th style="padding: 12px; text-align: center; width: 10%;">IBD RS</th>
                <th style="padding: 12px; text-align: right; width: 10%;">1주 변화</th>
                <th style="padding: 12px; text-align: right; width: 10%;">3주 변화</th>
            </tr></thead><tbody>`;
        
        this.signals.slice(0, 10).forEach((signal, idx) => {
            const phaseColor = signal.phase === 4 ? '#4da6ff' : '#fff';
            const bgColor = signal.phase === 4 ? 'rgba(77, 166, 255, 0.05)' : 'transparent';
            const rsColor = signal.rs_score >= 80 ? '#00d084' : '#ff9f43';
            
            html += `<tr style="border-bottom: 1px solid #333; background: ${bgColor};">
                <td style="padding: 10px 12px; font-weight: bold; color: #4da6ff;">${signal.symbol}</td>
                <td style="padding: 10px 12px; text-align: right;">$${signal.price.toFixed(2)}</td>
                <td style="padding: 10px 12px; text-align: center; font-weight: bold; color: ${rsColor};">${signal.rs_score}</td>
                <td style="padding: 10px 12px; text-align: center; font-weight: bold; color: ${phaseColor};">
                    ${signal.is_phase_4_plus ? '🎯+' : `${this.getPhaseEmoji(signal.phase)} ${signal.phase}`}
                </td>
                <td style="padding: 10px 12px; text-align: center; font-size: 0.85em;">
                    <span style="padding: 3px 8px; border-radius: 3px; background: #333; color: #aaa;">${signal.pattern}</span>
                </td>
                <td style="padding: 10px 12px; text-align: center; color: #ffc107; font-weight: bold;">${signal.ibd_rs}</td>
                <td style="padding: 10px 12px; text-align: right; color: ${signal.rs_1w_chg > 0 ? '#00d084' : '#ff6b6b'}; font-weight: bold;">
                    ${signal.rs_1w_chg > 0 ? '+' : ''}${signal.rs_1w_chg.toFixed(2)}%
                </td>
                <td style="padding: 10px 12px; text-align: right; color: ${signal.rs_3w_chg > 0 ? '#00d084' : '#ff6b6b'}; font-weight: bold;">
                    ${signal.rs_3w_chg > 0 ? '+' : ''}${signal.rs_3w_chg.toFixed(2)}%
                </td>
            </tr>`;
        });
        
        html += `</tbody></table>`;
        container.innerHTML = html;
    }
    
    displaySummary() {
        const summaryContainer = document.getElementById('entry-signals-summary');
        if (!summaryContainer || !this.data) return;
        
        summaryContainer.innerHTML = `
            <div style="padding: 10px 0; border-bottom: 1px solid #444; color: #888; font-size: 0.9em;">
                📅 ${this.data.timestamp} | 🎯 Phase 4: <strong style="color: #4da6ff;">${this.data.phase_4_count}</strong> | 🎯+ Phase 4+: <strong style="color: #00d084;">${this.data.phase_4_plus_count}</strong>
            </div>
        `;
    }
    
    init() {
        this.loadJSON();
        
        setInterval(() => {
            this.loadJSON();
        }, 60000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const loader = new RSCANDataLoader();
    loader.init();
    window.rscanLoader = loader;
});
