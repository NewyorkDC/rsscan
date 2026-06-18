/* ===== data-loader.js - JSON 데이터 불러오기 ===== */

const dataLoader = {
    
    // JSON 파일 경로
    paths: {
        screener: 'data/ibd_screener_latest.json',
        strategyRoom: 'data/strategy_room_portfolio.json',
        marketPulse: 'data/market_pulse_history.csv'
    },
    
    // 데이터 캐시
    cache: {},
    
    /**
     * JSON 파일 불러오기 (Fetch API)
     */
    async loadJSON(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`❌ JSON 로드 실패: ${url}`, error);
            return null;
        }
    },
    
    /**
     * CSV 파일 불러오기 (간단한 파싱)
     */
    async loadCSV(url) {
        try {
            const response = await fetch(url);
            const text = await response.text();
            const lines = text.trim().split('\n');
            const headers = lines[0].split(',');
            
            return lines.slice(1).map(line => {
                const values = line.split(',');
                const obj = {};
                headers.forEach((header, i) => {
                    obj[header.trim()] = values[i]?.trim();
                });
                return obj;
            });
        } catch (error) {
            console.error(`❌ CSV 로드 실패: ${url}`, error);
            return null;
        }
    },
    
    /**
     * 모든 데이터 로드
     */
    async loadAll() {
        console.log('📂 데이터 로드 시작...');
        
        // 병렬 로드
        const [screener, strategyRoom] = await Promise.all([
            this.loadJSON(this.paths.screener),
            this.loadJSON(this.paths.strategyRoom)
        ]);
        
        this.cache = {
            screener,
            strategyRoom
        };
        
        console.log('✅ 데이터 로드 완료');
        return this.cache;
    },
    
    /**
     * 스크리너 데이터 가져오기
     */
    getScreenerData() {
        return this.cache.screener || null;
    },
    
    /**
     * 전략실 데이터 가져오기
     */
    getStrategyRoomData() {
        return this.cache.strategyRoom || null;
    },
    
    /**
     * 드래그 앤 드롭으로 파일 로드 (사용자가 JSON 파일 드래그)
     */
    setupDragAndDrop() {
        const dropZones = document.querySelectorAll('.tab-content');
        
        dropZones.forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.style.opacity = '0.5';
            });
            
            zone.addEventListener('dragleave', () => {
                zone.style.opacity = '1';
            });
            
            zone.addEventListener('drop', async (e) => {
                e.preventDefault();
                zone.style.opacity = '1';
                
                const files = e.dataTransfer.files;
                if (files.length === 0) return;
                
                const file = files[0];
                if (!file.name.endsWith('.json')) {
                    alert('⚠️ JSON 파일만 지원됩니다.');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        
                        // 데이터 타입 자동 인식
                        if (data.results) {
                            this.cache.screener = data;
                            console.log('✅ 스크리너 데이터 로드됨');
                        } else if (data.holdings) {
                            this.cache.strategyRoom = data;
                            console.log('✅ 전략실 데이터 로드됨');
                        }
                        
                        // UI 갱신
                        if (window.app) {
                            window.app.data = this.cache;
                            window.updateUI();
                            if (window.renderNavChart) {
                                window.renderNavChart();
                            }
                        }
                        
                        alert('✅ 데이터 로드 완료!');
                    } catch (error) {
                        alert('❌ JSON 파싱 실패: ' + error.message);
                    }
                };
                reader.readAsText(file);
            });
        });
    }
};

// 페이지 로드 시 드래그 앤 드롭 설정
document.addEventListener('DOMContentLoaded', () => {
    dataLoader.setupDragAndDrop();
    
    // 필요시 자동으로 데이터 로드 시도
    // dataLoader.loadAll().then(() => {
    //     window.location.reload();
    // });
});

console.log('✅ data-loader.js 로드 완료');
