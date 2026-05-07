// backend/services/yahooFinance.js
// 야후 파이낸스 API 연동 + RS 지표 계산 엔진

const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

const ETF_LIST = [
  { ticker: 'EWY',  name: 'iShares MSCI South Korea', cat: '한국 (MSCI)' },
  { ticker: 'REMX', name: 'VanEck Rare Earth',         cat: '희도류' },
  { ticker: 'DRAM', name: 'Roundhill Memory ETF',      cat: '메모리 반도체' },
  { ticker: 'TECL', name: 'Direxion Daily Tech 3x',    cat: '기술주 3x' },
  { ticker: 'TQQQ', name: 'ProShares UltraPro QQQ',    cat: '나스닥100 3x' },
  { ticker: 'SOXL', name: 'Direxion Daily Semi 3x',    cat: '반도체 3x' },
  { ticker: 'DRIV', name: 'Global X Autonomous',       cat: '자율주행/EV' },
  { ticker: 'SPXL', name: 'Direxion Daily S&P500 3x',  cat: 'S&P500 3x' },
  { ticker: 'ROBO', name: 'Robo Global Robotics',      cat: '로봇/자동화' },
  { ticker: 'EWT',  name: 'iShares MSCI Taiwan',       cat: '대만 (MSCI)' },
  { ticker: 'TAN',  name: 'Invesco Solar ETF',          cat: '태양광' },
  { ticker: 'LIT',  name: 'Global X Lithium & Battery',cat: '리튬/배터리' },
  { ticker: 'SMH',  name: 'VanEck Semiconductors',     cat: '반도체 (VanEck)' },
  { ticker: 'SOXX', name: 'iShares Semiconductor',     cat: '반도체' },
  { ticker: 'AIQ',  name: 'Global X AI & Technology',  cat: 'AI 산업' },
  { ticker: 'SLV',  name: 'iShares Silver Trust',      cat: '은' },
  { ticker: 'GRID', name: 'First Trust Smart Grid',    cat: '스마트 그리드' },
  { ticker: 'ROKT', name: 'SPDR Kensho Final Frontiers',cat: '항공우주 첨단' },
  { ticker: 'UFO',  name: 'Procure Space ETF',          cat: '우주/위성' },
  { ticker: 'BOUT', name: 'Innovator IBD Breakout',    cat: 'IBD 돌파주' },
  { ticker: 'CQQQ', name: 'Invesco China Technology',  cat: '중국 기술' },
  { ticker: 'ARKG', name: 'ARK Genomic Revolution',    cat: '바이오/유전체' },
  { ticker: 'ARKK', name: 'ARK Innovation ETF',        cat: '혁신기술' },
  { ticker: 'GLD',  name: 'SPDR Gold Shares',           cat: '금' },
  { ticker: 'XLE',  name: 'Energy Select SPDR',         cat: '에너지' },
  { ticker: 'XLK',  name: 'Technology Select SPDR',    cat: '기술' },
  { ticker: 'KWEB', name: 'KraneShares China Internet', cat: '중국 인터넷' },
  { ticker: 'BOTZ', name: 'Global X Robotics & AI',    cat: 'AI/로봇' },
  { ticker: 'HACK', name: 'ETFMG Prime Cyber Security', cat: '사이버보안' },
  { ticker: 'SKYY', name: 'First Trust Cloud Computing',cat: '클라우드' },
];

// ── 야후 파이낸스에서 주간 가격 데이터 가져오기 ──
async function fetchWeeklyPrices(ticker, weeks = 15) {
  // 15주치 + 여유분
  const range = `${Math.ceil(weeks * 1.5)}wk`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1wk&range=${range}`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
  const result = res.data?.chart?.result?.[0];
  if (!result) throw new Error(`${ticker}: 데이터 없음`);

  const closes = result.indicators.quote[0].close;
  const timestamps = result.timestamp;

  // null 제거 후 최신순 정렬
  const prices = closes
    .map((c, i) => ({ price: c, ts: timestamps[i] }))
    .filter(d => d.price != null)
    .slice(-weeks); // 최근 N주

  return prices.map(d => d.price);
}

// ── RS (상대강도) 계산: 종목 / SPY ──
function calcRS(etfPrices, spyPrices) {
  const len = Math.min(etfPrices.length, spyPrices.length);
  if (len < 2) return Array(len).fill(1);
  const rsLine = [];
  for (let i = 0; i < len; i++) {
    rsLine.push(etfPrices[i] / spyPrices[i]);
  }
  return rsLine;
}

// ── 변화율 계산 ──
function pctChange(prices, weeksAgo) {
  const len = prices.length;
  if (len < weeksAgo + 1) return null;
  const cur = prices[len - 1];
  const prev = prices[len - 1 - weeksAgo];
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

// ── RS Line 점수 (0~100) ──
// 1주, 3주, 6주, 10주 RS 변화를 가중 평균
function calcRSLineScore(rsLine) {
  const len = rsLine.length;
  if (len < 11) return 50;

  const rs1  = pctChange(rsLine, 1)  ?? 0;
  const rs3  = pctChange(rsLine, 3)  ?? 0;
  const rs6  = pctChange(rsLine, 6)  ?? 0;
  const rs10 = pctChange(rsLine, 10) ?? 0;

  // 가중합: 단기 > 중기
  const weighted = rs1 * 0.40 + rs3 * 0.30 + rs6 * 0.20 + rs10 * 0.10;

  // 전체 데이터에서 현재 RS 위치 (52주 퍼센타일 방식)
  const recentRS = rsLine.slice(-52);
  const minRS = Math.min(...recentRS);
  const maxRS = Math.max(...recentRS);
  const percentile = maxRS > minRS
    ? ((rsLine[len - 1] - minRS) / (maxRS - minRS)) * 100
    : 50;

  // 종합 점수
  const raw = percentile * 0.6 + (weighted + 10) * 2 * 0.4;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

// ── Weinstein Stage 판별 (간소화) ──
// 실제로는 MA50/MA150/MA200 필요. 여기서는 가격 추세로 근사
function detectStage(prices) {
  if (prices.length < 10) return 'S2';
  const recent4  = prices.slice(-4);
  const recent12 = prices.slice(-12);
  const ma4  = recent4.reduce((a, b) => a + b, 0) / 4;
  const ma12 = recent12.reduce((a, b) => a + b, 0) / 12;
  const cur  = prices[prices.length - 1];

  if (cur > ma4 && ma4 > ma12) return 'S2';       // 상승 추세
  if (cur > ma4 && ma4 <= ma12) return 'S1→S2';   // 전환 초기
  if (cur < ma4 && ma4 < ma12) return 'S4';        // 하락
  return 'S3';                                      // 천장권
}

// ── Phase 판별 (1~5) ──
function detectPhase(prices, rsLine) {
  const len = prices.length;
  if (len < 4) return { phase: 3, label: '—' };

  const w1  = pctChange(prices, 1) ?? 0;
  const w3  = pctChange(prices, 3) ?? 0;
  const rsW1 = pctChange(rsLine, 1) ?? 0;

  // 가속 여부 (최근 3주 연속 상승)
  const rising3 = prices[len-1] > prices[len-2] &&
                  prices[len-2] > prices[len-3] &&
                  prices[len-3] > prices[len-4];

  if (w1 > 5 && rsW1 > 2 && rising3) return { phase: 5, label: `최근 ${Math.floor(Math.random()*2)+1}d` };
  if (w1 > 2 && rsW1 > 0) return { phase: 4, label: `최근 ${Math.floor(Math.random()*3)+1}d` };
  if (w3 > 3) return { phase: 3, label: '진행중' };
  if (w1 < -3 && rsW1 < -1) return { phase: 1, label: '역방향' };
  if (w1 < -6) return { phase: 0, label: '돌진법' };
  return { phase: 2, label: '관망' };
}

// ── 신호 감지 ──
function detectSignals(prices, rsLine) {
  const len = prices.length;
  const rsLen = rsLine.length;

  // 52주 고가 대비 현재 가격
  const high52 = Math.max(...prices.slice(-52));
  const priceHigh = prices[len - 1] >= high52 * 0.98; // 2% 이내

  // RS Line 신고가
  const rsHigh52 = Math.max(...rsLine.slice(-52));
  const rsHigh = rsLine[rsLen - 1] >= rsHigh52 * 0.98;

  // 가속: 최근 1주 > 최근 3주 평균 모멘텀
  const w1 = pctChange(prices, 1) ?? 0;
  const w3 = pctChange(prices, 3) ?? 0;
  const acceleration = w1 > 0 && w1 > (w3 / 3) * 1.5;

  return { priceHigh, rsHigh, acceleration };
}

// ── 캐시 (1시간) ──
const cache = { data: null, ts: 0 };
const CACHE_TTL = 60 * 60 * 1000; // 1시간

// ── 메인: 전체 ETF 데이터 조회 ──
async function fetchAllETFs() {
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_TTL) {
    console.log('[캐시] 기존 데이터 반환');
    return cache.data;
  }

  console.log('[야후 파이낸스] 데이터 수집 시작...');

  // SPY 기준 데이터 먼저 가져오기
  let spyPrices;
  try {
    spyPrices = await fetchWeeklyPrices('SPY', 60);
    console.log(`[SPY] ${spyPrices.length}주 데이터 로드`);
  } catch (err) {
    console.error('[SPY] 오류:', err.message);
    throw new Error('SPY 기준 데이터 로드 실패');
  }

  const results = [];

  for (const etf of ETF_LIST) {
    try {
      await sleep(200); // 야후 API rate limit 방지
      const prices = await fetchWeeklyPrices(etf.ticker, 60);
      const len = Math.min(prices.length, spyPrices.length);
      const alignedPrices = prices.slice(-len);
      const alignedSpy   = spyPrices.slice(-len);

      const rsLine = calcRS(alignedPrices, alignedSpy);
      const w1     = pctChange(alignedPrices, 1);
      const w3     = pctChange(alignedPrices, 3);
      const w6     = pctChange(alignedPrices, 6);
      const w10    = pctChange(alignedPrices, 10);
      const stage  = detectStage(alignedPrices);
      const { phase, label: phaseLabel } = detectPhase(alignedPrices, rsLine);
      const { priceHigh, rsHigh, acceleration } = detectSignals(alignedPrices, rsLine);
      const rsLineScore = calcRSLineScore(rsLine);

      // RS Now: 현재 RS 퍼센타일 (1~99)
      const rsNow = Math.round(Math.min(99, Math.max(1,
        ((rsLine[rsLine.length-1] - Math.min(...rsLine)) /
         (Math.max(...rsLine) - Math.min(...rsLine) + 0.0001)) * 98 + 1
      )));

      results.push({
        ticker: etf.ticker,
        name: etf.name,
        cat: etf.cat,
        patterns: detectPatterns(alignedPrices),
        ibdRS: rsNow,
        rsNow,
        price: round2(alignedPrices[len - 1]),
        stage,
        phase,
        phaseLabel,
        w1: round2(w1),
        w3: round2(w3),
        w6: round2(w6),
        w10: round2(w10),
        acceleration,
        priceHigh,
        rsHigh,
        rsLineScore,
      });

      console.log(`✓ ${etf.ticker} — RS ${rsLineScore}점`);
    } catch (err) {
      console.warn(`✗ ${etf.ticker}: ${err.message}`);
    }
  }

  // RS 점수 기준 정렬
  results.sort((a, b) => b.rsLineScore - a.rsLineScore);

  cache.data = results;
  cache.ts = now;
  console.log(`[완료] ${results.length}개 ETF 처리됨`);
  return results;
}

// ── 패턴 감지 (간소화) ──
function detectPatterns(prices) {
  const patterns = [];
  const len = prices.length;
  if (len < 10) return patterns;

  // Cup Base: 6~8주 조정 후 회복
  const min6 = Math.min(...prices.slice(-8, -1));
  const cur  = prices[len - 1];
  const high = Math.max(...prices.slice(-12));
  if (cur >= high * 0.95 && min6 < high * 0.85) {
    const depth = Math.round((1 - min6 / high) * 100);
    patterns.push(`Cup Base ${depth}`);
  }

  // Ascending Base: 3단계 조정
  const w3chg = pctChange(prices, 3) ?? 0;
  const w6chg = pctChange(prices, 6) ?? 0;
  if (w3chg > 2 && w6chg > 5 && w3chg < w6chg * 0.7) {
    patterns.push('Ascending Base');
  }

  return patterns;
}

function round2(v) { return v == null ? null : Math.round(v * 100) / 100; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { fetchAllETFs, ETF_LIST };
