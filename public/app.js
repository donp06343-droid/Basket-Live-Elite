(function(){
const $=id=>document.getElementById(id);
const keys=['fga','fgm','3pa','3pm','fta','ftm','orb','drb','tov','ast','stl','blk'];
const labels={fga:'FGA',fgm:'FGM','3pa':'3PA','3pm':'3PM',fta:'FTA',ftm:'FTM',orb:'ORB',drb:'DRB',tov:'TOV',ast:'AST',stl:'STL',blk:'BLK'};
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function num(id){const v=Number($(id)?.value);return Number.isFinite(v)?v:0;}
function ars(n){try{return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n);}catch{return '$ '+Math.round(n);}}
function elapsed(){const pl=num('periodLength')||10;const per=String($('period')?.value||'1');const clock=String($('clock')?.value||'10:00');const [mm,ss]=(clock.match(/^(\d{1,2}):(\d{2})$/)||['0','10','0']).slice(1).map(Number);const left=mm+ss/60;const p=per==='OT'?4:Math.max(1,Math.min(4,+per||1));return (p-1)*pl+(pl-Math.min(pl,Math.max(0,left)));}
let lastModel=null,prevModel=null,lastPaceKey=null,liveWatchTimer=null,selectedImage=null;
function notifyAction(msg,force){try{if(!('Notification' in window))return;if(Notification.permission==='granted')new Notification('Basket Live Elite',{body:msg});else if(force&&Notification.permission!=='denied')Notification.requestPermission();}}catch{}
function ensureNotifyPermission(){try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();}catch{}}
function renderKelly(){const box=$('kellyResult');if(!box)return;if(!lastModel||!lastModel.best){box.innerHTML='Corré el modelo con cuotas.';return;}const b=lastModel.best;const bank=Number($('bankroll')?.value)||0;const stake=Math.round(bank*(lastModel.stakePct||0));box.innerHTML=`Mejor: <b>${esc(b.name)}</b> @ ${b.odds.toFixed(2)} · EV ${(b.ev*100).toFixed(1)}%<br>Stake máx: <b>${ars(stake)}</b> (${((lastModel.stakePct||0)*100).toFixed(2)}% bankroll)`;}
function runModel(){
  if(typeof BLM==='undefined'){if($('modelOut'))$('modelOut').textContent='Modelo no cargado.';return;}
  ensureNotifyPermission();
  const d={ptsA:num('ptsA'),ptsB:num('ptsB'),elapsed:elapsed(),periodLength:num('periodLength')||10,teamA:($('teamA')?.value||'').trim(),teamB:($('teamB')?.value||'').trim()};
  const inp={line:Number($('lineTotal')?.value)||null,over:Number($('oddsOver')?.value)||null,under:Number($('oddsUnder')?.value)||null,oA:Number($('oddsA')?.value)||null,oB:Number($('oddsB')?.value)||null,pA:Number($('preA')?.value)||null,pB:Number($('preB')?.value)||null,kf:Number($('kellyFrac')?.value)||0.25,maxStakePct:0.025,ctx:window.__bleTeamCtx||null};
  prevModel=lastModel;const out=BLM.analyze(d,inp,prevModel);lastModel=out;
  const tr=BLM.record(d.elapsed,d.ptsA+d.ptsB);const pa=$('paceAlert');
  if(pa){if(tr.ok&&tr.alert&&tr.key!==lastPaceKey){lastPaceKey=tr.key;pa.className='status warn';pa.textContent='⚡ '+tr.msg;pa.classList.remove('hidden');notifyAction('Ritmo: '+tr.msg,true);}else if(!tr.ok||!tr.alert)pa.classList.add('hidden');}
  const actionMap={ENTER:{cls:'enter',label:'ENTRAR'},HOLD:{cls:'hold',label:'HOLD / ESPERAR'},NO_ENTER:{cls:'no',label:'NO ENTRAR'},CASH_OUT:{cls:'cash',label:'⚠ CASH-OUT / ASEGURAR'}};
  const act=actionMap[out.action]||actionMap.HOLD;
  let html=`<div class="rec ${act.cls}">${act.label}</div>`;
  html+=`<div class="small" style="text-align:center;margin-top:4px">${esc(out.actionReason||'')} · riesgo ${esc(out.riskLevel||'')}</div>`;
  if(out.best){const b=out.best;html+=`<div class="note" style="margin-top:8px">Mejor mercado: <b>${esc(b.name)}</b> @ ${b.odds.toFixed(2)} · P ${(b.p*100).toFixed(1)}% · EV ${(b.ev*100).toFixed(1)}%`+(out.stakePct!=null?`<br>Stake máx: <b>${ars(Math.round((Number($('bankroll')?.value)||0)*out.stakePct))}</b> (${(out.stakePct*100).toFixed(2)}% bankroll)`:'')+'</div>';}
  if(out.report&&out.report.length){out.report.forEach(sec=>{html+=`<div class="note" style="margin-top:10px"><b>${esc(sec.title)}</b><ul style="margin:6px 0 0;padding-left:18px">`;(sec.bullets||[]).forEach(b=>{html+=`<li>${esc(b)}</li>`;});html+='</ul></div>';});}
  else{html+=(out.lines||[]).map(l=>'<div>'+esc(l)+'</div>').join('');}
  if(out.blockers?.length)html+='<div class="status warn" style="margin-top:8px"><b>Filtros:</b> '+out.blockers.map(esc).join(' · ')+'</div>';
  const q=encodeURIComponent(d.teamA+' '+d.teamB+' basket');
  html+=`<div class="note" style="margin-top:10px"><b>Fuentes en vivo</b><br><a class="link" href="https://www.sofascore.com/search?q=${q}" target="_blank" rel="noopener">SofaScore</a> · <a class="link" href="https://www.flashscore.com.ar/busqueda/?q=${q}" target="_blank" rel="noopener">Flashscore</a> · <a class="link" href="https://sportscore.com/" target="_blank" rel="noopener">SportScore</a></div>`;
  if($('modelOut'))$('modelOut').innerHTML=html||'Sin datos.';
  renderKelly();try{refreshAssistant();}catch(e){}
  if(prevModel&&prevModel.action!==out.action){if(out.action==='CASH_OUT')notifyAction('CASH-OUT: '+(out.actionReason||'proteger'),true);else if(out.action==='ENTER')notifyAction('Edge: '+(out.best?out.best.name:''),true);}
}
if($('runModel'))$('runModel').onclick=runModel;
function buildLocalTips(){
  const tips=[];const ptsA=num('ptsA'),ptsB=num('ptsB'),el=elapsed(),diff=ptsA-ptsB;
  const line=Number($('lineTotal')?.value)||0;const over=Number($('oddsOver')?.value)||0,under=Number($('oddsUnder')?.value)||0;
  const action=lastModel?.action||'HOLD',proj=lastModel?.projFinal||lastModel?.m?.proj||0,rate=lastModel?.rate||lastModel?.m?.rate||0,best=lastModel?.best;
  if(el<8)tips.push('Menos de 8 min: priorizá HOLD.');
  if(line>0&&proj>0){const gap=Math.abs(proj-line);if(gap<2)tips.push('Proyección pegada a la línea: edge bajo.');else if(gap>=6)tips.push('Brecha proyección–línea ~'+gap.toFixed(1)+' pts.');if(proj>line+3&&over>=1.01)tips.push('Modelo inclina Over @ '+over.toFixed(2));if(proj<line-3&&under>=1.01)tips.push('Modelo inclina Under @ '+under.toFixed(2));}
  if(best)tips.push('Mejor mercado: '+best.name+' · EV '+((best.ev||0)*100).toFixed(1)+'%');
  if(action==='ENTER')tips.push('ENTRAR solo si EV≥5% y stake ≤2.5% bankroll.');
  if(action==='CASH_OUT')tips.push('CASH-OUT: asegurar reduce regalar ganancia.');
  if(action==='NO_ENTER')tips.push('NO ENTRAR es correcto cuando no hay valor.');
  if(Math.abs(diff)>=12&&el>=20)tips.push('Ventaja grande: ML poco valor; mirá totales.');
  if(rate>0&&rate<2.8)tips.push('Ritmo bajo: Under más atractivo.');
  if(rate>=3.6)tips.push('Ritmo alto: Over con más chance si no frena.');
  if(!over&&!under)tips.push('Sin cuotas: el pronóstico puro sigue válido. Completá Over/Under o Gana A/B.');
  if(!tips.length)tips.push('Actualizá marcador. Con más minutos el modelo se afina.');
  return tips;
}
async function refreshAssistant(){
  const box=$('assistantBox');if(!box)return;
  const local=buildLocalTips();
  box.innerHTML='<ul style="margin:0;padding-left:18px">'+local.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>';
  try{const payload={ptsA:num('ptsA'),ptsB:num('ptsB'),elapsed:elapsed(),line:Number($('lineTotal')?.value)||0,action:lastModel?.action||'HOLD',proj:lastModel?.projFinal||lastModel?.m?.proj||0};
    const r=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok)return;const d=await r.json();if(d.ok&&d.tips&&d.tips.length){const merged=[...new Set([...local,...d.tips])];box.innerHTML='<ul style="margin:0;padding-left:18px">'+merged.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>';}
  }catch(e){}
}
// Tabs
document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));btn.classList.add('active');const p=$(btn.dataset.tab);if(p)p.classList.add('active');});
// Minimal calculate/summary
function calculate(){const a=num('ptsA'),b=num('ptsB'),el=elapsed();const box=$('summary');if(box)box.innerHTML=`<h2>Resumen</h2><p><b>${esc($('teamA')?.value||'A')}</b> ${a} – ${b} <b>${esc($('teamB')?.value||'B')}</b> · ${el.toFixed(1)}' jugados</p>`;try{runModel();}catch(e){}}
if($('calc'))$('calc').onclick=calculate;if($('calc2'))$('calc2').onclick=calculate;
// OCR odds helpers + apply stub (full OCR remains if present in longer builds)
function parseOcrText(text){
  const t=(text||'').replace(/\u00a0/g,' ');
  const set=(id,v)=>{const el=$(id);if(el&&v!=null&&v!=='')el.value=v;};
  let sm,re=/(\d{1,3})\s*[:\-–]\s*(\d{1,3})/g;const cands=[];
  while((sm=re.exec(t))){const a=+sm[1],b=+sm[2];if(a<=160&&b<=160)cands.push({a,b,s:a+b});}
  cands.sort((x,y)=>y.s-x.s);if(cands[0]){set('ocrPtsA',cands[0].a);set('ocrPtsB',cands[0].b);}
  const clocks=[...t.matchAll(/\b([0-2]?\d):([0-5]\d)\b/g)].map(m=>m[0]);if(clocks[0])set('ocrClock',clocks[0]);
  const per=t.match(/\b([1-4])\s*(?:st|nd|rd|th)?\s*(?:quarter|cuarto|qtr)/i)||t.match(/\b(?:Q|P)\s*([1-4])\b/i);if(per)set('ocrPeriod',String(per[1]));
  const lineM=t.match(/(?:total|línea|linea|over\/under)[^0-9]{0,12}(\d{2,3}[.,]\d)/i)||t.match(/\b(1\d{2}[.,]5)\b/);
  if(lineM&&$('lineTotal'))$('lineTotal').value=lineM[1].replace(',','.');
  const decOdds=[...t.matchAll(/\b([1-9][.,]\d{2})\b/g)].map(m=>parseFloat(m[1].replace(',','.'))).filter(x=>x>=1.10&&x<=15);
  if(decOdds.length>=2){const uniq=[...new Set(decOdds.map(x=>Math.round(x*100)/100))].sort((a,b)=>a-b);
    if($('oddsOver')&&!$('oddsOver').value)$('oddsOver').value=String(uniq[0]);
    if($('oddsUnder')&&!$('oddsUnder').value)$('oddsUnder').value=String(uniq[Math.min(1,uniq.length-1)]);
    if($('oddsA')&&!$('oddsA').value&&uniq[0]<=2.5){$('oddsA').value=String(uniq[0]);if($('oddsB')&&!$('oddsB').value)$('oddsB').value=String(uniq[uniq.length-1]);}}
  if($('ocrText'))$('ocrText').value=t.slice(0,2000);
}
if($('imageInput'))$('imageInput').onchange=e=>{selectedImage=e.target.files&&e.target.files[0];if($('readImage'))$('readImage').disabled=!selectedImage;if(selectedImage&&$('preview')){$('preview').src=URL.createObjectURL(selectedImage);$('preview').classList.remove('hidden');}};
if($('readImage'))$('readImage').onclick=async()=>{if(!selectedImage||typeof Tesseract==='undefined'){if($('ocrStatus'))$('ocrStatus').textContent='Tesseract no disponible.';return;}if($('ocrStatus'))$('ocrStatus').textContent='OCR…';
  try{const result=await Tesseract.recognize(selectedImage,'spa+eng');parseOcrText(result.data.text||'');if($('ocrStatus')){$('ocrStatus').textContent='OCR listo. Revisá y aplicá.';$('ocrStatus').className='status success';}}catch(e){if($('ocrStatus'))$('ocrStatus').textContent='Error OCR: '+e.message;}};
if($('applyOCR'))$('applyOCR').onclick=()=>{if($('ocrTeamA')?.value)$('teamA').value=$('ocrTeamA').value;if($('ocrTeamB')?.value)$('teamB').value=$('ocrTeamB').value;
  if($('ocrPtsA')?.value)$('ptsA').value=$('ocrPtsA').value;if($('ocrPtsB')?.value)$('ptsB').value=$('ocrPtsB').value;
  if($('ocrPeriod')?.value)$('period').value=$('ocrPeriod').value;if($('ocrClock')?.value)$('clock').value=$('ocrClock').value;
  calculate();document.querySelector('[data-tab="analysis"]')?.click();};
// Live scores button
if($('btnLiveScores'))$('btnLiveScores').onclick=async()=>{const box=$('liveScoresBox');if(box)box.textContent='Buscando…';
  try{const r=await fetch('/api/live-scores?teamA='+encodeURIComponent($('teamA')?.value||'')+'&teamB='+encodeURIComponent($('teamB')?.value||''));const d=await r.json();
    if(!box)return;if(!d.ok||!d.matches?.length){box.innerHTML='<span class="muted">'+(d.note||'Sin resultados')+'</span>';return;}
    box.innerHTML=d.matches.slice(0,8).map(m=>`<div class="match"><b>${esc(m.home)}</b> ${m.homeScore??'-'} – ${m.awayScore??'-'} <b>${esc(m.away)}</b> · ${esc(m.status||'')} <span class="small">${esc(m.source||'')}</span></div>`).join('');
  }catch(e){if(box)box.textContent='Error: '+e.message;}};
// Server health
async function checkServer(){const s=$('srvStatus');if(!s)return;try{const r=await fetch('/api/health');const d=await r.json();s.textContent='Online · '+(d.version||'')+' · '+new Date(d.timestamp||Date.now()).toLocaleTimeString();s.className='status success';}catch{s.textContent='Sin conexión al API';s.className='status danger';}}
checkServer();
// Boot
try{calculate();}catch(e){}
})();
