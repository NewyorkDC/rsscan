#!/usr/bin/env python3
"""
Strategy Room - v5 Paper-Trade 시뮬레이션
입력: entry_signals.json (5-Gate 통과 종목)
출력: strategy_room_portfolio.json (NAV, holdings, closed trades)
"""

import json
import os
from datetime import datetime, timedelta
from copy import deepcopy
import sys

class StrategyRoomV5:
    def __init__(self):
        self.input_file = 'results/entry_signals.json'
        self.portfolio_file = 'results/strategy_room_portfolio.json'
        self.entry_signals = []
        
        # 포트폴리오 초기화
        self.initial_capital = 100000
        self.portfolio = {
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'nav': self.initial_capital,
            'cash': self.initial_capital,
            'holdings': [],
            'closed_trades': [],
            'statistics': {
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0.0,
                'avg_win': 0.0,
                'avg_loss': 0.0,
                'cumulative_return': 0.0
            }
        }
        
        # v5 규칙
        self.stop_loss_pct = -7.0      # -7% 손절
        self.profit_target_1 = 20.0    # 첫 목표: +20%
        self.profit_target_2 = 50.0    # 최종 목표: +50%
        self.max_hold_weeks_1 = 4      # 첫 타겟까지 최대 4주
        self.max_hold_weeks_2 = 8      # 최종 타겟까지 최대 8주
        self.max_positions = 5         # 최대 5개 포지션
        self.position_size = self.initial_capital / self.max_positions
    
    def load_signals(self):
        """진입 신호 로드"""
        print(f"📥 신호 로드: {self.input_file}\n")
        try:
            with open(self.input_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.entry_signals = data.get('signals', [])
            
            # Phase 4+ AND momentum_score >= 80인 종목만 필터링
            filtered = [s for s in self.entry_signals if s.get('entry_weight', 0) >= 0.9]
            print(f"✅ 전체 신호: {len(self.entry_signals)}개")
            print(f"✅ 최고 우선순위 (Weight >= 0.9): {len(filtered)}개\n")
            
            return filtered
        except FileNotFoundError:
            print(f"❌ 파일 없음: {self.input_file}")
            return []
    
    def execute_entry(self, signal):
        """진입 실행 (v5 룰 적용)"""
        ticker = signal.get('ticker')
        close = signal.get('close', 0)
        entry_weight = signal.get('entry_weight', 0)
        phase = signal.get('phase', 0)
        
        # Phase 4여야 진입 가능
        if phase != 4:
            return None
        
        # 포지션 크기 계산
        if entry_weight >= 1.0:
            shares = int(self.position_size / close)
            entry_cost = shares * close
        elif entry_weight >= 0.9:
            shares = int((self.position_size * 0.8) / close)
            entry_cost = shares * close
        else:
            return None
        
        # 현금 확인
        if entry_cost > self.portfolio['cash']:
            return None
        
        # 포지션 생성
        position = {
            'ticker': ticker,
            'entry_date': signal.get('date'),
            'entry_price': close,
            'shares': shares,
            'entry_cost': entry_cost,
            'entry_weight': entry_weight,
            'entry_reason': signal.get('entry_reason', ''),
            'phase': phase,
            'rs_score': signal.get('momentum_score_v2', 0),
            'status': 'ACTIVE',
            'profit_pct': 0.0,
            'profit_usd': 0.0,
            'exit_date': None,
            'exit_price': None,
            'exit_reason': None
        }
        
        # 현금 차감
        self.portfolio['cash'] -= entry_cost
        
        return position
    
    def calculate_positions_value(self):
        """현재 포트폴리오 가치 계산"""
        holdings_value = 0
        for holding in self.portfolio['holdings']:
            holdings_value += holding['entry_cost']  # 단순화: entry_cost 기준
        
        return holdings_value
    
    def simulate_exit(self, position, current_price=None):
        """포지션 종료 시뮬레이션 (v5 룰)"""
        if current_price is None:
            current_price = position['entry_price']
        
        profit_pct = ((current_price - position['entry_price']) / position['entry_price']) * 100
        profit_usd = (current_price - position['entry_price']) * position['shares']
        days_held = 30  # 단순화: 가정 30일 보유
        
        # 손절 조건: -7%
        if profit_pct <= self.stop_loss_pct:
            return {
                'exit_price': position['entry_price'] * (1 + self.stop_loss_pct / 100),
                'exit_reason': f'🔴 손절 (-7%)',
                'profit_pct': self.stop_loss_pct,
                'profit_usd': profit_usd
            }
        
        # 익절 조건 1: +20% (4주 이내)
        if profit_pct >= self.profit_target_1 and days_held <= (self.max_hold_weeks_1 * 7):
            return {
                'exit_price': position['entry_price'] * (1 + self.profit_target_1 / 100),
                'exit_reason': f'🟢 익절 목표 1 (+20%)',
                'profit_pct': self.profit_target_1,
                'profit_usd': (position['entry_price'] * (1 + self.profit_target_1 / 100) - position['entry_price']) * position['shares']
            }
        
        # 익절 조건 2: +50% (8주 이내)
        if profit_pct >= self.profit_target_2 and days_held <= (self.max_hold_weeks_2 * 7):
            return {
                'exit_price': position['entry_price'] * (1 + self.profit_target_2 / 100),
                'exit_reason': f'🟢 익절 목표 2 (+50%)',
                'profit_pct': self.profit_target_2,
                'profit_usd': (position['entry_price'] * (1 + self.profit_target_2 / 100) - position['entry_price']) * position['shares']
            }
        
        # Max Hold 도달: 8주
        if days_held >= (self.max_hold_weeks_2 * 7):
            return {
                'exit_price': current_price,
                'exit_reason': f'⏰ Max Hold 도달 (8주)',
                'profit_pct': profit_pct,
                'profit_usd': profit_usd
            }
        
        return None  # 아직 보유 중
    
    def run_backtest(self):
        """백테스트 실행"""
        print("🚀 v5 Paper-Trade 시뮬레이션 시작\n")
        print("=" * 120)
        print("진입 신호 처리 중...\n")
        
        signals = self.load_signals()
        if not signals:
            print("❌ 처리할 신호가 없습니다.\n")
            return False
        
        print(f"{'Ticker':<8} {'Phase':<6} {'진입가':<10} {'Weight':<8} {'포지션':<12} {'상태':<20}")
        print("-" * 120)
        
        entry_count = 0
        for signal in signals:
            # 최대 포지션 수 도달 시 중단
            if len(self.portfolio['holdings']) >= self.max_positions:
                print(f"{signal['ticker']:<8} {signal['phase']:<6} {signal['close']:<10.2f} {signal['entry_weight']:<8.1f} {'SKIP':<12} {'최대 포지션 도달':<20}")
                continue
            
            # 진입 실행
            position = self.execute_entry(signal)
            if position:
                self.portfolio['holdings'].append(position)
                entry_count += 1
                status = f"{position['shares']} shares @ ${position['entry_price']:.2f}"
                print(f"{signal['ticker']:<8} {signal['phase']:<6} {signal['close']:<10.2f} {signal['entry_weight']:<8.1f} {status:<12} {'✅ 진입':<20}")
            else:
                print(f"{signal['ticker']:<8} {signal['phase']:<6} {signal['close']:<10.2f} {signal['entry_weight']:<8.1f} {'FAIL':<12} {'❌ 진입 실패':<20}")
        
        print("-" * 120)
        print(f"\n진입 성공: {entry_count}개\n")
        
        # 시뮬레이션: 각 포지션의 종료 조건 검토
        print("포지션 종료 시뮬레이션:\n")
        print(f"{'Ticker':<8} {'진입가':<10} {'종목가':<10} {'손익':<10} {'수익률':<10} {'종료사유':<30}")
        print("-" * 120)
        
        for holding in self.portfolio['holdings']:
            exit_info = self.simulate_exit(holding)
            if exit_info:
                holding['exit_price'] = exit_info['exit_price']
                holding['exit_reason'] = exit_info['exit_reason']
                holding['profit_pct'] = exit_info['profit_pct']
                holding['profit_usd'] = exit_info['profit_usd']
                holding['status'] = 'CLOSED'
                
                # Closed trades로 이동
                self.portfolio['closed_trades'].append(deepcopy(holding))
                
                print(f"{holding['ticker']:<8} {holding['entry_price']:<10.2f} {exit_info['exit_price']:<10.2f} ${exit_info['profit_usd']:<9.2f} {exit_info['profit_pct']:<9.1f}% {exit_info['exit_reason']:<30}")
        
        print("-" * 120)
        
        # NAV 계산
        self.calculate_nav()
        
        return True
    
    def calculate_nav(self):
        """NAV 및 통계 계산"""
        # 현금 + 홀딩 가치
        holdings_value = sum(h['entry_cost'] for h in self.portfolio['holdings'] if h['status'] == 'ACTIVE')
        closed_profit = sum(h['profit_usd'] for h in self.portfolio['closed_trades'])
        
        self.portfolio['nav'] = self.portfolio['cash'] + holdings_value + closed_profit
        
        # 통계 계산
        closed = self.portfolio['closed_trades']
        if closed:
            winners = [t for t in closed if t['profit_usd'] >= 0]
            losers = [t for t in closed if t['profit_usd'] < 0]
            
            self.portfolio['statistics']['total_trades'] = len(closed)
            self.portfolio['statistics']['winning_trades'] = len(winners)
            self.portfolio['statistics']['losing_trades'] = len(losers)
            self.portfolio['statistics']['win_rate'] = (len(winners) / len(closed) * 100) if closed else 0
            self.portfolio['statistics']['avg_win'] = (sum(t['profit_usd'] for t in winners) / len(winners)) if winners else 0
            self.portfolio['statistics']['avg_loss'] = (sum(t['profit_usd'] for t in losers) / len(losers)) if losers else 0
            self.portfolio['statistics']['cumulative_return'] = (closed_profit / self.initial_capital * 100) if self.initial_capital else 0
    
    def save_portfolio(self):
        """포트폴리오 저장"""
        print("\n💾 포트폴리오 저장 중...\n")
        
        os.makedirs('results', exist_ok=True)
        
        try:
            with open(self.portfolio_file, 'w', encoding='utf-8') as f:
                json.dump(self.portfolio, f, indent=2, ensure_ascii=False)
            print(f"✅ 저장 완료: {self.portfolio_file}\n")
            return True
        except Exception as e:
            print(f"❌ 저장 오류: {e}\n")
            return False
    
    def print_summary(self):
        """최종 요약"""
        print("=" * 120)
        print("📊 v5 Paper-Trade 포트폴리오 요약")
        print("=" * 120)
        
        nav = self.portfolio['nav']
        return_pct = ((nav - self.initial_capital) / self.initial_capital * 100)
        
        print(f"\n💰 NAV: ${nav:,.2f}")
        print(f"💵 초기 자본: ${self.initial_capital:,.2f}")
        print(f"📈 총 손익: ${nav - self.initial_capital:,.2f} ({return_pct:+.2f}%)\n")
        
        stats = self.portfolio['statistics']
        print(f"📊 거래 통계:")
        print(f"  • 완료된 거래: {stats['total_trades']}건")
        print(f"  • 승리: {stats['winning_trades']}건 ({stats['win_rate']:.1f}%)")
        print(f"  • 패배: {stats['losing_trades']}건")
        print(f"  • 평균 수익: ${stats['avg_win']:,.2f}")
        print(f"  • 평균 손실: ${stats['avg_loss']:,.2f}\n")
        
        print(f"📈 활성 포지션: {len([h for h in self.portfolio['holdings'] if h['status'] == 'ACTIVE'])}개")
        print(f"✅ 완료된 거래: {len(self.portfolio['closed_trades'])}건\n")
        
        if self.portfolio['closed_trades']:
            print("✅ 완료된 거래:")
            print("-" * 120)
            for trade in self.portfolio['closed_trades']:
                print(f"  {trade['ticker']:<8} | 진입: ${trade['entry_price']:<8.2f} | 손익: ${trade['profit_usd']:>10.2f} ({trade['profit_pct']:>+6.1f}%) | {trade['exit_reason']}")
            print("-" * 120)
        
        print("\n✅ 완료!\n")
    
    def run(self):
        """메인 실행"""
        print("\n🏛️  STRATEGY ROOM - v5 Paper-Trade System")
        print("=" * 120 + "\n")
        
        if not self.run_backtest():
            return False
        
        if not self.save_portfolio():
            return False
        
        self.print_summary()
        return True

if __name__ == '__main__':
    strategy_room = StrategyRoomV5()
    success = strategy_room.run()
    sys.exit(0 if success else 1)
