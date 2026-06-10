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
  const TF = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
  const SSD = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';
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
    if (!detections.length) {
      sum.innerHTML = '<b>감지 0개.</b> AI는 ‘사진’으로 배웠어요 — 명화·추상화·단순한 그림 앞에서는 <b>거의 못 보거나 엉뚱하게</b> 봅니다. 이게 바로 ‘AI의 눈’의 한계예요.';
      $('#btn-od-csv').disabled = true; $('#btn-od-send').disabled = true; return;
    }
    const c = {}; detections.forEach(d => c[ko(d.class)] = (c[ko(d.class)] || 0) + 1);
    const chips = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="od-chip">${k} ×${v}</span>`).join(' ');
    sum.innerHTML = `<b>${detections.length}개</b> 감지: ${chips}`;
    $('#btn-od-csv').disabled = false; $('#btn-od-send').disabled = false;
  }

  function applyDetections(dets, note) {
    // 화면이 작을 때 너무 많은 박스를 피하려고 신뢰도 0.3 이상만
    detections = (dets || []).filter(d => d.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, 40);
    render(); summarize();
    if (note) setStatus(note);
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

  /* ----------------------------- 모델 로드 + 감지 ----------------------------- */
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load fail')); document.head.appendChild(s); }); }
  async function ensureModel() {
    if (model) return model;
    setStatus('AI 모델을 불러오는 중… (처음 한 번, 약 5–6MB · 브라우저에서만 실행)');
    if (!window.tf) await loadScript(TF);
    if (!window.cocoSsd) await loadScript(SSD);
    model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });   // 가장 가벼운 모델(교실용)
    return model;
  }
  async function detectReal() {
    if (busy || !srcCanvas) return; busy = true;
    const btn = $('#btn-od-detect'); if (btn) { btn.disabled = true; btn.textContent = '🤖 감지 중…'; }
    try {
      const m = await ensureModel();
      const dets = await m.detect(srcCanvas, 40);
      applyDetections(dets, dets.length ? 'AI 감지 완료 · ' + dets.length + '개' : 'AI가 아무것도 찾지 못했어요 — 이게 결과이자 ‘비평거리’예요.');
    } catch (e) {
      setStatus('AI 모델을 불러오지 못했어요(네트워크 차단/오프라인일 수 있어요). 아래 ‘오프라인 예시’로 객체 감지가 무엇인지 체험해 보세요.', 'warn');
    } finally { busy = false; if (btn) { btn.disabled = false; btn.textContent = '🤖 AI로 사물 감지'; } }
  }

  /* ----------------------------- 입력 ----------------------------- */
  function loadImage(img, title, autoDetect) {
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
    if (!window.ImageAnalysis) return;
    srcCanvas = ImageAnalysis.generateDemo(name, 640, 480); detections = []; render(); summarize();
    setStatus('명화 데모 — ‘AI로 사물 감지’를 누르면, AI가 명화를 얼마나 못 보는지 확인할 수 있어요(온라인 필요).');
  }
  function loadStreetDemo() {
    const { cv, baked } = drawStreet(720, 480);
    srcCanvas = cv; applyDetections(baked, '오프라인 예시 장면 · baked 감지(네트워크 없이도 작동) — 실제 AI 감지는 사진을 업로드해 보세요.');
  }

  /* ----------------------------- 시작 ----------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    $('#btn-od-upload').addEventListener('click', () => $('#od-file').click());
    $('#od-file').addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
    $('#btn-od-detect').addEventListener('click', detectReal);
    $('#btn-od-street').addEventListener('click', loadStreetDemo);
    $('#sel-od-art').addEventListener('change', e => { if (e.target.value) loadArtDemo(e.target.value); });
    $('#btn-od-csv').addEventListener('click', exportCSV);
    $('#btn-od-send').addEventListener('click', sendToData);
    // 드래그&드롭
    const stage = $('#odstage-wrap');
    if (stage) {
      ['dragover', 'dragenter'].forEach(ev => stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.add('drop'); }));
      ['dragleave', 'drop'].forEach(ev => stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.remove('drop'); }));
      stage.addEventListener('drop', e => { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
    }
    loadStreetDemo(); // 시작하자마자 살아있는 화면(오프라인 안전)
  });

  window.ObjectStudio = { rows: toRows };   // (외부 연동용 최소 창구)
})();
