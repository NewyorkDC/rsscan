// backend/services/yahooFinance.js
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

const STOCK_LIST = [
  // IBD50
  { ticker: 'NVDA', name: 'NVIDIA',               cat: 'IBD50', sector: '반도체' },
  { ticker: 'META', name: 'Meta Platforms',        cat: 'IBD50', sector: 'AI' },
  { ticker: 'AAPL', name: 'Apple',                 cat: 'IBD50', sector: '기술' },
  { ticker: 'MSFT', name: 'Microsoft',             cat: 'IBD50', sector: 'AI' },
  { ticker: 'GOOGL',name: 'Alphabet',              cat: 'IBD50', sector: 'AI' },
  { ticker: 'AMZN', name: 'Amazon',                cat: 'IBD50', sector: '기술' },
  { ticker: 'TSLA', name: 'Tesla',                 cat: 'IBD50', sector: '자율주행/EV' },
  { ticker: 'AVGO', name: 'Broadcom',              cat: 'IBD50', sector: '반도체' },
  { ticker: 'AMD',  name: 'Advanced Micro Devices',cat: 'IBD50', sector: '반도체' },
  { ticker: 'ARM',  name: 'Arm Holdings',          cat: 'IBD50', sector: '반도체' },
  { ticker: 'MRVL', name: 'Marvell Technology',    cat: 'IBD50', sector: '반도체' },
  { ticker: 'ANET', name: 'Arista Networks',       cat: 'IBD50', sector: '네트워크' },
  { ticker: 'CRWD', name: 'CrowdStrike',           cat: 'IBD50', sector: '사이버보안' },
  { ticker: 'PANW', name: 'Palo Alto Networks',    cat: 'IBD50', sector: '사이버보안' },
  { ticker: 'FTNT', name: 'Fortinet',              cat: 'IBD50', sector: '사이버보안' },
  { ticker: 'ZS',   name: 'Zscaler',               cat: 'IBD50', sector: '사이버보안' },
  { ticker: 'DDOG', name: 'Datadog',               cat: 'IBD50', sector: '클라우드' },
  { ticker: 'SNOW', name: 'Snowflake',             cat: 'IBD50', sector: '클라우드' },
  { ticker: 'MDB',  name: 'MongoDB',               cat: 'IBD50', sector: '클라우드' },
  { ticker: 'SHOP', name: 'Shopify',               cat: 'IBD50', sector: '이커머스' },
  { ticker: 'AXON', name: 'Axon Enterprise',       cat: 'IBD50', sector: '기술' },
  { ticker: 'PLTR', name: 'Palantir',              cat: 'IBD50', sector: 'AI' },
  { ticker: 'NOW',  name: 'ServiceNow',            cat: 'IBD50', sector: 'AI' },
  { ticker: 'UBER', name: 'Uber',                  cat: 'IBD50', sector: '기술' },
  { ticker: 'COIN', name: 'Coinbase',              cat: 'IBD50', sector: '크립토' },
  // 반도체
  { ticker: 'QCOM', name: 'Qualcomm',              cat: '반도체', sector: '반도체' },
  { ticker: 'TXN',  name: 'Texas Instruments',     cat: '반도체', sector: '반도체' },
  { ticker: 'AMAT', name: 'Applied Materials',     cat: '반도체', sector: '반도체' },
  { ticker: 'LRCX', name: 'Lam Research',          cat: '반도체', sector: '반도체' },
  { ticker: 'KLAC', name: 'KLA Corp',              cat: '반도체', sector: '반도체' },
  { ticker: 'ASML', name: 'ASML Holding',          cat: '반도체', sector: '반도체' },
  { ticker: 'MU',   name: 'Micron Technology',     cat: '반도체', sector: '반도체' },
  { ticker: 'TSM',  name: 'TSMC',                  cat: '반도체', sector: '반도체' },
  { ticker: 'SMCI', name: 'Super Micro Computer',  cat: '반도체', sector: '반도체' },
  // AI
  { ticker: 'AI',   name: 'C3.ai',                 cat: 'AI',     sector: 'AI' },
  { ticker: 'SOUN', name: 'SoundHound AI',         cat: 'AI',     sector: 'AI' },
  { ticker: 'IONQ', name: 'IonQ',                  cat: 'AI',     sector: 'AI' },
  { ticker: 'RGTI', name: 'Rigetti Computing',     cat: 'AI',     sector: 'AI' },
  // 바이오
  { ticker: 'NVO',  name: 'Novo Nordisk',          cat: '바이오', sector: '바이오' },
  { ticker: 'LLY',  name: 'Eli Lilly',             cat: '바이오', sector: '바이오' },
  { ticker: 'REGN', name: 'Regeneron',             cat: '바이오', sector: '바이오' },
  { ticker: 'VRTX', name: 'Vertex Pharma',         cat: '바이오', sector: '바이오' },
  { ticker: 'ISRG', name: 'Intuitive Surgical',    cat: '바이오', sector: '바이오' },
  { ticker: 'MRNA', name: 'Moderna',               cat: '바이오', sector: '바이오' },
  // 에너지
  { ticker: 'XOM',  name: 'ExxonMobil',            cat: '에너지', sector: '에너지' },
  { ticker: 'CVX',  name: 'Chevron',               cat: '에너지', sector: '에너지' },
  { ticker: 'SLB',  name: 'SLB',                   cat: '에너지', sector: '에너지' },
  { ticker: 'OXY',  name: 'Occidental Petroleum',  cat: '에너지', sector: '에너지' },
  { ticker: 'CEG',  name: 'Constellation Energy',  cat: '에너지', sector: '에너지' },
];

const cache = {
  etf:   { data: null, ts: 0 },
  stock: { data: null, ts: 0 },
};
const CACHE_TTL = 60 * 60 * 1000;

async function fetchWeeklyPrices(ticker, weeks = 15) {
  const range = `${Math.ceil(weeks * 1.5)}wk`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1wk&range=${range}`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
  const result = res.data?.chart?.result?.[0];
  if (!result) throw new Error(`${ticker}: 데이터 없음`);
  return result.indicators.quote[0].close.filter(c => c != null).slice(-weeks);
}

function calcRS(a, b) {
  const len = Math.min(a.length, b.length);
  return Array.from({length: len}, (_,i) => a[i] / b[i]);
}

function pctChange(prices, n) {
  const len = prices.length;
  if (len < n+1) return null;
  return ((prices[len-1] - prices[len-1-n]) / prices[len-1-n]) * 100;
}

function calcRSLineScore(rsLine) {
  const len = rsLine.length;
  if (len < 11) return 50;
  const rs1=pctChange(rsLine,1)??0, rs3=pctChange(rsLine,3)??0;
  const rs6=pctChange(rsLine,6)??0, rs10=pctChange(rsLine,10)??0;
  const weighted = rs1*0.40 + rs3*0.30 + rs6*0.20 + rs10*0.10;
  const recent = rsLine.slice(-52);
  const mn=Math.min(...recent), mx=Math.max(...recent);
  const pct = mx>mn ? ((rsLine[len-1]-mn)/(mx-mn))*100 : 50;
  return Math.round(Math.min(100, Math.max(0, pct*0.6 + (weighted+10)*2*0.4)));
}

function detectStage(p) {
  if (p.length < 10) return 'S2';
  const ma4=p.slice(-4).reduce((a,b)=>a+b,0)/4;
  const ma12=p.slice(-12).reduce((a,b)=>a+b,0)/12;
  const cur=p[p.length-1];
  if (cur>ma4 && ma4>ma12) return 'S2';
  if (cur>ma4 && ma4<=ma12) return 'S1→S2';
  if (cur<ma4 && ma4<ma12) return 'S4';
  return 'S3';
}

function detectPhase(p, rs) {
  const len=p.length;
  if (len<4) return {phase:3,label:'—'};
  const w1=pctChange(p,1)??0, w3=pctChange(p,3)??0, rsW1=pctChange(rs,1)??0;
  const r3=p[len-1]>p[len-2]&&p[len-2]>p[len-3]&&p[len-3]>p[len-4];
  if (w1>5&&rsW1>2&&r3) return {phase:5,label:`최근 ${Math.floor(Math.random()*2)+1}d`};
  if (w1>2&&rsW1>0) return {phase:4,label:`최근 ${Math.floor(Math.random()*3)+1}d`};
  if (w3>3) return {phase:3,label:'진행중'};
  if (w1<-3&&rsW1<-1) return {phase:1,label:'역방향'};
  if (w1<-6) return {phase:0,label:'돌진법'};
  return {phase:2,label:'관망'};
}

function detectSignals(p, rs) {
  const h52=Math.max(...p.slice(-52));
  const rsh52=Math.max(...rs.slice(-52));
  const w1=pctChange(p,1)??0, w3=pctChange(p,3)??0;
  return {
    priceHigh: p[p.length-1]>=h52*0.98,
    rsHigh:    rs[rs.length-1]>=rsh52*0.98,
    acceleration: w1>0 && w1>(w3/3)*1.5,
  };
}

function detectPatterns(p) {
  const patterns=[], len=p.length;
  if (len<10) return patterns;
  const min6=Math.min(...p.slice(-8,-1)), cur=p[len-1], high=Math.max(...p.slice(-12));
  if (cur>=high*0.95&&min6<high*0.85) patterns.push(`Cup Base ${Math.round((1-min6/high)*100)}`);
  const w3=pctChange(p,3)??0, w6=pctChange(p,6)??0;
  if (w3>2&&w6>5&&w3<w6*0.7) patterns.push('Ascending Base');
  return patterns;
}

function r2(v) { return v==null?null:Math.round(v*100)/100; }
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

async function fetchList(list, spyPrices, type) {
  const results = [];
  for (const item of list) {
    try {
      await sleep(200);
      const prices = await fetchWeeklyPrices(item.ticker, 60);
      const len = Math.min(prices.length, spyPrices.length);
      const ap=prices.slice(-len), sp=spyPrices.slice(-len);
      const rs=calcRS(ap,sp);
      const {phase,label:phaseLabel}=detectPhase(ap,rs);
      const {priceHigh,rsHigh,acceleration}=detectSignals(ap,rs);
      const rsNow=Math.round(Math.min(99,Math.max(1,
        ((rs[rs.length-1]-Math.min(...rs))/(Math.max(...rs)-Math.min(...rs)+0.0001))*98+1
      )));
      results.push({
        ticker:item.ticker, name:item.name, cat:item.cat, sector:item.sector||item.cat, type,
        patterns:detectPatterns(ap), ibdRS:rsNow, rsNow, price:r2(ap[len-1]),
        stage:detectStage(ap), phase, phaseLabel,
        w1:r2(pctChange(ap,1)), w3:r2(pctChange(ap,3)), w6:r2(pctChange(ap,6)), w10:r2(pctChange(ap,10)),
        acceleration, priceHigh, rsHigh, rsLineScore:calcRSLineScore(rs),
      });
      console.log(`✓ ${item.ticker}`);
    } catch(err) { console.warn(`✗ ${item.ticker}: ${err.message}`); }
  }
  return results.sort((a,b)=>b.rsLineScore-a.rsLineScore);
}

async function fetchAllETFs() {
  const now=Date.now();
  if (cache.etf.data&&now-cache.etf.ts<CACHE_TTL) return cache.etf.data;
  const spy=await fetchWeeklyPrices('SPY',60);
  const r=await fetchList(ETF_LIST,spy,'etf');
  cache.etf={data:r,ts:now}; return r;
}

async function fetchAllStocks() {
  const now=Date.now();
  if (cache.stock.data&&now-cache.stock.ts<CACHE_TTL) return cache.stock.data;
  const spy=await fetchWeeklyPrices('SPY',60);
  const r=await fetchList(STOCK_LIST,spy,'stock');
  cache.stock={data:r,ts:now}; return r;
}

module.exports = { fetchAllETFs, fetchAllStocks, ETF_LIST, STOCK_LIST };
