@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ================================================================================
echo  🚀 RSSCAN v3 - 완전 일일 분석 (yfinance 실시간 데이터)
echo ================================================================================
echo.

REM Python 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python이 설치되어 있지 않습니다!
    pause
    exit /b 1
)

REM 필수 패키지 설치
echo 📦 필수 패키지 설치 중...
pip install -q yfinance pandas numpy

REM 스크립트 실행
echo.
echo 📥 yfinance에서 S&P 500 데이터 수집 중... (3~5분 소요)
echo.

python generate_rsscan_daily.py

echo.
echo ✅ 완료! entry_signals.json 생성됨
echo    RSSCAN v3 대시보드를 새로고침하면 최신 데이터가 표시됩니다
echo.
echo 📊 매일 시장 종료 후(16:30 EST) 실행 권장
echo.
pause
