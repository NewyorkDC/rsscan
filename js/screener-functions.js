/**
 * RSSCAN v3 - 스크리너 필터링 & 정렬 기능
 */

class Screener {
    constructor() {
        this.allSignals = [];
        this.filteredSignals = [];
        this.currentPhaseFilter = 'all';
        this.currentRSFilter = 'all';
        this.currentPatternFilter = 'all';
        this.currentSort = 'rs-score';
        this.searchQuery = '';
    }
    
    init(signals) {
        this.allSignals = signals || [];
        this.setupEventListeners();
        this.filterAndDisplay();
    }
    
    setupEventListeners() {
        // Phase 필터
        document.querySelectorAll('[data-filter="phase"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentPhaseFilter = e.target.dataset.value;
                this.updateFilterButtons('phase', this.currentPhaseFilter);
                this.filterAndDisplay();
            });
        });
        
        // RS Score 필터
        document.querySelectorAll('[data-filter="rs-score"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentRSFilter = e.target.dataset.value;
                this.updateFilterButtons('rs-score', this.currentRSFilter);
                this.filterAndDisplay();
            });
        });
        
        // Pattern 필터
        document.querySelectorAll('[data-filter="pattern"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentPatternFilter = e.target.dataset.value;
                this.updateFilterButtons('pattern', this.currentPatternFilter);
                this.filterAndDisplay();
            });
        });
        
        // Sort 버튼
        document.querySelectorAll('[data-sort]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentSort = e.target.dataset.sort;
                this.updateSortButtons(this.currentSort);
                this.filterAndDisplay();
            });
        });
        
        // 검색창
        const searchInput = document.getElementById('screener-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toUpperCase();
                this.filterAndDisplay();
            });
        }
    }
    
    updateFilterButtons(type, value) {
        document.querySelectorAll(`[data-filter="${type}"]`).forEach(btn => {
            if (btn.dataset.value === value) {
                btn.style.background = type === 'phase' && value === '4+' ? '#00d084' : '#4da6ff';
                btn.style.color = '#000';
                btn.style.fontWeight = 'bold';
            } else {
                btn.style.background = '';
                btn.style.color = '';
                btn.style.fontWeight = '';
            }
        });
    }
    
    updateSortButtons(sort) {
        document.querySelectorAll('[data-sort]').forEach(btn => {
            if (btn.dataset.sort === sort) {
                btn.style.background = '#4da6ff';
                btn.style.color = '#000';
                btn.style.fontWeight = 'bold';
            } else {
                btn.style.background = '';
                btn.style.color = '';
                btn.style.fontWeight = '';
            }
        });
    }
    
    filterAndDisplay() {
        // 필터링
        this.filteredSignals = this.allSignals.filter(signal => {
            // 검색 필터
            if (this.searchQuery && !signal.symbol.includes(this.searchQuery)) {
                return false;
            }
            
            // Phase 필터
            if (this.currentPhaseFilter !== 'all') {
                if (this.currentPhaseFilter === '4+') {
                    if (!signal.is_phase_4_plus) return false;
                } else {
                    if (signal.phase !== parseInt(this.currentPhaseFilter)) return false;
                }
            }
            
            // RS Score 필터
            if (this.currentRSFilter !== 'all') {
                const threshold = parseInt(this.currentRSFilter);
                if (signal.rs_score < threshold) return false;
            }
            
            // Pattern 필터
            if (this.currentPatternFilter !== 'all') {
                if (signal.pattern !== this.currentPatternFilter) return false;
            }
            
            return true;
        });
        
        // 정렬
        this.sort();
        
        // 표시
        this.displayResults();
    }
    
    sort() {
        switch (this.currentSort) {
            case 'rs-score':
                this.filteredSignals.sort((a, b) => b.rs_score - a.rs_score);
                break;
            case 'phase':
                const phaseOrder = { 4: 0, 3: 1, 5: 2, 2: 3, 1: 4, 6: 5, 7: 6, 0: 7 };
                this.filteredSignals.sort((a, b) => {
                    const aOrder = phaseOrder[a.phase] !== undefined ? phaseOrder[a.phase] : 8;
                    const bOrder = phaseOrder[b.phase] !== undefined ? phaseOrder[b.phase] : 8;
                    return aOrder - bOrder;
                });
                break;
            case 'symbol':
                this.filteredSignals.sort((a, b) => a.symbol.localeCompare(b.symbol));
                break;
            case 'price':
                this.filteredSignals.sort((a, b) => b.price - a.price);
                break;
        }
    }
    
    getPhaseEmoji(phase) {
        const emojis = { 0: "🔴", 1: "⚪", 2: "🟡", 3: "🟢", 4: "🎯", 5: "🟢", 6: "🟠", 7: "🔴" };
        return emojis[phase] || "❓";
    }
    
    displayResults() {
        const container = document.getElementById('screener-table');
        const countLabel = document.getElementById('screener-result-count');
        
        if (!container) return;
        
        countLabel.textContent = `📊 스크린 결과: ${this.filteredSignals.length}개`;
        
        if (this.filteredSignals.length === 0) {
            container.innerHTML = `<div style="padding: 20px; text-align: center; color: #888;">
                <p>🔍 검색 결과가 없습니다</p></div>`;
            return;
        }
        
        let html = `<table style="width: 100%; border-collapse: collapse; color: #ccc;">
            <thead><tr style="border-bottom: 2px solid #444; background: #1a1a1a;">
                <th style="padding: 12px; text-align: left; width: 8%;">티커</th>
                <th style="padding: 12px; text-align: right; width: 8%;">가격</th>
                <th style="padding: 12px; text-align: center; width: 8%;">RS Score</th>
                <th style="padding: 12px; text-align: center; width: 8%;">Phase</th>
                <th style="padding: 12px; text-align: center; width: 10%;">패턴</th>
                <th style="padding: 12px; text-align: center; width: 8%;">IBD RS</th>
                <th style="padding: 12px; text-align: center; width: 8%;">Stage</th>
                <th style="padding: 12px; text-align: right; width: 10%;">1주 변화</th>
                <th style="padding: 12px; text-align: right; width: 10%;">3주 변화</th>
                <th style="padding: 12px; text-align: right; width: 10%;">6주 변화</th>
            </tr></thead><tbody>`;
        
        this.filteredSignals.forEach((signal, idx) => {
            const bgColor = signal.phase === 4 ? 'rgba(77, 166, 255, 0.05)' : idx % 2 === 0 ? 'rgba(0,0,0,0.3)' : 'transparent';
            const rsColor = signal.rs_score >= 80 ? '#00d084' : signal.rs_score >= 70 ? '#4da6ff' : '#ff9f43';
            const phaseColor = signal.phase === 4 ? '#4da6ff' : '#fff';
            
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
                <td style="padding: 10px 12px; text-align: center; color: #ffc107;">${signal.ibd_rs}</td>
                <td style="padding: 10px 12px; text-align: center; color: #ccc;">S${signal.stage}</td>
                <td style="padding: 10px 12px; text-align: right; color: ${signal.rs_1w_chg > 0 ? '#00d084' : '#ff6b6b'}; font-weight: bold;">
                    ${signal.rs_1w_chg > 0 ? '+' : ''}${signal.rs_1w_chg.toFixed(2)}%
                </td>
                <td style="padding: 10px 12px; text-align: right; color: ${signal.rs_3w_chg > 0 ? '#00d084' : '#ff6b6b'}; font-weight: bold;">
                    ${signal.rs_3w_chg > 0 ? '+' : ''}${signal.rs_3w_chg.toFixed(2)}%
                </td>
                <td style="padding: 10px 12px; text-align: right; color: ${signal.rs_6w_chg > 0 ? '#00d084' : '#ff6b6b'};">
                    ${signal.rs_6w_chg > 0 ? '+' : ''}${signal.rs_6w_chg.toFixed(2)}%
                </td>
            </tr>`;
        });
        
        html += `</tbody></table>`;
        container.innerHTML = html;
    }
}

// 전역 screener 인스턴스
window.screener = new Screener();
