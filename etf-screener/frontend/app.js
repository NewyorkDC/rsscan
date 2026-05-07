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
