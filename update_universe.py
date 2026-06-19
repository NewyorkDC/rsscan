"""
RSSCAN v3: Investable Universe Builder
기관자금 유입 가능한 우량주 유니버스 (1,000~1,500개) 매일 갱신 스크립트

필터링 기준:
1. 현재가 >= $10
2. ADV (Average Daily Volume) >= 500,000주 AND 일평균거래대금 >= $1,000만
3. 시가총액 >= $1B
+ GICS 섹터/산업 매핑
+ 멀티스레딩 OHLCV 수집
"""

import pandas as pd
import yfinance as yf
import json
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import warnings
import requests

warnings.filterwarnings('ignore')

# ===== GICS 섹터 매핑 (11개 섹터) =====
GICS_MAPPING = {
    # Communication Services (통신서비스)
    'AAPL': {'sector': 'Information Technology', 'industry': 'Technology Hardware, Storage & Peripherals', 'gics_code': '45'},
    'META': {'sector': 'Communication Services', 'industry': 'Media & Entertainment', 'gics_code': '50'},
    'GOOGL': {'sector': 'Communication Services', 'industry': 'Interactive Media & Services', 'gics_code': '50'},
    'MSFT': {'sector': 'Information Technology', 'industry': 'Software & Services', 'gics_code': '45'},
    
    # Information Technology
    'NVDA': {'sector': 'Information Technology', 'industry': 'Semiconductors & Semiconductor Equipment', 'gics_code': '45'},
    'AVGO': {'sector': 'Information Technology', 'industry': 'Semiconductors & Semiconductor Equipment', 'gics_code': '45'},
    'BROADCOM': {'sector': 'Information Technology', 'industry': 'Semiconductors & Semiconductor Equipment', 'gics_code': '45'},
    'MCHP': {'sector': 'Information Technology', 'industry': 'Semiconductors & Semiconductor Equipment', 'gics_code': '45'},
    'INTC': {'sector': 'Information Technology', 'industry': 'Semiconductors & Semiconductor Equipment', 'gics_code': '45'},
    
    # Healthcare
    'JNJ': {'sector': 'Health Care', 'industry': 'Pharmaceuticals', 'gics_code': '35'},
    'UNH': {'sector': 'Health Care', 'industry': 'Health Care Providers & Services', 'gics_code': '35'},
    'PFE': {'sector': 'Health Care', 'industry': 'Pharmaceuticals', 'gics_code': '35'},
    'ABBV': {'sector': 'Health Care', 'industry': 'Pharmaceuticals', 'gics_code': '35'},
    
    # Financials
    'JPM': {'sector': 'Financials', 'industry': 'Banks', 'gics_code': '40'},
    'BAC': {'sector': 'Financials', 'industry': 'Banks', 'gics_code': '40'},
    'WFC': {'sector': 'Financials', 'industry': 'Banks', 'gics_code': '40'},
    'GS': {'sector': 'Financials', 'industry': 'Capital Markets', 'gics_code': '40'},
    
    # Industrials
    'BA': {'sector': 'Industrials', 'industry': 'Aerospace & Defense', 'gics_code': '20'},
    'CAT': {'sector': 'Industrials', 'industry': 'Machinery', 'gics_code': '20'},
    'GE': {'sector': 'Industrials', 'industry': 'Industrial Conglomerates', 'gics_code': '20'},
    
    # Consumer Discretionary
    'TSLA': {'sector': 'Consumer Discretionary', 'industry': 'Automobiles', 'gics_code': '25'},
    'AMZN': {'sector': 'Consumer Discretionary', 'industry': 'Internet & Direct Marketing Retail', 'gics_code': '25'},
    'MCD': {'sector': 'Consumer Discretionary', 'industry': 'Restaurants', 'gics_code': '25'},
    'SBUX': {'sector': 'Consumer Discretionary', 'industry': 'Restaurants', 'gics_code': '25'},
    
    # Consumer Staples
    'PG': {'sector': 'Consumer Staples', 'industry': 'Household & Personal Products', 'gics_code': '30'},
    'KO': {'sector': 'Consumer Staples', 'industry': 'Beverages', 'gics_code': '30'},
    'WMT': {'sector': 'Consumer Staples', 'industry': 'Food & Staples Retailing', 'gics_code': '30'},
    
    # Energy
    'XOM': {'sector': 'Energy', 'industry': 'Oil, Gas & Consumable Fuels', 'gics_code': '10'},
    'CVX': {'sector': 'Energy', 'industry': 'Oil, Gas & Consumable Fuels', 'gics_code': '10'},
    'COP': {'sector': 'Energy', 'industry': 'Oil, Gas & Consumable Fuels', 'gics_code': '10'},
    
    # Materials
    'LIN': {'sector': 'Materials', 'industry': 'Chemicals', 'gics_code': '15'},
    'APD': {'sector': 'Materials', 'industry': 'Chemicals', 'gics_code': '15'},
    'FCX': {'sector': 'Materials', 'industry': 'Metals & Mining', 'gics_code': '15'},
    
    # Real Estate
    'PLD': {'sector': 'Real Estate', 'industry': 'Industrial REITs', 'gics_code': '60'},
    'SPY': {'sector': 'Real Estate', 'industry': 'Diversified REITs', 'gics_code': '60'},
    
    # Utilities
    'NEE': {'sector': 'Utilities', 'industry': 'Electric Utilities', 'gics_code': '55'},
    'DUK': {'sector': 'Utilities', 'industry': 'Electric Utilities', 'gics_code': '55'},
}

def get_sp500_tickers():
    """S&P 500 구성 종목 + 주요 나스닥 종목 조합으로 초기 유니버스 생성"""
    print("📊 S&P 500 및 주요 종목 티커 수집 중...")
    
    try:
        # S&P 500 종목
        sp500 = pd.read_html('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies')[0]
        sp500_tickers = sp500['Symbol'].tolist()
        
        # 주요 Nasdaq 테크 종목 추가
        additional = ['NVDA', 'AVGO', 'ASML', 'MSTR', 'PLTR', 'COIN', 'RIOT', 'MARA']
        
        tickers = list(set(sp500_tickers + additional))
        print(f"✅ 총 {len(tickers)}개 종목 수집됨")
        
        return sorted(tickers)
    
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"❌ 치명적 오류: S&P 500 티커 수집 실패")
        print(f"{'='*60}")
        print(f"오류 메시지: {str(e)}")
        print(f"\n📦 필요한 패키지: lxml, html5lib")
        print(f"💾 설치 방법: pip install lxml html5lib")
        print(f"또는 requirements.txt에 추가")
        print(f"{'='*60}\n")
        import sys
        sys.exit(1)

def fetch_ticker_info(ticker):
    """개별 종목의 기본 정보 수집 (가격, 시가총액, 거래량)"""
    try:
        data = yf.download(ticker, period='1d', progress=False)
        
        if data.empty:
            return None
        
        info = yf.Ticker(ticker).info
        
        current_price = data['Close'].iloc[-1]
        
        # 최근 50일 ADV 계산
        data_50d = yf.download(ticker, period='60d', progress=False)
        if len(data_50d) >= 50:
            avg_volume = data_50d['Volume'].tail(50).mean()
        else:
            avg_volume = data_50d['Volume'].mean()
        
        market_cap = info.get('marketCap', 0)
        
        # 일평균거래대금 계산
        avg_daily_value = avg_volume * current_price
        
        return {
            'ticker': ticker,
            'price': current_price,
            'market_cap': market_cap,
            'adv': avg_volume,
            'avg_daily_value': avg_daily_value,
        }
    
    except Exception as e:
        return None

def filter_universe(ticker_info_list):
    """3가지 하드 룰 필터링 적용"""
    print("\n🔍 유니버스 필터링 중 (3가지 하드 룰)...")
    
    filtered = []
    
    for info in ticker_info_list:
        if info is None:
            continue
        
        # 규칙 1: 가격 >= $10
        if info['price'] < 10:
            continue
        
        # 규칙 2: ADV >= 500,000 AND 일평균거래대금 >= $10,000,000
        if info['adv'] < 500_000 or info['avg_daily_value'] < 10_000_000:
            continue
        
        # 규칙 3: 시가총액 >= $1B
        if info['market_cap'] < 1_000_000_000:
            continue
        
        filtered.append(info)
    
    print(f"✅ {len(filtered)}개 종목이 모든 필터링을 통과했습니다!")
    
    return filtered

def assign_gics(ticker):
    """GICS 섹터 & 산업 매핑"""
    if ticker in GICS_MAPPING:
        return GICS_MAPPING[ticker]
    
    # 기본값 (매핑되지 않은 종목)
    return {
        'sector': 'Unknown',
        'industry': 'Unknown',
        'gics_code': '00'
    }

def fetch_ohlcv_parallel(ticker_list, max_workers=20):
    """멀티스레딩으로 OHLCV 데이터 병렬 수집"""
    print(f"\n📈 {len(ticker_list)}개 종목의 OHLCV 데이터 병렬 수집 중... (Max {max_workers}개 동시 작업)")
    
    ohlcv_data = {}
    failed_tickers = []
    
    def fetch_single_ohlcv(ticker):
        try:
            data = yf.download(ticker, period='365d', progress=False)
            
            if data.empty:
                return ticker, None
            
            # 최근 데이터만 반환 (마지막 252거래일 = 약 1년)
            data = data.tail(252)
            
            result = {
                'ticker': ticker,
                'open': data['Open'].tolist()[-1],
                'high': data['High'].tolist()[-1],
                'low': data['Low'].tolist()[-1],
                'close': data['Close'].tolist()[-1],
                'volume': data['Volume'].tolist()[-1],
                'date': str(data.index[-1].date()),
            }
            
            return ticker, result
        
        except Exception as e:
            return ticker, None
    
    # ThreadPoolExecutor로 병렬 처리
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_single_ohlcv, ticker): ticker for ticker in ticker_list}
        
        completed = 0
        for future in as_completed(futures):
            completed += 1
            ticker, result = future.result()
            
            if result:
                ohlcv_data[ticker] = result
            else:
                failed_tickers.append(ticker)
            
            if completed % 50 == 0:
                print(f"  진행 중: {completed}/{len(ticker_list)}")
    
    print(f"✅ {len(ohlcv_data)}개 종목 OHLCV 수집 완료 (실패: {len(failed_tickers)}개)")
    
    return ohlcv_data

def save_universe(filtered_universe, ohlcv_data):
    """필터링된 유니버스 + GICS 매핑 + OHLCV 저장"""
    
    print("\n💾 최종 유니버스 데이터 저장 중...")
    
    final_universe = []
    
    for universe_item in filtered_universe:
        ticker = universe_item['ticker']
        
        if ticker not in ohlcv_data:
            continue
        
        gics_info = assign_gics(ticker)
        ohlcv = ohlcv_data[ticker]
        
        combined = {
            'ticker': ticker,
            'price': universe_item['price'],
            'market_cap': universe_item['market_cap'],
            'adv': universe_item['adv'],
            'avg_daily_value': universe_item['avg_daily_value'],
            'sector': gics_info['sector'],
            'industry': gics_info['industry'],
            'gics_code': gics_info['gics_code'],
            'open': ohlcv['open'],
            'high': ohlcv['high'],
            'low': ohlcv['low'],
            'close': ohlcv['close'],
            'volume': ohlcv['volume'],
            'date': ohlcv['date'],
        }
        
        final_universe.append(combined)
    
    # JSON 저장
    with open('results/investable_universe.json', 'w', encoding='utf-8') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'count': len(final_universe),
            'universe': final_universe,
        }, f, indent=2, ensure_ascii=False)
    
    # CSV 저장 (분석용)
    df = pd.DataFrame(final_universe)
    df.to_csv('results/investable_universe.csv', index=False, encoding='utf-8')
    
    print(f"✅ 최종 유니버스: {len(final_universe)}개 종목")
    print(f"📁 저장 위치:")
    print(f"   - results/investable_universe.json")
    print(f"   - results/investable_universe.csv")
    
    # 섹터별 분포 출력
    print(f"\n📊 섹터별 분포:")
    sector_counts = df['sector'].value_counts()
    for sector, count in sector_counts.items():
        print(f"   - {sector}: {count}개")
    
    return final_universe

def main():
    print("=" * 60)
    print("🚀 RSSCAN v3: Investable Universe Builder")
    print("=" * 60)
    
    start_time = time.time()
    
    try:
        # Step 1: 초기 티커 수집
        all_tickers = get_sp500_tickers()
        
        if not all_tickers:
            raise Exception("❌ 티커 수집 실패: 종목 리스트가 비어있습니다")
        
        # Step 2: 기본 정보 수집 (가격, 시가총액, ADV)
        print(f"\n🔄 {len(all_tickers)}개 종목의 기본 정보 수집 중... (병렬 처리)")
        
        with ThreadPoolExecutor(max_workers=30) as executor:
            ticker_info_list = list(executor.map(fetch_ticker_info, all_tickers))
        
        # Step 3: 필터링 (3가지 하드 룰)
        filtered_universe = filter_universe(ticker_info_list)
        
        if not filtered_universe:
            raise Exception("❌ 필터링 실패: 조건을 통과한 종목이 없습니다")
        
        # Step 4: OHLCV 데이터 수집 (멀티스레딩)
        filtered_tickers = [item['ticker'] for item in filtered_universe]
        ohlcv_data = fetch_ohlcv_parallel(filtered_tickers)
        
        if not ohlcv_data:
            raise Exception("❌ OHLCV 수집 실패: 데이터가 없습니다")
        
        # Step 5: 저장 (GICS 매핑 포함)
        final_universe = save_universe(filtered_universe, ohlcv_data)
        
        if not final_universe:
            raise Exception("❌ 저장 실패: 최종 유니버스가 비어있습니다")
        
        elapsed_time = time.time() - start_time
        
        print("\n" + "=" * 60)
        print(f"✅ 성공! (소요시간: {elapsed_time:.1f}초)")
        print("=" * 60)
    
    except Exception as e:
        elapsed_time = time.time() - start_time
        
        print("\n" + "=" * 60)
        print("❌ RSSCAN Investable Universe Builder 실패")
        print("=" * 60)
        print(f"오류: {str(e)}")
        print(f"소요시간: {elapsed_time:.1f}초")
        print("=" * 60 + "\n")
        
        import sys
        sys.exit(1)

if __name__ == '__main__':
    main()
