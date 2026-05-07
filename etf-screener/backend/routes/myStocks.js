const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function r2(v)     { return v==null?null:Math.round(v*100)/100; }

async function fetchWeeklyPrices(ticker, weeks=60) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1wk&range=${Math.ceil(weeks*1.5)}wk`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
  const result = res.data?.chart?.result?.[0];
  if (!result) throw new Error(`${ticker}: 데이터 없음`);
  const name = result.meta?.longName || result.meta?.shortName || ticker;
  const closes = result.indicators.quote[0].close.filter(c=>c!=null).slice(-weeks);
  return { prices: closes, name };
}

function calcRS(a,b){const len=Math.min(a.length,b.length);return Array.from({length:len},(_,i)=>a[i]/b[i]);}
function pctChange(p,n){if(p.length<n+1)return null;return((p[p.length-1]-p[p.length-1-n])/p[p.length-1-n])*100;}
function calcRSLineScore(rs){const len=rs.length;if(len<11)return 50;const r1=pctChange(rs,1)??0,r3=pctChange(rs,3)??0,r6=pctChange(rs,6)??0,r10=pctChange(rs,10)??0;const w=r1*0.4+r3*0.3+r6*0.2+r10*0.1;const sl=rs.slice(-52),mn=Math.min(...sl),mx=Math.max(...sl);const pct=mx>mn?((rs[len-1]-mn)/(mx-mn))*100:50;return Math.round(Math.min(100,Math.max(0,pct*0.6+(w+10)*2*0.4)));}
function detectStage(p){if(p.length<10)return 'S2';const ma4=p.slice(-4).reduce((a,b)=>a+b,0)/4;const ma12=p.slice(-12).reduce((a,b)=>a+b,0)/12;const cur=p[p.length-1];if(cur>ma4&&ma4>ma12)return 'S2';if(cur>ma4&&ma4<=ma12)return 'S1→S2';if(cur<ma4&&ma4<ma12)return 'S4';return 'S3';}
function detectPhase(p,rs){const len=p.length;if(len<4)return{phase:3,label:'—'};const w1=pctChange(p,1)??0,w3=pctChange(p,3)??0,rsW1=pctChange(rs,1)??0;const r3=p[len-1]>p[len-2]&&p[len-2]>p[len-3]&&p[len-3]>p[len-4];if(w1>5&&rsW1>2&&r3)return{phase:5,label:'최근 1d'};if(w1>2&&rsW1>0)return{phase:4,label:'최근 2d'};if(w3>3)return{phase:3,label:'진행중'};if(w1<-3&&rsW1<-1)return{phase:1,label:'역방향'};if(w1<-6)return{phase:0,label:'돌진법'};return{phase:2,label:'관망'};}
function detectSignals(p,rs){const h52=Math.max(...p.slice(-52)),rsh52=Math.max(...rs.slice(-52));const w1=pctChange(p,1)??0,w3=pctChange(p,3)??0;return{priceHigh:p[p.length-1]>=h52*0.98,rsHigh:rs[rs.length-1]>=rsh52*0.98,acceleration:w1>0&&w1>(w3/3)*1.5};}
function detectPatterns(p){const pts=[],len=p.length;if(len<10)return pts;const min6=Math.min(...p.slice(-8,-1)),cur=p[len-1],high=Math.max(...p.slice(-12));if(cur>=high*0.95&&min6<high*0.85)pts.push(`Cup Base ${Math.round((1-min6/high)*100)}`);const w3=pctChange(p,3)??0,w6=pctChange(p,6)??0;if(w3>2&&w6>5&&w3<w6*0.7)pts.push('Ascending Base');return pts;}

router.post('/', async (req, res) => {
  const { tickers } = req.body;
  if (!tickers||!Array.isArray(tickers)||!tickers.length)
    return res.status(400).json({ ok:false, error:'티커 목록 필요' });
  try {
    const { prices: spyPrices } = await fetchWeeklyPrices('SPY', 60);
    const results = [];
    for (const ticker of tickers.slice(0,30)) {
      try {
        await sleep(250);
        const { prices, name } = await fetchWeeklyPrices(ticker.toUpperCase(), 60);
        const len=Math.min(prices.length,spyPrices.length);
        const ap=prices.slice(-len),sp=spyPrices.slice(-len),rs=calcRS(ap,sp);
        const {phase,label:phaseLabel}=detectPhase(ap,rs);
        const {priceHigh,rsHigh,acceleration}=detectSignals(ap,rs);
        const rsNow=Math.round(Math.min(99,Math.max(1,((rs[rs.length-1]-Math.min(...rs))/(Math.max(...rs)-Math.min(...rs)+0.0001))*98+1)));
        results.push({
          ticker:ticker.toUpperCase(),name,cat:'내 종목',sector:'내 종목',type:'my',
          patterns:detectPatterns(ap),ibdRS:rsNow,rsNow,price:r2(ap[len-1]),
          stage:detectStage(ap),phase,phaseLabel,
          w1:r2(pctChange(ap,1)),w3:r2(pctChange(ap,3)),w6:r2(pctChange(ap,6)),w10:r2(pctChange(ap,10)),
          acceleration,priceHigh,rsHigh,rsLineScore:calcRSLineScore(rs),
        });
      } catch(err){ console.warn(`✗ ${ticker}: ${err.message}`); }
    }
    results.sort((a,b)=>b.rsLineScore-a.rsLineScore);
    res.json({ok:true,data:results,count:results.length});
  } catch(err){
    res.status(500).json({ok:false,error:err.message});
  }
});

module.exports = router;
