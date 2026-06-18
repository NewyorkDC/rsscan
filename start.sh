#!/bin/bash

echo ""
echo "╔════════════════════════════════════════╗"
echo "║     RSSCAN v3 - 시작 중입니다          ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Python 확인
if ! command -v python3 &> /dev/null; then
    echo "❌ Python이 설치되지 않았습니다."
    echo "https://www.python.org/downloads/ 에서 설치하세요."
    exit 1
fi

echo "✅ Python 확인됨"

# 폴더 생성
mkdir -p data input css js backend

echo "✅ 폴더 구조 준비 완료"

# 대시보드 시작
echo ""
echo "🌐 대시보드 시작 중..."
echo ""
echo "📍 로컬 주소: http://localhost:8765"
echo "📍 Tailscale: http://[Tailscale IP]:8765"
echo ""

python3 -m http.server 8765 --bind 127.0.0.1
