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
from datetime import datetime

import yfinance as yf
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

OUTPUT_DIR = 'results'
SCAN_FILE = 'results/daily_ibd_scan.json'

INDICES = {
    'SP500':   {'ticker': 'SPY', 'name': 'S&P 500'},
    'NASDAQ':  {'ticker': 'QQQ', 'name': 'NASDAQ'},
    'RUSSELL': {'ticker': 'IWM', 'name': 'Russell 2000'},
}


def fetch_index(ticker):
    """단일 지수 6개월 일봉. 실패 시 None."""
    try:
        df = yf.Ticker(ticker).history(period='1y', auto_adjust=True)
        if df is None or len(df) < 50:
            return None
        return df
    except Exception as e:
        print(f"⚠️ {ticker} 다운로드 실패: {e}")
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
    """SPY MA 정배열 + 분산일 + breadth 종합 regime 판정"""
    above50 = spy_info['above_ma50']
    above200 = spy_info['above_ma200']

    if above50 and above200 and dd_count <= 3 and breadth >= 55:
        return {'label': 'Uptrend Resumed', 'icon': '🟢', 'code': 'uptrend_resumed', 'ratio': '75-95%'}
    if above50 and above200:
        return {'label': 'Confirmed Uptrend', 'icon': '🟢', 'code': 'confirmed_uptrend', 'ratio': '60-80%'}
    if above200 and not above50:
        return {'label': 'Uptrend Under Pressure', 'icon': '🟡', 'code': 'under_pressure', 'ratio': '30-50%'}
    if above50 and not above200:
        return {'label': 'Rally Attempt', 'icon': '🟠', 'code': 'rally_attempt', 'ratio': '20-40%'}
    return {'label': 'Market in Correction', 'icon': '🔴', 'code': 'correction', 'ratio': '0-25%'}


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
    indices_out = {}
    spy_info = None
    spy_df = None
    for key, meta in INDICES.items():
        print(f"📈 {meta['name']}({meta['ticker']}) 수집 중...")
        df = fetch_index(meta['ticker'])
        if df is None:
            indices_out[key] = {'name': meta['name'], 'close': None, 'change_pct': 0.0,
                                'above_ma21': False, 'above_ma50': False, 'above_ma200': False}
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

    # 4. Regime 판정
    if spy_info is None:
        regime = {'label': 'Unknown', 'icon': '⚪', 'code': 'unknown', 'ratio': '—'}
    else:
        regime = judge_regime(spy_info, dd_count, breadth)

    # 5. 출력 조립
    pulse = {
        'date': datetime.now().strftime('%Y-%m-%d'),
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'regime': regime['label'],
        'regime_icon': regime['icon'],
        'regime_code': regime['code'],
        'investment_ratio': regime['ratio'],
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

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_file = os.path.join(OUTPUT_DIR, 'market_pulse.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(pulse, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print(f"✅ Regime: {pulse['regime']} ({pulse['regime_icon']}) / 투자비중 {pulse['investment_ratio']}")
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
