@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ================================================================================
echo  🚀 RSSCAN v3 - S&P 500 신규 진입 신호 자동 생성
echo ================================================================================
echo.

REM Python이 설치되어 있는지 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python이 설치되어 있지 않습니다!
    echo    Python을 먼저 설치하세요: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM 필요한 패키지 설치
echo 📦 필요한 패키지 설치 중...
pip install -q yfinance pandas numpy

REM 스크립트 실행
echo.
echo 📥 데이터 수집 중... (2~3분 소요)
echo.

python generate_entry_signals.py

echo.
echo ✅ 완료! entry_signals.json 생성됨
echo    RSSCAN v3 대시보드에서 자동으로 로드됩니다
echo.
pause
