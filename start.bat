@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

title RSSCAN v3 Dashboard

echo.
echo ╔════════════════════════════════════════╗
echo ║     RSSCAN v3 - 시작 중입니다          ║
echo ╚════════════════════════════════════════╝
echo.

REM 현재 디렉토리 확인
if not exist "index.html" (
    echo ❌ 오류: index.html을 찾을 수 없습니다.
    echo 이 파일이 프로젝트 루트 디렉토리에 있어야 합니다.
    echo.
    pause
    exit /b 1
)

REM 포트 8765 확인 (이미 사용 중인지)
echo 📊 포트 8765 확인 중...
netstat -ano | findstr ":8765" >nul
if not errorlevel 1 (
    echo ⚠️  포트 8765가 이미 사용 중입니다.
    echo 기존 프로세스를 종료하거나 다른 포트를 사용하세요.
    echo.
    pause
    exit /b 1
)

REM Python 설치 확인
echo 🐍 Python 확인 중...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python이 설치되지 않았습니다.
    echo https://www.python.org/downloads/ 에서 설치하세요.
    echo (설치 시 "Add Python to PATH" 꼭 체크!)
    echo.
    pause
    exit /b 1
)

REM 데이터 폴더 생성
if not exist "data" mkdir data
if not exist "css" mkdir css
if not exist "js" mkdir js

echo ✅ 모든 준비 완료!
echo.
echo 🌐 대시보드 시작 중...
echo.
echo 📍 로컬 주소: http://localhost:8765
echo 📍 Tailscale: http://[Tailscale IP]:8765
echo.

REM Python HTTP 서버 시작
cd /d "%~dp0"
python -m http.server 8765 --bind 127.0.0.1

echo.
echo ⚠️  서버가 중단되었습니다.
pause
