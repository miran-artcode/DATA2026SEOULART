/*
 * studio-object.js — 객체 감지 렌즈: 브라우저 AI(TF.js COCO-SSD)로 '무엇이 있나'를 데이터로
 * -----------------------------------------------------------------------------
 *  사진 → AI가 사물(사람·자동차·개… 80범주)을 감지 → 네모(박스)+라벨 → 점·데이터로.
 *  · 모델은 필요할 때만 CDN에서 지연 로드(자족적 사이트 유지). 8명이 동시에 써도
 *    실패하면 '오프라인 예시'로 부드럽게 이어진다(수업이 멈추지 않게).
 *  · 비평의 핵심: AI는 '사진'으로 배웠다 → 명화·추상화 앞에선 거의 못 보거나 엉뚱하게 본다.
 *    "AI의 눈은 무엇을 보고, 무엇을 못 보는가" 를 직접 확인하는 데이터 리터러시 렌즈.
 *  · 이미지는 브라우저 안에서만 처리(업로드/전송 없음).
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  // 모델 스크립트는 외부 CDN에서 받아온다 — 한 곳이 막히면 다음 곳으로 폴백(학교망 대비).
  const TF = ['https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', 'https://unpkg.com/@tensorflow/tfjs@4.22.0/dist/tf.min.js'];
  const SSD = ['https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js', 'https://unpkg.com/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js'];
  const COLS = ['사물', '중심x', '중심y', '크기', '신뢰도'];

  // COCO 80범주 → 한국어(자주 나오는 것 위주, 없으면 원어)
  const KO = {
    person: '사람', bicycle: '자전거', car: '자동차', motorcycle: '오토바이', airplane: '비행기',
    bus: '버스', train: '기차', truck: '트럭', boat: '배', 'traffic light': '신호등',
    'fire hydrant': '소화전', 'stop sign': '정지표지', bench: '벤치', bird: '새', cat: '고양이',
    dog: '개', horse: '말', sheep: '양', cow: '소', elephant: '코끼리', bear: '곰', zebra: '얼룩말',
    giraffe: '기린', backpack: '가방', umbrella: '우산', handbag: '핸드백', tie: '넥타이',
    suitcase: '여행가방', bottle: '병', 'wine glass': '와인잔', cup: '컵', fork: '포크', knife: '칼',
    spoon: '숟가락', bowl: '그릇', banana: '바나나', apple: '사과', sandwich: '샌드위치',
    orange: '오렌지', chair: '의자', couch: '소파', 'potted plant': '화분', bed: '침대',
    'dining table': '식탁', tv: 'TV', laptop: '노트북', mouse: '마우스', keyboard: '키보드',
    'cell phone': '휴대폰', book: '책', clock: '시계', vase: '꽃병', scissors: '가위',
    'teddy bear': '곰인형', kite: '연', skateboard: '스케이트보드', surfboard: '서핑보드'
  };
  const ko = c => KO[c] || c;

  let srcCanvas = null;     // 원본(자연 크기) 캔버스
  let detections = [];      // [{bbox:[x,y,w,h], class, score}]
  let model = null;         // cocoSsd 모델(로드되면)
  let busy = false;
  let live = false, liveStream = null, liveVideo = null;   // 실시간 카메라(웹캠/휴대폰)
  // 자동 기록(로그): 감지 결과를 시간에 따라 표로 누적 → 데이터셋
  let logging = false, logRows = [], logStartT = 0, logFrame = 0, lastLogAt = 0, logByCam = false, curSource = '예시';
  const LOG_INTERVAL = 900, LOG_MAX = 6000;
  const LOGCOLS = ['초', '회차', '사물', '중심x', '중심y', '가로', '세로', '크기', '종횡비', '신뢰도', '장면개수', '출처'];
  // 실시간 관찰(센서): 화면·소리에서 바로 읽히는 신호를 시간에 따라 그리고 기록
  let micOn = false, obsRaf = 0, lastChartAt = 0, lastObsAt = 0, prevLum = null, obsScratch = null, obsRows = [], chartBuf = [];
  const OBSCOLS = ['초', '밝기', '어두움', '채도', '따뜻함', '움직임', '사람수', '사물수', '소리', '높은소리'];
  const METRICS = [
    { k: '밝기', c: '#f4d35e' }, { k: '어두움', c: '#7c8696' }, { k: '채도', c: '#e26d5c' },
    { k: '따뜻함', c: '#e8973a' }, { k: '움직임', c: '#2FB6A8' }, { k: '사람수', c: '#6E84B8' },
    { k: '사물수', c: '#93A4E8' }, { k: '소리', c: '#9b5de5' }, { k: '높은소리', c: '#00bbf9' }
  ];
  const obsSel = { 밝기: true, 어두움: false, 채도: true, 따뜻함: false, 움직임: true, 사람수: true, 사물수: false, 소리: true, 높은소리: true };
  const dispScale = { 사람수: 8, 사물수: 5 };   // 개수(0~)를 0~100 그래프에 맞게 보기 좋게 확대
  const CHART_MS = 140, OBS_MS = 1000, CHART_MAX = 160, OBS_MAX = 4000;
  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function disp(k, v) { return Math.max(0, Math.min(100, (v || 0) * (dispScale[k] || 1))); }

  function setStatus(msg, kind) {
    const el = $('#od-status'); if (!el) return;
    el.textContent = msg || '';
    el.className = 'muted' + (kind === 'warn' ? ' od-warn' : '');
  }
  function fmt(n) { return Math.round(n); }

  /* ----------------------------- 데모 장면(절차적, 오프라인) ----------------------------- */
  // '사진처럼 보이는' 거리 장면 + 박스가 맞아떨어지는 baked 감지(오프라인에서도 살아있게)
  function drawStreet(W, H) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, H * 0.7); sky.addColorStop(0, '#bcd6ef'); sky.addColorStop(1, '#e9eef3');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    x.fillStyle = '#6b7280'; x.fillRect(0, H * 0.7, W, H * 0.3);                 // 도로
    x.strokeStyle = '#f4d35e'; x.lineWidth = 5; x.setLineDash([24, 18]);
    x.beginPath(); x.moveTo(0, H * 0.85); x.lineTo(W, H * 0.85); x.stroke(); x.setLineDash([]);
    // 사람
    x.fillStyle = '#2b3a67'; x.fillRect(W * 0.17, H * 0.46, W * 0.05, H * 0.26);
    x.fillStyle = '#e6b894'; x.beginPath(); x.arc(W * 0.195, H * 0.43, W * 0.022, 0, 7); x.fill();
    // 개
    x.fillStyle = '#8a5a2b'; x.beginPath(); x.ellipse(W * 0.36, H * 0.76, W * 0.05, H * 0.045, 0, 0, 7); x.fill();
    x.fillRect(W * 0.40, H * 0.74, W * 0.012, H * 0.06); x.fillRect(W * 0.33, H * 0.74, W * 0.012, H * 0.06);
    x.beginPath(); x.arc(W * 0.305, H * 0.72, W * 0.02, 0, 7); x.fill();
    // 자동차
    x.fillStyle = '#c0392b'; roundRect(x, W * 0.50, H * 0.60, W * 0.30, H * 0.16, 12); x.fill();
    x.fillStyle = '#1f2a38'; roundRect(x, W * 0.55, H * 0.55, W * 0.18, H * 0.08, 8); x.fill();
    x.fillStyle = '#111'; circle(x, W * 0.57, H * 0.77, W * 0.028); circle(x, W * 0.74, H * 0.77, W * 0.028);
    // 신호등
    x.fillStyle = '#333'; x.fillRect(W * 0.86, H * 0.30, W * 0.012, H * 0.42);
    x.fillStyle = '#222'; roundRect(x, W * 0.845, H * 0.24, W * 0.045, H * 0.12, 6); x.fill();
    x.fillStyle = '#e74c3c'; circle(x, W * 0.8675, H * 0.275, W * 0.012);
    x.fillStyle = '#f1c40f'; circle(x, W * 0.8675, H * 0.30, W * 0.012);
    x.fillStyle = '#2ecc71'; circle(x, W * 0.8675, H * 0.325, W * 0.012);
    const B = (cls, score, rx, ry, rw, rh) => ({ class: cls, score, bbox: [rx * W, ry * H, rw * W, rh * H] });
    const baked = [
      B('person', 0.92, 0.155, 0.40, 0.085, 0.33),
      B('dog', 0.78, 0.30, 0.70, 0.13, 0.11),
      B('car', 0.95, 0.49, 0.55, 0.32, 0.23),
      B('traffic light', 0.71, 0.84, 0.23, 0.06, 0.14)
    ];
    return { cv, baked };
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }

  /* ----------------------------- 렌더(이미지 + 박스) ----------------------------- */
  function colorFor(cls) { let h = 0; for (let i = 0; i < cls.length; i++) h = (h * 31 + cls.charCodeAt(i)) % 360; return h; }
  function render() {
    const cv = $('#odstage'); if (!cv || !srcCanvas) return;
    const W = srcCanvas.width, H = srcCanvas.height;
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.drawImage(srcCanvas, 0, 0);
    x.lineWidth = Math.max(2, W / 320); x.font = (Math.max(13, W / 46) | 0) + 'px sans-serif'; x.textBaseline = 'top';
    detections.forEach(d => {
      const [bx, by, bw, bh] = d.bbox, hue = colorFor(d.class);
      x.strokeStyle = `hsl(${hue},85%,60%)`; x.fillStyle = `hsla(${hue},85%,55%,0.14)`;
      x.fillRect(bx, by, bw, bh); x.strokeRect(bx, by, bw, bh);
      const label = ko(d.class) + ' ' + Math.round(d.score * 100) + '%';
      const tw = x.measureText(label).width + 10, th = (W / 46 | 0) + 9;
      x.fillStyle = `hsl(${hue},85%,55%)`; x.fillRect(bx, Math.max(0, by - th), tw, th);
      x.fillStyle = '#0a0c12'; x.fillText(label, bx + 5, Math.max(0, by - th) + 4);
    });
  }

  function summarize() {
    const sum = $('#od-summary'); if (!sum) return;
    ObjArt.refresh();
    if (!detections.length) {
      sum.innerHTML = '<b>감지 0개.</b> AI는 ‘사진’으로 배웠어요 — 명화·추상화·단순한 그림 앞에서는 <b>거의 못 보거나 엉뚱하게</b> 봅니다. 이게 바로 ‘AI의 눈’의 한계예요.';
      $('#btn-od-csv').disabled = true; $('#btn-od-send').disabled = true; return;
    }
    const c = {}; detections.forEach(d => c[ko(d.class)] = (c[ko(d.class)] || 0) + 1);
    const chips = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="od-chip">${k} ×${v}</span>`).join(' ');
    sum.innerHTML = `<b>${detections.length}개</b> 감지: ${chips}`;
    $('#btn-od-csv').disabled = false; $('#btn-od-send').disabled = false;
  }

  function applyDetections(dets, note, source) {
    // 화면이 작을 때 너무 많은 박스를 피하려고 신뢰도 0.3 이상만
    detections = (dets || []).filter(d => d.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, 40);
    render(); summarize();
    if (note) setStatus(note);
    curSource = source || '사진';
    logSnapshot(curSource, true);   // 자동 기록이 켜져 있으면 한 줄 남김
    if (!live) obsTick();           // 정지 화면도 관찰값(밝기·색·사물수…)을 한 점 남김
  }

  /* ----------------------------- 데이터 변환 ----------------------------- */
  function toRows() {
    const W = srcCanvas.width, H = srcCanvas.height, A = W * H;
    return detections.map(d => {
      const [bx, by, bw, bh] = d.bbox;
      return { 사물: ko(d.class), 중심x: fmt((bx + bw / 2) / W * 100), 중심y: fmt((by + bh / 2) / H * 100), 크기: fmt(bw * bh / A * 100), 신뢰도: fmt(d.score * 100) };
    });
  }
  function toCSV() { const r = toRows(); return COLS.join(',') + '\n' + r.map(o => COLS.map(c => o[c]).join(',')).join('\n'); }
  function exportCSV() {
    if (!detections.length) return;
    const blob = new Blob(['﻿' + toCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.download = 'objects_' + Date.now() + '.csv'; a.href = URL.createObjectURL(blob); a.click();
    setStatus('CSV를 저장했어요.');
  }
  function sendToData() {
    if (!detections.length) return;
    const payload = { name: '사물 감지 데이터', csv: toCSV(), intent: ($('#od-intent') ? $('#od-intent').value.trim() : ''), omit: ($('#od-omit') ? $('#od-omit').value.trim() : '') };
    try { localStorage.setItem('dn_data_incoming', JSON.stringify(payload)); } catch (e) { UI.toast('전송 실패(용량).'); return; }
    UI.toast('데이터 점 스튜디오로 보냈어요!');
    setTimeout(() => location.href = 'studio-data.html', 500);
  }

  /* ----------------------------- 자동 기록(로그) → 데이터 누적 ----------------------------- */
  // 감지될 때마다(특히 실시간 카메라) 한 줄씩 표로 쌓아 시간에 따른 데이터셋을 자동으로 만든다.
  function logCSV() { return LOGCOLS.join(',') + '\n' + logRows.map(o => LOGCOLS.map(c => o[c]).join(',')).join('\n'); }
  function updateLogUI() {
    const has = logRows.length > 0;
    const stat = $('#od-log-stat');
    if (stat) {
      if (has) {
        const types = new Set(logRows.map(r => r.사물)).size;
        const secs = Math.max.apply(null, logRows.map(r => r.초));
        stat.innerHTML = `📊 <b>${logRows.length.toLocaleString()}행</b> 기록 · ${logFrame}회차 · 사물 ${types}종 · ${secs.toFixed(0)}초` + (logging ? ' · <span class="od-warn">⏺ 기록 중</span>' : ' · ⏸ 멈춤');
      } else {
        stat.innerHTML = logging ? '⏺ 기록 중 — 감지되는 사물이 표로 쌓입니다…'
          : '자동 기록을 켜면 감지 결과(시간·사물·위치·크기·종횡비·신뢰도·장면 개수 등)가 표처럼 계속 쌓여 <b>데이터</b>가 됩니다. 📹 실시간 카메라와 함께 쓰면 자동으로 기록돼요.';
      }
    }
    const set = (id, dis) => { const e = $(id); if (e) e.disabled = dis; };
    set('#btn-od-log-csv', !has); set('#btn-od-log-send', !has); set('#btn-od-log-clear', !has);
    const b = $('#btn-od-log'); if (b) { b.textContent = logging ? '■ 자동 기록 중지' : '⏺ 자동 기록'; b.classList.toggle('rec', logging); }
  }
  function logSnapshot(source, force) {
    if (!logging || !srcCanvas || !detections.length) return;
    const now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (!force && now - lastLogAt < LOG_INTERVAL) return;   // 카메라 프레임 폭주 방지(약 1초 간격)
    lastLogAt = now; logFrame++;
    const W = srcCanvas.width, H = srcCanvas.height, A = W * H, cnt = detections.length, t = (now - logStartT) / 1000;
    detections.forEach(d => {
      const [bx, by, bw, bh] = d.bbox;
      logRows.push({
        초: +t.toFixed(1), 회차: logFrame, 사물: ko(d.class),
        중심x: fmt((bx + bw / 2) / W * 100), 중심y: fmt((by + bh / 2) / H * 100),
        가로: fmt(bw / W * 100), 세로: fmt(bh / H * 100), 크기: fmt(bw * bh / A * 100),
        종횡비: +(bw / Math.max(1, bh)).toFixed(2), 신뢰도: fmt(d.score * 100),
        장면개수: cnt, 출처: source || '사진'
      });
    });
    if (logRows.length >= LOG_MAX) { stopLog(); setStatus('자동 기록이 최대치(' + LOG_MAX.toLocaleString() + '행)에 도달해 멈췄어요. 내보내거나 비우고 다시 시작하세요.', 'warn'); }
    updateLogUI();
  }
  function startLog(silent) {
    if (logging) return;
    logging = true; lastLogAt = 0; lastObsAt = 0;
    if (!logRows.length) { logStartT = (window.performance && performance.now) ? performance.now() : Date.now(); logFrame = 0; }
    if (!silent) setStatus('⏺ 자동 기록을 시작했어요 — 감지되는 사물이 데이터로 쌓입니다.');
    if (detections.length) logSnapshot(live ? '카메라' : curSource, true);   // 이미 떠 있는 화면이면 즉시 한 줄
    updateLogUI();
  }
  function stopLog() { if (!logging) return; logging = false; updateLogUI(); }
  function toggleLog() { logging ? stopLog() : startLog(); }
  function exportLogCSV() {
    if (!logRows.length) return;
    const blob = new Blob(['﻿' + logCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.download = 'object_log_' + Date.now() + '.csv'; a.href = URL.createObjectURL(blob); a.click();
    setStatus('자동 기록 ' + logRows.length.toLocaleString() + '행을 CSV로 저장했어요.');
  }
  function sendLogToData() {
    if (!logRows.length) return;
    const payload = { name: '사물 감지 자동기록', csv: logCSV(), intent: ($('#od-intent') ? $('#od-intent').value.trim() : ''), omit: ($('#od-omit') ? $('#od-omit').value.trim() : '') };
    try { localStorage.setItem('dn_data_incoming', JSON.stringify(payload)); } catch (e) { UI.toast('전송 실패(기록이 커요 — CSV로 내보낸 뒤 불러오세요).'); return; }
    UI.toast('자동 기록 데이터를 데이터 점 스튜디오로 보냈어요!');
    setTimeout(() => location.href = 'studio-data.html', 500);
  }
  function clearLog() { logRows = []; logFrame = 0; logging = false; obsRows = []; chartBuf = []; prevLum = null; updateLogUI(); updateObsUI(); drawChart(); setStatus('기록을 비웠어요.'); }

  /* ----------------------------- 실시간 관찰(센서) → 시간에 따른 변화 ----------------------------- */
  // 화면을 작은 캔버스로 빠르게 재서 밝기·어두움·채도·따뜻함·움직임을 신호로.
  function computeScene() {
    if (!srcCanvas) return null;
    if (!obsScratch) { obsScratch = document.createElement('canvas'); obsScratch.width = 64; obsScratch.height = 48; }
    const sw = obsScratch.width, sh = obsScratch.height, sx = obsScratch.getContext('2d');
    try { sx.drawImage(srcCanvas, 0, 0, sw, sh); } catch (e) { return null; }
    let data; try { data = sx.getImageData(0, 0, sw, sh).data; } catch (e) { return null; }   // 외부 이미지 보호(tainted) 시 건너뜀
    const N = sw * sh, lum = new Float32Array(N); let sumL = 0, sumS = 0, sumR = 0, sumB = 0, motion = 0;
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const L = 0.299 * r + 0.587 * g + 0.114 * b; lum[i] = L; sumL += L; sumR += r; sumB += b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sumS += mx > 8 ? (mx - mn) / mx : 0;
    }
    if (prevLum && prevLum.length === N) { for (let i = 0; i < N; i++) motion += Math.abs(lum[i] - prevLum[i]); motion /= N; }
    prevLum = lum;
    const bright = sumL / N / 255 * 100;
    return {
      밝기: Math.round(bright), 어두움: Math.round(100 - bright), 채도: Math.round(sumS / N * 100),
      따뜻함: Math.round(Math.max(0, Math.min(100, 50 + (sumR - sumB) / N / 255 * 140))),
      움직임: Math.round(Math.max(0, Math.min(100, motion / 255 * 100 * 3.2)))
    };
  }
  function currentMetrics() {
    const sc = computeScene() || { 밝기: 0, 어두움: 0, 채도: 0, 따뜻함: 0, 움직임: 0 };
    let people = 0; detections.forEach(d => { if (d.class === 'person') people++; });
    let sound = 0, high = 0;
    if (micOn && window.AudioInput && AudioInput.enabled) { const v = AudioInput.getValues(); sound = Math.round(v.volume * 100); high = Math.round(v.high * 100); }
    return { 밝기: sc.밝기, 어두움: sc.어두움, 채도: sc.채도, 따뜻함: sc.따뜻함, 움직임: sc.움직임, 사람수: people, 사물수: detections.length, 소리: sound, 높은소리: high };
  }
  function drawMeters(m) {
    const host = $('#od-meters'); if (!host) return;
    host.innerHTML = METRICS.filter(x => obsSel[x.k]).map(x =>
      `<div class="obs-meter"><span>${x.k}</span><div class="bar"><i style="width:${disp(x.k, m[x.k])}%;background:${x.c}"></i></div><span class="val">${m[x.k] || 0}</span></div>`).join('');
  }
  function drawChart() {
    const cv = $('#od-chart'); if (!cv) return; const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, pad = 8;
    ctx.fillStyle = '#07080d'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) { const y = pad + (H - pad * 2) * g / 4; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke(); }
    const n = chartBuf.length;
    if (n < 2) {
      ctx.fillStyle = '#5b6480'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('📹 카메라나 🎤 소리를 켜면 여기에 시간에 따른 변화가 그려져요', W / 2, H / 2);
      return;
    }
    METRICS.filter(m => obsSel[m.k]).forEach(m => {
      ctx.strokeStyle = m.c; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = pad + (W - pad * 2) * (i / (n - 1)), y = pad + (H - pad * 2) * (1 - disp(m.k, chartBuf[i][m.k]) / 100); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    });
  }
  function recordObs(m) {   // 자동 기록 중이면 ~1초 간격으로 한 줄 누적
    if (!logging) return;
    const now = nowMs();
    if (now - lastObsAt < OBS_MS || obsRows.length >= OBS_MAX) return;
    lastObsAt = now;
    obsRows.push(Object.assign({ 초: +((now - logStartT) / 1000).toFixed(1) }, m));
    updateObsUI();
  }
  function obsTick() {   // 차트 버퍼에 한 점 + 미터/차트 갱신 + (기록 중이면) 한 줄
    const m = currentMetrics();
    chartBuf.push(m); if (chartBuf.length > CHART_MAX) chartBuf.shift();
    drawMeters(m); drawChart(); recordObs(m);
  }
  function obsActive() { return live || micOn; }
  function obsLoop() {
    if (!obsActive()) { obsRaf = 0; return; }
    const now = nowMs();
    if (now - lastChartAt >= CHART_MS) { lastChartAt = now; obsTick(); }
    obsRaf = requestAnimationFrame(obsLoop);
  }
  function startObs() { if (!obsRaf && obsActive()) { lastChartAt = 0; obsRaf = requestAnimationFrame(obsLoop); } }
  function stopObs() { if (!obsActive() && obsRaf) { cancelAnimationFrame(obsRaf); obsRaf = 0; } }
  async function toggleMic() {
    const b = $('#btn-od-mic');
    if (micOn) { if (window.AudioInput) AudioInput.stop(); micOn = false; if (b) { b.textContent = '🎤 소리도 관찰'; b.classList.remove('rec'); } stopObs(); updateObsUI(); setStatus('소리 관찰을 껐어요.'); return; }
    if (!window.AudioInput) { UI.toast('오디오 모듈이 없어요.'); return; }
    try { await AudioInput.start(); micOn = true; if (b) { b.textContent = '🔇 소리 끄기'; b.classList.add('rec'); } startObs(); updateObsUI(); setStatus('🎤 소리 관찰 중 — 소리 크기·높은 소리가 그래프에 더해져요(소리는 저장되지 않아요).'); }
    catch (e) { UI.toast('마이크를 켤 수 없어요(권한/지원을 확인하세요).'); }
  }
  function obsCSV() { return OBSCOLS.join(',') + '\n' + obsRows.map(o => OBSCOLS.map(c => o[c]).join(',')).join('\n'); }
  function updateObsUI() {
    const has = obsRows.length > 0;
    const set = (id, d) => { const e = $(id); if (e) e.disabled = d; };
    set('#btn-od-obs-csv', !has); set('#btn-od-obs-send', !has);
    const stat = $('#od-obs-stat');
    if (stat) stat.innerHTML = has ? `📈 관찰 <b>${obsRows.length.toLocaleString()}행</b> 기록됨` + (logging ? ' · <span class="od-warn">⏺ 기록 중</span>' : '')
      : (obsActive() ? '실시간 관찰 중 — ⏺ 자동 기록을 켜면 시간에 따라 데이터로 쌓여요.' : '카메라나 소리를 켜고 자동 기록을 누르면 시간에 따른 변화가 데이터로 쌓여요.');
  }
  function exportObsCSV() {
    if (!obsRows.length) return;
    const blob = new Blob(['﻿' + obsCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.download = 'observation_' + Date.now() + '.csv'; a.href = URL.createObjectURL(blob); a.click();
    setStatus('관찰 ' + obsRows.length.toLocaleString() + '행을 CSV로 저장했어요.');
  }
  function sendObsToData() {
    if (!obsRows.length) return;
    const payload = { name: '실시간 관찰 기록', csv: obsCSV(), intent: ($('#od-intent') ? $('#od-intent').value.trim() : ''), omit: ($('#od-omit') ? $('#od-omit').value.trim() : '') };
    try { localStorage.setItem('dn_data_incoming', JSON.stringify(payload)); } catch (e) { UI.toast('전송 실패(기록이 커요 — CSV로 내보내세요).'); return; }
    UI.toast('관찰 기록을 데이터 점 스튜디오로 보냈어요!');
    setTimeout(() => location.href = 'studio-data.html', 500);
  }
  // 현재 그래프를 제목·범례·현재값과 함께 JPG로 저장
  function exportObsJPG() {
    const W = 960, H = 560, ex = document.createElement('canvas'); ex.width = W; ex.height = H; const x = ex.getContext('2d');
    x.fillStyle = '#0c0e16'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#e8ecf6'; x.font = 'bold 22px sans-serif'; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.fillText('실시간 관찰 — 시간에 따른 변화', 28, 40);
    x.fillStyle = '#9aa3bd'; x.font = '13px sans-serif';
    x.fillText('데이터의 눈 · 객체 감지 렌즈 · ' + new Date().toLocaleString('ko-KR'), 28, 62);
    const gx = 28, gy = 84, gw = W - 56, gh = 360;
    x.fillStyle = '#07080d'; x.fillRect(gx, gy, gw, gh);
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 1;
    for (let g = 0; g <= 4; g++) { const yy = gy + gh * g / 4; x.beginPath(); x.moveTo(gx, yy); x.lineTo(gx + gw, yy); x.stroke(); }
    const n = chartBuf.length, picks = METRICS.filter(m => obsSel[m.k]);
    if (n >= 2) picks.forEach(m => {
      x.strokeStyle = m.c; x.lineWidth = 2.4; x.beginPath();
      for (let i = 0; i < n; i++) { const px = gx + gw * (i / (n - 1)), py = gy + gh * (1 - disp(m.k, chartBuf[i][m.k]) / 100); i ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
    });
    const last = chartBuf[n - 1] || {}; let lx = 28, ly = gy + gh + 40; x.font = '14px sans-serif'; x.textBaseline = 'middle';
    picks.forEach(m => {
      const label = m.k + (last[m.k] != null ? ' ' + last[m.k] : ''), wlab = x.measureText(label).width;
      if (lx + 18 + wlab > W - 28) { lx = 28; ly += 26; }
      x.fillStyle = m.c; x.fillRect(lx, ly - 6, 12, 12); x.fillStyle = '#e8ecf6'; x.fillText(label, lx + 18, ly); lx += 18 + wlab + 22;
    });
    const a = document.createElement('a'); a.download = 'observation_' + Date.now() + '.jpg'; a.href = ex.toDataURL('image/jpeg', 0.92); a.click();
    setStatus('관찰 그래프를 JPG로 저장했어요.');
  }
  function initObsPicks() {
    const host = $('#od-obs-picks'); if (!host) return;
    host.innerHTML = METRICS.map(m => `<label class="obs-pick"><input type="checkbox" data-obs="${m.k}"${obsSel[m.k] ? ' checked' : ''}><i style="background:${m.c}"></i>${m.k}</label>`).join('');
    host.querySelectorAll('input[data-obs]').forEach(inp => inp.addEventListener('change', () => { obsSel[inp.dataset.obs] = inp.checked; if (chartBuf.length) drawMeters(chartBuf[chartBuf.length - 1]); drawChart(); }));
  }

  /* ----------------------------- 모델 로드 + 감지 ----------------------------- */
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load fail')); document.head.appendChild(s); }); }
  // 여러 CDN을 순서대로 시도 — 하나가 막혀도 다음에서 받는다(학교망/차단 대비).
  async function loadFirst(urls) { let err; for (const u of urls) { try { await loadScript(u); return; } catch (e) { err = e; } } throw (err || new Error('all CDNs failed')); }
  async function ensureModel() {
    if (model) return model;
    setStatus('AI 모델을 불러오는 중… (처음 한 번, 약 5–6MB · 브라우저에서만 실행)');
    if (!window.tf) await loadFirst(TF);
    if (!window.cocoSsd) await loadFirst(SSD);
    model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });   // 가장 가벼운 모델(교실용)
    return model;
  }

  /* ----------------------------- 실시간 카메라(웹캠/휴대폰) ----------------------------- */
  // 카메라를 켜서 프레임마다 감지 → 박스를 실시간으로. HTTPS(깃허브 페이지)에서 휴대폰 뒷카메라도 됨.
  async function startLive() {
    if (live) return;
    try {
      setStatus('카메라를 켜는 중…');
      const m = await ensureModel();
      liveStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      liveVideo = document.createElement('video'); liveVideo.playsInline = true; liveVideo.muted = true; liveVideo.srcObject = liveStream;
      await liveVideo.play();
      live = true;
      const b = $('#btn-od-cam'); if (b) { b.textContent = '■ 카메라 끄기'; b.classList.add('rec'); }
      if (!logging) { startLog(true); logByCam = true; }   // 실시간 감지는 자동으로 기록 시작(화면 감지=자동 데이터화)
      startObs();                                           // 실시간 관찰 그래프(밝기·색·움직임…) 시작
      setStatus('📹 실시간 감지 + ⏺ 자동 기록 중 — 카메라를 사물(사람·컵·휴대폰·의자…)에 향해 보세요. 감지 결과가 데이터로 쌓이고, 옆 그래프에 시간 변화가 그려져요(영상은 저장 안 됨).');
      requestAnimationFrame(liveStep);
    } catch (e) {
      live = false;
      if (e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError' || e.name === 'NotReadableError'))
        setStatus('카메라를 쓸 수 없어요 — 권한 거부/카메라 없음일 수 있어요. 주소창의 카메라 허용을 확인해 주세요(휴대폰도 HTTPS면 가능).', 'warn');
      else
        setStatus('카메라/모델을 켜지 못했어요(모델 CDN 차단일 수 있어요). 잠시 후 다시 시도하거나 다른 네트워크에서 열어 보세요.', 'warn');
    }
  }
  function stopLive() {
    live = false;
    if (liveStream) { liveStream.getTracks().forEach(t => t.stop()); liveStream = null; }
    liveVideo = null;
    const b = $('#btn-od-cam'); if (b) { b.textContent = '📹 실시간 카메라'; b.classList.remove('rec'); }
    if (logByCam) { stopLog(); logByCam = false; }   // 카메라가 자동 시작한 기록만 멈춤(쌓인 데이터는 유지). 수동 기록은 사진·예시에서 계속됨
    stopObs();   // 마이크도 꺼져 있으면 관찰 루프 정지
  }
  function toggleLive() { if (live) { stopLive(); setStatus('카메라를 껐어요.'); } else startLive(); }
  async function liveStep() {
    if (!live || !liveVideo || !model) return;
    if (liveVideo.readyState >= 2 && liveVideo.videoWidth) {
      try {
        const dets = await model.detect(liveVideo, 20);
        if (!live) return;
        // 비디오 프레임을 srcCanvas에 복사 → 기존 render()·CSV·‘춤추는 점’이 그대로 동작
        if (!srcCanvas || srcCanvas.width !== liveVideo.videoWidth || srcCanvas.height !== liveVideo.videoHeight) {
          srcCanvas = document.createElement('canvas'); srcCanvas.width = liveVideo.videoWidth; srcCanvas.height = liveVideo.videoHeight;
        }
        srcCanvas.getContext('2d').drawImage(liveVideo, 0, 0, srcCanvas.width, srcCanvas.height);
        detections = dets.filter(d => d.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, 20);
        render(); summarize();
        curSource = '카메라';
        logSnapshot('카메라', false);   // 실시간 프레임을 약 1초 간격으로 자동 기록
      } catch (e) { /* 프레임 단위 오류는 건너뜀 */ }
    }
    if (live) requestAnimationFrame(liveStep);
  }
  async function detectReal() {
    stopLive();
    if (busy || !srcCanvas) return; busy = true;
    const btn = $('#btn-od-detect'); if (btn) { btn.disabled = true; btn.textContent = '🤖 감지 중…'; }
    try {
      const m = await ensureModel();
      const dets = await m.detect(srcCanvas, 40);
      applyDetections(dets, dets.length ? 'AI 감지 완료 · ' + dets.length + '개' : 'AI가 아무것도 찾지 못했어요 — 이게 결과이자 ‘비평거리’예요.', '사진');
    } catch (e) {
      setStatus('AI 모델을 불러오지 못했어요(네트워크 차단/오프라인일 수 있어요). 아래 ‘오프라인 예시’로 객체 감지가 무엇인지 체험해 보세요.', 'warn');
    } finally { busy = false; if (btn) { btn.disabled = false; btn.textContent = '🤖 AI로 사물 감지'; } }
  }

  /* ----------------------------- 입력 ----------------------------- */
  function loadImage(img, title, autoDetect) {
    stopLive();
    const cv = document.createElement('canvas');
    const maxDim = 720, ar = img.width / img.height;
    cv.width = Math.min(maxDim, img.width); cv.height = Math.round(cv.width / ar);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    srcCanvas = cv; detections = []; render(); summarize();
    if (title) setStatus('‘' + title + '’ 불러옴 — ‘AI로 사물 감지’를 눌러 보세요.');
    if (autoDetect) detectReal();
  }
  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) { UI.toast('이미지 파일을 넣어 주세요.'); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { loadImage(img, file.name.replace(/\.[^.]+$/, ''), true); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); UI.toast('이미지를 불러오지 못했어요.'); };
    img.src = url;
  }
  function loadArtDemo(name) {
    stopLive();
    if (!window.ImageAnalysis) return;
    setStatus('명화 불러오는 중…');
    ImageAnalysis.loadPainting(name, (cv, title, isFallback) => {
      srcCanvas = cv; detections = []; render(); summarize();
      setStatus('‘' + (title || '명화') + '’' + (isFallback ? ' (오프라인 대체)' : '') + ' — ‘AI로 사물 감지’를 누르면, AI가 ‘사진으로 배운 눈’으로 명화를 얼마나 못 보는지 확인할 수 있어요.');
    });
  }
  function loadStreetDemo() {
    stopLive();
    const { cv, baked } = drawStreet(720, 480);
    srcCanvas = cv; applyDetections(baked, '오프라인 예시 장면 · baked 감지(네트워크 없이도 작동) — 실제 AI 감지는 사진을 업로드해 보세요.', '예시');
  }

  /* ----------------------------- 춤추는 점(감지 → 미디어아트) ----------------------------- */
  // 감지된 사물 하나하나를 '점'으로: 위치=사진 속 중심, 크기=박스 크기, 색=사물종류,
  // 떨림=(1−신뢰도). AI가 또렷이 본 건 단단히, 흐릿하게 본 건 떨리며 떠오른다.
  const ObjArt = (function () {
    let cv = null, ctx = null, raf = null, playing = true, T = 0, pts = [];
    let motion = 'hover';
    const TAU = Math.PI * 2;

    function dot(x, y, r, hue, a) {
      const A = Math.min(0.95, a);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.0);
      g.addColorStop(0, 'hsla(' + hue.toFixed(0) + ',85%,62%,' + A.toFixed(2) + ')');
      g.addColorStop(1, 'hsla(' + hue.toFixed(0) + ',85%,55%,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'hsla(' + hue.toFixed(0) + ',92%,78%,' + Math.min(1, A + 0.2).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * 0.45), 0, TAU); ctx.fill();
    }

    function build() {
      pts = []; if (!cv || !srcCanvas || !detections.length) return;
      const sw = srcCanvas.width, sh = srcCanvas.height, A = sw * sh;
      detections.forEach(d => {
        const [bx, by, bw, bh] = d.bbox;
        const area = Math.min(1, (bw * bh) / A);
        pts.push({
          hx: 0.06 + ((bx + bw / 2) / sw) * 0.88, hy: 0.08 + ((by + bh / 2) / sh) * 0.84,
          r: 4 + Math.sqrt(area) * 46, hue: colorFor(d.class), conf: d.score, label: ko(d.class), ph: Math.random() * TAU
        });
      });
    }

    function draw() {
      if (!ctx) return;
      const W = cv.width, H = cv.height, n = pts.length;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#07080d'; ctx.fillRect(0, 0, W, H);
      if (!n) {
        ctx.fillStyle = '#5b6480'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('사물을 감지하면, 찾은 것들이 여기서 떠올라 춤춰요', W / 2, H / 2);
        return;
      }
      const pad = 30, IW = W - pad * 2, IH = H - pad * 2;
      const showLabel = $('#od-art-label') ? $('#od-art-label').checked : true;
      for (let i = 0; i < n; i++) {
        const p = pts[i], tremor = 4 + (1 - p.conf) * 26;   // 신뢰도 낮을수록 더 떨림
        let x, y;
        if (motion === 'swarm') {
          const orb = 18 + (1 - p.conf) * 40;
          x = pad + (0.5 + (p.hx - 0.5) * 0.5) * IW + Math.cos(T * 0.9 + p.ph) * orb;
          y = pad + (0.5 + (p.hy - 0.5) * 0.5) * IH + Math.sin(T * 1.1 + p.ph) * orb;
        } else if (motion === 'rise') {
          const frac = (((p.hy + T * (0.05 + p.r * 0.0015) + p.ph * 0.15) % 1) + 1) % 1;
          x = pad + (p.hx + Math.sin(T * 1.2 + p.ph) * 0.02) * IW;
          y = pad + (1 - frac) * IH;
        } else {                                            // hover
          x = pad + p.hx * IW + Math.cos(T * 1.3 + p.ph) * tremor;
          y = pad + p.hy * IH + Math.sin(T * 1.6 + p.ph) * tremor;
        }
        const r = p.r * (0.88 + 0.12 * Math.sin(T * 2 + p.ph));
        ctx.globalCompositeOperation = 'lighter';
        dot(x, y, r, p.hue, 0.42 + p.conf * 0.4);
        ctx.globalCompositeOperation = 'source-over';
        if (showLabel) {
          ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(p.label, x, y + r + 13);
        }
      }
    }

    function loop(ts) { if (!playing) { raf = null; return; } T = ts / 1000; draw(); raf = requestAnimationFrame(loop); }
    function start() { if (!raf && playing) raf = requestAnimationFrame(loop); }
    function refresh() { build(); if (!raf) { draw(); start(); } }
    function setPlay(on) { playing = on; const b = $('#od-art-play'); if (b) b.textContent = on ? '⏸ 멈춤' : '▶ 재생'; if (on) start(); }

    function init() {
      cv = $('#od-art'); if (!cv) return; ctx = cv.getContext('2d');
      $('#od-art-motion').addEventListener('change', e => { motion = e.target.value; });
      $('#od-art-play').addEventListener('click', () => setPlay(!playing));
      const modal = $('#od-art-modal');
      $('#btn-od-art-info').addEventListener('click', () => { modal.hidden = false; });
      $('#od-art-modal-x').addEventListener('click', () => { modal.hidden = true; });
      modal.addEventListener('click', e => { if (e.target.id === 'od-art-modal') modal.hidden = true; });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.hidden = true; });
      refresh();
    }
    return { init, refresh };
  })();

  /* ----------------------------- 시작 ----------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    ObjArt.init();
    $('#btn-od-upload').addEventListener('click', () => $('#od-file').click());
    $('#od-file').addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
    $('#btn-od-detect').addEventListener('click', detectReal);
    $('#btn-od-cam').addEventListener('click', toggleLive);
    $('#btn-od-street').addEventListener('click', loadStreetDemo);
    $('#sel-od-art').addEventListener('change', e => { if (e.target.value) loadArtDemo(e.target.value); });
    $('#btn-od-csv').addEventListener('click', exportCSV);
    $('#btn-od-send').addEventListener('click', sendToData);
    // 자동 기록(로그)
    const onClick = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
    onClick('#btn-od-log', toggleLog);
    onClick('#btn-od-log-csv', exportLogCSV);
    onClick('#btn-od-log-send', sendLogToData);
    onClick('#btn-od-log-clear', clearLog);
    updateLogUI();
    // 실시간 관찰(센서) 패널
    onClick('#btn-od-mic', toggleMic);
    onClick('#btn-od-jpg', exportObsJPG);
    onClick('#btn-od-obs-csv', exportObsCSV);
    onClick('#btn-od-obs-send', sendObsToData);
    initObsPicks(); drawChart(); updateObsUI();
    // 드래그&드롭
    const stage = $('#odstage-wrap');
    if (stage) {
      ['dragover', 'dragenter'].forEach(ev => stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.add('drop'); }));
      ['dragleave', 'drop'].forEach(ev => stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.remove('drop'); }));
      stage.addEventListener('drop', e => { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
    }
    loadStreetDemo(); // 시작하자마자 살아있는 화면(오프라인 안전)
  });

  window.ObjectStudio = { rows: toRows, log: () => logRows.slice(), logCSV, obs: () => obsRows.slice(), obsCSV };   // (외부 연동용 최소 창구)
})();
