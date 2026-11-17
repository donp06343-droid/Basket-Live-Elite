(function () {
  const $ = id => document.getElementById(id);
  const keys = ['fga','fgm','3pa','3pm','fta','ftm','orb','drb','tov','ast','stl','blk'];
  const labels = {fga:'FGA',fgm:'FGM','3pa':'3PA','3pm':'3PM',fta:'FTA',ftm:'FTM',orb:'ORB',drb:'DRB',tov:'TOV',ast:'AST',stl:'STL',blk:'BLK'};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = id => Math.max(0, Number($(id)?.value) || 0);
  const pct = x => Number.isFinite(x) ? (x * 100).toFixed(1) + '%' : '—';
  const fmt = x => Number.isFinite(x) ? x.toFixed(1) : '—';

  let shareId = localStorage.getItem('ble_active_share') || null;
  let shareUrl = '';
  let lastModel = null;
  let prevModel = null;
  let screenStream = null;
  let captureTimer = null;
  let lastPaceKey = null;
  let lastActionKey = null;
  let liveWatchTimer = null;

  function notifyAction(msg, force) {
    const key = String(msg).slice(0, 80);
    if (!force && key === lastActionKey) return;
    lastActionKey = key;
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Basket Live Elite', { body: msg, tag: 'ble-action' });
      }
    } catch (e) {}
    console.log('[BLE]', msg);
  }
  function ensureNotifyPermission() {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    } catch (e) {}
  }

  document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tab,.panel').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const p = $(b.dataset.tab); if (p) p.classList.add('active');
    if (b.dataset.tab === 'history') loadHistory();
    if (b.dataset.tab === 'server') checkServer();
    if (b.dataset.tab === 'kelly') renderKelly();
  });

  if ($('league')) $('league').onchange = () => {
    if ($('league').value !== 'CUSTOM')
      $('periodLength').value = $('league').value === 'NBA' ? 12 : 10;
  };

  function elapsed() {
    const len = num('periodLength') || 10;
    const p = $('period')?.value === 'OT' ? 4 : Number($('period')?.value || 1) - 1;
    const m = ($('clock')?.value || '').match(/^(\d{1,2}):([0-5]\d)$/);
    return Math.max(0, p * len + (m ? len - (+m[1] + (+m[2]) / 60) : len));
  }

  function team(p, opp) {
    const s = {};
    keys.forEach(k => s[k] = num(p + '_' + k));
    const poss = Math.max(0, s.fga - s.orb + s.tov + .44 * s.fta);
    const oppPoss = Math.max(0, num(opp + '_fga') - num(opp + '_orb') + num(opp + '_tov') + .44 * num(opp + '_fta'));
    const pts = num(p === 'a' ? 'ptsA' : 'ptsB');
    const oppPts = num(p === 'a' ? 'ptsB' : 'ptsA');
    const den = s.fga + .44 * s.fta + s.tov;
    return {
      ...s, pts, poss,
      ortg: poss ? 100 * pts / poss : NaN,
      drtg: oppPoss ? 100 * oppPts / oppPoss : NaN,
      pace: elapsed() ? 48 * poss / elapsed() : NaN,
      efg: s.fga ? (s.fgm + .5 * s['3pm']) / s.fga : NaN,
      ts: (2 * s.fga + .88 * s.fta) ? pts / (2 * s.fga + .88 * s.fta) : NaN,
      tovPct: den ? s.tov / den : NaN,
      orbPct: (s.orb + num(opp + '_drb')) ? s.orb / (s.orb + num(opp + '_drb')) : NaN,
      ftr: s.fga ? s.fta / s.fga : NaN,
      fg: s.fga ? s.fgm / s.fga : NaN,
      three: s['3pa'] ? s['3pm'] / s['3pa'] : NaN,
      ft: s.fta ? s.ftm / s.fta : NaN
    };
  }

  function collect() {
    const A = team('a', 'b'), B = team('b', 'a');
    return {
      teamA: ($('teamA')?.value || '').trim() || 'Equipo A',
      teamB: ($('teamB')?.value || '').trim() || 'Equipo B',
      ptsA: A.pts, ptsB: B.pts,
      period: $('period')?.value, clock: $('clock')?.value,
      league: $('league')?.value, periodLength: num('periodLength'),
      A, B
    };
  }

  if ($('stats')) {
    ['a', 'b'].forEach(p => {
      $('stats').insertAdjacentHTML('beforeend',
        `<h3>Equipo ${p.toUpperCase()}</h3><div class="grid">` +
        keys.map(k => `<label>${labels[k]} <input id="${p}_${k}" type="number" min="0" value="0"></label>`).join('') +
        '</div>');
    });
  }

  function calculate() {
    const d = collect();
    const A = d.A, B = d.B;
    if ($('summary')) $('summary').innerHTML =
      `<h2>${esc(d.teamA)} ${A.pts} – ${B.pts} ${esc(d.teamB)}</h2>
       <div class="metrics">
         <div class="metric"><small>Marcador</small><b>${A.pts}–${B.pts}</b></div>
         <div class="metric"><small>Período</small><b>${esc(d.period)}</b></div>
         <div class="metric"><small>Reloj</small><b>${esc(d.clock)}</b></div>
         <div class="metric"><small>Min jugados</small><b>${elapsed().toFixed(1)}</b></div>
       </div>`;
    if ($('metrics')) $('metrics').innerHTML =
      `<div style="overflow:auto"><table>
        <tr><th>Métrica</th><th>${esc(d.teamA)}</th><th>${esc(d.teamB)}</th></tr>` +
      [['Posesiones', fmt(A.poss), fmt(B.poss)],['Pace / 48', fmt(A.pace), fmt(B.pace)],
       ['ORtg', fmt(A.ortg), fmt(B.ortg)],['DRtg', fmt(A.drtg), fmt(B.drtg)],
       ['Net', fmt(A.ortg - A.drtg), fmt(B.ortg - B.drtg)],
       ['eFG%', pct(A.efg), pct(B.efg)],['TS%', pct(A.ts), pct(B.ts)],
       ['FG%', pct(A.fg), pct(B.fg)],['3P%', pct(A.three), pct(B.three)],
       ['FT%', pct(A.ft), pct(B.ft)],['TOV%', pct(A.tovPct), pct(B.tovPct)],
       ['ORB%', pct(A.orbPct), pct(B.orbPct)],['FTA/FGA', fmt(A.ftr), fmt(B.ftr)],
       ['AST/TO', fmt(A.tov ? A.ast / A.tov : NaN), fmt(B.tov ? B.ast / B.tov : NaN)],
       ['STL/BLK', A.stl + '/' + A.blk, B.stl + '/' + B.blk]
      ].map(r => '<tr>' + r.map(v => '<td>' + v + '</td>').join('') + '</tr>').join('') +
      `</table></div>`;
  }
  if ($('calc')) $('calc').onclick = calculate;
  if ($('calc2')) $('calc2').onclick = calculate;
  if ($('resetStats')) $('resetStats').onclick = () => {
    document.querySelectorAll('#stats input').forEach(x => x.value = 0);
    if ($('summary')) $('summary').innerHTML = '<h2>Resumen</h2><p class="muted">Completá el marcador.</p>';
    if ($('metrics')) $('metrics').textContent = 'Calculá un partido.';
  };

  function runModel() {
    if (typeof BLM === 'undefined') {
      if ($('modelOut')) $('modelOut').textContent = 'Modelo no cargado.';
      return;
    }
    ensureNotifyPermission();
    const d = { ptsA: num('ptsA'), ptsB: num('ptsB'), elapsed: elapsed(), periodLength: num('periodLength') || 10 };
    const inp = {
      line: Number($('lineTotal')?.value) || null,
      over: Number($('oddsOver')?.value) || null,
      under: Number($('oddsUnder')?.value) || null,
      oA: Number($('oddsA')?.value) || null,
      oB: Number($('oddsB')?.value) || null,
      pA: Number($('preA')?.value) || null,
      pB: Number($('preB')?.value) || null,
      kf: Number($('kellyFrac')?.value) || 0.25,
      maxStakePct: 0.025
    };
    prevModel = lastModel;
    const out = BLM.analyze(d, inp, prevModel);
    lastModel = out;
    const tr = BLM.record(d.elapsed, d.ptsA + d.ptsB);
    const pa = $('paceAlert');
    if (pa) {
      if (tr.ok && tr.alert && tr.key !== lastPaceKey) {
        lastPaceKey = tr.key;
        pa.className = 'status warn';
        pa.textContent = '⚡ ' + tr.msg;
        pa.classList.remove('hidden');
        notifyAction('Ritmo: ' + tr.msg, true);
      } else if (!tr.ok || !tr.alert) pa.classList.add('hidden');
    }
    let html = (out.lines || []).map(l => '<div>' + esc(l) + '</div>').join('');
    if (out.blockers?.length) html += '<div class="status warn" style="margin-top:8px"><b>Filtros:</b> ' + out.blockers.map(esc).join(' · ') + '</div>';
    const actionMap = {
      ENTER: { cls: 'enter', label: 'ENTRAR (edge claro)' },
      HOLD: { cls: 'hold', label: 'HOLD / esperar' },
      NO_ENTER: { cls: 'no', label: 'NO ENTRAR' },
      CASH_OUT: { cls: 'cash', label: '⚠ CASH-OUT / ASEGURAR' }
    };
    const act = actionMap[out.action] || actionMap.HOLD;
    html += `<div class="rec ${act.cls}" style="margin-top:10px">${act.label}</div>`;
    html += `<div class="small" style="text-align:center;margin-top:4px">${esc(out.actionReason || '')} · riesgo ${esc(out.riskLevel || '')}</div>`;
    if (out.best) {
      const b = out.best;
      html += `<div class="note" style="margin-top:8px">Mejor: <b>${esc(b.name)}</b> @ ${b.odds.toFixed(2)} · P ${(b.p * 100).toFixed(1)}% · EV ${(b.ev * 100).toFixed(1)}%` +
        (out.stakePct != null ? `<br>Stake máx: <b>${(out.stakePct * 100).toFixed(2)}%</b> bankroll (tope 2.5%)` : '') + '</div>';
    }
    if ($('modelOut')) $('modelOut').innerHTML = html || 'Sin datos.';
    renderKelly();
    if (prevModel && prevModel.action !== out.action) {
      if (out.action === 'CASH_OUT') notifyAction('CASH-OUT: ' + (out.actionReason || 'proteger'), true);
      else if (out.action === 'NO_ENTER' && prevModel.action === 'ENTER') notifyAction('Edge caído · NO ENTRAR', true);
      else if (out.action === 'ENTER') notifyAction('Edge: ' + (out.best ? out.best.name : ''), true);
    }
  }
  if ($('runModel')) $('runModel').onclick = runModel;

  function renderKelly() {
    const br = Number($('bankroll')?.value) || 0;
    const box = $('kellyResult');
    if (!box) return;
    if (!lastModel || !lastModel.best) {
      box.innerHTML = 'Corré el modelo con cuotas válidas.';
      return;
    }
    const b = lastModel.best;
    const stakePct = lastModel.stakePct || 0;
    const stake = Math.round(br * stakePct * 100) / 100;
    box.innerHTML = `<b>${esc(b.name)}</b> @ ${b.odds.toFixed(2)}<br>P ${(b.p * 100).toFixed(1)}% · Edge ${((b.p - b.pm) * 100).toFixed(1)} pp · EV ${(b.ev * 100).toFixed(1)}%<br><b>Stake sug: ${stake} (${(stakePct * 100).toFixed(2)}%)</b><br><span class="small">Educativo · tope 2.5% · ¼ Kelly máx</span>`;
  }
  if ($('kellyFrac')) $('kellyFrac').onchange = () => { if (lastModel) runModel(); };
  if ($('bankroll')) $('bankroll').onchange = renderKelly;

  function loadPositions() { try { return JSON.parse(localStorage.getItem('ble_positions') || '[]'); } catch { return []; } }
  function savePositions(arr) { localStorage.setItem('ble_positions', JSON.stringify(arr)); }
  function renderPositions() {
    const arr = loadPositions();
    const el = $('posList');
    if (!el) return;
    if (!arr.length) { el.innerHTML = 'Sin posiciones.'; return; }
    el.innerHTML = arr.map((p, i) =>
      `<div class="match"><b>${esc(p.desc)}</b> · ${p.stake} · ${esc(p.result)}${p.pl != null ? ' · P&L ' + p.pl : ''}
       <button data-i="${i}" class="delPos" style="margin-left:6px;padding:3px 7px;font-size:.7rem">✕</button></div>`
    ).join('');
    document.querySelectorAll('.delPos').forEach(btn => btn.onclick = () => {
      const a = loadPositions(); a.splice(+btn.dataset.i, 1); savePositions(a); renderPositions();
    });
  }
  if ($('addPos')) $('addPos').onclick = () => {
    const desc = ($('posDesc')?.value || '').trim();
    const stake = Number($('posStake')?.value) || 0;
    if (!desc || stake <= 0) return alert('Completá descripción y stake.');
    const arr = loadPositions();
    arr.unshift({ desc, stake, result: $('posResult')?.value, pl: $('posPL')?.value === '' ? null : Number($('posPL')?.value), at: new Date().toISOString() });
    savePositions(arr);
    if ($('posDesc')) $('posDesc').value = '';
    if ($('posStake')) $('posStake').value = '';
    renderPositions();
  };
  if ($('clearPos')) $('clearPos').onclick = () => { if (confirm('¿Borrar historial local?')) { savePositions([]); renderPositions(); } };
  renderPositions();

  function headers() {
    const t = localStorage.getItem('ble_token') || '';
    return { 'Content-Type': 'application/json', ...(t ? { 'x-app-token': t } : {}) };
  }
  function setShare(id, key) {
    shareId = id;
    localStorage.setItem('ble_active_share', id);
    if (key) localStorage.setItem('ble_edit_' + id, key);
    shareUrl = location.origin + '/live/' + id;
    if ($('shareBox')) $('shareBox').classList.remove('hidden');
    if ($('shareUrl')) $('shareUrl').textContent = shareUrl;
    if ($('finish')) $('finish').disabled = false;
  }
  if ($('save')) $('save').onclick = async () => {
    const data = collect();
    if (!data.teamA || !data.teamB) return alert('Ingresá los dos equipos.');
    try {
      let r;
      if (shareId) {
        r = await fetch('/api/live/' + encodeURIComponent(shareId), {
          method: 'PUT',
          headers: { ...headers(), 'x-edit-key': localStorage.getItem('ble_edit_' + shareId) || '' },
          body: JSON.stringify(data)
        });
      } else {
        r = await fetch('/api/matches', { method: 'POST', headers: headers(), body: JSON.stringify(data) });
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      if (d.shareId) setShare(d.shareId, d.editKey);
      alert(shareId ? 'Actualizado.' : 'Creado. Compartí el enlace.');
    } catch (e) { alert('Error: ' + e.message); }
  };
  if ($('copyShare')) $('copyShare').onclick = async () => {
    try { await navigator.clipboard.writeText(shareUrl); $('copyShare').textContent = '¡Copiado!'; setTimeout(() => $('copyShare').textContent = 'Copiar', 1500); }
    catch { prompt('Copiá:', shareUrl); }
  };
  if ($('nativeShare')) $('nativeShare').onclick = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'BLE', url: shareUrl }); } catch {} }
    else if ($('copyShare')) $('copyShare').click();
  };
  if ($('finish')) $('finish').onclick = async () => {
    if (!shareId) return;
    try {
      const r = await fetch('/api/live/' + shareId + '/finish', { method: 'POST', headers: { ...headers(), 'x-edit-key': localStorage.getItem('ble_edit_' + shareId) || '' } });
      if (!r.ok) throw new Error('No se pudo finalizar');
      $('finish').disabled = true;
      alert('Finalizado.');
    } catch (e) { alert(e.message); }
  };

  async function checkServer() {
    try {
      const r = await fetch('/api/health');
      const d = await r.json();
      if ($('srvStatus')) { $('srvStatus').textContent = 'Online · ' + (d.storage || 'ok'); $('srvStatus').className = 'status success'; }
    } catch {
      if ($('srvStatus')) { $('srvStatus').textContent = 'Sin conexión'; $('srvStatus').className = 'status danger'; }
    }
  }
  if ($('checkSrv')) $('checkSrv').onclick = checkServer;
  if ($('saveToken')) $('saveToken').onclick = () => {
    localStorage.setItem('ble_token', $('token')?.value || '');
    if ($('token')) $('token').value = '';
    alert('Token guardado.');
    checkServer();
  };
  async function loadHistory() {
    try {
      const r = await fetch('/api/matches', { headers: headers() });
      if (!r.ok) throw new Error('No autorizado');
      const a = await r.json();
      if ($('historyList')) $('historyList').innerHTML = a.length
        ? a.map(x => `<div class="match"><b>${esc(x.teamA)} ${x.ptsA}–${x.ptsB} ${esc(x.teamB)}</b>
           <div class="small">${new Date(x.createdAt || x.created_at).toLocaleString()} · ${x.isLive ? 'Live' : 'Fin'}</div>
           <a href="/live/${encodeURIComponent(x.shareId)}" target="_blank">Abrir</a></div>`).join('')
        : 'Sin partidos.';
    } catch (e) { if ($('historyList')) $('historyList').textContent = e.message; }
  }

  function parseOcrText(text) {
    const t = text.replace(/\u00a0/g, ' ');
    let score = t.match(/(\d{1,3})\s*[:\-–]\s*(\d{1,3})/);
    if (score) {
      const a = +score[1], b = +score[2];
      if (a <= 200 && b <= 200) { if ($('ocrPtsA')) $('ocrPtsA').value = a; if ($('ocrPtsB')) $('ocrPtsB').value = b; }
    } else {
      const nums = []; t.replace(/\b(\d{1,3})\b/g, (_, n) => nums.push(+n));
      const big = nums.filter(n => n >= 5 && n <= 200).sort((x, y) => y - x);
      if (big.length >= 2) { if ($('ocrPtsA')) $('ocrPtsA').value = big[0]; if ($('ocrPtsB')) $('ocrPtsB').value = big[1]; }
    }
    const elapsedM = t.match(/time\s*elapsed[:\s]*([0-2]?\d:[0-5]\d)/i) || t.match(/transcurrido[:\s]*([0-2]?\d:[0-5]\d)/i);
    if (elapsedM) { if ($('ocrClock')) $('ocrClock').value = elapsedM[1]; }
    else { const clock = t.match(/\b([0-2]?\d:[0-5]\d)\b/); if (clock && $('ocrClock')) $('ocrClock').value = clock[1]; }
    let per = t.match(/(\d)[\.ºo]?\s*(er|do|to)?\s*cuarto/i) || t.match(/\b(1[ºer]|2[ºdo]|3[ºer]|4[ºto]|OT|Q[1-4])\b/i);
    if (per && $('ocrPeriod')) {
      let v = String(per[1] || per[0]).replace(/[^\dOT]/gi, '');
      if (/OT/i.test(v)) $('ocrPeriod').value = 'OT';
      else if (v) $('ocrPeriod').value = v.charAt(0);
    }
    const teamPat = /([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñü0-9\.\s\-]{3,40}(?:\([A-Za-z\s]+\))?)/g;
    const teams = []; let m;
    while ((m = teamPat.exec(t)) !== null) {
      const name = m[1].trim().replace(/\s+/g, ' ');
      if (name.length >= 4 && !/^(Más|Menos|Total|Victorias|Popular|Grupo|Fase|Baloncesto|Argentina|Championship)/i.test(name)) teams.push(name);
    }
    const uniq = [...new Set(teams)].filter(n => !/^\d/.test(n));
    if (uniq.length >= 2) { if ($('ocrTeamA')) $('ocrTeamA').value = uniq[0].slice(0, 40); if ($('ocrTeamB')) $('ocrTeamB').value = uniq[1].slice(0, 40); }
    else if (uniq.length === 1 && $('ocrTeamA')) $('ocrTeamA').value = uniq[0].slice(0, 40);
    const lineM = t.match(/(?:Más de|Over|Total)[^\d]{0,12}(\d{2,3}(?:\.\d)?)/i);
    if (lineM && $('lineTotal')) $('lineTotal').value = lineM[1];
    const overM = t.match(/Más de[^\d]{0,12}\d{2,3}(?:\.\d)?[^\d]{0,8}(\d+\.\d{2,3})/i);
    const underM = t.match(/Menos de[^\d]{0,12}\d{2,3}(?:\.\d)?[^\d]{0,8}(\d+\.\d{2,3})/i);
    if (overM && $('oddsOver')) $('oddsOver').value = overM[1];
    if (underM && $('oddsUnder')) $('oddsUnder').value = underM[1];
  }

  let selectedImage = null;
  if ($('imageInput')) $('imageInput').onchange = e => {
    selectedImage = e.target.files && e.target.files[0];
    if ($('readImage')) $('readImage').disabled = !selectedImage;
    if (selectedImage && $('preview')) { $('preview').src = URL.createObjectURL(selectedImage); $('preview').classList.remove('hidden'); }
  };
  if ($('readImage')) $('readImage').onclick = async () => {
    if (!selectedImage || typeof Tesseract === 'undefined') { if ($('ocrStatus')) $('ocrStatus').textContent = 'Tesseract no disponible.'; return; }
    if ($('ocrStatus')) $('ocrStatus').textContent = 'Procesando…';
    if ($('ocrProgress')) $('ocrProgress').style.width = '10%';
    try {
      const result = await Tesseract.recognize(selectedImage, 'spa+eng', {
        logger: m => { if (m.status === 'recognizing text' && m.progress && $('ocrProgress')) $('ocrProgress').style.width = (m.progress * 100).toFixed(0) + '%'; }
      });
      const text = result.data.text || '';
      if ($('ocrText')) $('ocrText').value = text;
      if ($('ocrProgress')) $('ocrProgress').style.width = '100%';
      if ($('ocrStatus')) $('ocrStatus').textContent = 'Listo. Revisá y aplicá.';
      parseOcrText(text);
    } catch (e) { if ($('ocrStatus')) $('ocrStatus').textContent = 'Error: ' + e.message; }
  };
  if ($('applyOCR')) $('applyOCR').onclick = () => {
    if ($('ocrTeamA')?.value) $('teamA').value = $('ocrTeamA').value;
    if ($('ocrTeamB')?.value) $('teamB').value = $('ocrTeamB').value;
    if ($('ocrPtsA')?.value !== '') $('ptsA').value = $('ocrPtsA').value;
    if ($('ocrPtsB')?.value !== '') $('ptsB').value = $('ocrPtsB').value;
    if ($('ocrPeriod')?.value) {
      const p = $('ocrPeriod').value;
      if (['1','2','3','4','OT'].includes(p)) $('period').value = p;
    }
    if ($('ocrClock')?.value) {
      const m = $('ocrClock').value.match(/^(\d{1,2}):([0-5]\d)$/);
      if (m) {
        const played = +m[1] + (+m[2]) / 60;
        const plen = num('periodLength') || 10;
        if (played > plen) {
          const perIdx = Math.min(3, Math.floor(played / plen));
          const inPeriod = played - perIdx * plen;
          const remain = Math.max(0, plen - inPeriod);
          const mm = Math.floor(remain), ss = Math.round((remain - mm) * 60);
          $('period').value = String(perIdx + 1);
          $('clock').value = mm + ':' + String(ss).padStart(2, '0');
        } else $('clock').value = $('ocrClock').value;
      }
    }
    calculate();
    runModel();
    notifyAction('Captura aplicada · modelo actualizado');
  };

  if ($('startShare')) $('startShare').onclick = async () => {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
      const v = $('screenVideo');
      if (v) { v.srcObject = screenStream; v.classList.remove('hidden'); await v.play(); }
      if ($('stopShare')) $('stopShare').disabled = false;
      $('startShare').disabled = true;
      if ($('videoStatus')) $('videoStatus').textContent = 'Capturando…';
      const interval = Math.max(3, num('captureInterval') || 8) * 1000;
      captureTimer = setInterval(captureFrame, interval);
      screenStream.getVideoTracks()[0].onended = stopShare;
    } catch (e) { if ($('videoStatus')) $('videoStatus').textContent = 'Error: ' + e.message; }
  };
  function stopShare() {
    if (captureTimer) clearInterval(captureTimer);
    captureTimer = null;
    if (screenStream) screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
    if ($('screenVideo')) { $('screenVideo').srcObject = null; $('screenVideo').classList.add('hidden'); }
    if ($('stopShare')) $('stopShare').disabled = true;
    if ($('startShare')) $('startShare').disabled = false;
    if ($('videoStatus')) $('videoStatus').textContent = 'Detenido';
  }
  if ($('stopShare')) $('stopShare').onclick = stopShare;

  async function captureFrame() {
    const v = $('screenVideo');
    if (!v || !v.videoWidth) return;
    const c = $('frameCanvas');
    if (!c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    if (typeof Tesseract === 'undefined') return;
    try {
      if ($('videoStatus')) $('videoStatus').textContent = 'OCR…';
      const result = await Tesseract.recognize(c, 'spa+eng', { logger: () => {} });
      parseOcrText(result.data.text || '');
      if ($('ocrPtsA')?.value !== '') $('ptsA').value = $('ocrPtsA').value;
      if ($('ocrPtsB')?.value !== '') $('ptsB').value = $('ocrPtsB').value;
      if ($('ocrClock')?.value) $('clock').value = $('ocrClock').value;
      calculate();
      runModel();
      if (shareId) {
        try {
          await fetch('/api/live/' + encodeURIComponent(shareId), {
            method: 'PUT',
            headers: { ...headers(), 'x-edit-key': localStorage.getItem('ble_edit_' + shareId) || '' },
            body: JSON.stringify(collect())
          });
        } catch {}
      }
      if ($('videoStatus')) $('videoStatus').textContent = 'OK · ' + new Date().toLocaleTimeString();
    } catch (e) { if ($('videoStatus')) $('videoStatus').textContent = 'Error: ' + e.message; }
  }

  function startLiveWatch() {
    ensureNotifyPermission();
    if (liveWatchTimer) clearInterval(liveWatchTimer);
    if ($('watchStatus')) $('watchStatus').textContent = 'Activo · modelo cada 20s · avisos ON';
    const tick = async () => {
      if (shareId) {
        try {
          const r = await fetch('/api/live/' + encodeURIComponent(shareId));
          if (r.ok) {
            const d = await r.json();
            if (d.ptsA != null) $('ptsA').value = d.ptsA;
            if (d.ptsB != null) $('ptsB').value = d.ptsB;
            if (d.period) $('period').value = d.period;
            if (d.clock) $('clock').value = d.clock;
            if (d.teamA) $('teamA').value = d.teamA;
            if (d.teamB) $('teamB').value = d.teamB;
          }
        } catch {}
      }
      calculate();
      runModel();
    };
    tick();
    liveWatchTimer = setInterval(tick, 20000);
    notifyAction('Seguimiento vivo iniciado', true);
  }
  function stopLiveWatch() {
    if (liveWatchTimer) clearInterval(liveWatchTimer);
    liveWatchTimer = null;
    if ($('watchStatus')) $('watchStatus').textContent = 'Detenido';
  }
  if ($('watchLive')) {
    $('watchLive').onclick = () => {
      if (liveWatchTimer) { stopLiveWatch(); $('watchLive').textContent = 'Seguir vivo + avisos'; }
      else { startLiveWatch(); $('watchLive').textContent = 'Detener seguimiento'; }
    };
  }

  function isLivePath() {
    const m = location.pathname.match(/^\/live\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }
  async function startViewer(id) {
    if ($('app')) $('app').classList.add('hidden');
    if ($('viewer')) $('viewer').classList.remove('hidden');
    if ($('liveStatus')) $('liveStatus').textContent = 'Conectando…';
    const poll = async () => {
      try {
        const r = await fetch('/api/live/' + encodeURIComponent(id));
        if (!r.ok) throw new Error('No encontrado');
        const d = await r.json();
        if ($('vTeamA')) $('vTeamA').textContent = d.teamA || 'A';
        if ($('vTeamB')) $('vTeamB').textContent = d.teamB || 'B';
        if ($('vPtsA')) $('vPtsA').textContent = d.ptsA ?? 0;
        if ($('vPtsB')) $('vPtsB').textContent = d.ptsB ?? 0;
        if ($('vPeriod')) $('vPeriod').textContent = `Período ${d.period || '—'} · ${d.clock || '—'}`;
        if ($('vUpdated')) $('vUpdated').textContent = d.updatedAt ? 'Act. ' + new Date(d.updatedAt).toLocaleString() : '';
        if ($('liveStatus')) {
          $('liveStatus').textContent = d.isLive ? '● En vivo' : 'Finalizado';
          $('liveStatus').className = 'status ' + (d.isLive ? 'success' : 'muted');
        }
      } catch (e) {
        if ($('liveStatus')) { $('liveStatus').textContent = 'Error: ' + e.message; $('liveStatus').className = 'status danger'; }
      }
    };
    await poll();
    setInterval(poll, 5000);
  }
  if ($('backHome')) $('backHome').onclick = () => {
    history.pushState({}, '', '/');
    if ($('viewer')) $('viewer').classList.add('hidden');
    if ($('app')) $('app').classList.remove('hidden');
  };

  const liveId = isLivePath();
  if (liveId) startViewer(liveId);
  else {
    if (shareId) {
      shareUrl = location.origin + '/live/' + shareId;
      if ($('shareBox')) $('shareBox').classList.remove('hidden');
      if ($('shareUrl')) $('shareUrl').textContent = shareUrl;
      if ($('finish')) $('finish').disabled = false;
    }
    calculate();
    checkServer();
  }
})();
