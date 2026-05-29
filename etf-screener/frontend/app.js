// ── Market Pulse 데이터 저장 ──
let pulseData = { data: [], pricePct: 0, rsPct: 0, health: 0, above50: [], rs80: [], rs50: [], below50: [] };

// ── Market Pulse 상세 모달 ──
window.openPulseDetail = function(type) {
  const modal = document.getElementById('pulseModal');
  const title = document.getElementById('pulseModalTitle');
  const body  = document.getElementById('pulseModalBody');
  if (!modal) return;

  const d = pulseData;
  const pricePct = d.pricePct, rsPct = d.rsPct, health = d.health;

  function healthBar(v, color) {
    return `<div style="background:var(--bg3);border-radius:4px;height:8px;margin:6px 0 10px;">
      <div style="width:${v}%;height:100%;background:${color};border-radius:4px;transition:width 0.5s;"></div>
    </div>`;
  }
  function tickerList(items, limit=10) {
    if (!items.length) return '<span style="color:var(--text3);font-size:12px">해당 없음</span>';
    return items.slice(0,limit).map(r =>
      `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--border);padding:3px 9px;border-radius:5px;margin:2px;font-family:var(--mono);font-size:12px;">
        <span style="color:var(--accent);font-weight:600;">${r.ticker}</span>
        <span style="color:var(--text3);">${r.rsLineScore}점</span>
      </span>`
    ).join('') + (items.length > limit ? `<div style="color:var(--text3);font-size:11px;margin-top:6px;">+${items.length-limit}개 더</div>` : '');
  }

  if (type === 'price') {
    title.textContent = '📈 가격 폭 — 상세 분석';
    body.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;color:var(--text2);margin-bottom:8px;">
          <b style="color:var(--text)">가격 폭(Price Breadth)</b>이란?<br>
          전체 종목 중 <b>50일 이동평균선(50MA) 위</b>에 있는 종목 비율이에요.<br>
          단기 추세가 살아있는 종목이 얼마나 되는지 보여줘요.
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-family:var(--mono);font-size:22px;font-weight:600;color:${pricePct>=70?'#22c55e':pricePct>=55?'#84cc16':pricePct>=40?'#f59e0b':pricePct>=25?'#f97316':'#ef4444'}">${pricePct}%</span>
            <span style="font-size:12px;color:var(--text3)">${d.above50.length}/${d.data.length}개 상회</span>
          </div>
          ${healthBar(pricePct, pricePct>=70?'#22c55e':pricePct>=55?'#84cc16':pricePct>=40?'#f59e0b':pricePct>=25?'#f97316':'#ef4444')}
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);font-family:var(--mono);">
            <span>0% 위험</span><span>25%</span><span>40%</span><span>55%</span><span>70%+ 강세</span>
          </div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;color:var(--text2);line-height:1.6;">
          💡 <b>읽는 법</b><br>
          • <span style="color:#22c55e">70%+</span> = 강세 전방위 — 대부분 종목이 상승 추세<br>
          • <span style="color:#84cc16">55~70%</span> = 건강한 시장<br>
          • <span style="color:#f59e0b">40~55%</span> = 중립 — 방향성 불명확<br>
          • <span style="color:#f97316">25~40%</span> = 약세 징후<br>
          • <span style="color:#ef4444">25% 미만</span> = 위험 — 대부분 하락 추세
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;margin-bottom:8px;">✅ 50MA 상회 종목 (${d.above50.length}개)</div>
        <div>${tickerList(d.above50.sort((a,b)=>b.rsLineScore-a.rsLineScore))}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;margin-bottom:8px;">❌ 50MA 하회 종목 (${d.below50.length}개)</div>
        <div>${tickerList(d.below50.sort((a,b)=>b.rsLineScore-a.rsLineScore))}</div>
      </div>`;

  } else if (type === 'rs') {
    title.textContent = '🔺 RS 폭 — 상세 분석';
    body.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;color:var(--text2);margin-bottom:8px;">
          <b style="color:var(--text)">RS 폭(RS Breadth)</b>이란?<br>
          전체 종목 중 <b>RS 점수 80 이상</b>인 종목 비율이에요.<br>
          시장 대비 강한 상대강도를 가진 종목이 얼마나 넓게 퍼져있는지 보여줘요.
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-family:var(--mono);font-size:22px;font-weight:600;color:${rsPct>=70?'#22c55e':rsPct>=55?'#84cc16':rsPct>=40?'#f59e0b':rsPct>=25?'#f97316':'#ef4444'}">${rsPct}%</span>
            <span style="font-size:12px;color:var(--text3)">${d.rs80.length}/${d.data.length}개 RS 80+</span>
          </div>
          ${healthBar(rsPct, rsPct>=70?'#22c55e':rsPct>=55?'#84cc16':rsPct>=40?'#f59e0b':rsPct>=25?'#f97316':'#ef4444')}
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);font-family:var(--mono);">
            <span>0% 위험</span><span>25%</span><span>40%</span><span>55%</span><span>70%+ 강세</span>
          </div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;color:var(--text2);line-height:1.6;">
          💡 <b>가격 폭 vs RS 폭 차이</b><br>
          • <b>가격 폭</b> = 단기 추세 (50MA 기준) — 지금 오르고 있나?<br>
          • <b>RS 폭</b> = 상대 강도 (SPY 대비) — 시장보다 강한가?<br>
          • <span style="color:#22c55e">둘 다 높으면</span> = 진짜 광범위 강세<br>
          • <span style="color:#f97316">가격 폭만 높으면</span> = 소수 대형주가 끌어올리는 것
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;margin-bottom:8px;">🔥 RS 80+ 종목 (${d.rs80.length}개)</div>
        <div>${tickerList(d.rs80.sort((a,b)=>b.rsLineScore-a.rsLineScore), 15)}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;margin-bottom:8px;">💤 RS 80 미만 (${d.rs50.length}개)</div>
        <div>${tickerList(d.rs50.sort((a,b)=>b.rsLineScore-a.rsLineScore))}</div>
      </div>`;

  } else if (type === 'health') {
    const sig = health>=70?{icon:'🚀',text:'강한 강세',color:'#22c55e',desc:'대부분 종목이 상승 추세, 적극적 매수 환경'}:
                health>=55?{icon:'✅',text:'건강',color:'#84cc16',desc:'시장이 건강하게 상승 중, 선별적 매수 가능'}:
                health>=40?{icon:'⚠️',text:'중립',color:'#f59e0b',desc:'방향성 불명확, 신중한 접근 필요'}:
                health>=25?{icon:'📉',text:'약세',color:'#f97316',desc:'대부분 하락 추세, 방어적 포지션 권장'}:
                           {icon:'🚨',text:'위험',color:'#ef4444',desc:'광범위 하락, 현금 보유 또는 관망'};
    title.textContent = '🏥 시장 건강도 — 종합 분석';
    body.innerHTML = `
      <div style="text-align:center;padding:16px 0;margin-bottom:16px;background:var(--bg3);border-radius:10px;">
        <div style="font-size:48px;margin-bottom:8px;">${sig.icon}</div>
        <div style="font-size:32px;font-family:var(--mono);font-weight:700;color:${sig.color}">${health}%</div>
        <div style="font-size:16px;color:${sig.color};font-weight:600;margin:4px 0">${sig.text}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">${sig.desc}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div style="background:var(--bg3);border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">📈 가격 폭</div>
          <div style="font-size:20px;font-family:var(--mono);font-weight:600;color:${pricePct>=70?'#22c55e':pricePct>=55?'#84cc16':pricePct>=40?'#f59e0b':'#ef4444'}">${pricePct}%</div>
          <div style="font-size:11px;color:var(--text3)">50MA 상회</div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">🔺 RS 폭</div>
          <div style="font-size:20px;font-family:var(--mono);font-weight:600;color:${rsPct>=70?'#22c55e':rsPct>=55?'#84cc16':rsPct>=40?'#f59e0b':'#ef4444'}">${rsPct}%</div>
          <div style="font-size:11px;color:var(--text3)">RS 80+</div>
        </div>
      </div>
      <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px;color:var(--text2);line-height:1.8;">
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;margin-bottom:8px;">📊 건강도 기준표</div>
        <div><span style="color:#22c55e">🚀 70%+</span> &nbsp;강한 강세 — 적극 매수 환경</div>
        <div><span style="color:#84cc16">✅ 55~70%</span> 건강 — 선별 매수 가능</div>
        <div><span style="color:#f59e0b">⚠️ 40~55%</span> 중립 — 신중, 방향성 확인 필요</div>
        <div><span style="color:#f97316">📉 25~40%</span> 약세 — 방어적 포지션</div>
        <div><span style="color:#ef4444">🚨 0~25%</span> &nbsp;위험 — 현금 보유/관망</div>
      </div>
      <div style="background:var(--bg3);border-radius:8px;padding:12px;font-size:12px;color:var(--text2);line-height:1.6;">
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;margin-bottom:8px;">💡 현재 시장 해석</div>
        ${health >= 70 ? '두 지표 모두 강세권 — 광범위한 강세장으로 공격적 매수 환경입니다.' :
          health >= 55 ? '시장이 건강하게 상승 중입니다. RS 강한 종목 위주로 선별 진입이 유리합니다.' :
          health >= 40 ? '가격 폭과 RS 폭이 엇갈리는 구간입니다. 소수 종목이 지수를 끌어올릴 수 있어 주의가 필요합니다.' :
          health >= 25 ? '대부분 종목이 약세입니다. 신규 진입보다 기존 포지션 관리에 집중하세요.' :
          '광범위한 하락장입니다. 현금 비중을 높이고 관망을 권장합니다.'}
        <br><br>
        ${pricePct >= 70 && rsPct < 40 ? '⚠️ <b>주의:</b> 가격 폭은 높지만 RS 폭이 낮습니다. 소수 대형주가 지수를 끌어올리는 패턴일 수 있습니다.' :
          pricePct < 40 && rsPct >= 70 ? '💡 RS 폭이 가격 폭보다 높습니다. 상대강도 선행 신호일 수 있어 주목하세요.' :
          pricePct >= 55 && rsPct >= 55 ? '✅ 두 지표가 모두 건강권 이상입니다. 건강한 상승장 신호입니다.' : ''}
      </div>`;
  }

  modal.style.display = 'flex';
};

// ── Market Pulse 계산 ──
function updateMarketPulse(data) {
  if (!data || !data.length) return;

  // 1. 가격 폭: 50MA 상회 비율 (Stage S2 = 50MA 위라고 근사)
  const above50ma = data.filter(r => r.stage === 'S2' || r.stage === 'S1→S2').length;
  const pricePct = Math.round((above50ma / data.length) * 100);

  // 2. RS 폭: RS 80+ 종목 비율
  const rs80plus = data.filter(r => r.rsLineScore >= 80).length;
  const rsPct = Math.round((rs80plus / data.length) * 100);

  // 3. 종합 건강도
  const health = Math.round((pricePct * 0.5) + (rsPct * 0.5));

  // 색상 결정
  function getClass(v) {
    if (v >= 70) return 'strong';
    if (v >= 55) return 'good';
    if (v >= 40) return 'neutral';
    if (v >= 25) return 'weak';
    return 'danger';
  }
  function getLabel(v) {
    if (v >= 70) return '강한 강세';
    if (v >= 55) return '건강';
    if (v >= 40) return '중립';
    if (v >= 25) return '약세';
    return '위험';
  }
  function getSignal(v) {
    if (v >= 70) return { icon: '🚀', text: '강세 진입', color: '#22c55e' };
    if (v >= 55) return { icon: '✅', text: '건강', color: '#84cc16' };
    if (v >= 40) return { icon: '⚠️', text: '중립', color: '#f59e0b' };
    if (v >= 25) return { icon: '📉', text: '약세', color: '#f97316' };
    return { icon: '🚨', text: '위험', color: '#ef4444' };
  }

  const pc = getClass(pricePct);
  const rc = getClass(rsPct);
  const hc = getClass(health);
  const sig = getSignal(health);

  // 데이터 저장 (모달에서 사용)
  pulseData = {
    data, pricePct, rsPct, health,
    above50: data.filter(r => r.stage === 'S2' || r.stage === 'S1→S2'),
    below50: data.filter(r => r.stage !== 'S2' && r.stage !== 'S1→S2'),
    rs80:  data.filter(r => r.rsLineScore >= 80),
    rs50:  data.filter(r => r.rsLineScore < 80),
  };

  // 업데이트
  const el = id => document.getElementById(id);
  if (!el('priceBreadth')) return;

  el('priceBreadth').textContent = pricePct + '%';
  el('priceBreadth').className = `pulse-value health-${pc}`;
  el('priceBreadthSub').textContent = `${above50ma}/${data.length}개 · 50MA 상회`;
  el('priceBreadthBar').style.width = pricePct + '%';
  el('priceBreadthBar').className = `pulse-bar-fill bar-${pc}`;

  el('rsBreadth').textContent = rsPct + '%';
  el('rsBreadth').className = `pulse-value health-${rc}`;
  el('rsBreadthSub').textContent = `${rs80plus}/${data.length}개 · RS ≥ 80`;
  el('rsBreadthBar').style.width = rsPct + '%';
  el('rsBreadthBar').className = `pulse-bar-fill bar-${rc}`;

  el('healthScore').textContent = health + '%';
  el('healthScore').className = `pulse-value health-${hc}`;
  el('healthLabel').textContent = getLabel(health);
  el('healthBar').style.width = health + '%';
  el('healthBar').className = `pulse-bar-fill bar-${hc}`;

  el('signalDot').textContent = sig.icon;
  el('signalDot').style.borderColor = sig.color;
  el('signalText').textContent = sig.text;
  el('signalText').className = `pulse-signal-text health-${hc}`;
}

const API = window.location.hostname==='localhost'?'http://localhost:3000':'https://rsscan-production.up.railway.app';

const state = {
  mode: 'etf',
  etfData:[], stockData:[], myData:[],
  filtered:[],
  starred: new Set(JSON.parse(localStorage.getItem('starred')||'[]')),
  myTickers: JSON.parse(localStorage.getItem('myTickers')||'[]'),
  sortKey:'rsLineScore', sortAsc:false,
  stageFilter:'all', phaseFilter:'all', sectorFilter:'all',
  signalFilters: new Set(),
  search:'', loading:false,
  alerts: JSON.parse(localStorage.getItem('alertSettings')||'null'),
};

const $=id=>document.getElementById(id);
const fmt=v=>v==null?'—':(v>=0?'+':'')+v.toFixed(2)+'%';
const scoreClass=s=>s===100?'score-100':s>=90?'score-90':s>=80?'score-80':s>=70?'score-70':'score-low';
const phaseClass=p=>['ph0','ph1','ph2','ph3','ph4','ph5'][Math.min(p,5)];
const phaseSymbol=p=>p>=2?'●':p===1?'△':'●';
const stageClass=s=>s==='S2초'?'stage-s2x':s?.includes('→')?'stage-s12':'stage-s2';

function showToast(msg,type='ok'){
  const t=$('toast');t.textContent=msg;t.className=`toast show ${type}`;
  clearTimeout(t._tid);t._tid=setTimeout(()=>t.className='toast',2800);
}
function formatChg(v){
  if(v==null)return '<span class="chg-neu">—</span>';
  return `<span class="${v>0?'chg-pos':v<0?'chg-neg':'chg-neu'}">${fmt(v)}</span>`;
}

// ── 모드 전환 ──
window.switchMode=function(mode){
  state.mode=mode;
  const tabs={etf:'tabETF',stock:'tabStock',my:'tabMy'};
  const bars={etf:'etfFilterBar',stock:'stockFilterBar',my:'myFilterBar'};
  Object.keys(tabs).forEach(m=>{
    const tab=$(tabs[m]);
    const bar=$(bars[m]);
    if(tab) tab.classList.toggle('active',m===mode);
    if(bar) bar.style.display=m===mode?'block':'none';
  });
  $('thCat').textContent=mode==='etf'?'자산군':'섹터';
  if(mode==='stock'&&!state.stockData.length) loadStocks();
  else if(mode==='my'){
    renderMyTickers();
    if(state.myTickers.length&&!state.myData.length) loadMyStocks();
    else applyFilters();
  }
  else applyFilters();
};

// ── 데이터 로드 ──
async function loadData(){
  if(state.loading)return;
  state.loading=true;
  $('tableBody').innerHTML='<tr><td colspan="15" class="loading-row"><div class="spinner"></div> 야후 파이낸스 데이터 수집 중...</td></tr>';
  $('refreshBtn').classList.add('spinning');
  try{
    const res=await fetch(`${API}/api/etfs`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.error);
    state.etfData=json.data;
    const d=new Date(json.updatedAt);
    $('lastUpdate').textContent=`업데이트: ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    applyFilters();
    updateMarketPulse(json.data);
    showToast(`✓ ETF ${json.count}개 로드 완료`);
  }catch(err){
    $('tableBody').innerHTML=`<tr><td colspan="15" class="loading-row" style="color:var(--red)">⚠ ${err.message}</td></tr>`;
    showToast('데이터 로드 실패','err');
  }finally{state.loading=false;$('refreshBtn').classList.remove('spinning');}
}

async function loadStocks(){
  if(state.loading)return;
  state.loading=true;
  $('tableBody').innerHTML='<tr><td colspan="15" class="loading-row"><div class="spinner"></div> 주식 데이터 수집 중... (1~2분)</td></tr>';
  try{
    const res=await fetch(`${API}/api/stocks`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.error);
    state.stockData=json.data;
    applyFilters();
    updateMarketPulse(json.data);
    showToast(`✓ 주식 ${json.count}개 로드 완료`);
  }catch(err){
    $('tableBody').innerHTML=`<tr><td colspan="15" class="loading-row" style="color:var(--red)">⚠ ${err.message}</td></tr>`;
    showToast('주식 데이터 로드 실패','err');
  }finally{state.loading=false;}
}

async function loadMyStocks(){
  if(!state.myTickers.length){
    $('tableBody').innerHTML='<tr><td colspan="15" class="loading-row" style="color:var(--text3)">+ 종목 추가 버튼으로 관심 종목을 추가해보세요!</td></tr>';
    return;
  }
  if(state.loading)return;
  state.loading=true;
  $('tableBody').innerHTML=`<tr><td colspan="15" class="loading-row"><div class="spinner"></div> ${state.myTickers.join(', ')} 데이터 수집 중...</td></tr>`;
  try{
    const res=await fetch(`${API}/api/mystocks`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({tickers:state.myTickers})
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.error);
    state.myData=json.data;
    applyFilters();
    showToast(`✓ 내 종목 ${json.count}개 로드 완료`);
  }catch(err){
    $('tableBody').innerHTML=`<tr><td colspan="15" class="loading-row" style="color:var(--red)">⚠ ${err.message}</td></tr>`;
    showToast('내 종목 로드 실패','err');
  }finally{state.loading=false;}
}

// ── 필터 & 정렬 ──
function applyFilters(){
  let d=state.mode==='etf'?[...state.etfData]:state.mode==='stock'?[...state.stockData]:[...state.myData];
  if(state.mode==='etf'){
    if(state.stageFilter!=='all') d=d.filter(r=>r.stage===state.stageFilter);
    if(state.phaseFilter!=='all') d=d.filter(r=>String(r.phase)===state.phaseFilter);
    if(state.signalFilters.size>0) d=d.filter(r=>[...state.signalFilters].every(s=>r[s]));
  }else if(state.mode==='stock'){
    if(state.sectorFilter!=='all') d=d.filter(r=>r.cat===state.sectorFilter||r.sector===state.sectorFilter);
  }
  if(state.search){const q=state.search.toUpperCase();d=d.filter(r=>r.ticker.includes(q)||r.name?.toUpperCase().includes(q));}
  d.sort((a,b)=>{
    let av=a[state.sortKey]??-Infinity,bv=b[state.sortKey]??-Infinity;
    if(typeof av==='string')av=av.toLowerCase();if(typeof bv==='string')bv=bv.toLowerCase();
    return state.sortAsc?(av>bv?1:-1):(av<bv?1:-1);
  });
  state.filtered=d;
  renderTable();
  const cntId=state.mode==='etf'?'resultCount':state.mode==='stock'?'stockResultCount':'myResultCount';
  const el=$(cntId);if(el)el.textContent=d.length;
}

// ── 렌더 ──
function renderTable(){
  const tbody=$('tableBody');
  if(!state.filtered.length){
    tbody.innerHTML='<tr><td colspan="15" class="loading-row">검색 결과 없음</td></tr>';return;
  }
  tbody.innerHTML=state.filtered.map(r=>{
    const starred=state.starred.has(r.ticker);
    const pats=(r.patterns||[]).map(p=>`<span class="td-pattern">${p}</span>`).join('')||'—';
    const sigs=[
      r.acceleration?'<span class="sig sig-accel">⚡가속</span>':'',
      r.priceHigh?'<span class="sig sig-ph">📈신고</span>':'',
      r.rsHigh?'<span class="sig sig-rsh">🔺RS</span>':''
    ].filter(Boolean).join('');
    const priceStr=r.price?`<span style="font-family:var(--mono);font-size:11px;color:var(--text3)">$${r.price.toFixed(2)}</span>`:'';
    const catLabel=(state.mode==='stock'||state.mode==='my')?(r.sector||r.cat):r.cat;
    return `<tr>
      <td><span class="td-star ${starred?'starred':''}" data-ticker="${r.ticker}">${starred?'★':'☆'}</span></td>
      <td><span class="td-ticker">${r.ticker}</span> ${priceStr}</td>
      <td class="td-name">${r.name||''}</td>
      <td><span class="td-cat">${catLabel||''}</span></td>
      <td>${pats}</td>
      <td class="td-rs">${r.ibdRS??'—'}</td>
      <td class="td-rs">${r.rsNow??'—'}</td>
      <td><span class="${stageClass(r.stage)}">${r.stage||'—'}</span></td>
      <td><span class="phase-dot ${phaseClass(r.phase)}">${phaseSymbol(r.phase)} ${r.phaseLabel||''}</span></td>
      <td>${formatChg(r.w1)}</td><td>${formatChg(r.w3)}</td><td>${formatChg(r.w6)}</td><td>${formatChg(r.w10)}</td>
      <td><div class="sig-wrap">${sigs||'<span style="color:var(--text3)">—</span>'}</div></td>
      <td class="${scoreClass(r.rsLineScore)} score-cell">${r.rsLineScore}</td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.td-star').forEach(el=>{
    el.addEventListener('click',e=>{
      const t=e.target.dataset.ticker;
      if(state.starred.has(t))state.starred.delete(t);else state.starred.add(t);
      localStorage.setItem('starred',JSON.stringify([...state.starred]));
      renderTable();
    });
  });
}

// ── 내 종목 ──
function renderMyTickers(){
  const el=$('myTickerTags');if(!el)return;
  el.innerHTML=state.myTickers.map(t=>`
    <span style="background:var(--amber-dim);border:1px solid var(--amber);color:var(--amber);padding:2px 10px;border-radius:5px;font-family:var(--mono);font-size:12px;display:flex;align-items:center;gap:5px;">
      ${t} <span onclick="removeMy('${t}')" style="cursor:pointer;opacity:0.7">✕</span>
    </span>`).join('');
}

function renderCurrentTickers(){
  const el=$('currentTickerList');if(!el)return;
  if(!state.myTickers.length){el.innerHTML='<span style="color:var(--text3);font-size:12px">아직 추가된 종목이 없어요</span>';return;}
  el.innerHTML=state.myTickers.map(t=>`
    <span style="background:var(--bg3);border:1px solid var(--border);padding:3px 10px;border-radius:5px;font-family:var(--mono);font-size:12px;display:flex;align-items:center;gap:6px;">
      ${t} <span onclick="removeMy('${t}')" style="cursor:pointer;color:var(--red)">✕</span>
    </span>`).join('');
}

window.removeMy=function(ticker){
  state.myTickers=state.myTickers.filter(t=>t!==ticker);
  state.myData=state.myData.filter(d=>d.ticker!==ticker);
  localStorage.setItem('myTickers',JSON.stringify(state.myTickers));
  renderMyTickers();renderCurrentTickers();applyFilters();
};

function addMyTickers(){
  const input=$('newTickerInput').value.trim();if(!input)return;
  const newOnes=input.toUpperCase().split(',').map(t=>t.trim()).filter(Boolean);
  state.myTickers=[...new Set([...state.myTickers,...newOnes])];
  localStorage.setItem('myTickers',JSON.stringify(state.myTickers));
  $('newTickerInput').value='';
  renderMyTickers();renderCurrentTickers();
  showToast(`✓ ${newOnes.length}개 종목 추가됨`);
}

// ── 알림 ──
function loadAlertSettings(){
  const s=state.alerts;if(!s)return;
  if(s.token)$('tgToken').value=s.token;
  if(s.chatId)$('tgChatId').value=s.chatId;
  if(s.threshold){$('rsThreshold').value=s.threshold;$('rsThresholdVal').textContent=s.threshold;}
  if(s.conditions){
    $('cond-phase-change').checked=s.conditions.phaseChange??true;
    $('cond-rs-high').checked=s.conditions.rsHigh??true;
    $('cond-accel').checked=s.conditions.accel??true;
    $('cond-price-high').checked=s.conditions.priceHigh??false;
  }
}
function saveAlertSettings(){
  const settings={
    token:$('tgToken').value.trim(),chatId:$('tgChatId').value.trim(),
    threshold:parseInt($('rsThreshold').value),
    conditions:{phaseChange:$('cond-phase-change').checked,rsHigh:$('cond-rs-high').checked,accel:$('cond-accel').checked,priceHigh:$('cond-price-high').checked}
  };
  state.alerts=settings;localStorage.setItem('alertSettings',JSON.stringify(settings));
  fetch(`${API}/api/alerts/config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)}).catch(()=>{});
  $('alertModal').style.display='none';$('alertBadge').style.display='flex';
  showToast('✓ 알림 설정 저장됨');
}
async function sendTestAlert(){
  const token=$('tgToken').value.trim(),chatId=$('tgChatId').value.trim(),res=$('testResult');
  if(!token||!chatId){res.textContent='⚠ Bot Token과 Chat ID를 입력하세요';res.className='test-result err';return;}
  res.textContent='전송 중...';res.className='test-result';
  try{
    const r=await fetch(`${API}/api/alerts/test`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,chatId})});
    const json=await r.json();if(!json.ok)throw new Error(json.error);
    res.textContent='✓ 전송 성공!';res.className='test-result ok';
  }catch(err){res.textContent=`✗ ${err.message}`;res.className='test-result err';}
}

// ── 이벤트 ──
function bindEvents(){
  document.querySelectorAll('[data-group="stage"]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-group="stage"]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');state.stageFilter=btn.dataset.value;applyFilters();
  }));
  document.querySelectorAll('[data-group="phase"]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-group="phase"]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');state.phaseFilter=btn.dataset.value;applyFilters();
  }));
  document.querySelectorAll('[data-group="sector"]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-group="sector"]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');state.sectorFilter=btn.dataset.value;applyFilters();
  }));
  document.querySelectorAll('.signal-btn').forEach(btn=>btn.addEventListener('click',()=>{
    const sig=btn.dataset.signal;
    if(state.signalFilters.has(sig)){state.signalFilters.delete(sig);btn.classList.remove('active');}
    else{state.signalFilters.add(sig);btn.classList.add('active');}
    applyFilters();
  }));
  document.querySelectorAll('.sort-btn').forEach(btn=>btn.addEventListener('click',()=>{
    const key=btn.dataset.sort;state.sortAsc=state.sortKey===key?!state.sortAsc:false;state.sortKey=key;
    document.querySelectorAll('.sort-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');applyFilters();
  }));
  document.querySelectorAll('.th-sort').forEach(th=>th.addEventListener('click',()=>{
    const col=th.dataset.col;state.sortAsc=state.sortKey===col?!state.sortAsc:false;state.sortKey=col;
    document.querySelectorAll('.th-sort').forEach(t=>t.classList.remove('active'));
    th.classList.add('active');applyFilters();
  }));
  ['searchInput','stockSearchInput','mySearchInput'].forEach(id=>{
    const el=$(id);if(el)el.addEventListener('input',e=>{state.search=e.target.value.trim();applyFilters();});
  });
  $('refreshBtn').addEventListener('click',()=>{
    if(state.mode==='etf')loadData();else if(state.mode==='stock')loadStocks();else loadMyStocks();
  });
  $('alertSettingsBtn').addEventListener('click',()=>{$('alertModal').style.display='flex';loadAlertSettings();});
  $('modalClose').addEventListener('click',()=>$('alertModal').style.display='none');
  $('alertModal').addEventListener('click',e=>{if(e.target===$('alertModal'))$('alertModal').style.display='none';});
  $('rsThreshold').addEventListener('input',e=>$('rsThresholdVal').textContent=e.target.value);
  $('testAlertBtn').addEventListener('click',sendTestAlert);
  $('saveAlertBtn').addEventListener('click',saveAlertSettings);
  const openBtn=$('openAddModal');
  if(openBtn)openBtn.addEventListener('click',()=>{renderCurrentTickers();$('addTickerModal').style.display='flex';});
  const closeBtn=$('addTickerClose');
  if(closeBtn)closeBtn.addEventListener('click',()=>$('addTickerModal').style.display='none');
  const addBtn=$('addTickerBtn');
  if(addBtn)addBtn.addEventListener('click',addMyTickers);
  const inp=$('newTickerInput');
  if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter')addMyTickers();});
  const loadBtn=$('loadMyBtn');
  if(loadBtn)loadBtn.addEventListener('click',()=>{$('addTickerModal').style.display='none';loadMyStocks();});
}

function init(){
  bindEvents();
  if(state.alerts?.token)$('alertBadge').style.display='flex';
  if(state.myTickers.length)renderMyTickers();
  loadData();
  setInterval(()=>{if(state.mode==='etf')loadData();},30*60*1000);
}

document.addEventListener('DOMContentLoaded',init);
