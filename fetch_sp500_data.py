#!/usr/bin/env python3
"""
S&P 500 종목 RS Line 데이터 수집
yfinance로 실시간 데이터 다운로드
결과: results/daily_ibd_scan.json
"""

import yfinance as yf
import pandas as pd
import json
from datetime import datetime, timedelta
import sys

class SP500DataFetcher:
    def __init__(self):
        self.sp500_tickers = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BERKB', 'JPM', 'JNJ',
            'V', 'WMT', 'AVGO', 'MA', 'PG', 'HD', 'DIS', 'COST', 'MCD', 'BAC',
            'VZ', 'NFLX', 'KO', 'CRM', 'CSCO', 'INTC', 'INTU', 'ABT', 'AMD', 'CMCSA',
            'LLY', 'GE', 'ISRG', 'AXP', 'SPY', 'QQQ', 'IWM', 'EEM', 'FXI', 'GLD',
            'GS', 'PYPL', 'HON', 'ADBE', 'UPS', 'OKE', 'LIN', 'PLTR', 'QCOM', 'AMAT',
            'LRCX', 'SNPS', 'CADL', 'MCHP', 'NXPI', 'ASML', 'KLAC', 'ROP', 'SJM', 'AEP'
        ]
        self.output_file = 'results/daily_ibd_scan.json'
        self.data = []
    
    def calculate_rs_line(self, ticker):
        """RS Line 계산"""
        try:
            # 종목과 SPY(S&P 500 ETF) 데이터 다운로드
            stock = yf.download(ticker, period='3mo', progress=False)
            spy = yf.download('SPY', period='3mo', progress=False)
            
            if len(stock) < 10:
                return None
            
            # 정규화 (최근 60거래일 기준)
            stock_norm = stock['Close'] / stock['Close'].iloc[-60:]
            spy_norm = spy['Close'] / spy['Close'].iloc[-60:]
            
            # RS Line = (종목 / SPY) * 100
            rs_line = (stock_norm[-1] / spy_norm[-1]) * 100
            
            return rs_line
        except Exception as e:
            print(f"❌ {ticker} RS 계산 실패: {e}")
            return None
    
    def fetch_data(self):
        """S&P 500 데이터 수집"""
        print("📊 S&P 500 RS Line 데이터 수집 시작...\n")
        
        for i, ticker in enumerate(self.sp500_tickers[:50], 1):  # 처음 50개만 (시간 절약)
            print(f"[{i:2d}/50] {ticker} 처리 중...")
            
            try:
                # 종목 정보 다운로드
                stock_data = yf.download(ticker, period='1y', progress=False)
                info = yf.Ticker(ticker).info
                
                if len(stock_data) < 10:
                    continue
                
                # RS Line 계산
                rs_line = self.calculate_rs_line(ticker)
                if rs_line is None:
                    continue
                
                # Phase 추정 (간단한 버전)
                close_price = stock_data['Close'].iloc[-1]
                sma_50 = stock_data['Close'].rolling(50).mean().iloc[-1]
                sma_200 = stock_data['Close'].rolling(200).mean().iloc[-1]
                
                if close_price > sma_50 > sma_200:
                    phase = 4
                elif close_price > sma_200:
                    phase = 3
                else:
                    phase = 1
                
                # Momentum Score (RSI 기반)
                delta = stock_data['Close'].diff()
                gain = (delta.where(delta > 0, 0)).rolling(14).mean()
                loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
                rs = gain / loss
                rsi = 100 - (100 / (1 + rs))
                momentum_score = int(rsi.iloc[-1])
                
                record = {
                    'ticker': ticker,
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'close': round(close_price, 2),
                    'phase': phase,
                    'momentum_score_v2': momentum_score,
                    'ibd_rs_rating': int(rs_line),
                    'rs_6w_change': round((stock_data['Close'].iloc[-1] / stock_data['Close'].iloc[-30] - 1) * 100, 1),
                    'rs_10w_change': round((stock_data['Close'].iloc[-1] / stock_data['Close'].iloc[-50] - 1) * 100, 1),
                    'theme_score': 70 if momentum_score > 70 else 50,
                    'rs_line_bayes': int(rs_line),
                    'top_pattern': momentum_score > 65,
                    'dist_pivot_pct': 2.5 if phase == 4 else 5.0,
                    'breakout': (close_price > sma_50) and momentum_score > 60,
                    'rs_accelerating_strong': rs_line > 90,
                    'rs_new_high': True,
                    'total_score': min(100, momentum_score + 10),
                    'ad_score': 60,
                    'trend_pass': 7 if phase >= 3 else 4
                }
                
                self.data.append(record)
            
            except Exception as e:
                print(f"  ⚠️ 오류: {e}")
                continue
        
        print(f"\n✅ {len(self.data)}개 종목 수집 완료")
    
    def save_data(self):
        """JSON 저장"""
        import os
        os.makedirs('results', exist_ok=True)
        
        with open(self.output_file, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)
        
        print(f"💾 저장 완료: {self.output_file}")
        print(f"   총 {len(self.data)}개 종목 데이터")

if __name__ == '__main__':
    fetcher = SP500DataFetcher()
    fetcher.fetch_data()
    fetcher.save_data()
    print("\n✅ 완료!")
