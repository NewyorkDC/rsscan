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


def compute_acc_dis(close, volume):
    """기관 매집/분산 등급 (A+~E). 최근 50일 상승일 vs 하락일 거래량 비교."""
    n = min(len(close), 50)
    if n < 10:
        return 'C', 50.0
    c = close.iloc[-n:].values
    v = volume.iloc[-n:].values
    up_vol = 0.0
    down_vol = 0.0
    for i in range(1, n):
        if c[i] > c[i - 1]:
            up_vol += v[i]
        elif c[i] < c[i - 1]:
            down_vol += v[i]
    total = up_vol + down_vol
    if total <= 0:
        return 'C', 50.0
    # 매집비율 0~1 → 점수 0~100
    acc_ratio = up_vol / total
    score = round(acc_ratio * 100, 1)
    # 등급 매핑 (IBD 스타일 A+~E)
    if score >= 70: grade = 'A+'
    elif score >= 62: grade = 'A'
    elif score >= 56: grade = 'B+'
    elif score >= 50: grade = 'B'
    elif score >= 44: grade = 'C+'
    elif score >= 38: grade = 'C'
    elif score >= 30: grade = 'D'
    else: grade = 'E'
    return grade, score


def detect_pattern(close, high, low, volume):
    """룰베이스 차트 패턴 탐지. (패턴명, 점수0~100) 반환.
    HT Flag(고타이트 깃발), Cup with Handle, VCP(변동성 수축), Flat Base 순으로 검사."""
    n = len(close)
    if n < 40:
        return None, 0

    c = close.values
    last = c[-1]
    hi = high.values
    lo = low.values

    # 최근 고점 대비 위치
    high_50 = float(np.max(c[-50:])) if n >= 50 else float(np.max(c))
    dist_high = (last / high_50 - 1) * 100 if high_50 > 0 else -100

    # 1) 변동성 수축 (최근 10일 변동폭 vs 그 이전 20일 변동폭)
    recent_range = (np.max(hi[-10:]) - np.min(lo[-10:])) / last if last > 0 else 1
    prior_range = (np.max(hi[-30:-10]) - np.min(lo[-30:-10])) / last if last > 0 and n >= 30 else 1
    contracting = recent_range < prior_range * 0.7  # 변동폭 30%+ 수축

    # 2) 베이스 깊이 (최근 60일 조정폭 — 컵 등 깊은 베이스 포착)
    base_window = min(60, n)
    base_high = float(np.max(c[-base_window:]))
    base_low = float(np.min(c[-base_window:]))
    base_depth = (1 - base_low / base_high) * 100 if base_high > 0 else 100

    # 3) 거래량 수축 여부 (최근 5일 평균 < 20일 평균 → 매물 소화)
    vol = volume.values
    vol_dry = float(np.mean(vol[-5:])) < float(np.mean(vol[-20:])) if n >= 20 else False

    # === 패턴 판정 (신고가 근접 + 베이스 형태) ===
    # High Tight Flag: 신고가 3% 이내 + 얕은 베이스(<15%) + 변동성 수축
    if dist_high >= -3 and base_depth < 15 and contracting:
        score = 80 + min(int((3 + dist_high) * 3), 15)  # 신고가 가까울수록 가점
        return 'High Tight Flag', min(score, 99)

    # VCP (Volatility Contraction): 변동성 수축 + 거래량 마름 + 신고가 8% 이내
    if contracting and vol_dry and dist_high >= -8 and base_depth < 25:
        score = 72 + min(int((8 + dist_high) * 2), 18)
        return 'VCP', min(score, 95)

    # Cup with Handle: 중간 깊이 베이스(15~35%) + 신고가 10% 이내 + 거래량 마름
    if 15 <= base_depth <= 35 and dist_high >= -10 and vol_dry:
        score = 68 + min(int((10 + dist_high) * 1.5), 20)
        return 'Cup with Handle', min(score, 92)

    # Flat Base: 얕은 횡보(<12%) + 신고가 12% 이내
    if base_depth < 12 and dist_high >= -12:
        score = 62 + min(int((12 + dist_high)), 18)
        return 'Flat Base', min(score, 85)

    return None, 0


def compute_supply_zone(close, volume):
    """매물 분포: 현재가 위 저항 매물 비율(%). 낮을수록 돌파 쉬움.
    가격대별 거래량 히스토그램으로 현재가 위/아래 매물량 비교."""
    n = min(len(close), 252)
    if n < 30:
        return 50.0
    c = close.iloc[-n:].values
    v = volume.iloc[-n:].values
    last = c[-1]
    above_vol = float(np.sum(v[c > last]))  # 현재가보다 높은 가격대 거래량 = 저항
    total_vol = float(np.sum(v))
    if total_vol <= 0:
        return 50.0
    return round(above_vol / total_vol * 100, 1)  # 위 매물 % (0=저항없음, 100=전부저항)


def fetch_one(ticker, bench_perf):
    """단일 종목 분석. 실패 시 None 반환."""
    try:
        df = yf.Ticker(ticker).history(period='2y', auto_adjust=True)
        if df is None or len(df) < 60:
            return None

        close = df['Close']
        volume = df['Volume']
        high = df['High'] if 'High' in df else close
        low = df['Low'] if 'Low' in df else close
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

        # 252일 가격 모멘텀 (RS 백분위 계산용) — 시점별로 산출하여 RS 변화율 계산
        # rs_now: 오늘 기준 / rs_1w: 5거래일 전 기준 / rs_3w: 15거래일 전 / rs_6w: 30거래일 전
        def perf_252_at(offset):
            """offset 거래일 전 시점 기준 252일 수익률"""
            idx = -1 - offset
            if len(close) <= 252 + offset:
                # 데이터 부족 시 가능한 최대 lookback
                lb = min(len(close) - 1 - offset, 252)
                if lb <= 0:
                    return None
                try:
                    return close.iloc[idx] / float(close.iloc[idx - lb]) - 1
                except (IndexError, ZeroDivisionError):
                    return None
            try:
                return close.iloc[idx] / float(close.iloc[idx - 252]) - 1
            except (IndexError, ZeroDivisionError):
                return None

        perf_now = perf_252_at(0)
        perf_1w = perf_252_at(5)
        perf_3w = perf_252_at(15)
        perf_6w = perf_252_at(30)
        perf_252 = perf_now if perf_now is not None else 0.0

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

        # ===== A그룹: IBD 스타일 정밀 지표 =====
        # Acc/Dis (기관 매집/분산 등급)
        acc_grade, acc_score = compute_acc_dis(close, volume)
        # 차트 패턴 인식
        pattern_name, pattern_score = detect_pattern(close, high, low, volume)
        # 매물 분포 (현재가 위 저항 %)
        supply_above_pct = compute_supply_zone(close, volume)

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
            '_perf_now': perf_now,      # RS 변화율용 시점별 수익률
            '_perf_1w': perf_1w,
            '_perf_3w': perf_3w,
            '_perf_6w': perf_6w,
            # A그룹
            'acc_dis_grade': acc_grade,
            'acc_dis_score': acc_score,
            'chart_pattern': pattern_name,        # 'High Tight Flag' 등 or None
            'pattern_score': pattern_score,       # 0~99
            'supply_above_pct': supply_above_pct, # 위 매물 % (낮을수록 돌파 쉬움)
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
    # rs_now(오늘) + 과거 시점(1주/3주/6주 전) RS Rating을 각각 백분위로 산출
    # → RS 변화율(가속도) 계산에 사용
    n = len(results)

    def rank_percentile(key):
        """results의 key값으로 종목간 백분위(1~99) 배열 반환. None/NaN은 최하위."""
        vals = np.array([
            r[key] if (r.get(key) is not None
                       and not (isinstance(r[key], float) and (np.isnan(r[key]) or np.isinf(r[key]))))
            else -np.inf
            for r in results
        ])
        ranks = vals.argsort().argsort()
        return [int(round((ranks[i] / max(n - 1, 1)) * 98)) + 1 for i in range(n)]

    rs_now_arr = rank_percentile('_perf_now')
    rs_1w_arr = rank_percentile('_perf_1w')
    rs_3w_arr = rank_percentile('_perf_3w')
    rs_6w_arr = rank_percentile('_perf_6w')

    for i, r in enumerate(results):
        r['ibd_rs_rating'] = rs_now_arr[i]   # 오늘 기준 RS Rating (rs_now)
        r['rs_line_bayes'] = rs_now_arr[i]
        r['rs_now'] = rs_now_arr[i]
        r['rs_1w_ago'] = rs_1w_arr[i]
        r['rs_3w_ago'] = rs_3w_arr[i]
        r['rs_6w_ago'] = rs_6w_arr[i]

    # ===== Composite Rating: 여러 지표 가중 합성 후 종목 간 백분위 (1~99) =====
    # IBD Composite 근사: RS 35% + 추세(Phase) 25% + Acc/Dis 20% + 패턴 20%
    raw_comp = []
    for r in results:
        rs = r['ibd_rs_rating']
        phase = r.get('phase', 3)
        phase_pts = {7: 0, 6: 20, 3: 40, 4: 70, 5: 100}.get(phase, 40)
        acc = r.get('acc_dis_score', 50)
        pat = r.get('pattern_score', 0)
        comp_raw = rs * 0.35 + phase_pts * 0.25 + acc * 0.20 + pat * 0.20
        raw_comp.append(comp_raw)
    comp_arr = np.array(raw_comp)
    comp_ranks = comp_arr.argsort().argsort()
    for i, r in enumerate(results):
        r['composite_rating'] = int(round((comp_ranks[i] / max(n - 1, 1)) * 98)) + 1

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

    # ===== momentum_score_v2: RS Line 점수 계산식 (4항목, 총 105→100 캡) =====
    # 1️⃣ RS 절대강도(40) + 2️⃣ 1주 RS변화율(25) + 3️⃣ 1~3주 RS변화율(20) + 4️⃣ 가속보너스(20)
    def compute_momentum_v2(rs_now, rs_1w, rs_3w, rs_6w):
        # --- 1️⃣ RS 절대 강도 (최대 40점) ---
        if rs_now >= 90:
            s_abs = 40
        elif rs_now >= 85:
            s_abs = 32
        elif rs_now >= 80:
            s_abs = 24
        else:
            s_abs = 12

        # --- 2️⃣ 최근 1주 RS 변화율 (최대 25점): (rs_now - rs_1w) / rs_1w × 100 ---
        c1 = ((rs_now - rs_1w) / rs_1w * 100) if rs_1w else 0.0
        if c1 >= 2.0:
            s_1w = 25
        elif c1 >= 1.0:
            s_1w = 18
        elif c1 >= 0.3:
            s_1w = 10
        elif c1 >= -0.3:
            s_1w = 5
        else:
            s_1w = 0

        # --- 3️⃣ 1~3주 RS 변화율 (최대 20점): (rs_1w - rs_3w) / rs_3w × 100 ---
        c3 = ((rs_1w - rs_3w) / rs_3w * 100) if rs_3w else 0.0
        if c3 >= 1.5:
            s_3w = 20
        elif c3 >= 0.8:
            s_3w = 14
        elif c3 >= 0.2:
            s_3w = 8
        elif c3 >= -0.2:
            s_3w = 3
        else:
            s_3w = 0

        # --- 4️⃣ 가속 보너스 (최대 20점) ---
        # 3~6주 변화율 (단조증가 판정용)
        c6 = ((rs_3w - rs_6w) / rs_6w * 100) if rs_6w else 0.0
        s_acc = 0
        # 가속(+15): 최근 1주 변화율 > 1~3주 변화율
        if c1 > c3:
            s_acc += 15
        # 가속추세(+5): 3구간 모두 양수 + 단조증가(c1>c3>c6) + 1주변화 ≥ +0.5%
        if (c1 > 0 and c3 > 0 and c6 > 0) and (c1 > c3 > c6) and (c1 >= 0.5):
            s_acc += 5

        total = s_abs + s_1w + s_3w + s_acc
        return min(total, 100)

    # total_score 중앙값 계산을 위해 먼저 raw 산출
    for r in results:
        rs = safe_num(r['ibd_rs_rating'])
        # momentum_score_v2: 정통 RS Line 점수 (4항목)
        mom = compute_momentum_v2(
            safe_num(r.get('rs_now', rs)),
            safe_num(r.get('rs_1w_ago', rs)),
            safe_num(r.get('rs_3w_ago', rs)),
            safe_num(r.get('rs_6w_ago', rs)),
        )
        r['momentum_score_v2'] = mom
        # theme_score: 신고가/가속이면 가산
        theme = 50
        if r['rs_new_high']:
            theme += 15
        if r['rs_accelerating_strong']:
            theme += 10
        r['theme_score'] = min(theme, 100)
        # top_pattern: 실제 차트 패턴이 인식됐고 신고가 근접 + RS 70+ + Phase 4+
        has_pattern = bool(r.get('chart_pattern'))
        r['top_pattern'] = bool(has_pattern and rs >= 70 and r['phase'] >= 4)
        # ad_score: 실제 Acc/Dis 매집 점수 (기관 수급)
        r['ad_score'] = int(round(safe_num(r.get('acc_dis_score', 50))))
        # trend_pass: Phase 기반 추세 통과 개수 (4~8)
        if r['phase'] >= 5:
            r['trend_pass'] = 8
        elif r['phase'] == 4:
            r['trend_pass'] = 7
        elif r['phase'] == 3:
            r['trend_pass'] = 6
        else:
            r['trend_pass'] = 4
        # total_score: RS + 모멘텀 + 추세 + 패턴 종합
        r['total_score'] = int(np.clip(
            rs * 0.5 + mom * 0.25 + r['trend_pass'] * 1.25
            + safe_num(r.get('pattern_score', 0)) * 0.12, 0, 100))

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
            'rs_now': r.get('rs_now', r['ibd_rs_rating']),
            'rs_1w_ago': r.get('rs_1w_ago', r['ibd_rs_rating']),
            'rs_3w_ago': r.get('rs_3w_ago', r['ibd_rs_rating']),
            'rs_6w_ago': r.get('rs_6w_ago', r['ibd_rs_rating']),
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
            # A그룹: IBD 스타일 정밀 지표
            'composite_rating': r.get('composite_rating', 0),
            'acc_dis_grade': r.get('acc_dis_grade', 'C'),
            'acc_dis_score': r.get('acc_dis_score', 50.0),
            'chart_pattern': r.get('chart_pattern'),
            'pattern_score': r.get('pattern_score', 0),
            'supply_above_pct': r.get('supply_above_pct', 50.0),
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
