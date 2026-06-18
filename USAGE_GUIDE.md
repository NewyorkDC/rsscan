# 🚀 RSSCAN v3 - S&P 500 신규 진입 신호 자동 생성

## 📌 개요

매일 `run_daily.bat` (또는 `run_daily.sh`) 를 실행하면:
1. **yfinance**로 S&P 500 종목 데이터 자동 수집
2. **RS Line 점수** 계산 (0~100 스케일)
3. **MTR State** 계산 (0~7)
4. **Phase** 계산 (0~7)
5. **entry_signals.json** 생성
6. HTML 대시보드에서 자동 로드

---

## 🎯 실행 방법

### **Windows 사용자**

```batch
1. run_daily.bat 더블클릭
   (또는 PowerShell/CMD에서 run_daily.bat 실행)

2. 2~3분 대기 (S&P 500 종목 스캔)

3. entry_signals.json 자동 생성

4. HTML 대시보드 새로고침 (Ctrl+F5)
   → 전략실 탭에 신규 진입 신호 표시
```

### **Mac/Linux 사용자**

```bash
1. 터미널 열기

2. 다음 실행:
   chmod +x run_daily.sh
   ./run_daily.sh

3. 2~3분 대기 (S&P 500 종목 스캔)

4. entry_signals.json 자동 생성

5. HTML 대시보드 새로고침 (Ctrl+F5)
```

---

## 🔄 자동화 (일일 자동 실행)

### **Windows 작업 스케줄러**

```
1. Win + R → taskschd.msc 열기
2. "기본 작업 만들기"
3. 이름: "RSSCAN Daily"
4. 트리거: "매일" 09:30 (시장 시간 30분 후)
5. 작업: run_daily.bat 실행
6. 위치: C:\Users\[사용자]\rsscan\
```

### **Mac Cron**

```bash
# 터미널에서:
crontab -e

# 매일 09:30 실행 (UTC 기준)
30 09 * * * /Users/[사용자]/rsscan/run_daily.sh
```

### **Linux Cron**

```bash
# 터미널에서:
crontab -e

# 매일 09:30 실행
30 09 * * * /home/[사용자]/rsscan/run_daily.sh
```

---

## 📊 RS Line 점수 계산식

### **1️⃣ RS 절대 강도 (40점)**
```
RS Rating ≥ 90 → 40점
RS Rating ≥ 85 → 32점
RS Rating ≥ 80 → 24점
RS Rating < 80 → 12점
```

### **2️⃣ 1주 변화율 (25점)**
```
+2.0% 이상 → 25점
+1.0~2.0% → 18점
+0.3~1.0% → 10점
-0.3~+0.3% → 5점
-0.3% 이하 → 0점
```

### **3️⃣ 1~3주 변화율 (20점)**
```
+1.5% 이상 → 20점
+0.8~1.5% → 14점
+0.2~0.8% → 8점
-0.2~+0.2% → 3점
-0.2% 이하 → 0점
```

### **4️⃣ 가속 보너스 (20점)**
```
단조 가속 (c1 > c3 > c6) + c1 ≥ 0.5% → 20점
단순 가속 (c1 > c3) → 15점
```

---

## 🎯 Phase 해석

| Phase | 상태 | 액션 |
|-------|------|------|
| 0 | 🔴 회피 | 스캔 제외 |
| 1 | ⚪ 관찰 | 감시 리스트 |
| 2 | 🟡 바닥 매집 | 조기 후보 |
| 3 | 🟢 베이스 성숙 | 대기 중 |
| **4** | **🎯 돌파 임박 ★** | **핵심 진입** |
| 5 | 🟢 본격 리더 | 홀드·추가매수 |
| 6 | 🟠 후반 피로 | 익절 준비 |
| 7 | 🔴 분배 의심 | 청산 검토 |

---

## 📁 파일 구조

```
rsscan/
├── generate_entry_signals.py    ← 핵심 스크립트
├── run_daily.bat                ← Windows 배치 파일
├── run_daily.sh                 ← Mac/Linux 쉘 스크립트
├── entry_signals.json           ← 생성되는 결과 파일
├── index.html                   ← RSSCAN v3 대시보드
├── css/
│   ├── dashboard.css
│   └── responsive.css
└── js/
    └── app.js
```

---

## 🔧 트러블슈팅

### **Python이 없습니다**

```
1. Python 3.8+ 설치: https://www.python.org/downloads/
2. 설치 시 "Add Python to PATH" 체크
3. run_daily.bat 다시 실행
```

### **yfinance 오류**

```
pip install --upgrade yfinance
```

### **권한 오류 (Mac/Linux)**

```bash
chmod +x run_daily.sh
./run_daily.sh
```

---

## 📈 결과 파일 (entry_signals.json)

```json
{
  "timestamp": "2026-06-16 14:30:00",
  "market_health": "🟢 Uptrend Resumed",
  "market_regime": "75~95%",
  "total_scanned": 45,
  "phase_4_count": 8,
  "phase_4_plus_count": 3,
  "signals": [
    {
      "symbol": "NVMI",
      "price": 619.07,
      "rs_score": 92,
      "phase": 4,
      "phase_name": "🎯 돌파 임박",
      "is_phase_4_plus": true,
      "pattern": "Ascending Base",
      "rs_1w_chg": 2.1,
      "rs_3w_chg": 1.3,
      "ibd_rs": 93
    },
    ...
  ]
}
```

---

## 💡 팁

1. **매일 동일 시간에 실행** (시장 시간 이후, 예: 16:30)
2. **Phase 4 + RS Score ≥ 80** 종목 우선 검토
3. **Phase 4+ 종목** (장기배경 양호)이 최고의 품질
4. **전환(NEW↑)** 당일 (예: Phase 3→4) 가장 날카로운 진입 타이밍

---

**질문 있으시면 언제든지!** 🚀
