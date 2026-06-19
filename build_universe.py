#!/usr/bin/env python3
"""
build_universe.py - 동적 Investable Universe 생성

IBD/O'Neil/Minervini 철학: 고정 지수가 아니라 "충분한 시총·유동성을 가진
거래 가능 종목"을 매일 새로 선정한다.

방식:
1. NASDAQ/NYSE/AMEX 전체 상장 종목 메타데이터 수집 (symbol, marketCap, volume, sector)
2. 사전 필터: 우선주/워런트/유닛/펀드 등 비정상 티커 제거
3. 시총·거래량 필터 (기본: 시총 >= 5억$, 거래량 >= 10만주)
4. 시총 내림차순 상한 (기본 1,200개) — yfinance 수집 시간 관리
5. 출력: results/universe_tickers.json  (fetch_sp500_data.py가 읽음)

출처: github.com/rreichel3/US-Stock-Symbols (매일 갱신되는 공개 데이터)
"""

import json
import os
import sys
import urllib.request

# ===== 필터 파라미터 =====
MIN_MARKET_CAP = 5e8       # 최소 시총 5억 달러
MIN_VOLUME = 100_000       # 최소 일거래량 10만주
MAX_TICKERS = 2000         # yfinance 수집 상한 (시총 상위순)

BASE = "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main"
EXCHANGES = ['nasdaq', 'nyse', 'amex']

# 제외할 티커 접미/패턴 (우선주, 워런트, 유닛 등)
EXCLUDE_SUFFIXES = ('.W', '.U', '.R', '.P', '-W', '-U', '-WS', '-RT')


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def parse_mcap(s):
    try:
        return float(s) if s else 0.0
    except (ValueError, TypeError):
        return 0.0


def parse_vol(s):
    try:
        return int(str(s).replace(',', '')) if s else 0
    except (ValueError, TypeError):
        return 0


def is_valid_ticker(symbol, name):
    """비정상 티커(우선주/워런트/유닛/펀드 등) 제외"""
    if not symbol or len(symbol) > 5:
        return False
    # 접미 패턴
    for suf in EXCLUDE_SUFFIXES:
        if suf in symbol:
            return False
    # 이름으로 ETF/펀드/우선주 거르기
    name_low = (name or '').lower()
    bad_words = ['warrant', 'preferred', 'units', 'depositary', 'right',
                 'etf', 'fund', 'trust', 'notes', 'debenture']
    if any(w in name_low for w in bad_words):
        return False
    # 워런트/우선주 표기가 흔한 5글자 티커 끝글자 (W/R/U/P) — 단 정상 4글자는 통과
    if len(symbol) == 5 and symbol[-1] in ('W', 'R', 'U', 'P'):
        return False
    return True


def build():
    print("=" * 60)
    print("🌐 동적 Investable Universe 생성")
    print("=" * 60 + "\n")

    all_stocks = []
    for ex in EXCHANGES:
        try:
            data = fetch_json(f"{BASE}/{ex}/{ex}_full_tickers.json")
            for d in data:
                d['exchange'] = ex
            all_stocks.extend(data)
            print(f"  {ex.upper()}: {len(data)}개 수집")
        except Exception as e:
            print(f"  ⚠️ {ex} 수집 실패: {e}")

    print(f"\n총 후보: {len(all_stocks)}개")

    if not all_stocks:
        print("❌ 후보 종목 수집 실패 — 기존 universe 유지")
        return False

    # 필터링
    filtered = []
    for d in all_stocks:
        sym = (d.get('symbol') or '').strip().upper()
        name = d.get('name', '')
        if not is_valid_ticker(sym, name):
            continue
        mcap = parse_mcap(d.get('marketCap', '0'))
        vol = parse_vol(d.get('volume', '0'))
        if mcap < MIN_MARKET_CAP or vol < MIN_VOLUME:
            continue
        filtered.append({
            'ticker': sym.replace('.', '-'),   # BRK.B → BRK-B (yfinance 형식)
            'name': name,
            'market_cap': mcap,
            'volume': vol,
            'sector': d.get('sector', ''),
            'industry': d.get('industry', ''),
            'exchange': d.get('exchange', ''),
        })

    print(f"시총>=${MIN_MARKET_CAP/1e8:.0f}억 & 거래량>={MIN_VOLUME:,}주 필터 후: {len(filtered)}개")

    # 시총 내림차순 + 상한
    filtered.sort(key=lambda x: x['market_cap'], reverse=True)
    universe = filtered[:MAX_TICKERS]
    print(f"시총 상위 {MAX_TICKERS} 상한 적용: {len(universe)}개\n")

    # 중복 제거 (티커 기준)
    seen = set()
    final = []
    for u in universe:
        if u['ticker'] not in seen:
            seen.add(u['ticker'])
            final.append(u)

    tickers = [u['ticker'] for u in final]

    # 저장
    os.makedirs('results', exist_ok=True)
    out = {
        'count': len(tickers),
        'min_market_cap': MIN_MARKET_CAP,
        'min_volume': MIN_VOLUME,
        'max_tickers': MAX_TICKERS,
        'tickers': tickers,
        'meta': {u['ticker']: {'sector': u['sector'], 'industry': u['industry'],
                               'market_cap': u['market_cap']} for u in final},
    }
    with open('results/universe_tickers.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"✅ 저장: results/universe_tickers.json ({len(tickers)}개)")
    print(f"   시총 1위: {final[0]['ticker']} (${final[0]['market_cap']/1e9:.1f}B)")
    print(f"   시총 막내: {final[-1]['ticker']} (${final[-1]['market_cap']/1e9:.2f}B)")
    print("=" * 60 + "\n")
    return True


if __name__ == '__main__':
    try:
        build()
        print("✅ 완료!")
        sys.exit(0)
    except Exception as e:
        print(f"❌ 오류: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(0)  # 실패해도 파이프라인 중단 방지
