(function(){
const $=id=>document.getElementById(id);
const keys=['fga','fgm','3pa','3pm','fta','ftm','orb','drb','tov','ast','stl','blk'];
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function num(id){const v=Number($(id)?.value);return Number.isFinite(v)?v:0;}
function ars(n){try{return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n);}catch{return '$ '+Math.round(n);}}
function elapsed(){const pl=num('periodLength')||10;const per=String($('period')?.value||'1');const clock=String($('clock')?.value||'10:00');const [mm,ss]=(clock.match(/^(\d{1,2}):(\d{2})$/)||['0','10','0']).slice(1).map(Number);const left=mm+ss/60;const p=per==='OT'?4:Math.max(1,Math.min(4,+per||1));return (p-1)*pl+(pl-Math.min(pl,Math.max(0,left)));}
let lastModel=null,prevModel=null,lastPaceKey=null,liveWatchTimer=null,selectedImage=null;
function notifyAction(msg,force){try{if(!('Notification' in window))return;if(Notification.permission==='granted')new Notification('Basket Live Elite',{body:msg});else if(force&&Notification.permission!=='denied')Notification.requestPermission();}catch{}}
function ensureNotifyPermission(){try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();}catch{}}

/** CLAHE en escala de grises (tile grid, clip limit). Pure JS, sin OpenCV. */
function claheGray(gray, width, height, tileSize, clipLimit) {
  tileSize = tileSize || 32;
  clipLimit = clipLimit || 2.0;
  const out = new Uint8ClampedArray(gray.length);
  const tilesX = Math.max(1, Math.ceil(width / tileSize));
  const tilesY = Math.max(1, Math.ceil(height / tileSize));
  const hists = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const hist = new Uint32Array(256);
      const x0 = tx * tileSize, y0 = ty * tileSize;
      const x1 = Math.min(width, x0 + tileSize), y1 = Math.min(height, y0 + tileSize);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[gray[y * width + x]]++;
          count++;
        }
      }
      const limit = Math.max(1, Math.floor((clipLimit * count) / 256));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
      }
      const boost = Math.floor(excess / 256);
      let rem = excess - boost * 256;
      for (let i = 0; i < 256; i++) hist[i] += boost;
      for (let i = 0; rem > 0 && i < 256; i++, rem--) hist[i]++;
      const lut = new Uint8ClampedArray(256);
      let cdf = 0;
      let first = 0;
      for (let i = 0; i < 256; i++) if (hist[i]) { first = hist[i]; break; }
      for (let i = 0; i < 256; i++) {
        cdf += hist[i];
        lut[i] = count <= first ? i : Math.round(((cdf - first) / (count - first)) * 255);
      }
      hists.push({ lut, x0, y0, x1, y1 });
    }
  }
  function lutAt(tx, ty, v) {
    tx = Math.max(0, Math.min(tilesX - 1, tx));
    ty = Math.max(0, Math.min(tilesY - 1, ty));
    return hists[ty * tilesX + tx].lut[v];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = gray[y * width + x];
      const gx = (x + 0.5) / tileSize - 0.5;
      const gy = (y + 0.5) / tileSize - 0.5;
      const tx = Math.floor(gx), ty = Math.floor(gy);
      const dx = gx - tx, dy = gy - ty;
      const a = lutAt(tx, ty, v);
      const b = lutAt(tx + 1, ty, v);
      const c = lutAt(tx, ty + 1, v);
      const d = lutAt(tx + 1, ty + 1, v);
      const top = a * (1 - dx) + b * dx;
      const bot = c * (1 - dx) + d * dx;
      out[y * width + x] = Math.round(top * (1 - dy) + bot * dy);
    }
  }
  return out;
}
function rgbaToGray(data, n) {
  const g = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    g[j] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
  }
  return g;
}
function grayToRgba(gray, data) {
  for (let j = 0, i = 0; j < gray.length; j++, i += 4) {
    data[i] = data[i + 1] = data[i + 2] = gray[j];
    data[i + 3] = 255;
  }
}
/** Aplica CLAHE sobre ImageData RGBA in-place. */
function applyClaheImageData(imgData, tileSize, clipLimit) {
  const w = imgData.width, h = imgData.height;
  const gray = rgbaToGray(imgData.data, w * h);
  const enhanced = claheGray(gray, w, h, tileSize || 32, clipLimit || 2.0);
  grayToRgba(enhanced, imgData.data);
  return imgData;
}

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
  if($('modelOut'))$('modelOut').innerHTML=html||'Sin datos.';
  renderKelly();try{refreshAssistant();}catch(e){}
}
if($('runModel'))$('runModel').onclick=runModel;
function buildLocalTips(){
  const tips=[];const el=elapsed();const line=Number($('lineTotal')?.value)||0;const over=Number($('oddsOver')?.value)||0,under=Number($('oddsUnder')?.value)||0;
  const action=lastModel?.action||'HOLD',proj=lastModel?.projFinal||lastModel?.m?.proj||0,rate=lastModel?.rate||0,best=lastModel?.best;
  if(el<8)tips.push('Menos de 8 min: priorizá HOLD.');
  if(line>0&&proj>0){const gap=Math.abs(proj-line);if(gap<2)tips.push('Proyección pegada a la línea: edge bajo.');else if(gap>=6)tips.push('Brecha proyección–línea ~'+gap.toFixed(1)+' pts.');}
  if(best)tips.push('Mejor mercado: '+best.name+' · EV '+((best.ev||0)*100).toFixed(1)+'%');
  if(action==='ENTER')tips.push('ENTRAR solo si EV≥5% y stake ≤2.5% bankroll.');
  if(action==='CASH_OUT')tips.push('CASH-OUT: asegurar reduce regalar ganancia.');
  if(action==='NO_ENTER')tips.push('NO ENTRAR es correcto cuando no hay valor.');
  if(rate>0&&rate<2.8)tips.push('Ritmo bajo: Under más atractivo.');
  if(rate>=3.6)tips.push('Ritmo alto: Over con más chance si no frena.');
  if(!over&&!under)tips.push('Sin cuotas: completá Over/Under o Gana A/B para valor.');
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
document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));btn.classList.add('active');const p=$(btn.dataset.tab);if(p)p.classList.add('active');});
function calculate(){const a=num('ptsA'),b=num('ptsB'),el=elapsed();const box=$('summary');if(box)box.innerHTML=`<h2>Resumen</h2><p><b>${esc($('teamA')?.value||'A')}</b> ${a} – ${b} <b>${esc($('teamB')?.value||'B')}</b> · ${el.toFixed(1)}' jugados</p>`;try{runModel();}catch(e){}}
if($('calc'))$('calc').onclick=calculate;if($('calc2'))$('calc2').onclick=calculate;
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
    if($('oddsUnder')&&!$('oddsUnder').value)$('oddsUnder').value=String(uniq[Math.min(1,uniq.length-1)]);}
  if($('ocrText'))$('ocrText').value=t.slice(0,2000);
}
if($('imageInput'))$('imageInput').onchange=e=>{selectedImage=e.target.files&&e.target.files[0];if($('readImage'))$('readImage').disabled=!selectedImage;if(selectedImage&&$('preview')){$('preview').src=URL.createObjectURL(selectedImage);$('preview').classList.remove('hidden');}};
if($('readImage'))$('readImage').onclick=async()=>{
  if(!selectedImage||typeof Tesseract==='undefined'){if($('ocrStatus'))$('ocrStatus').textContent='Tesseract no disponible.';return;}
  if($('ocrStatus'))$('ocrStatus').textContent='CLAHE + OCR multi-zona…';if($('ocrProgress'))$('ocrProgress').style.width='5%';
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
      applyClaheImageData(img, 24, 2.5);
      const d = img.data;
      for(let i=0;i<d.length;i+=4){
        let g = d[i];
        if(invert) g = 255 - g;
        if(thresh != null) g = g > thresh ? 255 : 0;
        else g = Math.max(0, Math.min(255, (g - 128) * 1.5 + 128));
        d[i]=d[i+1]=d[i+2]=g; d[i+3]=255;
      }
      ctx.putImageData(img, 0, 0);
      return c;
    }
    const variants = [
      {c: cropAndProcess(0.00, 0.42, 3.0, true,  140), psm:'6'},
      {c: cropAndProcess(0.00, 0.42, 3.0, true,  110), psm:'6'},
      {c: cropAndProcess(0.00, 0.38, 2.5, false, null), psm:'11'},
      {c: cropAndProcess(0.05, 0.50, 2.2, true,  130), psm:'6'},
      {c: cropAndProcess(0.00, 1.00, 1.6, true,  125), psm:'6'},
      {c: cropAndProcess(0.00, 0.45, 2.8, false, null), psm:'6'},
    ];
    const texts = [];
    for(let i=0;i<variants.length;i++){
      if($('ocrProgress'))$('ocrProgress').style.width = (8 + i*15) + '%';
      try{
        const r = await Tesseract.recognize(variants[i].c, 'spa+eng', {
          logger: ()=>{},
          tessedit_pageseg_mode: variants[i].psm,
          preserve_interword_spaces: '1'
        });
        if(r.data && r.data.text && r.data.text.trim().length > 3) texts.push(r.data.text);
      }catch(e){}
    }
    const scoreHint = /(\d{1,3})\s*[:\-–]\s*(\d{1,3})|time\s*elapsed|cuarto|quarter/i;
    texts.sort((a,b)=>(scoreHint.test(b)?100:0)+b.length - ((scoreHint.test(a)?100:0)+a.length));
    const text = texts.join('\n---\n');
    if($('ocrText'))$('ocrText').value = text || '(sin texto)';
    if($('ocrProgress'))$('ocrProgress').style.width = '100%';
    parseOcrText(text);
    if($('ocrStatus')){$('ocrStatus').textContent='CLAHE + OCR listo ('+texts.length+' pasadas). Revisá y aplicá.';$('ocrStatus').className='status success';}
  }catch(e){if($('ocrStatus')){$('ocrStatus').textContent='Error OCR: '+e.message;$('ocrStatus').className='status danger';}}
};
if($('applyOCR'))$('applyOCR').onclick=()=>{
  if($('ocrTeamA')?.value)$('teamA').value=$('ocrTeamA').value;if($('ocrTeamB')?.value)$('teamB').value=$('ocrTeamB').value;
  if($('ocrPtsA')?.value)$('ptsA').value=$('ocrPtsA').value;if($('ocrPtsB')?.value)$('ptsB').value=$('ocrPtsB').value;
  if($('ocrPeriod')?.value)$('period').value=$('ocrPeriod').value;if($('ocrClock')?.value)$('clock').value=$('ocrClock').value;
  calculate();document.querySelector('[data-tab="analysis"]')?.click();
};
if($('btnLiveScores'))$('btnLiveScores').onclick=async()=>{const box=$('liveScoresBox');if(box)box.textContent='Buscando…';
  try{const r=await fetch('/api/live-scores?teamA='+encodeURIComponent($('teamA')?.value||'')+'&teamB='+encodeURIComponent($('teamB')?.value||''));const d=await r.json();
    if(!box)return;if(!d.ok||!d.matches?.length){box.innerHTML='<span class="muted">'+(d.note||'Sin resultados')+'</span>';return;}
    box.innerHTML=d.matches.slice(0,8).map(m=>`<div class="match"><b>${esc(m.home)}</b> ${m.homeScore??'-'} – ${m.awayScore??'-'} <b>${esc(m.away)}</b> · ${esc(m.status||'')}</div>`).join('');
  }catch(e){if(box)box.textContent='Error: '+e.message;}};
async function checkServer(){const s=$('srvStatus');if(!s)return;try{const r=await fetch('/api/health');const d=await r.json();s.textContent='Online · '+(d.version||'')+' · '+new Date(d.timestamp||Date.now()).toLocaleTimeString();s.className='status success';}catch{s.textContent='Sin conexión al API';s.className='status danger';}}
checkServer();
try{calculate();}catch(e){}
})();
