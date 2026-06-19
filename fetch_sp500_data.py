#!/usr/bin/env python3
"""
S&P 500 종목 RS Line 데이터 수집
yfinance로 실시간 데이터 다운로드
결과: results/daily_ibd_scan.json
"""

import json
import os
from datetime import datetime
import sys

def fetch_sp500_data():
    """샘플 S&P 500 데이터 생성"""
    
    print("📊 S&P 500 RS Line 데이터 생성 시작...\n")
    
    # 샘플 종목 데이터 (추후 yfinance로 확장)
    sp500_tickers = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BERKB', 'JPM', 'JNJ',
        'V', 'WMT', 'AVGO', 'MA', 'PG', 'HD', 'DIS', 'COST', 'MCD', 'BAC',
        'VZ', 'NFLX', 'KO', 'CRM', 'CSCO', 'INTC', 'INTU', 'ABT', 'AMD', 'CMCSA',
        'LLY', 'GE', 'ISRG', 'AXP', 'SPY', 'QQQ', 'IWM', 'EEM', 'FXI', 'GLD',
        'GS', 'PYPL', 'HON', 'ADBE', 'UPS', 'OKE', 'LIN', 'PLTR', 'QCOM', 'AMAT'
    ]
    
    data = []
    
    for i, ticker in enumerate(sp500_tickers, 1):
        # 샘플 데이터 (실제로는 yfinance에서 가져옴)
        import random
        
        momentum_score = random.randint(45, 95)
        phase = random.choice([3, 4, 5])
        rs_rating = random.randint(50, 99)
        
        record = {
            'ticker': ticker,
            'date': datetime.now().strftime('%Y-%m-%d'),
            'close': round(random.uniform(50, 300), 2),
            'phase': phase,
            'momentum_score_v2': momentum_score,
            'ibd_rs_rating': rs_rating,
            'rs_6w_change': round(random.uniform(-5, 15), 1),
            'rs_10w_change': round(random.uniform(-10, 25), 1),
            'theme_score': 70 if momentum_score > 70 else 50,
            'rs_line_bayes': rs_rating,
            'top_pattern': momentum_score > 65,
            'dist_pivot_pct': round(random.uniform(0.5, 5), 1),
            'breakout': momentum_score > 75,
            'rs_accelerating_strong': rs_rating > 80,
            'rs_new_high': momentum_score > 70,
            'total_score': min(100, momentum_score + random.randint(0, 10)),
            'ad_score': random.randint(40, 80),
            'trend_pass': random.randint(4, 8)
        }
        
        data.append(record)
        print(f"[{i:2d}/50] {ticker} 데이터 생성")
    
    # results 폴더 생성
    os.makedirs('results', exist_ok=True)
    
    # JSON 저장
    output_file = 'results/daily_ibd_scan.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ {len(data)}개 종목 데이터 생성 완료")
    print(f"💾 저장 완료: {output_file}")
    print(f"   크기: {os.path.getsize(output_file)} bytes")

if __name__ == '__main__':
    try:
        fetch_sp500_data()
        print("\n✅ 완료!")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ 오류: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
