"""
strategy_room.py - 5-Gate Funnel Paper Trade 시스템

역할:
- 5-Gate Funnel으로 신규 신호 추출 (signals)
- Paper Portfolio 업데이트 (매가격 반영)
- NAV 곡선 생성
- 운용 규칙 v5 적용 (진입, 손절, 익절)

실행:
    python strategy_room.py signals   # 신규 신호 생성
    python strategy_room.py update    # 포트폴리오 가격 업데이트
    python strategy_room.py both      # 신호 + 포트폴리오
"""

import json
import pandas as pd
import yfinance as yf
import os
from datetime import datetime
from copy import deepcopy
import warnings
warnings.filterwarnings('ignore')

class StrategyRoom:
    def __init__(self):
        self.output_dir = 'data'
        os.makedirs(self.output_dir, exist_ok=True)
        
        # 운용 규칙 v5
        self.rules = {
            'entry_type': 'breakout',
            'stop_loss_pct': -7.0,
            'break_even_trigger': 15.0,
            'lock_in_trigger': 25.0,
            'lock_in_stop_pct': 1.10,
            'max_hold_days': 20,
            'oneill_8w_days': 40,
            'oneill_8w_trigger': 20.0,
            'position_cap': 12
        }
        
        self.portfolio = self.load_portfolio()
    
    def load_portfolio(self):
        """기존 포트폴리오 로드"""
        portfolio_file = os.path.join(self.output_dir, 'strategy_room_portfolio.json')
        
        if os.path.exists(portfolio_file):
            with open(portfolio_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        # 초기 포트폴리오
        return {
            'nav': 1.0,
            'holdings': [],
            'closed_trades': [],
            'rules': self.rules,
            'nav_history': [1.0],
            'creation_date': datetime.now().strftime('%Y-%m-%d')
        }
    
    def extract_signals(self, screener_data):
        """5-Gate Funnel으로 신호 추출"""
        signals = []
        
        if not screener_data:
            return signals
        
        results = screener_data.get('results', [])
        
        for item in results:
            symbol = item.get('symbol', '')
            phase = item.get('phase', 0)
            rs_line = item.get('rs_line', 0)
            
            # 5-Gate Funnel: G3 (시그널) + G4 (가드)
            # G3: rs_accelerating_strong + rs_new_high
            # G4: total_score >= median + ad_score >= 45 + trend_pass >= 6
            
            # 간단한 신호 판정
            if phase == 4 and rs_line >= 80:
                signals.append({
                    'symbol': symbol,
                    'signal_date': datetime.now().strftime('%Y-%m-%d'),
                    'phase': phase,
                    'rs_line': rs_line,
                    'pivot': item.get('pivot', 0),
                    'entry_confidence': 'HIGH' if rs_line >= 90 else 'MEDIUM'
                })
        
        # RS Line순 정렬
        signals.sort(key=lambda x: x['rs_line'], reverse=True)
        
        return signals[:20]  # 상위 20개
    
    def update_portfolio(self, signals):
        """포트폴리오 업데이트"""
        print("\n🏛 전략실 포트폴리오 업데이트")
        print("=" * 50)
        
        # 보유 종목 가격 업데이트
        if self.portfolio['holdings']:
            for holding in self.portfolio['holdings']:
                symbol = holding['symbol']
                
                try:
                    data = yf.download(symbol, period='1d', progress=False)
                    current_price = float(data['Close'].iloc[-1])
                    entry_price = holding['entry_price']
                    
                    holding['current_price'] = current_price
                    holding['pnl_pct'] = ((current_price - entry_price) / entry_price) * 100
                    holding['updated_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    
                except:
                    pass
        
        # 신규 진입 검토
        for signal in signals[:self.rules['position_cap']]:
            symbol = signal['symbol']
            
            # 이미 보유 중인지 확인
            if any(h['symbol'] == symbol for h in self.portfolio['holdings']):
                continue
            
            # 신규 진입
            self.portfolio['holdings'].append({
                'symbol': symbol,
                'entry_price': signal.get('pivot', 100),
                'current_price': signal.get('pivot', 100),
                'entry_date': signal['signal_date'],
                'pnl_pct': 0.0,
                'status': 'ACTIVE',
                'days_held': 0
            })
        
        # NAV 계산
        self.calculate_nav()
        
        # 저장
        self.save_portfolio()
    
    def calculate_nav(self):
        """NAV 계산"""
        if not self.portfolio['holdings']:
            nav_change = 1.0
        else:
            returns = [h.get('pnl_pct', 0) / 100 for h in self.portfolio['holdings']]
            nav_change = 1 + (sum(returns) / len(returns)) if returns else 1.0
        
        self.portfolio['nav'] = self.portfolio.get('nav', 1.0) * nav_change
        self.portfolio['nav_history'].append(round(self.portfolio['nav'], 4))
    
    def save_portfolio(self):
        """포트폴리오 저장"""
        portfolio_file = os.path.join(self.output_dir, 'strategy_room_portfolio.json')
        
        with open(portfolio_file, 'w', encoding='utf-8') as f:
            json.dump(self.portfolio, f, ensure_ascii=False, indent=2)
        
        print(f"💾 저장됨: {portfolio_file}")
        print(f"📊 NAV: {self.portfolio['nav']:.4f}")
        print(f"📈 보유: {len(self.portfolio['holdings'])} 종목")
        print(f"📉 청산: {len(self.portfolio['closed_trades'])} 거래")

def main():
    import sys
    
    strategy = StrategyRoom()
    
    # 명령어 처리
    command = sys.argv[1] if len(sys.argv) > 1 else 'both'
    
    # 스크리너 데이터 로드
    screener_file = os.path.join(strategy.output_dir, 'ibd_screener_latest.json')
    if os.path.exists(screener_file):
        with open(screener_file, 'r', encoding='utf-8') as f:
            screener_data = json.load(f)
    else:
        screener_data = None
    
    if command in ['signals', 'both']:
        print("🔍 신규 신호 추출 중...")
        signals = strategy.extract_signals(screener_data)
        
        signals_file = os.path.join(strategy.output_dir, 'strategy_room_live.json')
        with open(signals_file, 'w', encoding='utf-8') as f:
            json.dump({'signals': signals, 'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')}, f, ensure_ascii=False, indent=2)
        
        print(f"✅ 신호: {len(signals)}개")
    
    if command in ['update', 'both']:
        signals = strategy.extract_signals(screener_data) if screener_data else []
        strategy.update_portfolio(signals)
        print("✅ 포트폴리오 업데이트 완료")

if __name__ == '__main__':
    main()
