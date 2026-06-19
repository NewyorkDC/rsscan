#!/usr/bin/env python3
"""
S&P 500 전체 종목 RS Line 데이터 생성 (yfinance 실데이터)
결과: results/daily_ibd_scan.json

설계:
- 티커 목록: GitHub datahub S&P 500 CSV (Wikipedia 403 회피)
- 가격 데이터: yfinance (1년치 일봉)
- 상대강도(RS): 벤치마크(SPY) 대비 가격 모멘텀을 종목 간 백분위(1~99)로 환산
- Stage/Phase: 이동평균(MA50, MA200) 정배열 여부로 판정
- 5-Gate 필터가 의존하는 18개 컬럼을 모두 보존
"""

import json
import os
import sys
import time
from io import StringIO
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd
import requests
import yfinance as yf
import warnings

warnings.filterwarnings('ignore')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) '
                  'Chrome/120.0.0.0 Safari/537.36'
}

BENCHMARK = 'SPY'   # 상대강도 기준 벤치마크
MAX_TICKERS = 2000  # 최대 종목 수 (동적 universe 상한)
MAX_WORKERS = 20    # 병렬 다운로드 스레드


def get_sp500_tickers():
    """분석 대상 티커 목록 수집.
    1순위: 동적 universe (results/universe_tickers.json, build_universe.py 생성)
    2순위 폴백: S&P 500 (Wikipedia → GitHub CSV)
    """
    print("📊 분석 대상 티커 목록 수집 중...")

    # ===== 1순위: 동적 universe =====
    universe_file = 'results/universe_tickers.json'
    if os.path.exists(universe_file):
        try:
            with open(universe_file, encoding='utf-8') as f:
                uni = json.load(f)
            tickers = uni.get('tickers', [])
            if tickers:
                print(f"✅ 동적 universe 로드: {len(tickers)}개 "
                      f"(시총>=${uni.get('min_market_cap', 0)/1e8:.0f}억)")
                # 섹터 ETF는 별도 탭용으로 항상 포함
                etfs = ['SPY', 'QQQ', 'IWM', 'SMH', 'SOXX',
                        'XLK', 'XLV', 'XLF', 'XLE', 'XLI', 'XLY',
                        'XLP', 'XLU', 'XLRE', 'XLB', 'XLC']
                tickers = sorted(set(tickers + etfs))[:MAX_TICKERS]
                print(f"✅ 분석 대상 (ETF 포함): {len(tickers)}개\n")
                return tickers
        except Exception as e:
            print(f"⚠️ 동적 universe 로드 실패 ({e}), S&P 500 폴백")

    # ===== 2순위 폴백: S&P 500 =====
    print("📊 S&P 500 폴백 모드...")
    tickers = []
    try:
        resp = requests.get(
            'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies',
            headers=HEADERS, timeout=15
        )
        resp.raise_for_status()
        df = pd.read_html(StringIO(resp.text))[0]
        tickers = df['Symbol'].tolist()
        print(f"✅ Wikipedia에서 {len(tickers)}개 수집")
    except Exception as e:
        print(f"⚠️ Wikipedia 실패 ({e}), GitHub fallback 시도...")
        try:
            url = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv'
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            df = pd.read_csv(StringIO(resp.text))
            tickers = df['Symbol'].tolist()
            print(f"✅ GitHub fallback에서 {len(tickers)}개 수집")
        except Exception as e2:
            print(f"❌ 티커 목록 수집 완전 실패: {e2}")
            sys.exit(1)

    tickers = [str(t).replace('.', '-').strip() for t in tickers if t]
    additional = [
        'NVDA', 'AVGO', 'ASML', 'PLTR', 'COIN',
        'SMH', 'SOXX', 'QQQ', 'IWM', 'XLK', 'XLV', 'XLF', 'XLE', 'XLI', 'XLY',
        'XLP', 'XLU', 'XLRE', 'XLB', 'XLC'
    ]
    tickers = sorted(set(tickers + additional))[:MAX_TICKERS]
    print(f"✅ 분석 대상: {len(tickers)}개 종목\n")
    return tickers


def compute_phase(close, ma50, ma200, ma150=None):
    """이동평균 정배열 기반 Stage/Phase 판정 (Weinstein 단순화)
    ma200이 없으면(데이터 부족) ma150/ma50으로 폴백 판정."""
    # ma200 없으면 더 짧은 장기 MA로 대체
    long_ma = ma200
    if np.isnan(long_ma) if long_ma is not None else True:
        long_ma = ma150
    if long_ma is None or (np.isnan(long_ma)):
        # 장기 MA 자체가 없으면 ma50 기준 단순 판정
        if not np.isnan(ma50):
            return 4 if close > ma50 else 6
        return 3

    if np.isnan(ma50):
        return 4 if close > long_ma else 6

    # Phase 5: 강한 정배열 (close > MA50 > 장기MA)
    if close > ma50 > long_ma:
        return 5 if close > ma50 * 1.05 else 4
    # Phase 4: close > 장기MA 이지만 MA50 근처
    if close > long_ma:
        return 4
    # Phase 3: 장기MA 부근 (전환 구간)
    if close > long_ma * 0.95:
        return 3
    # Phase 6/7: 장기MA 하회 (하락/조정)
    return 6 if close > long_ma * 0.85 else 7


def fetch_one(ticker, bench_perf):
    """단일 종목 분석. 실패 시 None 반환."""
    try:
        df = yf.Ticker(ticker).history(period='2y', auto_adjust=True)
        if df is None or len(df) < 60:
            return None

        close = df['Close']
        volume = df['Volume']
        last = float(close.iloc[-1])
        if last < 5:   # 페니주 제외
            return None

        # 이동평균
        ma50 = float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else np.nan
        ma150 = float(close.rolling(150).mean().iloc[-1]) if len(close) >= 150 else np.nan
        ma200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else np.nan

        # 가격 모멘텀 (거래일 기준: 6주≈30일, 10주≈50일, 3주≈15일)
        def pct_change(days):
            if len(close) <= days:
                return 0.0
            return round((last / float(close.iloc[-days - 1]) - 1) * 100, 1)

        chg_3w = pct_change(15)
        chg_6w = pct_change(30)
        chg_10w = pct_change(50)

        # 252일 가격 모멘텀 (RS 계산용 raw)
        lookback = min(len(close) - 1, 252)
        perf_252 = (last / float(close.iloc[-lookback - 1]) - 1) if lookback > 0 else 0.0

        # 신고가 여부 (최근 1년 고점 기준; 2년치 받아도 252일만)
        recent_252 = close.iloc[-252:] if len(close) >= 252 else close
        high_1y = float(recent_252.max())
        dist_from_high = (last / high_1y - 1) * 100 if high_1y > 0 else -100
        rs_new_high = dist_from_high >= -2.0      # 신고가 2% 이내
        breakout = dist_from_high >= -0.5         # 사실상 신고가 돌파

        # 피벗(최근 20일 고점) 대비 거리
        recent_high = float(close.iloc[-20:].max())
        dist_pivot = round((last / recent_high - 1) * 100, 1) if recent_high > 0 else 0.0

        # 거래대금 (유동성)
        adv = float(volume.iloc[-20:].mean()) if len(volume) >= 20 else float(volume.mean())
        dollar_vol = adv * last

        # 가속 여부: 최근 3주 모멘텀이 10주 평균보다 강한가
        accelerating = chg_3w > 0 and chg_6w > 0 and (chg_3w >= chg_10w / 3)

        return {
            'ticker': ticker,
            'close': round(last, 2),
            'phase': compute_phase(last, ma50, ma200, ma150),
            'rs_6w_change': chg_6w,
            'rs_10w_change': chg_10w,
            'rs_3w_change': chg_3w,
            'dist_pivot_pct': dist_pivot,
            'breakout': bool(breakout),
            'rs_new_high': bool(rs_new_high),
            'rs_accelerating_strong': bool(accelerating),
            'dollar_vol': dollar_vol,
            '_perf_252': perf_252,      # RS 백분위 계산용 (임시)
        }
    except Exception:
        return None


def main():
    print("=" * 60)
    print("🚀 RSSCAN v3: S&P 500 실데이터 수집 (yfinance)")
    print("=" * 60 + "\n")

    tickers = get_sp500_tickers()

    # 벤치마크(SPY) 성과 먼저 수집 (재시도 포함)
    bench_perf = 0.0
    for attempt in range(4):
        try:
            bdf = yf.Ticker(BENCHMARK).history(period='2y', auto_adjust=True)
            if bdf is not None and len(bdf) > 60:
                bclose = bdf['Close']
                lb = min(len(bclose) - 1, 252)
                bench_perf = bclose.iloc[-1] / bclose.iloc[-lb - 1] - 1
                print(f"📈 벤치마크({BENCHMARK}) 252일 수익률: {bench_perf * 100:.1f}%\n")
                break
        except Exception as e:
            print(f"⚠️ 벤치마크 시도 {attempt+1}/4 실패 ({e})")
        time.sleep(3)
    else:
        print(f"⚠️ 벤치마크 수집 실패 — RS는 종목간 백분위로 계산(영향 없음)\n")

    # 병렬 수집
    results = []
    print(f"⏳ {len(tickers)}개 종목 데이터 수집 중 (병렬 {MAX_WORKERS}스레드)...")
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(fetch_one, t, bench_perf): t for t in tickers}
        done = 0
        for future in as_completed(futures):
            done += 1
            res = future.result()
            if res:
                results.append(res)
            if done % 50 == 0:
                print(f"   [{done}/{len(tickers)}] 진행 중... (유효 {len(results)}개)")

    if not results:
        print("❌ 수집된 데이터가 없습니다. yfinance 접근을 확인하세요.")
        sys.exit(1)

    print(f"\n✅ 유효 데이터 {len(results)}개 수집 완료")

    # ===== RS Rating 계산: 252일 모멘텀의 종목 간 백분위 (1~99) =====
    # NaN(모멘텀 계산 불가)은 최저값(-inf)으로 처리해 백분위 하위로
    perfs = np.array([
        r['_perf_252'] if (r.get('_perf_252') is not None
                           and not np.isnan(r['_perf_252'])
                           and not np.isinf(r['_perf_252']))
        else -np.inf
        for r in results
    ])
    ranks = perfs.argsort().argsort()  # 0(최저) ~ N-1(최고)
    n = len(results)
    for i, r in enumerate(results):
        percentile = int(round((ranks[i] / max(n - 1, 1)) * 98)) + 1  # 1~99
        r['ibd_rs_rating'] = percentile
        r['rs_line_bayes'] = percentile

    # ===== 파생 점수 계산 =====
    today = datetime.now().strftime('%Y-%m-%d')

    # NaN 안전 처리 헬퍼: NaN/None/inf → 기본값
    def safe_num(v, default=0.0):
        try:
            f = float(v)
            if np.isnan(f) or np.isinf(f):
                return default
            return f
        except (TypeError, ValueError):
            return default

    # 모든 수치 필드의 NaN을 먼저 청소
    numeric_fields = ['ibd_rs_rating', 'rs_6w_change', 'rs_10w_change',
                      'dist_pivot_pct', 'rs_line_bayes', 'close', '_perf_252']
    for r in results:
        for fld in numeric_fields:
            if fld in r:
                r[fld] = safe_num(r[fld])

    # total_score 중앙값 계산을 위해 먼저 raw 산출
    for r in results:
        rs = safe_num(r['ibd_rs_rating'])
        # momentum_score_v2: RS와 단기 모멘텀 결합
        mom = int(np.clip(rs * 0.7 + max(safe_num(r['rs_6w_change']), 0) * 1.5, 0, 100))
        r['momentum_score_v2'] = mom
        # theme_score: 신고가/가속이면 가산
        theme = 50
        if r['rs_new_high']:
            theme += 15
        if r['rs_accelerating_strong']:
            theme += 10
        r['theme_score'] = min(theme, 100)
        # top_pattern: 피벗 3% 이내 + RS 70+ + Phase 4+
        r['top_pattern'] = bool(safe_num(r['dist_pivot_pct']) >= -3 and rs >= 70 and r['phase'] >= 4)
        # ad_score: 거래대금 기반 (큰 거래대금일수록 기관 관심) — 백분위 근사
        r['ad_score'] = int(np.clip(40 + (rs * 0.4), 40, 90))
        # trend_pass: Phase 기반 추세 통과 개수 (4~8)
        if r['phase'] >= 5:
            r['trend_pass'] = 8
        elif r['phase'] == 4:
            r['trend_pass'] = 7
        elif r['phase'] == 3:
            r['trend_pass'] = 6
        else:
            r['trend_pass'] = 4
        # total_score: RS + 모멘텀 + 추세 종합
        r['total_score'] = int(np.clip(rs * 0.6 + mom * 0.3 + r['trend_pass'] * 1.25, 0, 100))

    # ===== 최종 레코드 정리 (불필요 임시필드 제거, 18컬럼 보존) =====
    output = []
    for r in results:
        output.append({
            'ticker': r['ticker'],
            'date': today,
            'close': r['close'],
            'phase': r['phase'],
            'momentum_score_v2': r['momentum_score_v2'],
            'ibd_rs_rating': r['ibd_rs_rating'],
            'rs_6w_change': r['rs_6w_change'],
            'rs_10w_change': r['rs_10w_change'],
            'theme_score': r['theme_score'],
            'rs_line_bayes': r['rs_line_bayes'],
            'top_pattern': r['top_pattern'],
            'dist_pivot_pct': r['dist_pivot_pct'],
            'breakout': r['breakout'],
            'rs_accelerating_strong': r['rs_accelerating_strong'],
            'rs_new_high': r['rs_new_high'],
            'total_score': r['total_score'],
            'ad_score': r['ad_score'],
            'trend_pass': r['trend_pass'],
        })

    # RS Rating 내림차순 정렬
    output.sort(key=lambda x: x['ibd_rs_rating'], reverse=True)

    os.makedirs('results', exist_ok=True)
    out_file = 'results/daily_ibd_scan.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print(f"✅ {len(output)}개 종목 실데이터 저장 완료!")
    print(f"💾 {out_file} ({os.path.getsize(out_file):,} bytes)")
    print(f"   RS 90+: {sum(1 for r in output if r['ibd_rs_rating'] >= 90)}개")
    print(f"   Phase 4+: {sum(1 for r in output if r['phase'] >= 4)}개")
    print(f"   신고가: {sum(1 for r in output if r['rs_new_high'])}개")
    print(f"{'=' * 60}\n")


if __name__ == '__main__':
    try:
        main()
        print("✅ 완료!")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ 치명적 오류: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
