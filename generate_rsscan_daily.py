#!/usr/bin/env python3
"""
RSSCAN v3 - 5-Gate Funnel 필터링 + Phase & RS 지표
기초 데이터: results/daily_ibd_scan.json
출력: results/entry_signals.json
"""

import json
import os
from datetime import datetime
from statistics import median
import sys

class GateFunnelFilter:
    def __init__(self):
        self.input_file = 'results/daily_ibd_scan.json'
        self.output_file = 'results/entry_signals.json'
        self.data = []
        self.filtered_signals = []
        
    def load_data(self):
        """기초 데이터 로드"""
        print(f"📥 기초 데이터 로드: {self.input_file}")
        try:
            with open(self.input_file, 'r', encoding='utf-8') as f:
                self.data = json.load(f)
            print(f"✅ {len(self.data)}개 종목 로드 완료\n")
            return True
        except FileNotFoundError:
            print(f"❌ 파일 없음: {self.input_file}")
            return False
        except json.JSONDecodeError:
            print(f"❌ JSON 파싱 오류")
            return False
    
    def check_gate_1(self, stock):
        """Gate 1: 테마/섹터"""
        theme_score = stock.get('theme_score', 0)
        rs_line_bayes = stock.get('rs_line_bayes', 0)
        passed = (theme_score >= 48) or (rs_line_bayes >= 75)
        return passed
    
    def check_gate_2(self, stock):
        """Gate 2: 패턴/Pivot"""
        top_pattern = stock.get('top_pattern', False)
        dist_pivot_pct = stock.get('dist_pivot_pct', 999)
        breakout = stock.get('breakout', False)
        
        if not top_pattern:
            return False
        
        passed = (dist_pivot_pct <= 3) or breakout
        return passed
    
    def check_gate_3(self, stock):
        """Gate 3: Trigger (RS 가속 + 신고가)"""
        rs_accelerating_strong = stock.get('rs_accelerating_strong', False)
        rs_new_high = stock.get('rs_new_high', False)
        passed = rs_accelerating_strong and rs_new_high
        return passed
    
    def check_gate_4(self, stock, median_score):
        """Gate 4: Guard (기본 가드)"""
        total_score = stock.get('total_score', 0)
        ad_score = stock.get('ad_score', 0)
        trend_pass = stock.get('trend_pass', 0)
        
        passed = (total_score >= median_score) and (ad_score >= 45) and (trend_pass >= 6)
        return passed
    
    def calculate_entry_weight(self, stock):
        """진입 가중치 계산 (Phase & RS 기반)"""
        phase = stock.get('phase', 0)
        momentum_score = stock.get('momentum_score_v2', 0)
        ibd_rs_rating = stock.get('ibd_rs_rating', 0)
        rs_6w_change = stock.get('rs_6w_change', 0)
        
        weight = 0.0
        reason = ""
        
        # 1순위: Phase 4+ AND momentum_score >= 80 (장기 배경 양호)
        if phase == 4 and momentum_score >= 80 and rs_6w_change > 0:
            weight = 1.0
            reason = "🎯 1순위: Phase 4+ 강세 (최고 가중치)"
        
        # 2순위: Phase 4 AND momentum_score >= 75
        elif phase == 4 and momentum_score >= 75:
            weight = 0.9
            reason = "🎯 2순위: Phase 4 진입 (높은 가중치)"
        
        # 3순위: Phase 3 (감시 중)
        elif phase == 3:
            weight = 0.6
            reason = "🟢 3순위: Phase 3 대기 (감시)"
        
        # 4순위: Phase 5 AND momentum_score >= 70 (Hold)
        elif phase == 5 and momentum_score >= 70:
            weight = 0.7
            reason = "🟢 Hold: Phase 5 본격 리더"
        
        # 위험 신호: Phase 6, 7
        elif phase in [6, 7]:
            weight = 0.0
            reason = "🔴 익절/청산: Phase 6~7"
        
        # 갭 전략: RS 급상승
        gap = momentum_score - ibd_rs_rating
        if gap > 10:
            weight = min(weight + 0.2, 1.0)
            reason += f" + 갭전략({gap:.0f}p)"
        
        return weight, reason
    
    def filter_all_gates(self):
        """모든 Gate를 통과한 종목 필터링"""
        print("🔍 5-Gate Funnel 필터링 중...\n")
        
        if not self.data:
            print("❌ 데이터 없음")
            return False
        
        # Gate 4를 위한 median 계산
        total_scores = [s.get('total_score', 0) for s in self.data]
        median_score = median(total_scores) if total_scores else 50
        print(f"📊 total_score median: {median_score:.1f}\n")
        
        print("종목별 Gate 검사 결과 & 진입 가중치:")
        print("-" * 140)
        print(f"{'Ticker':<8} {'Phase':<6} {'RS':<5} {'G1':<5} {'G2':<5} {'G3':<5} {'G4':<5} {'Weight':<7} {'사유':<50}")
        print("-" * 140)
        
        for stock in self.data:
            ticker = stock.get('ticker', 'N/A')
            phase = stock.get('phase', 0)
            momentum = stock.get('momentum_score_v2', 0)
            
            gate_1 = self.check_gate_1(stock)
            gate_2 = self.check_gate_2(stock)
            gate_3 = self.check_gate_3(stock)
            gate_4 = self.check_gate_4(stock, median_score)
            
            # 모든 Gate 통과 확인
            all_passed = gate_1 and gate_2 and gate_3 and gate_4
            
            # 진입 가중치 계산
            weight, reason = self.calculate_entry_weight(stock)
            
            # 출력
            status = "✅" if all_passed else "❌"
            print(f"{ticker:<8} {phase:<6} {momentum:<5} {str(gate_1):<5} {str(gate_2):<5} {str(gate_3):<5} {str(gate_4):<5} {weight:<7.1f} {reason:<50}")
            
            # 통과 종목 저장
            if all_passed:
                signal = {
                    'ticker': ticker,
                    'date': stock.get('date', datetime.now().strftime('%Y-%m-%d')),
                    'close': stock.get('close', 0),
                    'phase': phase,
                    'momentum_score_v2': momentum,
                    'ibd_rs_rating': stock.get('ibd_rs_rating', 0),
                    'rs_6w_change': stock.get('rs_6w_change', 0),
                    'rs_10w_change': stock.get('rs_10w_change', 0),
                    'entry_weight': weight,
                    'entry_reason': reason,
                    'gates_passed': {
                        'gate_1': gate_1,
                        'gate_2': gate_2,
                        'gate_3': gate_3,
                        'gate_4': gate_4
                    }
                }
                self.filtered_signals.append(signal)
        
        print("-" * 140)
        print(f"\n✅ 5-Gate 통과 종목: {len(self.filtered_signals)}개\n")
        return True
    
    def save_signals(self):
        """필터링된 신호 저장"""
        print(f"💾 신호 저장: {self.output_file}")
        
        os.makedirs('results', exist_ok=True)
        
        # 진입 가중치 높은 순으로 정렬
        sorted_signals = sorted(self.filtered_signals, key=lambda x: x['entry_weight'], reverse=True)
        
        output = {
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'total_scanned': len(self.data),
            'total_passed': len(self.filtered_signals),
            'signals': sorted_signals
        }
        
        try:
            with open(self.output_file, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2, ensure_ascii=False)
            print(f"✅ 저장 완료: {self.output_file}\n")
            return True
        except Exception as e:
            print(f"❌ 저장 오류: {e}\n")
            return False
    
    def print_summary(self):
        """최종 요약"""
        print("=" * 140)
        print("📈 최종 결과 요약")
        print("=" * 140)
        print(f"스캔 종목: {len(self.data)}개")
        print(f"5-Gate 통과: {len(self.filtered_signals)}개")
        print(f"통과율: {(len(self.filtered_signals) / len(self.data) * 100):.1f}%\n" if self.data else "통과율: 0%\n")
        
        if self.filtered_signals:
            print("🎯 통과 종목 (진입 가중치 순):")
            print("-" * 140)
            for i, signal in enumerate(self.filtered_signals, 1):
                print(f"  {i}. {signal['ticker']:8} | Phase: {signal['phase']} | RS: {signal['momentum_score_v2']:3.0f} | Weight: {signal['entry_weight']:.1f} | {signal['entry_reason']}")
            print("-" * 140)
        else:
            print("⚠️ 5-Gate를 통과한 종목이 없습니다.")
        
        print("\n✅ 완료! entry_signals.json이 저장되었습니다.")
        print("   다음 단계: strategy_room.py에서 v5 룰로 paper-trade 실행\n")
    
    def run(self):
        """메인 실행"""
        print("\n🚀 RSSCAN v3 - 5-Gate Funnel + Phase/RS 분석")
        print("=" * 140 + "\n")
        
        if not self.load_data():
            return False
        
        if not self.filter_all_gates():
            return False
        
        if not self.save_signals():
            return False
        
        self.print_summary()
        return True

if __name__ == '__main__':
    filter_engine = GateFunnelFilter()
    success = filter_engine.run()
    sys.exit(0 if success else 1)
