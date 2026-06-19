/* ===== app.js - 메인 기능 ===== */

// 전역 상태
const app = {
    currentTab: 'briefing',
    sidebarOpen: false,
    data: {
        screener: null,
        marketPulse: null,
        strategyRoom: null
    },
    charts: {}
};

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 RSSCAN v3 로드 중...');
    
    // 1. 탭 네비게이션 설정
    initTabs();
    
    // 2. 사이드바 토글 (모바일)
    initSidebar();
    
    // 3. 데이터 로드
    loadData();
    
    // 4. NAV 차트 렌더링 (전략실)
    renderNavChart();
    
    console.log('✅ 초기화 완료');
});

/* ===== 1. 탭 네비게이션 ===== */
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
    
    function switchTab(tabName) {
        // 모든 탭 비활성화
        tabBtns.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        
        // 선택 탭 활성화
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        app.currentTab = tabName;
    }
}

/* ===== 2. 사이드바 토글 (모바일) ===== */
function initSidebar() {
    const hamburger = document.getElementById('hamburgerBtn');
    const sidebar = document.querySelector('.sidebar');
    
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            app.sidebarOpen = !app.sidebarOpen;
            
            // 오버레이 배경 토글
            if (app.sidebarOpen) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = 'auto';
            }
        });
        
        // 사이드바 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (!sidebar.contains(e.target) && 
                !hamburger.contains(e.target) && 
                app.sidebarOpen) {
                sidebar.classList.remove('open');
                app.sidebarOpen = false;
                document.body.style.overflow = 'auto';
            }
        });
    }
}

/* ===== 3. 데이터 로드 ===== */
function loadData() {
    console.log('📊 데이터 로드 시작...');
    
    // 🔄 JSON 파일에서 실제 데이터 로드
    Promise.all([
        fetch('results/entry_signals.json').then(r => r.json()).catch(() => null),
        fetch('results/strategy_room_portfolio.json').then(r => r.json()).catch(() => null)
    ]).then(([signals, portfolio]) => {
        if (signals) {
            console.log(`✅ entry_signals.json 로드: ${signals.signals.length}개 신호`);
            app.data.screener = signals;
        }
        if (portfolio) {
            console.log(`✅ strategy_room_portfolio.json 로드: ${portfolio.holdings.length}개 포지션`);
            app.data.strategyRoom = portfolio;
        }
        updateUI();
    }).catch(err => {
        console.warn('⚠️ JSON 로드 실패, 대시보드 데이터 사용:', err);
        loadDummyData();
    });
}

// 더미 데이터 (JSON 로드 실패 시 사용)
function loadDummyData() {
    app.data.screener = {
        regime: 'Uptrend Resumed',
        regimeIcon: '🟢',
        investmentRatio: '75-95%',
        ddCount: 3,
        breadthPct: 58,
        stage2: 113,
        stage3: 45,
        stage4: 12
    };
    
    app.data.strategyRoom = {
        nav: 1.6141,
        navGain: 61.41,
        activeCount: 8,
        activePnl: 18.5,
        closedCount: 62,
        hitRate: 48.4,
        track: 'g3+g1+g2',
        navHistory: [1.0, 1.05, 1.12, 1.28, 1.45, 1.55, 1.6141]
    };
    
    updateUI();
}

/* ===== 4. UI 업데이트 ===== */
function updateUI() {
    const data = app.data.screener;
    
    // Market Regime 업데이트
    document.getElementById('regimeBadge').innerHTML = 
        `<span class="regime-icon">${data.regimeIcon}</span>
         <span class="regime-label">${data.regime}</span>`;
    
    document.getElementById('investmentRatio').textContent = data.investmentRatio;
    document.getElementById('ddCount').textContent = data.ddCount;
    document.getElementById('breadthPct').textContent = `${data.breadthPct}%`;
    
    // Market Pulse 카운터
    document.getElementById('stage2Count').textContent = data.stage2;
    document.getElementById('stage3Count').textContent = data.stage3;
    document.getElementById('stage4Count').textContent = data.stage4;
    
    // Strategy Room 업데이트
    const sr = app.data.strategyRoom;
    document.getElementById('navValue').textContent = sr.nav.toFixed(4);
    document.getElementById('activeCount').textContent = sr.activeCount;
    document.getElementById('closedCount').textContent = sr.closedCount;
    
    // 날짜 업데이트
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('updateTime').textContent = `${today} 기준`;
}

/* ===== 5. NAV 차트 렌더링 ===== */
function renderNavChart() {
    const canvas = document.getElementById('navChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const navData = app.data.strategyRoom.navHistory;
    
    // 7주 날짜 라벨
    const labels = Array.from({length: navData.length}, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (navData.length - 1 - i) * 7);
        return d.toLocaleDateString('ko-KR', {month: '2-digit', day: '2-digit'});
    });
    
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Portfolio NAV',
                    data: navData,
                    borderColor: '#58a6ff',
                    backgroundColor: 'rgba(88, 166, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#58a6ff',
                    pointBorderColor: '#0d1117',
                    pointBorderWidth: 2
                },
                {
                    label: '기준선',
                    data: Array(navData.length).fill(1.0),
                    borderColor: '#30363d',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#8b949e',
                        font: {size: 12}
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(22, 27, 34, 0.95)',
                    titleColor: '#e6edf3',
                    bodyColor: '#8b949e',
                    borderColor: '#30363d',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: {
                        color: '#30363d'
                    },
                    ticks: {
                        color: '#8b949e',
                        font: {size: 11}
                    }
                },
                y: {
                    grid: {
                        color: '#30363d'
                    },
                    ticks: {
                        color: '#8b949e',
                        font: {size: 11},
                        callback: (value) => value.toFixed(2)
                    },
                    min: 0.9,
                    max: 1.7
                }
            }
        }
    });
    
    app.charts.nav = chart;
}

/* ===== 헬퍼 함수 ===== */
window.showWatchlist = function() {
    alert('⭐ 워치리스트 기능은 곧 구현됩니다.');
};

window.checkCandidate = function(symbol) {
    console.log(`📋 ${symbol} 검토 모달 열기 (구현 예정)`);
};

// 콘솔 로그 (디버깅)
console.log('✅ app.js 로드 완료');
