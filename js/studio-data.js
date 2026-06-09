/*
 * studio-data.js — 「데이터가 춤추는 점」 스튜디오 (5.10.4)
 * -----------------------------------------------------------------------------
 * 우리 데이터를 점의 크기·속도·방향(벡터)·밀도로 변환하는 제너러티브 미디어아트.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);

  const SAMPLES = {
    emotion: [3, 4, 3, 2, 2, 1, 2, 3, 4, 4, 3, 2, 5, 4, 3, 3, 2, 4, 5, 5, 4, 3, 2, 3],
    temp: [12, 11, 10, 9, 9, 10, 12, 15, 18, 21, 24, 26, 27, 28, 28, 27, 25, 22, 19, 17, 16, 15, 14, 13],
    steps: [200, 800, 1500, 600, 400, 3000, 5200, 2400, 1800, 4200, 900, 300],
    noise: [40, 42, 55, 70, 65, 50, 48, 62, 75, 80, 58, 45, 52, 68, 72, 60, 47, 43]
  };
  const SAMPLE_NAME = { emotion: '우리 반 하루 감정 온도', temp: '하루 24시간 기온(℃)', steps: '활동량(걸음) 12구간', noise: '교실 소음 18구간(dB)' };

  const state = {
    data: SAMPLES.emotion.slice(), dataName: SAMPLE_NAME.emotion,
    mSize: true, mSpeed: true, mDir: true, mDensity: true,
    baseSpeed: 1, vib: 1, trail: 200, color: 'value'
  };
  let ruleA = null, ruleB = null, abFlag = false;
  let norm = [], dnorm = [], P = null, p5i = null;

  /* ----------------------------- 데이터 → 정규화 ----------------------------- */
  function recompute() {
    const d = state.data;
    const mn = Math.min(...d), mx = Math.max(...d), rng = (mx - mn) || 1;
    norm = d.map(v => (v - mn) / rng);
    let maxAbs = 0; const raw = d.map((v, i) => i ? v - d[i - 1] : 0);
    raw.forEach(x => maxAbs = Math.max(maxAbs, Math.abs(x)));
    dnorm = raw.map(x => maxAbs ? x / maxAbs : 0);
    $('#data-info').textContent = `${state.dataName} · ${d.length}개 · 최소 ${mn} ~ 최대 ${mx}`;
    build();
  }

  /* ----------------------------- 입자 생성 ----------------------------- */
  function build() {
    if (!p5i) return;
    const W = p5i.width, H = p5i.height, n = state.data.length, marg = 50;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const hx = marg + (n === 1 ? 0.5 : i / (n - 1)) * (W - marg * 2);
      const count = state.mDensity ? Math.round(5 + norm[i] * 45) : 16;
      const band = 30 + norm[i] * 90;
      for (let k = 0; k < count; k++) {
        arr.push({
          vi: i,
          hx: hx + (Math.random() - 0.5) * 16,
          hy: H / 2 + (Math.random() - 0.5) * band,
          px: hx, py: H / 2, vx: 0, vy: 0, ph: Math.random() * 6.28
        });
      }
    }
    P = arr;
  }

  function colorOf(v, p5) {
    if (state.color === 'warm') return p5.color(`hsl(${20 + v * 40}, 85%, ${45 + v * 20}%)`);
    if (state.color === 'cool') return p5.color(`hsl(${180 + v * 70}, 80%, ${45 + v * 20}%)`);
    return p5.color(`hsl(${(1 - v) * 220}, 82%, ${48 + v * 18}%)`); // 값: 한색→난색
  }

  /* ----------------------------- p5 스케치 ----------------------------- */
  const sketch = p => {
    p.setup = () => {
      const st = $('#dstage');
      const c = p.createCanvas(st.clientWidth, st.clientHeight); c.parent(st);
      p.pixelDensity(1); recompute();
    };
    p.windowResized = () => { const st = $('#dstage'); p.resizeCanvas(st.clientWidth, st.clientHeight); build(); };
    p.draw = () => {
      const ctx = p.drawingContext;
      ctx.fillStyle = state.trail >= 255 ? 'rgb(7,8,13)' : `rgba(7,8,13,${state.trail / 255})`;
      ctx.fillRect(0, 0, p.width, p.height);
      if (!P) return;
      const mAct = p.mouseX > 0 && p.mouseY > 0 && p.mouseX < p.width && p.mouseY < p.height;
      for (const o of P) {
        const v = norm[o.vi], dv = dnorm[o.vi];
        const speed = state.baseSpeed * (0.35 + (state.mSpeed ? Math.abs(dv) : 0.25) * 1.4);
        let ax = (o.hx - o.px) * 0.06, ay = (o.hy - o.py) * 0.03;
        ay += (state.mDir ? -Math.sign(dv) : 0) * speed * 0.55;          // 증가=위
        ax += (Math.random() - 0.5) * state.vib * speed;
        ay += (Math.random() - 0.5) * state.vib * speed;
        if (mAct) { // 가벼운 마우스 밀어내기
          const dx = o.px - p.mouseX, dy = o.py - p.mouseY, d2 = dx * dx + dy * dy;
          if (d2 < 9000) { const d = Math.sqrt(d2) + .1; const f = (1 - d / 95) * 4; ax += dx / d * f; ay += dy / d * f; }
        }
        o.vx = (o.vx + ax) * 0.9; o.vy = (o.vy + ay) * 0.9;
        o.px += o.vx; o.py += o.vy;
        const r = 1.5 + (state.mSize ? v * 7 : 1.5);
        ctx.fillStyle = colorOf(v, p).toString();
        ctx.beginPath(); ctx.arc(o.px, o.py, r, 0, 6.283); ctx.fill();
      }
    };
  };

  /* ----------------------------- 규칙 A/B ----------------------------- */
  function snapRule() { return { mSize: state.mSize, mSpeed: state.mSpeed, mDir: state.mDir, mDensity: state.mDensity }; }
  function applyRule(r) { if (!r) return; Object.assign(state, r); syncMap(); build(); }
  function syncMap() { $('#m-size').checked = state.mSize; $('#m-speed').checked = state.mSpeed; $('#m-dir').checked = state.mDir; $('#m-density').checked = state.mDensity; }

  /* ----------------------------- 코치 ----------------------------- */
  function rulesText() {
    const on = []; if (state.mSize) on.push('값→크기'); if (state.mSpeed) on.push('변화량→속도'); if (state.mDir) on.push('증가/감소→방향'); if (state.mDensity) on.push('값→밀도');
    return on.join(', ') || '매핑 없음';
  }
  function mdToHtml(t) {
    return UI.escapeHTML(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/\n/g, '<br>');
  }
  async function coach() {
    UI.modal('🧭 감상 코치', '<div class="spinner"></div> 질문을 준비하는 중…', '답이 아니라 질문이에요');
    const ctx = { kind: 'data', intent: $('#in-intent').value, dataName: $('#in-dataname').value || state.dataName, rules: rulesText() };
    const res = await Coach.ask(ctx);
    const note = res.source.indexOf('api') === 0 ? '실제 모델' : '오프라인 코치';
    UI.modal('🧭 감상 코치 <span class="badge">' + note + '</span>', `<div class="lvl-b">${mdToHtml(res.text)}</div>`, '답이 아니라 질문이에요');
  }

  /* ----------------------------- 저장/전시 ----------------------------- */
  function thumb() {
    const w = 360, h = Math.round(w * p5i.height / p5i.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(p5i.canvas, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.6);
  }
  function settings() { return { mapping: snapRule(), baseSpeed: state.baseSpeed, vib: state.vib, trail: state.trail, color: state.color, data: state.data, dataName: $('#in-dataname').value || state.dataName }; }

  async function saveNote() {
    const u = requireUser(); if (!u) return;
    await Store.saveNote({ userId: u.userId, by: u.display, kind: 'data', title: ($('#in-dataname').value || state.dataName),
      intent: $('#in-intent').value, evidence: $('#in-evidence').value, settings: settings() });
    UI.toast('작업노트에 저장했습니다.');
  }
  async function exhibit() {
    const u = requireUser(); if (!u) return;
    const intent = $('#in-intent').value.trim(), evidence = $('#in-evidence').value.trim();
    if (!intent || !evidence) { UI.toast('전시 전에 ‘의도 한 문장 + 근거 1개 이상’을 채워 주세요.'); document.querySelector('details:nth-of-type(4)').open = true; return; }
    await Store.saveWork({ userId: u.userId, by: u.display, kind: 'data', title: ($('#in-dataname').value || state.dataName),
      intent, evidence, dataName: $('#in-dataname').value || state.dataName, settings: settings(), thumb: thumb(), exhibited: true });
    UI.toast('🎉 갤러리에 전시했습니다!');
  }
  function requireUser() { const u = Auth.current(); if (!u) { UI.toast('로그인이 필요합니다.'); setTimeout(() => location.href = 'index.html?next=studio-data.html', 900); return null; } return u; }
  function saveImage() { const a = document.createElement('a'); a.download = 'data_art_' + Date.now() + '.png'; a.href = p5i.canvas.toDataURL('image/png'); a.click(); UI.toast('이미지를 저장했습니다.'); }

  /* ----------------------------- 이벤트 ----------------------------- */
  function rng(id, out, key, fmt) { const el = $('#' + id); el.addEventListener('input', () => { state[key] = +el.value; $('#' + out).textContent = fmt ? fmt(+el.value) : el.value; }); }
  function chk(id, key) { $('#' + id).addEventListener('change', e => { state[key] = e.target.checked; build(); }); }

  document.addEventListener('DOMContentLoaded', () => {
    UI.mountIdeaBar('idea', 'data');
    $('#in-dataname').value = state.dataName;
    p5i = new p5(sketch);

    $('#sel-sample').addEventListener('change', e => { state.data = SAMPLES[e.target.value].slice(); state.dataName = SAMPLE_NAME[e.target.value]; $('#in-dataname').value = state.dataName; $('#ta-data').value = state.data.join(', '); recompute(); });
    $('#btn-apply-data').addEventListener('click', () => {
      const vals = $('#ta-data').value.split(/[\s,;\n\t]+/).map(parseFloat).filter(v => !isNaN(v));
      if (vals.length < 2) { UI.toast('숫자를 2개 이상 입력하세요.'); return; }
      state.data = vals; recompute(); UI.toast('데이터를 적용했습니다.');
    });
    $('#btn-upload-csv').addEventListener('click', () => $('#csv').click());
    $('#csv').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#ta-data').value = r.result; $('#btn-apply-data').click(); }; r.readAsText(f); });

    chk('m-size', 'mSize'); chk('m-speed', 'mSpeed'); chk('m-dir', 'mDir'); chk('m-density', 'mDensity');
    rng('r-speed', 'o-speed', 'baseSpeed'); rng('r-vib', 'o-vib', 'vib'); rng('r-trail', 'o-trail', 'trail');
    $('#sel-color').addEventListener('change', e => state.color = e.target.value);

    $('#btn-ruleA').addEventListener('click', () => { ruleA = snapRule(); UI.toast('규칙 A 저장됨'); });
    $('#btn-ruleB').addEventListener('click', () => { ruleB = snapRule(); UI.toast('규칙 B 저장됨'); });
    $('#btn-ab').addEventListener('click', () => { if (!ruleA || !ruleB) { UI.toast('먼저 규칙 A·B를 저장하세요.'); return; } abFlag = !abFlag; applyRule(abFlag ? ruleB : ruleA); UI.toast('적용: 규칙 ' + (abFlag ? 'B' : 'A')); });

    $('#btn-coach').addEventListener('click', coach);
    $('#btn-img').addEventListener('click', saveImage);
    $('#btn-note').addEventListener('click', saveNote);
    $('#btn-exhibit').addEventListener('click', exhibit);
    $('#ta-data').value = state.data.join(', ');
  });
})();
