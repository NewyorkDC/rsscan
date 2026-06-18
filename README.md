# 🎯 RSSCAN v3 - IBD RS Line 스크리너 대시보드

**완전 리뉴얼된 RSSCAN v3**입니다.  
좌측 고정 사이드바 + 상단 7개 탭 네비게이션 + 모바일 최적화 + 전략실 통합

---

## ⚡ 1분 시작 가이드

### Windows 사용자
```bash
# 1. 이 폴더 열기 (PowerShell / CMD)
# 2. start.bat 더블클릭
# 3. 자동으로 브라우저 열림 (http://localhost:8765)
```

### Mac / Linux
```bash
./start.sh
# 또는
python3 -m http.server 8765
```

---

## 📋 필수 설치

### 1️⃣ Python 3.9+
- [python.org](https://www.python.org/downloads/) 다운로드
- 설치 시 **"Add Python to PATH"** 반드시 체크 ✓

### 2️⃣ Python 라이브러리
```bash
pip install -r requirements.txt
```

### 3️⃣ Git (선택)
- GitHub에 코드 올리려면 필요
- [git-scm.com](https://git-scm.com/)

---

## 🚀 주요 기능

### 좌측 사이드바 (고정)
| 항목 | 설명 |
|------|------|
| **Market Regime** | 시장 단계 + 투자비중 |
| **Market Pulse** | Stage 2/3/4 카운터 |
| **Phase 분포** | 0~7 상태 히스토그램 |
| **Watchlist** | ⭐ 워치리스트 수 |

### 상단 7개 탭 네비게이션
1. 📰 **Daily Briefing** ⭐ NEW
   - 6섹션 Top-Down 흐름
   - 시장 → 섹터 → 산업 → 진입 → 워치 → 보유
   
2. 📊 **Market Pulse**
   - Market Regime 상세
   - Breadth 차트

3. 🏭 **섹터 분석**
   - 11개 섹터 RS Line
   - 업종별 분류

4. 🔍 **스크리너**
   - Phase 필터
   - RS Line 정렬

5. 📈 **패턴 감지**
   - 11종 차트 패턴
   - RS Line순 정렬

6. ⚡ **RS 모멘텀**
   - 가속 + RS 신고가
   - 워치리스트 필터

7. 🏛 **전략실 (Paper Trade)**
   - 5-Gate Funnel 결과
   - NAV 곡선 (7주)
   - 보유/청산 이력
   - v5 운용 규칙

---

## 📱 모바일 대응

### 반응형 디자인
- **768px 이상**: 좌측 사이드바 + 메인 (2단 레이아웃)
- **480px~768px**: 햄버거 메뉴 (☰) + 메인
- **480px 미만**: 초소형 (모바일 최적화)

### Tailscale 원격 접속
```bash
# 1. tailscale.com 가입 (무료)
# 2. Windows에 Tailscale 설치
# 3. 스마트폰에 Tailscale 앱 설치
# 4. 모바일 브라우저에서 접속:
#    http://[Tailscale IP]:8765
```

---

## 📂 파일 구조

```
rsscan-v3/
├── index.html              ⭐ 메인 대시보드
├── css/
│  ├── dashboard.css        (레이아웃 + 색상)
│  └── responsive.css       (모바일 반응형)
├── js/
│  ├── app.js               (탭, 사이드바, 데이터)
│  └── data-loader.js       (JSON 드래그 앤 드롭)
├── backend/
│  ├── daily_analysis.py    (스크리너 분석)
│  ├── market_pulse.py      (시장 Regime)
│  └── strategy_room.py     (Paper Trade)
├── data/                   (생성되는 JSON/CSV)
└── input/                  (IBD 원본 엑셀)
```

---

## 🔧 사용 흐름

### 1️⃣ 데이터 준비
```bash
# IBD 500 엑셀 파일을 input/ 폴더에 저장
# 파일명: IBD500.xlsx 또는 IBD*.xlsx
```

### 2️⃣ 분석 실행 (Python)
```bash
python backend/daily_analysis.py
# → data/ibd_screener_latest.json 생성
```

### 3️⃣ 대시보드 열기
```bash
# start.bat 실행 또는 브라우저에서
http://localhost:8765
```

### 4️⃣ JSON 불러오기 (3가지 방법)
- **방법 A**: 드래그 앤 드롭
  - `data/ibd_screener_latest.json` 파일을 대시보드로 드래그
  
- **방법 B**: 우상단 버튼 (구현 예정)
  - "JSON 불러오기" 클릭

- **방법 C**: 자동 로드 (구현 예정)
  - Python 스크립트가 자동 주입

---

## 📊 데이터 형식

### ibd_screener_latest.json
```json
{
  "date": "2026-06-16",
  "results": [
    {
      "symbol": "NVDA",
      "phase": 4,
      "rs_line": 99,
      "rs_rating": 98,
      "pattern": "Cup&Handle",
      "earnings_pct": 25.5,
      ...
    }
  ],
  "sectors": [...],
  "market_pulse": {...}
}
```

### market_pulse_history.csv
```
date,regime,breadth_pct,dd_count,...
2026-06-16,Uptrend Resumed,58,3,...
2026-06-15,Confirmed Uptrend,55,2,...
```

### strategy_room_portfolio.json
```json
{
  "nav": 1.6141,
  "holdings": [...],
  "closed_trades": [...],
  "rules": {...}
}
```

---

## ⚙️ Python 백엔드 실행

### Daily Analysis (매일 자동)
```bash
python backend/daily_analysis.py
# 500 종목 분석 → ibd_screener_latest.json 생성
# 소요 시간: 2~5분 (yfinance 속도에 따라)
```

### Market Pulse 업데이트
```bash
python backend/market_pulse.py
# Market Regime 판정 → market_pulse_history.csv 추가
```

### Strategy Room (Paper Trade)
```bash
python backend/strategy_room.py signals
# 5-Gate Funnel 신규 신호 생성

python backend/strategy_room.py update
# 기존 포트폴리오 가격 업데이트

python backend/strategy_room.py both
# 신호 + 포트폴리오 동시 업데이트
```

---

## 🎯 Daily Briefing (6섹션)

### ① 시장 환경 (Market Status)
- Regime: 🟢 Uptrend Resumed
- 투자비중: 75-95%
- DD Count, Breadth, FTD

### ② 섹터 리더십 (Sector Leadership)
- 🥇 1위: Technology (RS 92)
- 🥈 2위: Financials (RS 78)
- 🥉 3위: Healthcare (RS 75)

### ③ 산업 테마 (Industry Themes)
- Semiconductors (RS 95)
- AI Infrastructure (RS 93)
- Biotech (RS 80)

### ④ 진입 후보 (Entry Candidates)
- Phase 4+ 종목 리스트
- 검토 버튼으로 상세 분석

### ⑤ 워치리스트 이슈 (Watchlist Review)
- Phase 전환 종목
- 익절/손절 경고

### ⑥ 보유 포지션 (Holdings Review)
- 현재 수익률
- Phase 상태
- 청산 시점

---

## 🏛 전략실 (Strategy Room)

### 개요
- **시스템**: 5-Gate Funnel (G0~G4)
- **트랙**: g3+g1+g2 (권고)
- **진입**: Breakout (pivot 돌파)
- **손절**: -7% (절대 룰)
- **익절**: +15% (BE), +25% (Lock-In), +20% in 3주 (8주 룰)

### 주요 지표
| 항목 | 값 |
|------|-----|
| Portfolio NAV | 1.6141 |
| Gain (기간) | +61.41% |
| Active Holdings | 8개 |
| Closed Trades | 62개 |
| Hit Rate | 48.4% |
| Avg Hold | 14.0일 |

### 8개 트랙 비교
```
트랙              NAV    MDD   4w 평균   관찰
─────────────────────────────────────────
g3_only          1.33   -5%   +14%     노이즈 큼
g3+g0            1.33   -5%   +14%     동일
g3+g1            1.50   -7%   +21%     섹터 효과
g3+g2            1.35   -5%   +17%     패턴 약함
g3+g1+g2 ⭐      1.61   -6%   +28%     최적 조합
g3+g0+g1         1.48   -6%   +22%
g3+g0+g2         1.35   -5%   +17%
Full Funnel      1.42   -6%   +23%
```

---

## 🐛 문제 해결

### 포트 8765 이미 사용 중?
```bash
# 다른 포트 사용
python -m http.server 8000
```

### Python 설치 안 됨?
```bash
# 시스템 PATH 확인
python --version

# 없으면 설치
# https://www.python.org/downloads/
# ✓ "Add Python to PATH" 체크
```

### JSON 로드 안 됨?
- File:// 프로토콜 제한 (브라우저 보안)
- 해결: `start.bat` 실행 (HTTP 서버) ✓

### yfinance Rate Limit?
- 10~30분 대기 후 재시도
- 또는 24시간 뒤 재실행

---

## 📚 참고 자료

### IBD 관련
- William O'Neil - *How to Make Money in Stocks*
- IBD Stock Screener: https://www.investors.com/etfs-and-funds/etf-data/

### Minervini 전략
- Mark Minervini - *Trade Like a Stock Market Wizard*
- RS Line 계산: 종목 가격 / SPY 가격

### 기술 스택
- Frontend: HTML5, CSS3, Chart.js, Vanilla JS
- Backend: Python, pandas, yfinance
- Mobile: Responsive CSS (768px, 480px)
- Remote: Tailscale VPN

---

## 📞 문제 보고

버그나 개선 사항: GitHub Issues에 남겨주세요.

```bash
# 이 프로젝트 포크 & 수정 후 Pull Request
git clone https://github.com/NewyorkDC/rsscan.git
cd rsscan/etf-screener
```

---

## 📄 라이선스

MIT License - 자유롭게 수정 및 배포 가능

---

## 🎉 시작하기

```bash
# 1. 이 폴더 열기
cd rsscan-v3

# 2. 라이브러리 설치
pip install -r requirements.txt

# 3. 대시보드 시작
./start.bat          # Windows
# 또는
./start.sh           # Mac/Linux
python -m http.server 8765

# 4. 브라우저 열기
http://localhost:8765
```

**행운을 빕니다! 🚀**
