"""
market_pulse.py - Market Regime 판정 엔진

역할:
- SPY/QQQ 가격 추이 분석
- Market Regime 판정 (Confirmed Uptrend, Rally Attempt, Correction 등)
- Breadth (50MA 위) 계산
- Distribution Day 카운트
- CSV에 누적 저장

실행:
    python market_pulse.py
"""

import yfinance as yf
import pandas as pd
import json
import os
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

class MarketPulse:
    def __init__(self):
        self.output_dir = 'data'
        os.makedirs(self.output_dir, exist_ok=True)
        
    def analyze(self):
        """시장 분석 실행"""
        print("\n📊 Market Pulse Analysis 시작")
        print("=" * 50)
        
        # SPY 데이터 다운로드
        print("📈 SPY/QQQ 데이터 다운로드 중...")
        spy = yf.download('SPY', period='6mo', progress=False)
        qqq = yf.download('QQQ', period='6mo', progress=False)
        
        if spy.empty or qqq.empty:
            print("❌ 데이터 다운로드 실패")
            return False
        
        # 분석
        regime = self.judge_regime(spy)
        breadth = self.calculate_breadth()
        dd_count = self.count_distribution_days(spy)
        
        pulse = {
            'date': datetime.now().strftime('%Y-%m-%d'),
            'regime': regime['label'],
            'regime_icon': regime['icon'],
            'regime_code': regime['code'],
            'investment_ratio': regime['ratio'],
            'breadth_pct': breadth,
            'dd_count': dd_count,
            'spy_close': float(spy['Close'].iloc[-1]),
            'spy_50ma': float(spy['Close'].rolling(50).mean().iloc[-1]),
            'qqq_close': float(qqq['Close'].iloc[-1]),
            'qqq_50ma': float(qqq['Close'].rolling(50).mean().iloc[-1])
        }
        
        # CSV에 추가
        self.append_to_csv(pulse)
        
        # JSON 생성
        self.save_json(pulse)
        
        print(f"✅ Regime: {pulse['regime']} ({pulse['regime_icon']})")
        print(f"✅ Breadth: {breadth}%")
        print(f"✅ DD Count: {dd_count}")
        
        return True
    
    def judge_regime(self, spy_data):
        """Market Regime 판정"""
        close = spy_data['Close'].iloc[-1]
        sma_50 = spy_data['Close'].rolling(50).mean().iloc[-1]
        sma_200 = spy_data['Close'].rolling(200).mean().iloc[-1]
        
        # 간단한 판정 로직
        if close > sma_50 and close > sma_200:
            return {
                'code': 'Confirmed Uptrend',
                'label': 'Confirmed Uptrend',
                'icon': '🟢',
                'ratio': '80-100%'
            }
        elif close > sma_50 and sma_50 > sma_200:
            return {
                'code': 'Uptrend Resumed',
                'label': 'Uptrend Resumed',
                'icon': '🟢',
                'ratio': '75-95%'
            }
        elif close > sma_200:
            return {
                'code': 'Under Pressure',
                'label': 'Under Pressure',
                'icon': '🟡',
                'ratio': '30-50%'
            }
        elif close > sma_50:
            return {
                'code': 'Rally Attempt',
                'label': 'Rally Attempt',
                'icon': '🟠',
                'ratio': '20-30%'
            }
        else:
            return {
                'code': 'Correction',
                'label': 'Correction',
                'icon': '🔴',
                'ratio': '0-25%'
            }
    
    def calculate_breadth(self):
        """광범위도 계산 (50MA 위 종목 비율)"""
        # 더미 계산
        return 58
    
    def count_distribution_days(self, data):
        """Distribution Day 카운트"""
        # 더미 계산
        return 3
    
    def append_to_csv(self, pulse):
        """CSV에 누적 추가"""
        csv_file = os.path.join(self.output_dir, 'market_pulse_history.csv')
        
        df = pd.DataFrame([pulse])
        
        if os.path.exists(csv_file):
            existing = pd.read_csv(csv_file)
            df = pd.concat([existing, df], ignore_index=True)
        
        df.to_csv(csv_file, index=False, encoding='utf-8')
        print(f"💾 저장됨: {csv_file}")
    
    def save_json(self, pulse):
        """JSON 저장"""
        json_file = os.path.join(self.output_dir, 'market_pulse.json')
        
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(pulse, f, ensure_ascii=False, indent=2)

def main():
    pulse = MarketPulse()
    pulse.analyze()

if __name__ == '__main__':
    main()
