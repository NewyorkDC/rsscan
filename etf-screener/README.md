# RSSCAN — ETF RS Line 스크리너

## 📁 프로젝트 구조

```
etf-screener/
├── frontend/
│   ├── index.html      # 메인 UI
│   ├── style.css       # 다크 테마 스타일
│   └── app.js          # 필터/정렬/알림 로직
├── backend/
│   └── server.js       # Express + 텔레그램 봇 + 스케줄러
├── package.json
└── .env.example
```

---

## 🚀 빠른 시작

### 1단계: 의존성 설치
```bash
npm install
```

### 2단계: 환경변수 설정
```bash
cp .env.example .env
# .env 파일에서 TELEGRAM_BOT_TOKEN 입력 (선택)
```

### 3단계: 서버 실행
```bash
npm run dev       # 개발 (nodemon 자동 재시작)
npm start         # 프로덕션
```

브라우저에서 `http://localhost:3000` 접속

---

## 📡 텔레그램 봇 설정 방법

### 1. 봇 생성
1. 텔레그램에서 `@BotFather` 검색
2. `/newbot` 명령 전송
3. 봇 이름 입력 (예: `MyRSScanner`)
4. 봇 아이디 입력 (예: `myrsscanner_bot`)
5. **Bot Token** 발급 (형식: `123456:ABCdef...`)

### 2. Chat ID 확인
1. 텔레그램에서 `@userinfobot` 검색 후 `/start`
2. 또는 그룹에 봇 추가 후 `@userinfobot`으로 그룹 ID 확인
3. Chat ID 형식: 개인 `12345678` / 그룹 `-100123456789`

### 3. 사이트에서 연동
1. 우상단 🔔 버튼 클릭
2. Bot Token + Chat ID 입력
3. 알림 조건 설정
4. "테스트 알림 전송" 으로 확인
5. 저장

---

## ⚙️ 알림 조건 설명

| 조건 | 트리거 |
|------|--------|
| Phase 전환 감지 | Phase 4/5 이상 진입 |
| RS Line 신고가 | `rsHigh: true` 종목 |
| 가속 신호 | `acceleration: true` 종목 |
| 주가 신고가 | `priceHigh: true` 종목 |
| RS 점수 임계값 | 설정값 이상인 종목만 |

자동 알림 스케줄: **평일 오후 4시** (장 마감 후)

---

## 🔌 실제 데이터 연동

`backend/server.js`의 `getSampleData()` 함수를 실제 API로 교체:

```js
// Yahoo Finance
const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1wk&range=3mo`;

// 또는 Polygon.io (유료, 안정적)
const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/week/...?apiKey=${KEY}`;
```

---

## 🌐 배포

**무료 옵션:**
- [Railway.app](https://railway.app) — Node.js 앱 무료 배포
- [Render.com](https://render.com) — 무료 플랜 있음
- [Fly.io](https://fly.io) — 소규모 앱 무료

```bash
# Railway 배포 예시
npm install -g railway
railway login
railway init
railway up
```
