#!/usr/bin/env python3
"""
update_universe.py - Investable Universe 저장 (v2, yfinance 제거)

[변경] 기존엔 yfinance로 종목 정보를 직접 받았으나, Yahoo의 봇 차단
(401 Invalid Crumb)으로 GitHub Actions에서 불안정 → 전면 재작성.

이제 build_universe.py가 GitHub 공개 데이터셋(야후 아님)으로 생성한
results/universe_tickers.json을 읽어 investable_universe.json 형식으로
변환만 한다. 네트워크 의존 최소화 → 안정적.

⚠️ build_universe.py가 먼저 실행되어야 함 (워크플로우 순서 보장).
"""

import json
import os
import sys


def main():
    print("=" * 60)
    print("🚀 RSSCAN v3: Investable Universe 저장 (v2)")
    print("=" * 60)

    src = 'results/universe_tickers.json'
    if not os.path.exists(src):
        print(f"⚠️ {src} 없음 — build_universe.py가 먼저 실행되어야 함.")
        print("   이 스텝은 건너뜁니다 (파이프라인 중단 없음).")
        sys.exit(0)

    try:
        with open(src, encoding='utf-8') as f:
            uni = json.load(f)
    except Exception as e:
        print(f"⚠️ universe_tickers.json 로드 실패: {e} — 스킵")
        sys.exit(0)

    tickers = uni.get('tickers', [])
    meta = uni.get('meta', {})

    if not tickers:
        print("⚠️ 티커가 비어있음 — 스킵")
        sys.exit(0)

    # investable_universe.json 형식으로 변환 (대시보드 호환)
    universe = []
    for t in tickers:
        m = meta.get(t, {})
        universe.append({
            'ticker': t,
            'sector': m.get('sector', ''),
            'industry': m.get('industry', ''),
            'market_cap': m.get('market_cap', 0),
        })

    os.makedirs('results', exist_ok=True)

    # JSON 저장
    out = {
        'count': len(universe),
        'source': 'build_universe.py (US-Stock-Symbols dataset)',
        'min_market_cap': uni.get('min_market_cap', 0),
        'min_volume': uni.get('min_volume', 0),
        'universe': universe,
    }
    with open('results/investable_universe.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"✅ Investable Universe 저장 완료: {len(universe)}개 종목")
    print(f"   - results/investable_universe.json")
    print("=" * 60 + "\n")
    sys.exit(0)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"⚠️ 오류: {e} — 파이프라인 중단 방지를 위해 스킵")
        sys.exit(0)
