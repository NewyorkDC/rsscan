#!/usr/bin/env python3
"""
Strategy Room - v6 Paper-Trade 시뮬레이션 (Stateful / 매일 누적)

핵심 변경 (v5 → v6):
- 상태 누적(stateful): 기존 portfolio.json을 읽어 어제 보유를 이어받음
- 현재가 갱신: daily_ibd_scan.json에서 보유종목 최신 종가를 받아 실시간 P&L 계산
- Lock Ratchet stop: 수익 구간별로 손절선을 끌어올림
- 플래그: BE(브레이크이븐), Lock(락스탑), Bw(추세이탈경고)
- max% 추적: 보유 중 최고 도달 수익률
- 종목 스위칭: 정체 종목을 강신호로 교체
- 위험지표: NAV 히스토리, 누적수익률, MDD, Sharpe(근사)

입력: results/entry_signals.json, results/daily_ibd_scan.json
출력: results/strategy_room_portfolio.json
"""

import json
import os
import sys
import math
from datetime import datetime
from copy import deepcopy


class StrategyRoomV6:
    def __init__(self):
        self.signals_file = 'results/entry_signals.json'
        self.scan_file = 'results/daily_ibd_scan.json'
        self.portfolio_file = 'results/strategy_room_portfolio.json'

        # ===== 운용 파라미터 =====
        self.initial_capital = 100000.0
        self.max_positions = 12          # 동시 보유 한도 (스크린샷 CAP 12)
        self.stop_loss_pct = -7.0        # 초기 손절 -7%
        self.be_trigger_pct = 8.0        # +8% 도달 시 브레이크이븐(BE)으로 스탑 상향
        self.lock_trigger_pct = 20.0     # +20% 도달 시 Lock 스탑 활성
        self.lock_giveback = 0.5         # Lock 시 최고수익의 50% 반납하면 청산
        self.max_hold_days = 56          # 최대 보유 8주(56일)
        self.stale_days = 21             # 21일 이상 보유 + 저성과 → 스위칭 후보
        self.stale_profit_pct = 3.0      # 보유 21일+ 인데 +3% 미만이면 정체로 간주

        self.today = datetime.now().strftime('%Y-%m-%d')

        # 현재가 조회용 맵
        self.price_map = {}      # ticker -> close
        self.phase_map = {}      # ticker -> phase
        self.rs_map = {}         # ticker -> ibd_rs_rating
        self.score_map = {}      # ticker -> total_score

        # 신규 진입 후보
        self.signals = []

        # 포트폴리오 (기존 상태 로드 또는 초기화)
        self.portfolio = self.load_portfolio()

    # ---------- 데이터 로드 ----------
    def load_portfolio(self):
        """기존 포트폴리오 상태를 읽어 이어받음. 없으면 초기화."""
        if os.path.exists(self.portfolio_file):
            try:
                with open(self.portfolio_file, encoding='utf-8') as f:
                    p = json.load(f)
                print(f"📂 기존 포트폴리오 로드: 보유 {len(p.get('holdings', []))}개, "
                      f"청산 {len(p.get('closed_trades', []))}건")
                # 누락 필드 보정
                p.setdefault('nav_history', [])
                p.setdefault('closed_trades', [])
                p.setdefault('holdings', [])
                return p
            except Exception as e:
                print(f"⚠️ 포트폴리오 로드 실패 ({e}), 새로 초기화")

        print("🆕 신규 포트폴리오 초기화")
        return {
            'timestamp': '',
            'nav': self.initial_capital,
            'cash': self.initial_capital,
            'holdings': [],
            'closed_trades': [],
            'nav_history': [],
            'statistics': {},
        }

    def load_market_data(self):
        """현재가/Phase/RS 맵 + 신규 진입 신호 로드"""
        # 스캔 데이터 (현재가 소스)
        if os.path.exists(self.scan_file):
            with open(self.scan_file, encoding='utf-8') as f:
                scan = json.load(f)
            for d in scan:
                t = d.get('ticker')
                if not t:
                    continue
                self.price_map[t] = d.get('close', 0)
                self.phase_map[t] = d.get('phase', 0)
                self.rs_map[t] = d.get('ibd_rs_rating', 0)
                self.score_map[t] = d.get('total_score', 0)
            print(f"✅ 현재가 데이터: {len(self.price_map)}개 종목")
        else:
            print(f"⚠️ {self.scan_file} 없음 — 현재가 갱신 불가")

        # 진입 신호
        if os.path.exists(self.signals_file):
            with open(self.signals_file, encoding='utf-8') as f:
                sig = json.load(f)
            self.signals = sig.get('signals', [])
            print(f"✅ 진입 신호: {len(self.signals)}개")
        else:
            print(f"⚠️ {self.signals_file} 없음 — 신규 진입 불가")

    # ---------- 유틸 ----------
    def days_held(self, position):
        """진입일부터 오늘까지 보유일"""
        try:
            d0 = datetime.strptime(position['entry_date'], '%Y-%m-%d')
            d1 = datetime.strptime(self.today, '%Y-%m-%d')
            return (d1 - d0).days
        except Exception:
            return 0

    def get_current_price(self, ticker, fallback):
        """현재가 조회 (없으면 fallback=진입가 또는 직전가)"""
        return self.price_map.get(ticker, fallback)

    # ---------- 보유종목 일일 갱신 ----------
    def update_holdings(self):
        """보유종목 현재가 갱신 + 청산 판정 + 플래그/스탑 갱신"""
        still_holding = []

        for pos in self.portfolio['holdings']:
            if pos.get('status') != 'ACTIVE':
                continue

            ticker = pos['ticker']
            entry = pos['entry_price']
            prev_price = pos.get('current_price', entry)
            cur = self.get_current_price(ticker, prev_price)
            pos['current_price'] = round(cur, 2)

            # 실시간 P&L
            profit_pct = (cur / entry - 1) * 100
            pos['profit_pct'] = round(profit_pct, 2)
            pos['profit_usd'] = round((cur - entry) * pos['shares'], 2)

            # max% (보유 중 최고 도달 수익률) 갱신
            pos['max_pct'] = round(max(pos.get('max_pct', 0.0), profit_pct), 2)

            # 보유일
            held = self.days_held(pos)
            pos['days_held'] = held

            # Phase/RS 최신화
            pos['phase'] = self.phase_map.get(ticker, pos.get('phase', 0))
            pos['rs_score'] = self.rs_map.get(ticker, pos.get('rs_score', 0))

            # ===== Lock Ratchet 스탑 계산 =====
            stop_price, flags = self.compute_stop_and_flags(pos)
            pos['stop_price'] = round(stop_price, 2)
            pos['stop_pct'] = round((stop_price / entry - 1) * 100, 1)
            pos['flags'] = flags

            # ===== 청산 판정 =====
            exit_info = self.check_exit(pos, cur, profit_pct, held, stop_price)
            if exit_info:
                pos['status'] = 'CLOSED'
                pos['exit_date'] = self.today
                pos['exit_price'] = round(exit_info['exit_price'], 2)
                pos['exit_reason'] = exit_info['reason']
                pos['profit_pct'] = round((exit_info['exit_price'] / entry - 1) * 100, 2)
                pos['profit_usd'] = round((exit_info['exit_price'] - entry) * pos['shares'], 2)
                self.portfolio['cash'] += exit_info['exit_price'] * pos['shares']
                self.portfolio['closed_trades'].append(deepcopy(pos))
                print(f"  🔚 청산 {ticker}: {pos['profit_pct']:+.1f}% ({exit_info['reason']})")
            else:
                still_holding.append(pos)

        self.portfolio['holdings'] = still_holding

    def compute_stop_and_flags(self, pos):
        """Lock Ratchet 스탑 가격 + 상태 플래그 산출"""
        entry = pos['entry_price']
        max_pct = pos.get('max_pct', 0.0)
        cur_phase = pos.get('phase', 0)
        flags = []

        # 기본 스탑: -7%
        stop_price = entry * (1 + self.stop_loss_pct / 100)

        # BE: +8% 도달했었으면 손절선을 본전으로
        if max_pct >= self.be_trigger_pct:
            stop_price = max(stop_price, entry)  # 브레이크이븐
            flags.append('BE')

        # Lock: +20% 도달했었으면 최고수익의 일부를 보호하는 스탑
        if max_pct >= self.lock_trigger_pct:
            locked_pct = max_pct * self.lock_giveback   # 최고수익의 50% 지점
            stop_price = max(stop_price, entry * (1 + locked_pct / 100))
            flags.append(f'Lock')

        # Bw(Below weakness): Phase가 6/7로 떨어지면 추세이탈 경고
        if cur_phase >= 6:
            flags.append('Bw')

        return stop_price, flags

    def check_exit(self, pos, cur, profit_pct, held, stop_price):
        """청산 조건 검사. 해당하면 dict, 아니면 None"""
        entry = pos['entry_price']

        # 1. 스탑 히트 (Lock Ratchet 포함)
        if cur <= stop_price:
            reason = '🔴 손절' if stop_price <= entry else '🔒 Lock 청산'
            return {'exit_price': stop_price, 'reason': reason}

        # 2. 추세 이탈: Phase 7(분배의심)이면 청산
        if pos.get('phase', 0) >= 7:
            return {'exit_price': cur, 'reason': '📉 추세이탈(P7)'}

        # 3. Max Hold 도달
        if held >= self.max_hold_days:
            return {'exit_price': cur, 'reason': '⏰ Max Hold(8주)'}

        return None

    # ---------- 종목 스위칭 ----------
    def switch_stale_positions(self):
        """정체 종목(오래 보유 + 저성과)을 강한 신규 신호로 교체"""
        if not self.signals:
            return

        held_tickers = {h['ticker'] for h in self.portfolio['holdings']}
        # 보유 중이 아닌 강신호 후보 (total_score 높은 순)
        candidates = sorted(
            [s for s in self.signals if s.get('ticker') not in held_tickers],
            key=lambda s: s.get('total_score', s.get('momentum_score_v2', 0)),
            reverse=True
        )
        if not candidates:
            return

        for pos in list(self.portfolio['holdings']):
            held = pos.get('days_held', 0)
            pnl = pos.get('profit_pct', 0)
            if held >= self.stale_days and pnl < self.stale_profit_pct:
                # 정체 → 가장 강한 후보와 비교
                if not candidates:
                    break
                cand = candidates[0]
                cand_score = cand.get('total_score', cand.get('momentum_score_v2', 0))
                pos_score = pos.get('rs_score', 0)
                if cand_score > pos_score + 5:  # 충분히 강해야 교체
                    # 정체 종목 청산
                    cur = pos.get('current_price', pos['entry_price'])
                    pos['status'] = 'CLOSED'
                    pos['exit_date'] = self.today
                    pos['exit_price'] = round(cur, 2)
                    pos['exit_reason'] = f"🔄 스위칭→{cand['ticker']}"
                    self.portfolio['cash'] += cur * pos['shares']
                    self.portfolio['closed_trades'].append(deepcopy(pos))
                    self.portfolio['holdings'].remove(pos)
                    print(f"  🔄 스위칭: {pos['ticker']}({pnl:+.1f}%) → {cand['ticker']}")
                    # 신규 진입
                    self.enter_position(cand)
                    candidates.pop(0)

    # ---------- 신규 진입 ----------
    def enter_position(self, signal):
        """빈 슬롯에 신규 진입"""
        if len(self.portfolio['holdings']) >= self.max_positions:
            return False

        ticker = signal.get('ticker')
        if any(h['ticker'] == ticker for h in self.portfolio['holdings']):
            return False  # 이미 보유

        close = signal.get('close', 0)
        if close <= 0:
            return False

        # 포지션 사이즈: NAV / max_positions
        position_size = self.portfolio['nav'] / self.max_positions
        shares = int(position_size / close)
        if shares <= 0:
            return False
        entry_cost = shares * close

        if entry_cost > self.portfolio['cash']:
            # 현금 부족분만큼 축소
            shares = int(self.portfolio['cash'] / close)
            if shares <= 0:
                return False
            entry_cost = shares * close

        position = {
            'ticker': ticker,
            'entry_date': signal.get('date', self.today),
            'entry_price': round(close, 2),
            'current_price': round(close, 2),
            'shares': shares,
            'entry_cost': round(entry_cost, 2),
            'entry_weight': signal.get('entry_weight', 1.0),
            'entry_reason': signal.get('entry_reason', ''),
            'phase': signal.get('phase', self.phase_map.get(ticker, 0)),
            'rs_score': signal.get('ibd_rs_rating', self.rs_map.get(ticker, 0)),
            'pattern': 'HT Flag' if signal.get('top_pattern') else 'Base',
            'status': 'ACTIVE',
            'profit_pct': 0.0,
            'profit_usd': 0.0,
            'max_pct': 0.0,
            'days_held': 0,
            'stop_price': round(close * (1 + self.stop_loss_pct / 100), 2),
            'stop_pct': self.stop_loss_pct,
            'flags': [],
            'exit_date': None,
            'exit_price': None,
            'exit_reason': None,
        }
        self.portfolio['cash'] -= entry_cost
        self.portfolio['holdings'].append(position)
        print(f"  ✅ 진입 {ticker}: {shares}주 @ ${close:.2f}")
        return True

    def fill_empty_slots(self):
        """빈 슬롯을 강신호 순으로 채움"""
        held_tickers = {h['ticker'] for h in self.portfolio['holdings']}
        candidates = sorted(
            [s for s in self.signals if s.get('ticker') not in held_tickers],
            key=lambda s: s.get('total_score', s.get('momentum_score_v2', 0)),
            reverse=True
        )
        for cand in candidates:
            if len(self.portfolio['holdings']) >= self.max_positions:
                break
            self.enter_position(cand)

    # ---------- NAV & 통계 ----------
    def calculate_nav(self):
        holdings_value = sum(
            h.get('current_price', h['entry_price']) * h['shares']
            for h in self.portfolio['holdings'] if h['status'] == 'ACTIVE'
        )
        nav = self.portfolio['cash'] + holdings_value
        self.portfolio['nav'] = round(nav, 2)

        # NAV 히스토리 (날짜별 1포인트, 중복 날짜는 갱신)
        hist = self.portfolio['nav_history']
        nav_ratio = round(nav / self.initial_capital, 4)
        if hist and hist[-1]['date'] == self.today:
            hist[-1]['nav'] = nav_ratio
        else:
            hist.append({'date': self.today, 'nav': nav_ratio})
        # 최근 500포인트만 유지
        self.portfolio['nav_history'] = hist[-500:]

    def calculate_statistics(self):
        closed = self.portfolio['closed_trades']
        nav = self.portfolio['nav']
        stats = {
            'total_trades': len(closed),
            'winning_trades': 0,
            'losing_trades': 0,
            'win_rate': 0.0,
            'avg_win': 0.0,
            'avg_loss': 0.0,
            'cumulative_return': round((nav / self.initial_capital - 1) * 100, 2),
            'mdd': 0.0,
            'sharpe': 0.0,
            'best_trade': 0.0,
            'worst_trade': 0.0,
        }

        if closed:
            winners = [t for t in closed if t.get('profit_usd', 0) >= 0]
            losers = [t for t in closed if t.get('profit_usd', 0) < 0]
            stats['winning_trades'] = len(winners)
            stats['losing_trades'] = len(losers)
            stats['win_rate'] = round(len(winners) / len(closed) * 100, 1)
            stats['avg_win'] = round(sum(t['profit_usd'] for t in winners) / len(winners), 2) if winners else 0.0
            stats['avg_loss'] = round(sum(t['profit_usd'] for t in losers) / len(losers), 2) if losers else 0.0
            pcts = [t.get('profit_pct', 0) for t in closed]
            stats['best_trade'] = round(max(pcts), 1) if pcts else 0.0
            stats['worst_trade'] = round(min(pcts), 1) if pcts else 0.0

        # MDD / Sharpe (NAV 히스토리 기반 근사)
        hist = [h['nav'] for h in self.portfolio['nav_history']]
        if len(hist) >= 2:
            peak = hist[0]
            max_dd = 0.0
            for v in hist:
                peak = max(peak, v)
                dd = (v / peak - 1) * 100
                max_dd = min(max_dd, dd)
            stats['mdd'] = round(max_dd, 1)

            # 일별 수익률 표준편차로 Sharpe 근사 (연율화)
            rets = [hist[i] / hist[i - 1] - 1 for i in range(1, len(hist))]
            if len(rets) >= 2:
                mean = sum(rets) / len(rets)
                var = sum((r - mean) ** 2 for r in rets) / len(rets)
                std = math.sqrt(var)
                if std > 0:
                    stats['sharpe'] = round((mean / std) * math.sqrt(252), 2)

        self.portfolio['statistics'] = stats

    # ---------- 실행 ----------
    def run(self):
        print("\n🏛️  STRATEGY ROOM v6 — Stateful Paper-Trade")
        print("=" * 60)

        self.load_market_data()

        print("\n📊 보유종목 일일 갱신...")
        self.update_holdings()

        print("\n🔄 정체 종목 스위칭 검토...")
        self.switch_stale_positions()

        print("\n➕ 빈 슬롯 채우기...")
        self.fill_empty_slots()

        self.calculate_nav()
        self.calculate_statistics()

        self.portfolio['timestamp'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        os.makedirs('results', exist_ok=True)
        with open(self.portfolio_file, 'w', encoding='utf-8') as f:
            json.dump(self.portfolio, f, indent=2, ensure_ascii=False)

        s = self.portfolio['statistics']
        print(f"\n{'=' * 60}")
        print(f"💰 NAV: ${self.portfolio['nav']:,.2f} (누적 {s['cumulative_return']:+.2f}%)")
        print(f"📦 보유: {len(self.portfolio['holdings'])}개 / 청산: {s['total_trades']}건")
        print(f"🎯 승률: {s['win_rate']}% | MDD: {s['mdd']}% | Sharpe: {s['sharpe']}")
        print(f"💾 저장: {self.portfolio_file}")
        print("=" * 60 + "\n")
        return True


if __name__ == '__main__':
    try:
        room = StrategyRoomV6()
        room.run()
        print("✅ 완료!")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ 오류: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(0)  # 파이프라인 중단 방지
