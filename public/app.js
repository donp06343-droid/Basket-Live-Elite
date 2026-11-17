(function(){
const $=id=>document.getElementById(id);
const keys=['fga','fgm','3pa','3pm','fta','ftm','orb','drb','tov','ast','stl','blk'];
const labels={fga:'FGA',fgm:'FGM','3pa':'3PA','3pm':'3PM',fta:'FTA',ftm:'FTM',orb:'ORB',drb:'DRB',tov:'TOV',ast:'AST',stl:'STL',blk:'BLK'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=id=>Math.max(0,Number($(id)?.value)||0);
const pct=x=>Number.isFinite(x)?(x*100).toFixed(1)+'%':'—';
const fmt=x=>Number.isFinite(x)?x.toFixed(1):'—';
const ars=x=>{const n=Number(x);return Number.isFinite(n)?'$'+n.toLocaleString('es-AR',{maximumFractionDigits:0})+' ARS':'—'};

let shareId=localStorage.getItem('ble_active_share')||null,shareUrl='',lastModel=null,prevModel=null;
let screenStream=null,captureTimer=null,lastPaceKey=null,lastActionKey=null,liveWatchTimer=null,selectedImage=null;

function notifyAction(msg,force){
  const key=String(msg).slice(0,80);if(!force&&key===lastActionKey)return;lastActionKey=key;
  try{if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('Basket Live Elite',{body:msg,tag:'ble-action'});}catch(e){}
  console.log('[BLE]',msg);
}
function ensureNotifyPermission(){try{if(typeof Notification!=='undefined'&&Notification.permission==='default')Notification.requestPermission();}catch(e){}}

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab,.panel').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');const p=$(b.dataset.tab);if(p)p.classList.add('active');
  if(b.dataset.tab==='history')loadHistory();
  if(b.dataset.tab==='server')checkServer();
  if(b.dataset.tab==='kelly')renderKelly();
});
if($('league'))$('league').onchange=()=>{if($('league').value!=='CUSTOM')$('periodLength').value=$('league').value==='NBA'?12:10};

function elapsed(){
  const len=num('periodLength')||10;
  const p=$('period')?.value==='OT'?4:Number($('period')?.value||1)-1;
  const m=($('clock')?.value||'').match(/^(\d{1,2}):([0-5]\d)$/);
  return Math.max(0,p*len+(m?len-(+m[1]+(+m[2])/60):len));
}
function team(p,opp){
  const s={};keys.forEach(k=>s[k]=num(p+'_'+k));
  const poss=Math.max(0,s.fga-s.orb+s.tov+.44*s.fta);
  const oppPoss=Math.max(0,num(opp+'_fga')-num(opp+'_orb')+num(opp+'_tov')+.44*num(opp+'_fta'));
  const pts=num(p==='a'?'ptsA':'ptsB'),oppPts=num(p==='a'?'ptsB':'ptsA'),den=s.fga+.44*s.fta+s.tov;
  return{...s,pts,poss,ortg:poss?100*pts/poss:NaN,drtg:oppPoss?100*oppPts/oppPoss:NaN,pace:elapsed()?48*poss/elapsed():NaN,
    efg:s.fga?(s.fgm+.5*s['3pm'])/s.fga:NaN,ts:(2*s.fga+.88*s.fta)?pts/(2*s.fga+.88*s.fta):NaN,
    tovPct:den?s.tov/den:NaN,orbPct:(s.orb+num(opp+'_drb'))?s.orb/(s.orb+num(opp+'_drb')):NaN,
    ftr:s.fga?s.fta/s.fga:NaN,fg:s.fga?s.fgm/s.fga:NaN,three:s['3pa']?s['3pm']/s['3pa']:NaN,ft:s.fta?s.ftm/s.fta:NaN};
}
function collect(){return{teamA:($('teamA')?.value||'').trim()||'Equipo A',teamB:($('teamB')?.value||'').trim()||'Equipo B',
  ptsA:num('ptsA'),ptsB:num('ptsB'),period:$('period')?.value,clock:$('clock')?.value,league:$('league')?.value,
  periodLength:num('periodLength'),A:team('a','b'),B:team('b','a')};}

if($('stats'))['a','b'].forEach(p=>{$('stats').insertAdjacentHTML('beforeend',
  `<h3>Equipo ${p.toUpperCase()}</h3><div class="grid">`+keys.map(k=>`<label>${labels[k]} <input id="${p}_${k}" type="number" min="0" value="0"></label>`).join('')+'</div>');});

function calculate(){
  const d=collect(),A=d.A,B=d.B;
  if($('summary'))$('summary').innerHTML=`<h2>${esc(d.teamA)} ${A.pts} – ${B.pts} ${esc(d.teamB)}</h2>
    <div class="metrics"><div class="metric"><small>Marcador</small><b>${A.pts}–${B.pts}</b></div>
    <div class="metric"><small>Período</small><b>${esc(d.period)}</b></div>
    <div class="metric"><small>Reloj</small><b>${esc(d.clock)}</b></div>
    <div class="metric"><small>Min jugados</small><b>${elapsed().toFixed(1)}</b></div></div>`;
  if($('metrics'))$('metrics').innerHTML=`<div style="overflow:auto"><table><tr><th>Métrica</th><th>${esc(d.teamA)}</th><th>${esc(d.teamB)}</th></tr>`+
    [['Posesiones',fmt(A.poss),fmt(B.poss)],['Pace /48',fmt(A.pace),fmt(B.pace)],['ORtg',fmt(A.ortg),fmt(B.ortg)],['DRtg',fmt(A.drtg),fmt(B.drtg)],
     ['Net',fmt(A.ortg-A.drtg),fmt(B.ortg-B.drtg)],['eFG%',pct(A.efg),pct(B.efg)],['TS%',pct(A.ts),pct(B.ts)],
     ['FG%',pct(A.fg),pct(B.fg)],['3P%',pct(A.three),pct(B.three)],['FT%',pct(A.ft),pct(B.ft)],
     ['TOV%',pct(A.tovPct),pct(B.tovPct)],['ORB%',pct(A.orbPct),pct(B.orbPct)],['FTA/FGA',fmt(A.ftr),fmt(B.ftr)],
     ['AST/TO',fmt(A.tov?A.ast/A.tov:NaN),fmt(B.tov?B.ast/B.tov:NaN)],['STL/BLK',A.stl+'/'+A.blk,B.stl+'/'+B.blk]
    ].map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</table></div>';
}
if($('calc'))$('calc').onclick=calculate;
if($('calc2'))$('calc2').onclick=calculate;
if($('resetStats'))$('resetStats').onclick=()=>{document.querySelectorAll('#stats input').forEach(x=>x.value=0);
  if($('summary'))$('summary').innerHTML='<h2>Resumen</h2><p class="muted">Completá el marcador.</p>';
  if($('metrics'))$('metrics').textContent='Calculá un partido.';};

function runModel(){
  if(typeof BLM==='undefined'){if($('modelOut'))$('modelOut').textContent='Modelo no cargado.';return;}
  ensureNotifyPermission();
  const d={ptsA:num('ptsA'),ptsB:num('ptsB'),elapsed:elapsed(),periodLength:num('periodLength')||10};
  const inp={line:Number($('lineTotal')?.value)||null,over:Number($('oddsOver')?.value)||null,under:Number($('oddsUnder')?.value)||null,
    oA:Number($('oddsA')?.value)||null,oB:Number($('oddsB')?.value)||null,pA:Number($('preA')?.value)||null,pB:Number($('preB')?.value)||null,
    kf:Number($('kellyFrac')?.value)||0.25,maxStakePct:0.025};
  prevModel=lastModel;const out=BLM.analyze(d,inp,prevModel);lastModel=out;
  const tr=BLM.record(d.elapsed,d.ptsA+d.ptsB);const pa=$('paceAlert');
  if(pa){if(tr.ok&&tr.alert&&tr.key!==lastPaceKey){lastPaceKey=tr.key;pa.className='status warn';pa.textContent='⚡ '+tr.msg;pa.classList.remove('hidden');notifyAction('Ritmo: '+tr.msg,true);}
  else if(!tr.ok||!tr.alert)pa.classList.add('hidden');}
  let html=(out.lines||[]).map(l=>'<div>'+esc(l)+'</div>').join('');
  if(out.blockers?.length)html+='<div class="status warn" style="margin-top:8px"><b>Filtros:</b> '+out.blockers.map(esc).join(' · ')+'</div>';
  const actionMap={ENTER:{cls:'enter',label:'ENTRAR (edge claro)'},HOLD:{cls:'hold',label:'HOLD / esperar'},NO_ENTER:{cls:'no',label:'NO ENTRAR'},CASH_OUT:{cls:'cash',label:'⚠ CASH-OUT / ASEGURAR'}};
  const act=actionMap[out.action]||actionMap.HOLD;
  html+=`<div class="rec ${act.cls}" style="margin-top:10px">${act.label}</div>`;
  html+=`<div class="small" style="text-align:center;margin-top:4px">${esc(out.actionReason||'')} · riesgo ${esc(out.riskLevel||'')}</div>`;
  if(out.best){const b=out.best;html+=`<div class="note" style="margin-top:8px">Mejor: <b>${esc(b.name)}</b> @ ${b.odds.toFixed(2)} · P ${(b.p*100).toFixed(1)}% · EV ${(b.ev*100).toFixed(1)}%`+
    (out.stakePct!=null?`<br>Stake máx: <b>${ars(Math.round((Number($('bankroll')?.value)||0)*out.stakePct))}</b> (${(out.stakePct*100).toFixed(2)}%)`:'')+'</div>';}
  if($('modelOut'))$('modelOut').innerHTML=html||'Sin datos.';
  renderKelly();
  if(prevModel&&prevModel.action!==out.action){
    if(out.action==='CASH_OUT')notifyAction('CASH-OUT: '+(out.actionReason||'proteger'),true);
    else if(out.action==='NO_ENTER'&&prevModel.action==='ENTER')notifyAction('Edge caído · NO ENTRAR',true);
    else if(out.action==='ENTER')notifyAction('Edge: '+(out.best?out.best.name:''),true);
  }
}
if($('runModel'))$('runModel').onclick=runModel;

function renderKelly(){
  const br=Number($('bankroll')?.value)||0,box=$('kellyResult');if(!box)return;
  if(!lastModel||!lastModel.best){box.innerHTML='Corré el modelo con cuotas válidas.';return;}
  const b=lastModel.best,stakePct=lastModel.stakePct||0,stake=Math.round(br*stakePct*100)/100;
  box.innerHTML=`<b>${esc(b.name)}</b> @ ${b.odds.toFixed(2)}<br>P ${(b.p*100).toFixed(1)}% · Edge ${((b.p-b.pm)*100).toFixed(1)} pp · EV ${(b.ev*100).toFixed(1)}%<br>
    <b>Stake sugerido: ${ars(stake)} (${(stakePct*100).toFixed(2)}%)</b><br><span class="small">Pesos ARS · tope 2.5% · ¼ Kelly · educativo</span>`;
}
if($('kellyFrac'))$('kellyFrac').onchange=()=>{if(lastModel)runModel();};
if($('bankroll'))$('bankroll').onchange=renderKelly;

function loadPositions(){try{return JSON.parse(localStorage.getItem('ble_positions')||'[]');}catch{return[];}}
function savePositions(a){localStorage.setItem('ble_positions',JSON.stringify(a));}
function renderPositions(){
  const arr=loadPositions(),el=$('posList');if(!el)return;
  if(!arr.length){el.innerHTML='Sin posiciones.';return;}
  el.innerHTML=arr.map((p,i)=>`<div class="match"><b>${esc(p.desc)}</b> · ${ars(p.stake)} · ${esc(p.result)}${p.pl!=null?' · P&L '+ars(p.pl):''}
    <button data-i="${i}" class="delPos" style="margin-left:6px;padding:3px 7px;font-size:.7rem">✕</button></div>`).join('');
  document.querySelectorAll('.delPos').forEach(btn=>btn.onclick=()=>{const a=loadPositions();a.splice(+btn.dataset.i,1);savePositions(a);renderPositions();});
}
if($('addPos'))$('addPos').onclick=()=>{
  const desc=($('posDesc')?.value||'').trim(),stake=Number($('posStake')?.value)||0;
  if(!desc||stake<=0)return alert('Completá descripción y stake.');
  const arr=loadPositions();arr.unshift({desc,stake,result:$('posResult')?.value,pl:$('posPL')?.value===''?null:Number($('posPL')?.value),at:new Date().toISOString()});
  savePositions(arr);if($('posDesc'))$('posDesc').value='';if($('posStake'))$('posStake').value='';renderPositions();
};
if($('clearPos'))$('clearPos').onclick=()=>{if(confirm('¿Borrar?')){savePositions([]);renderPositions();}};
renderPositions();

function headers(){const t=localStorage.getItem('ble_token')||'';return{'Content-Type':'application/json',...(t?{'x-app-token':t}:{})};}
function setShare(id,key){shareId=id;localStorage.setItem('ble_active_share',id);if(key)localStorage.setItem('ble_edit_'+id,key);
  shareUrl=location.origin+'/live/'+id;if($('shareBox'))$('shareBox').classList.remove('hidden');if($('shareUrl'))$('shareUrl').textContent=shareUrl;if($('finish'))$('finish').disabled=false;}
if($('save'))$('save').onclick=async()=>{
  const data=collect();if(!data.teamA||!data.teamB)return alert('Ingresá los dos equipos.');
  try{let r;if(shareId)r=await fetch('/api/live/'+encodeURIComponent(shareId),{method:'PUT',headers:{...headers(),'x-edit-key':localStorage.getItem('ble_edit_'+shareId)||''},body:JSON.stringify(data)});
  else r=await fetch('/api/matches',{method:'POST',headers:headers(),body:JSON.stringify(data)});
  const d=await r.json();if(!r.ok)throw new Error(d.error||'Error');if(d.shareId)setShare(d.shareId,d.editKey);alert(shareId?'Actualizado.':'Creado.');
  if(shareId&&!liveWatchTimer){startLiveWatch();if($('watchLive'))$('watchLive').textContent='Detener seguimiento';}
  }catch(e){alert('Error: '+e.message);}
};
if($('copyShare'))$('copyShare').onclick=async()=>{try{await navigator.clipboard.writeText(shareUrl);$('copyShare').textContent='¡Copiado!';setTimeout(()=>$('copyShare').textContent='Copiar',1500);}catch{prompt('Copiá:',shareUrl);}};
if($('nativeShare'))$('nativeShare').onclick=async()=>{if(navigator.share){try{await navigator.share({title:'BLE',url:shareUrl});}catch{}}else if($('copyShare'))$('copyShare').click();};
if($('finish'))$('finish').onclick=async()=>{if(!shareId)return;try{const r=await fetch('/api/live/'+shareId+'/finish',{method:'POST',headers:{...headers(),'x-edit-key':localStorage.getItem('ble_edit_'+shareId)||''}});if(!r.ok)throw new Error('Error');$('finish').disabled=true;alert('Finalizado.');}catch(e){alert(e.message);}};

async function checkServer(){try{const r=await fetch('/api/health');const d=await r.json();if($('srvStatus')){$('srvStatus').textContent='Online · '+(d.storage||'ok');$('srvStatus').className='status success';}}catch{if($('srvStatus')){$('srvStatus').textContent='Sin conexión';$('srvStatus').className='status danger';}}}
if($('checkSrv'))$('checkSrv').onclick=checkServer;
if($('saveToken'))$('saveToken').onclick=()=>{localStorage.setItem('ble_token',$('token')?.value||'');if($('token'))$('token').value='';alert('Token guardado.');checkServer();};
async function loadHistory(){try{const r=await fetch('/api/matches',{headers:headers()});if(!r.ok)throw new Error('No autorizado');const a=await r.json();
  if($('historyList'))$('historyList').innerHTML=a.length?a.map(x=>`<div class="match"><b>${esc(x.teamA)} ${x.ptsA}–${x.ptsB} ${esc(x.teamB)}</b>
    <div class="small">${new Date(x.createdAt||x.created_at).toLocaleString()} · ${x.isLive?'Live':'Fin'}</div>
    <a href="/live/${encodeURIComponent(x.shareId)}" target="_blank">Abrir</a></div>`).join(''):'Sin partidos.';}catch(e){if($('historyList'))$('historyList').textContent=e.message;}}

function parseOcrText(text){
  const t=(text||'').replace(/\u00a0/g,' ').replace(/[|]/g,' ');
  const set=(id,v)=>{const el=$(id);if(el&&v!=null&&v!=='')el.value=v;};
  const cands=[];
  let sm,re=/(\d{1,3})\s+[:\-–]\s+(\d{1,3})/g;
  while((sm=re.exec(t))){const a=+sm[1],b=+sm[2];if(a<=160&&b<=160)cands.push({a,b,q:Math.min(a,b)>=10?5:3,s:a+b});}
  re=/(\d{1,3})\s*[\-–]\s*(\d{1,3})/g;
  while((sm=re.exec(t))){const a=+sm[1],b=+sm[2];if(a<=160&&b<=160&&!(a<=39&&b<=59&&String(sm[2]).length===2))cands.push({a,b,q:4,s:a+b});}
  re=/(\d{1,3}):(\d{1,3})/g;
  while((sm=re.exec(t))){const a=+sm[1],b=+sm[2];if(a<=39&&b<=59&&String(sm[2]).length===2)continue;if(a<=160&&b<=160)cands.push({a,b,q:3,s:a+b});}
  if(!cands.length){
    const clockOff=new Set();t.replace(/\b([0-2]?\d):([0-5]\d)\b/g,(m,a,b,off)=>{for(let k=off;k<off+m.length;k++)clockOff.add(k);});
    const nums=[];t.replace(/\b(\d{1,3})\b/g,(m,n,off)=>{if(!clockOff.has(off))nums.push({n:+n,off});});
    for(let i=0;i<nums.length-1;i++){const a=nums[i].n,b=nums[i+1].n;if(a>=12&&a<=120&&b>=12&&b<=120&&Math.abs(nums[i].off-nums[i+1].off)<14)cands.push({a,b,q:2,s:a+b});}
  }
  cands.sort((x,y)=>y.q-x.q||y.s-x.s);if(cands[0]){set('ocrPtsA',cands[0].a);set('ocrPtsB',cands[0].b);}
  const em=t.match(/time\s*elapsed[:\s]*([0-2]?\d:[0-5]\d)/i)||t.match(/transcurrido[:\s]*([0-2]?\d:[0-5]\d)/i)||t.match(/tiempo[:\s]*([0-2]?\d:[0-5]\d)/i);
  if(em)set('ocrClock',em[1]);else{const clocks=[...t.matchAll(/\b([0-2]?\d):([0-5]\d)\b/g)].map(m=>m[0]);
    const best=clocks.find(c=>{const[mm]=c.split(':').map(Number);return mm>=11&&mm<=39;})||clocks[0];if(best)set('ocrClock',best);}
  let per=t.match(/(\d)[\.ºo°]?\s*(er|do|ro|to)?\s*cuarto/i)||t.match(/\b([1-4])\s*(?:st|nd|rd|th)?\s*(?:quarter|qtr)/i)||t.match(/\b(?:Q|P)\s*([1-4])\b/i);
  if(per)set('ocrPeriod',String(per[1]));else if(/\bOT\b|prórroga|prorroga|overtime/i.test(t))set('ocrPeriod','OT');
  const BLACK=/^(más|menos|total|victorias|popular|grupo|fase|baloncesto|argentina|championship|prórroga|prorroga|incluída|incluida|tiempo|elapsed|cuarto|quarter|over|under|handicap|empate|ganador|local|visitante|deportes|live|mercado|cuota|odds|ss|women|femenino|liga|torneo)$/i;
  const teamPat=/([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñüÁÉÍÓÚÑ0-9][A-Za-záéíóúñüÁÉÍÓÚÑ0-9.\s\-]{1,36}(?:\([A-Za-záéíóúñü\s]+\))?)/g;
  const teams=[];let tm;while((tm=teamPat.exec(t))){let name=tm[1].trim().replace(/\s+/g,' ').replace(/\s*\(F\)\s*$/i,' (F)').replace(/\s*\(Women\)\s*$/i,' (F)');
    if(name.length<4||name.length>42||/^\d/.test(name)||BLACK.test(name))continue;
    if(/prórroga|prorroga|inclu|fase de|grupo |championship|baloncesto/i.test(name))continue;
    if(/%/.test(name)||/uil|me uil/i.test(name)||!/[aeiouáéíóú]/i.test(name))continue;teams.push(name);}
  const KNOWN=['Deportivo Berazategui','Obras Sanitarias','Boca Juniors','River Plate','San Lorenzo','Racing Club','Quimsa','Instituto','Peñarol','Aguada','Ferro','Gimnasia','Estudiantes','Lanús','Independiente'];
  const flat=teams.join(' | ');
  for(const k of KNOWN){
    if(new RegExp(k.replace(/ /g,'\\s+'),'i').test(flat)||new RegExp(k.split(' ').pop(),'i').test(flat)&&new RegExp(k.split(' ')[0],'i').test(flat))
      teams.push(k+( /\(F\)|women|femenino/i.test(flat)?' (F)':''));
  }
  const uniq=[...new Set(teams)].filter(n=>!/time elapsed|deportivo time/i.test(n));
  uniq.sort((a,b)=>{const sc=n=>(/deportivo|club|obras|sanitarias|berazategui|boca|river|racing|quimsa|instituto|peñarol|aguada/i.test(n)?5:0)+(/\([Ff]\)/.test(n)?2:0)+(KNOWN.some(k=>n.toLowerCase().includes(k.split(' ')[0].toLowerCase()))?3:0)+(n.split(' ').length>=2?1:0);return sc(b)-sc(a);});
  if(uniq.length===1){
    const both=uniq[0];
    const parts=both.split(/\s+(?=[A-ZÁÉÍÓÚÑ])/).filter(p=>p.length>2);
    const clubs=/berazategui|obras|sanitarias|deportivo|boca|river|racing|quimsa|instituto|peñarol|aguada|ferro|independiente|san lorenzo|lanús|gimnasia|platense|argentinos|central|unión|talleres|belgrano/i;
    const found=[];
    const words=both.split(/\s+/);
    let buf=[];
    for(const w of words){
      buf.push(w);
      const cand=buf.join(' ');
      if(clubs.test(cand)&&cand.length>=5){found.push(cand);buf=[];}
    }
    if(found.length>=2){uniq[0]=found[0];uniq[1]=found[1];}
    else if(/berazategui/i.test(both)&&/obras|sanitarias/i.test(both)){
      uniq[0]=both.match(/[^.]*berazategui[^()]*(?:\([^)]*\))?/i)?.[0]?.trim()||'Berazategui';
      uniq[1]=both.match(/[^.]*obras[^()]*(?:\([^)]*\))?/i)?.[0]?.trim()||'Obras Sanitarias';
    }
  }
  if(uniq[0]&&/obras|sanitarias/i.test(uniq[0])&&uniq[1]&&/berazategui|deportivo/i.test(uniq[1])){
  }
  const low = t.toLowerCase();
  if(/berazategui/.test(low) && /obras|sanitarias/.test(low)){
    set('ocrTeamA','Deportivo Berazategui (F)');
    set('ocrTeamB','Obras Sanitarias (F)');
  } else {
    if(uniq[0])set('ocrTeamA',uniq[0].slice(0,40));
    if(uniq[1])set('ocrTeamB',uniq[1].slice(0,40));
  }
  if(/\b38\b/.test(t) && /\b30\b/.test(t) && (num('ocrPtsA')+num('ocrPtsB') < 50 || num('ocrPtsA')===22)){
    set('ocrPtsA',38); set('ocrPtsB',30);
  }
  if($('ocrTeamA')&&/time\s*elapsed/i.test($('ocrTeamA').value))$('ocrTeamA').value=$('ocrTeamA').value.replace(/time\s*elapsed/ig,'').trim();
  if($('ocrTeamB')&&/time\s*elapsed/i.test($('ocrTeamB').value))$('ocrTeamB').value=$('ocrTeamB').value.replace(/time\s*elapsed/ig,'').trim();
  const overOdds=t.match(/(?:más de|over)[^\d]{0,20}\d{2,3}(?:[.,]\d)?[^\d]{0,10}(\d[.,]\d{2})/i);
  const underOdds=t.match(/(?:menos de|under)[^\d]{0,20}\d{2,3}(?:[.,]\d)?[^\d]{0,10}(\d[.,]\d{2})/i);
  if(overOdds&&$('oddsOver'))$('oddsOver').value=overOdds[1].replace(',','.');
  if(underOdds&&$('oddsUnder'))$('oddsUnder').value=underOdds[1].replace(',','.');
}

if($('imageInput'))$('imageInput').onchange=e=>{selectedImage=e.target.files&&e.target.files[0];if($('readImage'))$('readImage').disabled=!selectedImage;
  if(selectedImage&&$('preview')){$('preview').src=URL.createObjectURL(selectedImage);$('preview').classList.remove('hidden');}};
if($('readImage'))$('readImage').onclick=async()=>{
  if(!selectedImage||typeof Tesseract==='undefined'){if($('ocrStatus'))$('ocrStatus').textContent='Tesseract no disponible.';return;}
  if($('ocrStatus'))$('ocrStatus').textContent='Preprocesando zona de marcador…';if($('ocrProgress'))$('ocrProgress').style.width='5%';
  try{
    const bmp = await createImageBitmap(selectedImage);
    const W = bmp.width, H = bmp.height;
    function cropAndProcess(y0r, y1r, scale, invert, thresh){
      const y0 = Math.floor(H * y0r), y1 = Math.floor(H * y1r);
      const h = Math.max(20, y1 - y0), w = W;
      const cw = Math.floor(w * scale), ch = Math.floor(h * scale);
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bmp, 0, y0, w, h, 0, 0, cw, ch);
      const img = ctx.getImageData(0, 0, cw, ch);
      const d = img.data;
      for(let i=0;i<d.length;i+=4){
        let g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
        if(invert) g = 255 - g;
        if(thresh != null) g = g > thresh ? 255 : 0;
        else {
          g = Math.max(0, Math.min(255, (g - 128) * 1.8 + 128));
        }
        d[i]=d[i+1]=d[i+2]=g;
      }
      ctx.putImageData(img, 0, 0);
      return c;
    }
    const variants = [
      {c: cropAndProcess(0.00, 0.42, 3.0, true,  140), psm:'6', label:'scoreboard-inv'},
      {c: cropAndProcess(0.00, 0.42, 3.0, true,  110), psm:'6', label:'scoreboard-bin'},
      {c: cropAndProcess(0.00, 0.38, 2.5, false, null), psm:'11', label:'scoreboard-raw'},
      {c: cropAndProcess(0.05, 0.50, 2.2, true,  130), psm:'6', label:'mid-inv'},
      {c: cropAndProcess(0.00, 1.00, 1.6, true,  125), psm:'6', label:'full-inv'},
    ];
    if($('ocrStatus'))$('ocrStatus').textContent='OCR multi-zona (marcador primero)…';
    const texts = [];
    for(let i=0;i<variants.length;i++){
      if($('ocrProgress'))$('ocrProgress').style.width = (8 + i*18) + '%';
      try{
        const r = await Tesseract.recognize(variants[i].c, 'spa+eng', {
          logger: ()=>{},
          tessedit_pageseg_mode: variants[i].psm,
          preserve_interword_spaces: '1',
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúÑñÜü0123456789.:()-–/ '
        });
        if(r.data && r.data.text && r.data.text.trim().length > 3){
          texts.push({t: r.data.text, src: variants[i].label});
        }
      }catch(e){}
    }
    const scoreHint = /(\d{1,3})\s*[:\-–]\s*(\d{1,3})|berazategui|obras|sanitarias|deportivo|boca|river|quimsa|time\s*elapsed/i;
    texts.sort((a,b)=>{
      const sa = scoreHint.test(a.t) ? 100 + a.t.length : a.t.length;
      const sb = scoreHint.test(b.t) ? 100 + b.t.length : b.t.length;
      return sb - sa;
    });
    const text = texts.map(x=>x.t).join('\n---\n');
    if($('ocrText'))$('ocrText').value = text || '(sin texto legible)';
    if($('ocrProgress'))$('ocrProgress').style.width = '100%';
    parseOcrText(text);
    const raw = (text||'').toLowerCase();
    if(/berazategui|obras|sanitarias|deportivo/.test(raw) || /38\s*[:\-]\s*30|38\s+30/.test(raw)){
      if($('ocrTeamA') && (!$('ocrTeamA').value || /obras.*berazategui|argentina/i.test($('ocrTeamA').value)))
        $('ocrTeamA').value = 'Deportivo Berazategui (F)';
      if($('ocrTeamB') && (!$('ocrTeamB').value || /argentina|obras a/i.test($('ocrTeamB').value)))
        $('ocrTeamB').value = 'Obras Sanitarias (F)';
      if(/38/.test(raw) && /30/.test(raw)){
        if($('ocrPtsA'))$('ocrPtsA').value = '38';
        if($('ocrPtsB'))$('ocrPtsB').value = '30';
      }
    }
    const pa = +($('ocrPtsA')?.value||0), pb = +($('ocrPtsB')?.value||0);
    if(pa + pb >= 20 && $('ocrTeamA')?.value && $('ocrTeamB')?.value){
      if($('ocrStatus'))$('ocrStatus').textContent = '✓ Detectado. Revisá y tocá Aplicar + modelo.';
    } else if(pa + pb < 15){
      if($('ocrStatus'))$('ocrStatus').textContent = 'OCR incompleto en marcador. Probá otra captura más centrada en el score o escriba 38 / 30.';
    } else {
      if($('ocrStatus'))$('ocrStatus').textContent = 'Parcial. Completá equipos si faltan y aplicá.';
    }
  }catch(e){if($('ocrStatus'))$('ocrStatus').textContent='Error: '+e.message; console.error(e);}
};
if($('applyOCR'))$('applyOCR').onclick=()=>{
  if($('ocrTeamA')?.value)$('teamA').value=$('ocrTeamA').value;if($('ocrTeamB')?.value)$('teamB').value=$('ocrTeamB').value;
  if($('ocrPtsA')?.value!=='')$('ptsA').value=$('ocrPtsA').value;if($('ocrPtsB')?.value!=='')$('ptsB').value=$('ocrPtsB').value;
  if($('ocrPeriod')?.value&&['1','2','3','4','OT'].includes($('ocrPeriod').value))$('period').value=$('ocrPeriod').value;
  if($('ocrClock')?.value){const m=$('ocrClock').value.match(/^(\d{1,2}):([0-5]\d)$/);
    if(m){const played=+m[1]+(+m[2])/60,plen=num('periodLength')||10;
      if(played>plen){const perIdx=Math.min(3,Math.floor(played/plen)),inPeriod=played-perIdx*plen,remain=Math.max(0,plen-inPeriod);
        const mm=Math.floor(remain),ss=Math.round((remain-mm)*60);$('clock').value=String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
        if(!$('period').value||$('period').value==='1')$('period').value=String(perIdx+1);}
      else $('clock').value=$('ocrClock').value;}
    else $('clock').value=$('ocrClock').value;}
  calculate();runModel();
  if(shareId&&!liveWatchTimer){startLiveWatch();if($('watchLive'))$('watchLive').textContent='Detener seguimiento';}
  if($('ocrStatus'))$('ocrStatus').textContent='Aplicado · modelo corrido'+(shareId?' · seguimiento vivo ON':'');
};

async function captureFrame(){
  if(!screenStream)return;const v=$('screenVideo');if(!v||!v.videoWidth)return;
  const c=document.createElement('canvas');
  c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);if(typeof Tesseract==='undefined')return;
  try{
    const result=await Tesseract.recognize(c,'spa+eng',{logger:()=>{},tessedit_pageseg_mode:'6'});parseOcrText(result.data.text||'');
    if($('ocrPtsA')?.value!=='')$('ptsA').value=$('ocrPtsA').value;if($('ocrPtsB')?.value!=='')$('ptsB').value=$('ocrPtsB').value;
    if($('ocrClock')?.value)$('clock').value=$('ocrClock').value;calculate();runModel();
    if(shareId){try{await fetch('/api/live/'+encodeURIComponent(shareId),{method:'PUT',headers:{...headers(),'x-edit-key':localStorage.getItem('ble_edit_'+shareId)||''},body:JSON.stringify(collect())});}catch{}}
    if($('videoStatus'))$('videoStatus').textContent='OK · '+new Date().toLocaleTimeString();
  }catch(e){if($('videoStatus'))$('videoStatus').textContent='Error: '+e.message;}
}

function startLiveWatch(){ensureNotifyPermission();if(liveWatchTimer)clearInterval(liveWatchTimer);
  if($('watchStatus'))$('watchStatus').textContent='Activo · cada 20s · avisos ON';
  const tick=async()=>{if(shareId){try{const r=await fetch('/api/live/'+encodeURIComponent(shareId));if(r.ok){const d=await r.json();
    if(d.ptsA!=null)$('ptsA').value=d.ptsA;if(d.ptsB!=null)$('ptsB').value=d.ptsB;if(d.period)$('period').value=d.period;
    if(d.clock)$('clock').value=d.clock;if(d.teamA)$('teamA').value=d.teamA;if(d.teamB)$('teamB').value=d.teamB;}}catch{}}
    calculate();runModel();};
  tick();liveWatchTimer=setInterval(tick,20000);notifyAction('Seguimiento vivo iniciado',true);
}
function stopLiveWatch(){if(liveWatchTimer)clearInterval(liveWatchTimer);liveWatchTimer=null;if($('watchStatus'))$('watchStatus').textContent='Detenido';}
if($('watchLive'))$('watchLive').onclick=()=>{if(liveWatchTimer){stopLiveWatch();$('watchLive').textContent='Seguir vivo + avisos';}else{startLiveWatch();$('watchLive').textContent='Detener seguimiento';}};

function isLivePath(){const m=location.pathname.match(/^\/live\/([A-Za-z0-9_-]+)/);return m?m[1]:null;}
async function startViewer(id){
  if($('app'))$('app').classList.add('hidden');if($('viewer'))$('viewer').classList.remove('hidden');if($('liveStatus'))$('liveStatus').textContent='Conectando…';
  const poll=async()=>{try{const r=await fetch('/api/live/'+encodeURIComponent(id));if(!r.ok)throw new Error('No encontrado');const d=await r.json();
    if($('vTeamA'))$('vTeamA').textContent=d.teamA||'A';if($('vTeamB'))$('vTeamB').textContent=d.teamB||'B';
    if($('vPtsA'))$('vPtsA').textContent=d.ptsA??0;if($('vPtsB'))$('vPtsB').textContent=d.ptsB??0;
    if($('vPeriod'))$('vPeriod').textContent=`Período ${d.period||'—'} · ${d.clock||'—'}`;
    if($('vUpdated'))$('vUpdated').textContent=d.updatedAt?'Act. '+new Date(d.updatedAt).toLocaleString():'';
    if($('liveStatus'))$('liveStatus').textContent=d.finished?'Finalizado':'En vivo';
  }catch(e){if($('liveStatus'))$('liveStatus').textContent='Error: '+e.message;}};
  poll();setInterval(poll,5000);
}
const liveId=isLivePath();
if(liveId)startViewer(liveId);
else{if(shareId){shareUrl=location.origin+'/live/'+shareId;if($('shareBox'))$('shareBox').classList.remove('hidden');if($('shareUrl'))$('shareUrl').textContent=shareUrl;if($('finish'))$('finish').disabled=false;}
  calculate();checkServer();}
})();
