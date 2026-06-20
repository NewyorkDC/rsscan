#!/usr/bin/env python3
"""
market_pulse.py - Market Regime 판정 엔진 (yfinance 실데이터)

역할:
- SPY / QQQ / IWM(러셀2000) 지수 데이터 분석
- 지수별 종가, 등락률(%), MA(21/50/200) 정배열 상태
- Market Regime 판정 (Uptrend Resumed, Confirmed Uptrend, Under Pressure, Rally Attempt, Correction)
- Breadth: daily_ibd_scan.json을 읽어 50MA(Phase>=3) 위 종목 비율 실계산
- Distribution Day 카운트 (최근 25일 분산일)
- 출력: results/market_pulse.json  (대시보드가 읽는 위치)
"""

import json
import os
import sys
import time
import ssl
from datetime import datetime

import yfinance as yf
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

# yfinance 봇 차단 완화: 미검증 SSL 컨텍스트 (fetch_sp500_data.py와 동일 정책)
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except Exception:
    pass

OUTPUT_DIR = 'results'
SCAN_FILE = 'results/daily_ibd_scan.json'
PULSE_FILE = 'results/market_pulse.json'   # 이전 유효 데이터 폴백용

INDICES = {
    'SP500':   {'ticker': 'SPY', 'name': 'S&P 500'},
    'NASDAQ':  {'ticker': 'QQQ', 'name': 'NASDAQ'},
    'RUSSELL': {'ticker': 'IWM', 'name': 'Russell 2000'},
}


def load_previous_pulse():
    """직전 실행의 market_pulse.json (지수 수집 최종 실패 시 폴백용)."""
    try:
        if os.path.exists(PULSE_FILE):
            with open(PULSE_FILE, encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return None



def fetch_index(ticker, retries=5):
    """단일 지수 일봉 (rate limit 재시도 강화). 실패 시 None.
    1차: yf.Ticker().history(), 2차 폴백: yf.download(). 각 재시도 사이 대기.
    """
    for attempt in range(retries):
        # 1차: Ticker.history
        try:
            df = yf.Ticker(ticker).history(period='1y', auto_adjust=True, timeout=15)
            if df is not None and len(df) >= 50:
                return df
        except Exception as e:
            print(f"⚠️ {ticker} history 시도 {attempt+1}/{retries} 실패: {e}")
        # 2차 폴백: yf.download
        try:
            df = yf.download(ticker, period='1y', auto_adjust=True,
                             progress=False, threads=False, timeout=15)
            if df is not None and len(df) >= 50:
                # download는 멀티컬럼일 수 있어 평탄화
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                return df
        except Exception as e:
            print(f"⚠️ {ticker} download 시도 {attempt+1}/{retries} 실패: {e}")
        time.sleep(3)
    print(f"⚠️ {ticker} 다운로드 최종 실패 ({retries}회)")
    return None


def analyze_index(df):
    """지수 1개 분석: 종가, 1일 등락률, MA 정배열"""
    close = df['Close']
    last = float(close.iloc[-1])
    prev = float(close.iloc[-2]) if len(close) >= 2 else last
    change_pct = round((last / prev - 1) * 100, 2) if prev else 0.0

    ma21 = float(close.rolling(21).mean().iloc[-1]) if len(close) >= 21 else np.nan
    ma50 = float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else np.nan
    ma200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else np.nan

    return {
        'close': round(last, 2),
        'change_pct': change_pct,
        'above_ma21': bool(not np.isnan(ma21) and last > ma21),
        'above_ma50': bool(not np.isnan(ma50) and last > ma50),
        'above_ma200': bool(not np.isnan(ma200) and last > ma200),
        'ma50': round(ma50, 2) if not np.isnan(ma50) else None,
        'ma200': round(ma200, 2) if not np.isnan(ma200) else None,
        # 스파크라인용 최근 90일 종가 배열 (차트 렌더링)
        'spark': [round(float(x), 2) for x in close.iloc[-90:].tolist()],
    }


def count_distribution_days(df):
    """최근 25거래일 중 분산일(전일 대비 -0.2% 이상 하락 + 거래량 증가) 카운트"""
    if len(df) < 26:
        return 0
    recent = df.iloc[-25:]
    close = recent['Close'].values
    vol = recent['Volume'].values
    dd = 0
    for i in range(1, len(recent)):
        price_drop = (close[i] / close[i - 1] - 1) <= -0.002
        vol_up = vol[i] > vol[i - 1]
        if price_drop and vol_up:
            dd += 1
    return int(dd)


def judge_regime(spy_info, dd_count, breadth):
    """IBD Market School 체계: 분산일(Distribution Day) 중심 판정.
    - Correction: 분산일 6+ 또는 SPY가 50일 MA 명확 이탈
    - Under Pressure: 분산일 4~5개 누적
    - Confirmed/Resumed Uptrend: 분산일 적고 정배열"""
    above50 = spy_info['above_ma50']
    above200 = spy_info['above_ma200']

    # 🔴 Correction: 분산일 6+ 또는 50일 MA 명확 이탈(장기 추세도 깨짐)
    if dd_count >= 6 or (not above50 and not above200):
        return {'label': 'Market in Correction', 'icon': '🔴', 'code': 'correction', 'ratio': '0-20%'}

    # 🔴 50일 MA 아래 (단기 추세 이탈, 장기는 유지) → 조정 진입
    if not above50 and above200:
        return {'label': 'Uptrend Under Pressure', 'icon': '🟡', 'code': 'under_pressure', 'ratio': '40-60%'}

    # 🟡 Under Pressure: 분산일 4~5개 누적
    if dd_count >= 4:
        return {'label': 'Uptrend Under Pressure', 'icon': '🟡', 'code': 'under_pressure', 'ratio': '40-60%'}

    # 🟢 Uptrend Resumed: 정배열 + 분산일 적음 + breadth 양호
    if above50 and above200 and dd_count <= 2 and breadth >= 55:
        return {'label': 'Uptrend Resumed', 'icon': '🟢', 'code': 'uptrend_resumed', 'ratio': '80-100%'}

    # 🟢 Confirmed Uptrend: 정배열 (분산일 3개 이하)
    if above50 and above200:
        return {'label': 'Confirmed Uptrend', 'icon': '🟢', 'code': 'confirmed_uptrend', 'ratio': '60-80%'}

    # 🟠 Rally Attempt: 50일 위, 200일 아래 (회복 시도)
    return {'label': 'Rally Attempt', 'icon': '🟠', 'code': 'rally_attempt', 'ratio': '20-40%'}


def compute_exposure_count(spy_info, dd_count, breadth):
    """IBD Market School Exposure Count (0~5단계, 노출도 0~100%).
    분산일·MA정배열·breadth를 종합한 0~5 카운트."""
    if spy_info is None:
        return {'count': 0, 'exposure': '0%', 'label': 'Unknown'}

    above50 = spy_info['above_ma50']
    above200 = spy_info['above_ma200']

    # 기본 카운트: MA 정배열 상태
    if not above50 and not above200:
        count = 0   # 완전 조정
    elif not above50 and above200:
        count = 1   # 50일 이탈, 장기 유지
    elif above50 and not above200:
        count = 2   # 회복 시도
    else:
        count = 4   # 완전 정배열 기본 4

    # 분산일에 따른 감점
    if dd_count >= 6:
        count = min(count, 0)
    elif dd_count >= 4:
        count = min(count, 2)
    elif dd_count >= 3:
        count = min(count, 3)

    # breadth에 따른 가점/감점
    if count >= 4 and breadth >= 60 and dd_count <= 1:
        count = 5   # 최대 노출 (강한 상승 + 광범위 참여)
    elif count >= 3 and breadth < 40:
        count = max(count - 1, 0)

    count = max(0, min(5, count))
    exposure_map = {0: '0-20%', 1: '20%', 2: '40%', 3: '60%', 4: '80%', 5: '100%'}
    label_map = {
        0: 'Correction (신규 매수 금지)',
        1: 'FTD 직후 (초기 진입)',
        2: '상승 지속 확인',
        3: 'Power Trend 초기',
        4: '강한 상승 추세',
        5: 'Full Exposure (최대 노출)',
    }
    # 권장 비중 상한(전략실 연동용): count별 최대 노출 비율(0~1)
    max_ratio_map = {0: 0.20, 1: 0.20, 2: 0.40, 3: 0.60, 4: 0.80, 5: 1.00}
    return {
        'count': count,
        'exposure': exposure_map[count],
        'label': label_map[count],
        'max_ratio': max_ratio_map[count],
    }


def calculate_breadth_and_stages():
    """daily_ibd_scan.json을 읽어 breadth, Stage/Phase 분포 실계산"""
    result = {
        'breadth_pct': 0,
        'stage2': 0, 'stage3': 0, 'stage4': 0,
        'phase_p4plus': 0, 'phase_p4': 0, 'phase_p3': 0, 'phase_p67': 0,
        'total': 0,
    }
    if not os.path.exists(SCAN_FILE):
        print(f"⚠️ {SCAN_FILE} 없음 — breadth는 0으로 출력")
        return result

    with open(SCAN_FILE, encoding='utf-8') as f:
        data = json.load(f)

    total = len(data)
    if total == 0:
        return result

    # Breadth: Phase >= 3 (상승 추세) 종목 비율 ≈ 50MA 위 비율
    above_trend = sum(1 for d in data if d.get('phase', 0) >= 3)
    result['breadth_pct'] = round(above_trend / total * 100)

    # Stage 분포 (Phase → Weinstein Stage 매핑)
    # Phase 5+ = Stage 4 (말기 상승), Phase 4 = Stage 3 후기, Phase 3 = Stage 2 상승
    result['stage4'] = sum(1 for d in data if d.get('phase', 0) >= 5)
    result['stage3'] = sum(1 for d in data if d.get('phase', 0) == 4)
    result['stage2'] = sum(1 for d in data if d.get('phase', 0) == 3)

    # Phase 분포 (사이드바 막대용)
    result['phase_p4plus'] = sum(1 for d in data if d.get('phase', 0) >= 5)
    result['phase_p4'] = sum(1 for d in data if d.get('phase', 0) == 4)
    result['phase_p3'] = sum(1 for d in data if d.get('phase', 0) == 3)
    result['phase_p67'] = sum(1 for d in data if d.get('phase', 0) >= 6)
    result['total'] = total

    return result


def main():
    print("=" * 60)
    print("📊 Market Pulse Analysis (yfinance 실데이터)")
    print("=" * 60 + "\n")

    # 1. 지수 데이터 수집
    prev_pulse = load_previous_pulse()  # 최종 실패 시 폴백
    indices_out = {}
    spy_info = None
    spy_df = None
    for key, meta in INDICES.items():
        print(f"📈 {meta['name']}({meta['ticker']}) 수집 중...")
        df = fetch_index(meta['ticker'])
        if df is None:
            # 최종 실패: 직전 실행의 유효 데이터로 폴백 (stale 표시)
            prev_idx = (prev_pulse or {}).get('indices', {}).get(key)
            if prev_idx and prev_idx.get('close') is not None:
                prev_idx = dict(prev_idx)
                prev_idx['stale'] = True   # 과거 데이터임을 표시
                indices_out[key] = prev_idx
                print(f"   ↩️ {meta['name']} 이전 데이터로 폴백 (close={prev_idx.get('close')})")
                if key == 'SP500':
                    spy_info = prev_idx
            else:
                indices_out[key] = {'name': meta['name'], 'close': None, 'change_pct': 0.0,
                                    'above_ma21': False, 'above_ma50': False, 'above_ma200': False,
                                    'spark': []}
            continue
        info = analyze_index(df)
        info['name'] = meta['name']
        indices_out[key] = info
        if key == 'SP500':
            spy_info = info
            spy_df = df

    # 2. Breadth / Stage / Phase 분포 (종목 데이터 기반)
    print("\n📊 Breadth / Stage 분포 계산 중...")
    breadth_stages = calculate_breadth_and_stages()
    breadth = breadth_stages['breadth_pct']

    # 3. Distribution Days
    dd_count = count_distribution_days(spy_df) if spy_df is not None else 0

    # 4. Regime 판정 + Exposure Count
    if spy_info is None:
        regime = {'label': 'Unknown', 'icon': '⚪', 'code': 'unknown', 'ratio': '—'}
        exposure = {'count': 0, 'exposure': '—', 'label': 'Unknown', 'max_ratio': 0.20}
    else:
        regime = judge_regime(spy_info, dd_count, breadth)
        exposure = compute_exposure_count(spy_info, dd_count, breadth)

    # 5. 출력 조립
    pulse = {
        'date': datetime.now().strftime('%Y-%m-%d'),
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'regime': regime['label'],
        'regime_icon': regime['icon'],
        'regime_code': regime['code'],
        'investment_ratio': regime['ratio'],
        # Exposure Count (0~5)
        'exposure_count': exposure['count'],
        'exposure_pct': exposure['exposure'],
        'exposure_label': exposure['label'],
        'exposure_max_ratio': exposure['max_ratio'],
        'breadth_pct': breadth,
        'dd_count': dd_count,
        'indices': indices_out,
        'stages': {
            'stage2': breadth_stages['stage2'],
            'stage3': breadth_stages['stage3'],
            'stage4': breadth_stages['stage4'],
        },
        'phase_distribution': {
            'p4plus': breadth_stages['phase_p4plus'],
            'p4': breadth_stages['phase_p4'],
            'p3': breadth_stages['phase_p3'],
            'p67': breadth_stages['phase_p67'],
        },
        'total_stocks': breadth_stages['total'],
    }

    # Breadth 추이 차트용: 지수 spark를 시작점=100 기준으로 정규화하여 겹쳐 그림
    def normalize_spark(key):
        idx = indices_out.get(key, {})
        spark = idx.get('spark') or []
        if len(spark) < 2 or not spark[0]:
            return []
        base = spark[0]
        return [round(v / base * 100, 2) for v in spark]

    # 시스템 전체(500+) 추이: breadth_pct 히스토리를 직전 pulse에서 이어받아 누적
    prev_bh = (prev_pulse or {}).get('breadth_history', []) if prev_pulse else []
    breadth_history = list(prev_bh)[-89:]  # 최근 89개 유지
    breadth_history.append(breadth)        # 오늘치 추가 → 최대 90개

    pulse['charts'] = {
        'sp500_norm': normalize_spark('SP500'),
        'nasdaq_norm': normalize_spark('NASDAQ'),
        'system_breadth': breadth_history,  # 시스템 전체 breadth 추이 (매일 누적)
    }
    pulse['breadth_history'] = breadth_history  # 다음 실행이 이어받도록 저장

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_file = os.path.join(OUTPUT_DIR, 'market_pulse.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(pulse, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print(f"✅ Regime: {pulse['regime']} ({pulse['regime_icon']}) / 투자비중 {pulse['investment_ratio']}")
    print(f"✅ Exposure Count: {pulse['exposure_count']}/5 ({pulse['exposure_pct']}) — {pulse['exposure_label']}")
    print(f"✅ Breadth: {breadth}% / DD Count: {dd_count}")
    for k, v in indices_out.items():
        if v.get('close'):
            print(f"   {v['name']}: {v['close']} ({v['change_pct']:+.2f}%)")
    print(f"💾 저장: {out_file}")
    print(f"{'=' * 60}\n")


if __name__ == '__main__':
    try:
        main()
        print("✅ 완료!")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ 오류: {e}")
        import traceback
        traceback.print_exc()
        # market_pulse 실패해도 전체 파이프라인은 중단하지 않음 (exit 0)
        sys.exit(0)
