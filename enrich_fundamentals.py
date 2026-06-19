#!/usr/bin/env python3
"""
enrich_fundamentals.py - B그룹: 재무(EPS/매출/마진) 보강

[설계] A그룹(5-Gate)을 통과한 소수 종목(~수십 개)만 yfinance 재무 API로
EPS/매출 성장률, 이익률, ROE, 기관보유를 받아 IBD 스타일 등급으로 변환한다.

⚠️ yfinance .info / 분기재무는 봇 차단(401)이 잦으므로:
  - 통과 종목만 조회 (2000개 아님 → rate limit 위험 최소)
  - 종목당 재시도 + 간격
  - 실패해도 해당 종목은 'N/A'로 두고 계속 (파이프라인 중단 없음)

입력:  results/entry_signals.json (5-Gate 통과)
출력:  results/entry_signals.json (재무 필드 추가하여 덮어씀)
       results/daily_ibd_scan.json (통과 종목에 한해 재무 필드 병합)
"""

import json
import os
import sys
import time

try:
    import yfinance as yf
except ImportError:
    print("⚠️ yfinance 미설치 — 재무 보강 스킵")
    sys.exit(0)

SIGNALS_FILE = 'results/entry_signals.json'
SCAN_FILE = 'results/daily_ibd_scan.json'


def safe_pct(numer, denom):
    """성장률 계산. 분모가 0이거나 음수→양수 전환 등 예외 처리."""
    try:
        if denom is None or numer is None:
            return None
        denom = float(denom)
        numer = float(numer)
        if denom == 0:
            return None
        # 적자→흑자 등 부호 전환은 의미가 왜곡되므로 분모 양수일 때만
        if denom < 0:
            return None
        return (numer / denom - 1) * 100
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def eps_rating(eps_growth_q, eps_growth_a):
    """EPS Rating 근사 (1~99). 분기+연간 EPS 성장률 가중."""
    # 둘 다 없으면 None
    vals = [v for v in [eps_growth_q, eps_growth_a] if v is not None]
    if not vals:
        return None
    # 분기 60% + 연간 40% (있는 것만)
    if eps_growth_q is not None and eps_growth_a is not None:
        g = eps_growth_q * 0.6 + eps_growth_a * 0.4
    else:
        g = vals[0]
    # 성장률 → 1~99 매핑 (성장률 25%면 ~80점, 0%면 ~40점)
    score = 40 + g * 1.4
    return int(max(1, min(99, round(score))))


def smr_grade(sales_growth, profit_margin, roe):
    """SMR 등급 (A~E). 매출성장 + 이익률 + ROE 종합."""
    pts = 0
    cnt = 0
    if sales_growth is not None:
        pts += min(max(sales_growth, -20), 50) / 50 * 100  # -20~50% → 0~100
        cnt += 1
    if profit_margin is not None:
        pts += min(max(profit_margin, 0), 30) / 30 * 100   # 0~30% → 0~100
        cnt += 1
    if roe is not None:
        pts += min(max(roe, 0), 40) / 40 * 100             # 0~40% → 0~100
        cnt += 1
    if cnt == 0:
        return None, None
    score = pts / cnt
    if score >= 70: g = 'A'
    elif score >= 55: g = 'B'
    elif score >= 40: g = 'C'
    elif score >= 25: g = 'D'
    else: g = 'E'
    return g, round(score, 1)


def fetch_fundamentals(ticker, retries=3):
    """단일 종목 재무 조회. 실패 시 None."""
    for attempt in range(retries):
        try:
            tk = yf.Ticker(ticker)
            info = tk.info or {}

            # 기본 지표 (info에서)
            profit_margin = info.get('profitMargins')      # 0.15 = 15%
            roe = info.get('returnOnEquity')               # 0.20 = 20%
            sales_growth = info.get('revenueGrowth')       # 0.25 = 25% (YoY)
            earnings_growth_q = info.get('earningsQuarterlyGrowth')  # 분기 YoY
            held_inst = info.get('heldPercentInstitutions')  # 기관보유 비율

            # 퍼센트 변환 (소수 → %)
            pm = profit_margin * 100 if profit_margin is not None else None
            roe_pct = roe * 100 if roe is not None else None
            sg = sales_growth * 100 if sales_growth is not None else None
            eg_q = earnings_growth_q * 100 if earnings_growth_q is not None else None
            inst = held_inst * 100 if held_inst is not None else None

            # 연간 EPS 성장률 (trailing vs forward EPS로 근사)
            eps_ttm = info.get('trailingEps')
            eps_fwd = info.get('forwardEps')
            eg_a = safe_pct(eps_fwd, eps_ttm) if (eps_ttm and eps_fwd) else None

            # 데이터가 거의 없으면 실패로 간주하고 재시도
            if all(v is None for v in [pm, roe_pct, sg, eg_q]):
                raise ValueError("재무 데이터 비어있음")

            return {
                'eps_rating': eps_rating(eg_q, eg_a),
                'smr_grade': smr_grade(sg, pm, roe_pct)[0],
                'smr_score': smr_grade(sg, pm, roe_pct)[1],
                'sales_growth': round(sg, 1) if sg is not None else None,
                'profit_margin': round(pm, 1) if pm is not None else None,
                'roe': round(roe_pct, 1) if roe_pct is not None else None,
                'eps_growth_q': round(eg_q, 1) if eg_q is not None else None,
                'inst_ownership': round(inst, 1) if inst is not None else None,
            }
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
            else:
                return None
    return None


def main():
    print("=" * 60)
    print("🏦 RSSCAN B그룹: 재무 데이터 보강 (EPS/매출/마진)")
    print("=" * 60)

    if not os.path.exists(SIGNALS_FILE):
        print(f"⚠️ {SIGNALS_FILE} 없음 — 스킵")
        sys.exit(0)

    with open(SIGNALS_FILE, encoding='utf-8') as f:
        data = json.load(f)
    signals = data.get('signals', [])
    if not signals:
        print("⚠️ 통과 신호 없음 — 스킵")
        sys.exit(0)

    print(f"📊 재무 보강 대상: {len(signals)}개 종목 (5-Gate 통과분만)")

    fund_map = {}
    ok = 0
    for i, s in enumerate(signals, 1):
        ticker = s.get('ticker')
        if not ticker:
            continue
        fund = fetch_fundamentals(ticker)
        if fund:
            fund_map[ticker] = fund
            # 신호에 직접 병합
            s.update(fund)
            ok += 1
        else:
            # 실패 시 None 필드로 채움 (대시보드가 'N/A' 표시)
            for k in ['eps_rating', 'smr_grade', 'smr_score', 'sales_growth',
                      'profit_margin', 'roe', 'eps_growth_q', 'inst_ownership']:
                s.setdefault(k, None)
        if i % 10 == 0:
            print(f"   [{i}/{len(signals)}] 진행 중... (성공 {ok}개)")
        time.sleep(0.3)  # rate limit 완화

    print(f"\n✅ 재무 보강 완료: {ok}/{len(signals)}개 성공")

    # entry_signals.json 덮어쓰기
    with open(SIGNALS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"💾 {SIGNALS_FILE} 갱신")

    # daily_ibd_scan.json에도 통과 종목에 한해 병합 (모달/표시용)
    if os.path.exists(SCAN_FILE) and fund_map:
        try:
            with open(SCAN_FILE, encoding='utf-8') as f:
                scan = json.load(f)
            merged = 0
            for d in scan:
                t = d.get('ticker')
                if t in fund_map:
                    d.update(fund_map[t])
                    merged += 1
            with open(SCAN_FILE, 'w', encoding='utf-8') as f:
                json.dump(scan, f, ensure_ascii=False, indent=2)
            print(f"💾 {SCAN_FILE}에 {merged}개 종목 재무 병합")
        except Exception as e:
            print(f"⚠️ scan 병합 실패 ({e}) — entry_signals는 정상 저장됨")

    print("=" * 60 + "\n")
    sys.exit(0)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"⚠️ 오류: {e} — 파이프라인 중단 방지 위해 스킵")
        sys.exit(0)
