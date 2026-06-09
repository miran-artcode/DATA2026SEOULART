/*
 * app.js — 화면 구성·상태·이벤트 연결 (메인)
 * -----------------------------------------------------------------------------
 * p5.js로 캔버스를 그리고, 오른쪽 패널의 조작 설정(상태)을 입자 시스템에 전달한다.
 * 분석은 ImageAnalysis, 소리는 AudioInput, 입자는 Particles 모듈이 담당.
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const BG = [12, 14, 22]; // 캔버스 배경(갤러리 느낌의 짙은 색)

  /* ----------------------------- 상태(조작 설정) ----------------------------- */
  const state = {
    // 분석
    K: 8, space: 'rgb', sampling: 'uniform', N: 4000, seed: 12345,
    // 점
    size: 3, colorMode: 'cluster', mosaicCell: 0,
    // 움직임
    mode: 'points', motionMode: 'hold', returnForce: 0.08, vibration: 0, trail: 255, additive: false,
    rotateSpeed: 0.004, depth: 220, palChart: 'donut',
    // 인터랙션(마우스)
    mouseMode: 'repel', mouseRadius: 130, mouseStrength: 1, clickExplode: true,
    // 인터랙션(마이크)
    micSens: 1.2, micTarget: 'vibration', freqOn: true,
    // 메타(윤리/리포트)
    meta: { title: '', artist: '', source: '', student: '', intent: '' }
  };

  let sourceCanvas = null;   // 분석 대상 원본(업로드/데모)
  let analysis = null;       // 분석 결과
  let system = null;         // 입자 시스템
  let p5i = null;            // p5 인스턴스
  let recorder = null, recChunks = [], recording = false;
  let dragging = false, dragX = 0, lastAngle = 0;

  /* ----------------------------- 작은 도우미 ----------------------------- */
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms || 2200);
  }
  function setBusy(on) { $('#busy').classList.toggle('show', !!on); }
  function fmt(n) { return n.toLocaleString('ko-KR'); }

  // 캔버스 안에서 이미지가 놓일 사각형(비율 유지, 가운데 정렬)
  function imageRect() {
    if (!analysis) return { x: 0, y: 0, w: p5i.width, h: p5i.height };
    const pad = 24;
    const cw = p5i.width - pad * 2, ch = p5i.height - pad * 2;
    const ar = analysis.width / analysis.height;
    let w = cw, h = cw / ar;
    if (h > ch) { h = ch; w = ch * ar; }
    return { x: (p5i.width - w) / 2, y: (p5i.height - h) / 2, w, h };
  }

  /* ----------------------------- 소스 불러오기 ----------------------------- */
  function loadFromFile(file) {
    if (!file || !file.type.startsWith('image/')) { toast('이미지 파일을 넣어 주세요.'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.getContext('2d').drawImage(img, 0, 0);
      sourceCanvas = cv;
      URL.revokeObjectURL(url);
      if (!state.meta.title) { state.meta.title = file.name.replace(/\.[^.]+$/, ''); $('#in-title').value = state.meta.title; }
      showThumb(); runAnalysis();
    };
    img.onerror = () => toast('이미지를 불러오지 못했습니다.');
    img.src = url;
  }
  function loadDemo(name) {
    sourceCanvas = ImageAnalysis.generateDemo(name, 640, 480);
    showThumb(); runAnalysis();
  }
  function showThumb() {
    const c = $('#thumb');
    const ctx = c.getContext('2d');
    const ar = sourceCanvas.width / sourceCanvas.height;
    c.width = 180; c.height = Math.round(180 / ar);
    ctx.drawImage(sourceCanvas, 0, 0, c.width, c.height);
    $('#thumb-wrap').classList.add('has');
  }

  /* ----------------------------- 분석 실행 ----------------------------- */
  function runAnalysis() {
    if (!sourceCanvas) return;
    setBusy(true);
    // UI가 먼저 갱신되도록 한 박자 뒤에 무거운 작업 실행
    setTimeout(() => {
      try {
        analysis = ImageAnalysis.analyze(sourceCanvas, {
          K: state.K, space: state.space, sampling: state.sampling, N: state.N, seed: state.seed
        });
        renderPalette();
        rebuildSystem();
        toast('분석 완료 · K=' + state.K + ' · 점 ' + fmt(state.N) + '개');
      } catch (e) {
        console.error(e); toast('분석 중 오류: ' + e.message);
      } finally { setBusy(false); }
    }, 16);
  }

  function rebuildSystem() {
    if (!analysis) return;
    system = Particles.create(analysis, imageRect(), { colorMode: state.colorMode, baseSize: state.size, mosaicCell: state.mosaicCell });
    updatePointInfo();
  }
  function updatePointInfo() {
    const el = $('#point-info');
    if (el && system) el.textContent = '현재 점 ' + fmt(system.n) + '개 — 적으면 또렷한 점(추상), 많으면 촘촘(사진처럼). 그림이 ‘점으로 치환’된 거예요.';
  }

  // 팔레트(대표색 + 비율) 표시 — 너비를 비율대로(비례 띠), 클릭하면 군집 켜기/끄기
  function renderPalette() {
    const box = $('#palette'); box.className = 'palette prop'; box.innerHTML = '';
    const pal = analysis.palette;
    const MAXSEG = 64;                         // 비례 띠는 상위 N개 + ‘기타’로 깔끔하게
    const display = pal.length <= MAXSEG ? pal : pal.slice(0, MAXSEG);
    display.forEach((p, i) => {
      const seg = document.createElement('button');
      seg.className = 'pseg';
      seg.style.background = 'rgb(' + p.r + ',' + p.g + ',' + p.b + ')';
      seg.style.flexGrow = Math.max(p.ratio, 0.0008);   // ← 비율만큼 너비 차지
      const pct = Math.round(p.ratio * 100);
      seg.title = pct + '% · 클릭: 이 색 군집 켜기/끄기';
      if (p.ratio > 0.06) seg.innerHTML = '<span class="pct">' + pct + '%</span>';
      seg.addEventListener('click', () => {
        if (!system) return;
        const on = !system.visible[i];
        system.setVisibility(i, on);
        seg.classList.toggle('off', !on);
      });
      box.appendChild(seg);
    });
    if (pal.length > MAXSEG) {
      let ratio = 0; for (let i = MAXSEG; i < pal.length; i++) ratio += pal[i].ratio;
      const seg = document.createElement('div');
      seg.className = 'pseg'; seg.style.background = '#565b6e';
      seg.style.flexGrow = Math.max(ratio, 0.0008);
      seg.title = '기타 ' + fmt(pal.length - MAXSEG) + '색 (' + Math.round(ratio * 100) + '%)';
      box.appendChild(seg);
    }
    const adjusted = analysis.requestedK > analysis.K;
    const note = adjusted
      ? '입력 K=' + fmt(analysis.requestedK) + ' → 실제 K=' + fmt(analysis.K) + ' (이미지 색 수·성능 한계로 자동 조정)'
      : 'K=' + fmt(analysis.K);
    $('#palette-meta').textContent = note + ' · ' + (state.space === 'lab' ? 'LAB' : 'RGB') + ' · 비율 높은 순';
    const kn = $('#k-note'); if (kn) kn.textContent = adjusted ? '※ ' + note : '';
    drawPalChart(state.palChart);
  }

  // 팔레트를 다양한 차트로: 도넛 / 막대 (점 수가 많으면 상위 N + ‘기타’로 묶음)
  function drawPalChart(type) {
    const cv = $('#pal-canvas'); if (!cv || !analysis) return;
    if (type === 'heatmap') { if (window.Charts && sourceCanvas) { const st = Charts.computeStats(sourceCanvas); Charts.heatmap(cv, st.samples); } return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || cv.parentElement.clientWidth || 280;
    const pal = analysis.palette, MAX = 24;
    let items = pal;
    if (pal.length > MAX) {
      items = pal.slice(0, MAX);
      let ratio = 0; for (let i = MAX; i < pal.length; i++) ratio += pal[i].ratio;
      items = items.concat([{ r: 120, g: 124, b: 140, ratio: ratio, rest: pal.length - MAX }]);
    }
    const h = type === 'hbars' ? (12 + items.length * 15) : Math.round(w * 0.62);
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);

    if (type === 'hbars') {
      const pad = 6, rowH = (h - pad * 2) / items.length;
      const max = Math.max.apply(null, items.map(p => p.ratio).concat(0.001));
      items.forEach((p, i) => {
        const bw = (p.ratio / max) * (w - 64), y = pad + i * rowH;
        ctx.fillStyle = 'rgb(' + p.r + ',' + p.g + ',' + p.b + ')';
        ctx.fillRect(58, y + 1, Math.max(2, bw), rowH - 2);
        ctx.fillStyle = '#9aa3bd'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(p.ratio * 100) + '%', 52, y + rowH / 2 + 3);
      });
    } else { // donut
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42, r = R * 0.55; let a0 = -Math.PI / 2;
      items.forEach(p => {
        const a1 = a0 + p.ratio * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.fillStyle = 'rgb(' + p.r + ',' + p.g + ',' + p.b + ')';
        ctx.arc(cx, cy, R, a0, a1); ctx.closePath(); ctx.fill(); a0 = a1;
      });
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#cdd3e6'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('상위 ' + Math.round((pal[0] ? pal[0].ratio : 0) * 100) + '%', cx, cy + 4);
    }
  }

  /* ----------------------------- p5 스케치 ----------------------------- */
  const sketch = (p) => {
    p.setup = () => {
      const holder = $('#canvas-holder');
      const c = p.createCanvas(holder.clientWidth, holder.clientHeight);
      c.parent(holder);
      p.pixelDensity(1);
      p.frameRate(60);
    };
    p.windowResized = () => {
      const holder = $('#canvas-holder');
      p.resizeCanvas(holder.clientWidth, holder.clientHeight);
      if (system) system.remap(imageRect(), false);
    };
    p.draw = () => {
      const ctx = p.drawingContext;
      // 잔상(트레일): 255면 완전 지움, 낮을수록 자취가 남음
      if (state.trail >= 255) {
        ctx.fillStyle = 'rgb(' + BG[0] + ',' + BG[1] + ',' + BG[2] + ')';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(' + BG[0] + ',' + BG[1] + ',' + BG[2] + ',' + (state.trail / 255) + ')';
      }
      ctx.fillRect(0, 0, p.width, p.height);

      if (!system) { drawHint(p, ctx); return; }

      // 마이크 값 갱신 + 미터 표시
      AudioInput.sensitivity = state.micSens;
      const mic = AudioInput.getValues();
      if (AudioInput.enabled) updateMeter(mic);

      // 3D 모드에서 드래그로 회전
      if (dragging && state.mode === '3d') {
        system.angle = lastAngle + (p.mouseX - dragX) * 0.01;
      }

      system.update(buildEnv(p, mic));
      system.render(ctx, {
        mode: state.mode,
        lines: state.mode === 'lines',
        additive: state.additive,
        depth: state.depth
      });
    };
    p.mousePressed = () => {
      if (p.mouseX < 0 || p.mouseY < 0 || p.mouseX > p.width || p.mouseY > p.height) return;
      if (state.mode === '3d') { dragging = true; dragX = p.mouseX; lastAngle = system ? system.angle : 0; }
      if (state.clickExplode && system) system.explode(p.mouseX, p.mouseY, state.mouseStrength * 7, state.mouseRadius * 2.2);
    };
    p.mouseReleased = () => { dragging = false; };
  };

  function buildEnv(p, mic) {
    const inside = p.mouseX >= 0 && p.mouseY >= 0 && p.mouseX <= p.width && p.mouseY <= p.height;
    return {
      motion: {
        returnForce: state.returnForce, damping: 0.86, vibration: state.vibration,
        rotateSpeed: state.mode === '3d' && !dragging ? state.rotateSpeed : 0,
        free: state.motionMode === 'free', wander: 1.2 + state.vibration
      },
      mouse: {
        x: p.mouseX, y: p.mouseY,
        mode: (inside && state.mode !== '3d') ? state.mouseMode : 'none',
        radius: state.mouseRadius, strength: state.mouseStrength
      },
      mic: {
        enabled: AudioInput.enabled, volume: mic.volume, low: mic.low, mid: mic.mid, high: mic.high,
        target: state.micTarget, freqOn: state.freqOn
      }
    };
  }

  function drawHint(p, ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center';
    ctx.font = '16px sans-serif';
    ctx.fillText('이미지를 업로드하거나 데모를 선택하세요.', p.width / 2, p.height / 2);
  }

  function updateMeter(mic) {
    $('#m-vol').style.width = Math.round(mic.volume * 100) + '%';
    $('#m-low').style.width = Math.round(mic.low * 100) + '%';
    $('#m-mid').style.width = Math.round(mic.mid * 100) + '%';
    $('#m-high').style.width = Math.round(mic.high * 100) + '%';
  }

  /* ----------------------------- 프리셋 ----------------------------- */
  const PRESETS = {
    pointillism: { label: '점묘화(고요)', mode: 'points', returnForce: 0.12, vibration: 0, trail: 255, additive: false, mouseMode: 'swell', mouseRadius: 120, mouseStrength: 1, clickExplode: false },
    living: { label: '살아있는 캔버스', mode: 'points', returnForce: 0.06, vibration: 0.6, trail: 200, additive: false, mouseMode: 'repel', mouseRadius: 150, mouseStrength: 1.2, clickExplode: true },
    sound: { label: '소리로 연주', mode: 'points', returnForce: 0.05, vibration: 0, trail: 150, additive: true, mouseMode: 'repel', clickExplode: true, micTarget: 'vibration', freqOn: true },
    nebula: { label: '성운·해체', mode: 'lines', returnForce: 0.012, vibration: 0.3, trail: 60, additive: true, mouseMode: 'attract', mouseRadius: 200, mouseStrength: 1.4, clickExplode: true },
    sculpture: { label: '3D 조각', mode: '3d', returnForce: 0.1, vibration: 0, trail: 255, additive: true, depth: 260, rotateSpeed: 0.005, clickExplode: false }
  };
  function applyPreset(name) {
    const pre = PRESETS[name]; if (!pre) return;
    Object.keys(pre).forEach(k => { if (k !== 'label') state[k] = pre[k]; });
    syncControls();
    if (system) system.setColorMode(state.colorMode);
    toast('프리셋 적용: ' + pre.label);
  }

  /* ----------------------------- 내보내기 ----------------------------- */
  function saveImage() {
    const a = document.createElement('a');
    a.download = 'artwork_' + Date.now() + '.png';
    a.href = p5i.canvas.toDataURL('image/png');
    a.click();
    toast('이미지를 저장했습니다.');
  }
  function toggleRecord(btn) {
    if (!recording) {
      if (!p5i.canvas.captureStream) { toast('이 브라우저는 녹화를 지원하지 않습니다.'); return; }
      const stream = p5i.canvas.captureStream(30);
      let mime = 'video/webm';
      if (window.MediaRecorder && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) mime = 'video/webm;codecs=vp9';
      recorder = new MediaRecorder(stream, { mimeType: mime });
      recChunks = [];
      recorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recChunks, { type: 'video/webm' });
        const a = document.createElement('a');
        a.download = 'artwork_' + Date.now() + '.webm';
        a.href = URL.createObjectURL(blob);
        a.click();
        toast('영상을 저장했습니다.');
      };
      recorder.start();
      recording = true; btn.textContent = '■ 녹화 중지'; btn.classList.add('rec');
      toast('녹화를 시작했습니다. 다시 누르면 저장됩니다.');
    } else {
      recorder.stop(); recording = false; btn.textContent = '● 영상 녹화'; btn.classList.remove('rec');
    }
  }
  function copyPalette() {
    if (!analysis) return;
    const hex = analysis.palette.map(p =>
      '#' + [p.r, p.g, p.b].map(v => v.toString(16).padStart(2, '0')).join('')).join('  ');
    navigator.clipboard.writeText(hex).then(() => toast('팔레트 색상코드를 복사했습니다.'),
      () => toast('복사 실패(브라우저 권한 확인).'));
  }
  function exportSettings() {
    const data = { app: '그림이 분해되어 다시 연주되다', version: 1, savedAt: new Date().toISOString(), state };
    download('settings_' + Date.now() + '.json', JSON.stringify(data, null, 2), 'application/json');
    toast('설정(JSON)을 저장했습니다.');
  }
  function importSettings(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        const s = data.state || data;
        Object.keys(state).forEach(k => { if (s[k] !== undefined) state[k] = s[k]; });
        if (s.meta) state.meta = Object.assign(state.meta, s.meta);
        syncControls();
        runAnalysis();
        toast('설정을 불러왔습니다.');
      } catch (e) { toast('설정 파일을 읽지 못했습니다.'); }
    };
    r.readAsText(file);
  }

  // 부록 A·B 양식을 채운 분석 리포트/설계서(Markdown) 내보내기
  function exportReport() {
    if (!analysis) { toast('먼저 이미지를 분석하세요.'); return; }
    const m = state.meta;
    const hex = (p) => '#' + [p.r, p.g, p.b].map(v => v.toString(16).padStart(2, '0')).join('');
    const rows = analysis.palette.map((p, i) =>
      `| ${i + 1} | ${hex(p)} | rgb(${p.r}, ${p.g}, ${p.b}) | ${Math.round(p.ratio * 100)}% |`).join('\n');
    const sampleName = { uniform: '무작위', bright: '밝은영역 가중', dark: '어두운영역 가중', edge: '윤곽(에지) 가중' }[state.sampling];
    const mouseName = { none: '없음', repel: '밀어내기', attract: '끌어당기기', swell: '부풀리기', scatter: '흩뿌리기' }[state.mouseMode];
    const targetName = { vibration: '진동', spread: '확산', size: '크기', explode: '폭발' }[state.micTarget];
    const modeName = { points: '점', lines: '점+선', '3d': '3D 조각' }[state.mode];

    const md = `# 분석 리포트 & 인터랙션 설계서
## 「그림이 분해되어 다시 연주되다」

### A) 알고리즘 분석 리포트
- 작품명/작가: **${m.title || '(미기재)'}** / ${m.artist || '(미기재)'}
- 출처·라이선스: ${m.source || '(미기재)'}
- 제작자(학생): ${m.student || '(미기재)'}
- 전처리: 리사이즈 ${analysis.width}×${analysis.height}px · 색공간 ${state.space.toUpperCase()} · 샘플링 ${sampleName}
- 최종 K: **${state.K}** · 난수 시드 ${state.seed}

| # | HEX | RGB | 비율 |
|---|-----|-----|------|
${rows}

- 한계(손실/근사): K-means는 색을 ${state.K}개로 "요약"하므로 미세한 색·질감이 사라집니다. 결과는 정답이 아니라 하나의 해석입니다.

### B) 인터랙션 설계서
- 관람 경험 목표(한 문장): ${m.intent || '(미기재)'}
- 점 개수 N(최종): **${fmt(state.N)}** · 점 크기 ${state.size} · 색 모드 ${state.colorMode === 'cluster' ? '대표색' : '원본색'}
- 표현 모드: ${modeName} · 복귀력 ${state.returnForce} · 진동 ${state.vibration} · 잔상 ${state.trail} · 발광 ${state.additive ? 'ON' : 'OFF'}
- 입력 → 출력 규칙
  1. **마우스**(반경 ${state.mouseRadius}, 세기 ${state.mouseStrength}) → ${mouseName}${state.clickExplode ? ' · 클릭 시 폭발' : ''}
  2. **마이크 볼륨** → ${targetName}${state.freqOn ? ' · 주파수(저/중/고음) → 밝기별 색 군집 반응' : ''}

### 윤리 점검
- [ ] 마이크 음성은 저장하지 않음(실시간 분석값만 사용)
- [ ] 원작 출처·라이선스 표기 완료
- [ ] AI(K-means) 기여 범위 표기: 색 분석·요약은 알고리즘, 의도·규칙 설계는 학생

_생성: ${new Date().toLocaleString('ko-KR')}_
`;
    download('report_' + Date.now() + '.md', md, 'text/markdown');
    toast('리포트(.md)를 저장했습니다.');
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.download = name; a.href = URL.createObjectURL(blob); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ----------------------------- 컨트롤 ↔ 상태 동기화 ----------------------------- */
  // 화면의 입력값을 state 기준으로 다시 맞춘다(프리셋/불러오기 후 호출)
  function syncControls() {
    setVal('#rng-k', Math.min(state.K, 64)); setVal('#num-k', state.K); setOut('#out-k', fmt(state.K));
    setVal('#sel-space', state.space); setVal('#sel-sampling', state.sampling);
    setVal('#rng-n', state.N); setOut('#out-n', fmt(state.N));
    setVal('#rng-size', state.size); setOut('#out-size', state.size);
    setVal('#sel-colormode', state.colorMode);
    setVal('#rng-mcell', state.mosaicCell); setOut('#out-mcell', state.mosaicCell);
    setVal('#sel-mode', state.mode);
    setVal('#sel-motion', state.motionMode);
    setVal('#rng-return', state.returnForce); setOut('#out-return', state.returnForce);
    setVal('#rng-vibration', state.vibration); setOut('#out-vibration', state.vibration);
    setVal('#rng-trail', state.trail); setOut('#out-trail', state.trail);
    setChk('#chk-additive', state.additive);
    setVal('#rng-rotate', state.rotateSpeed); setOut('#out-rotate', state.rotateSpeed);
    setVal('#rng-depth', state.depth); setOut('#out-depth', state.depth);
    setVal('#sel-mouse', state.mouseMode);
    setVal('#rng-mradius', state.mouseRadius); setOut('#out-mradius', state.mouseRadius);
    setVal('#rng-mstrength', state.mouseStrength); setOut('#out-mstrength', state.mouseStrength);
    setChk('#chk-explode', state.clickExplode);
    setVal('#rng-msens', state.micSens); setOut('#out-msens', state.micSens);
    setVal('#sel-mtarget', state.micTarget);
    setChk('#chk-freq', state.freqOn);
    $('#in-title').value = state.meta.title || '';
    $('#in-artist').value = state.meta.artist || '';
    $('#in-source').value = state.meta.source || '';
    $('#in-student').value = state.meta.student || '';
    $('#in-intent').value = state.meta.intent || '';
    $('#row-3d').style.display = state.mode === '3d' ? '' : 'none';
  }
  function setVal(sel, v) { const el = $(sel); if (el) el.value = v; }
  function setOut(sel, v) { const el = $(sel); if (el) el.textContent = v; }
  function setChk(sel, v) { const el = $(sel); if (el) el.checked = !!v; }

  /* ----------------------------- 이벤트 연결 ----------------------------- */
  function bindUI() {
    // 소스
    $('#file-input').addEventListener('change', e => { if (e.target.files[0]) loadFromFile(e.target.files[0]); });
    $('#btn-upload').addEventListener('click', () => $('#file-input').click());
    $('#sel-demo').addEventListener('change', e => loadDemo(e.target.value));
    $('#btn-analyze').addEventListener('click', runAnalysis);

    // 드래그&드롭
    const holder = $('#canvas-holder');
    ['dragover', 'dragenter'].forEach(ev => holder.addEventListener(ev, e => { e.preventDefault(); holder.classList.add('drop'); }));
    ['dragleave', 'drop'].forEach(ev => holder.addEventListener(ev, e => { e.preventDefault(); holder.classList.remove('drop'); }));
    holder.addEventListener('drop', e => { if (e.dataTransfer.files[0]) loadFromFile(e.dataTransfer.files[0]); });

    // 분석 파라미터(변경 시 재분석이 필요한 것들)
    // K: 슬라이더(빠른 범위) + 숫자 입력(1 ~ 1,000,000 까지). 실제 K는 이미지·성능 한계로 자동 조정.
    const rngK = $('#rng-k'), numK = $('#num-k');
    const setK = (v, reanalyze) => {
      v = Math.max(1, Math.min(Math.floor(v || 1), 1000000));
      state.K = v; setOut('#out-k', fmt(v));
      if (rngK) rngK.value = Math.min(v, +rngK.max);
      if (numK && document.activeElement !== numK) numK.value = v;
      if (reanalyze) runAnalysis();
    };
    if (rngK) { rngK.addEventListener('input', () => setK(+rngK.value, false)); rngK.addEventListener('change', () => setK(+rngK.value, true)); }
    if (numK) { numK.addEventListener('change', () => setK(+numK.value, true)); numK.addEventListener('keydown', e => { if (e.key === 'Enter') { setK(+numK.value, true); numK.blur(); } }); }
    // 팔레트 차트 전환
    document.querySelectorAll('[data-pchart]').forEach(b => b.addEventListener('click', () => {
      state.palChart = b.dataset.pchart;
      document.querySelectorAll('[data-pchart]').forEach(x => x.classList.toggle('on', x === b));
      if (analysis) drawPalChart(state.palChart);
    }));
    // K-means 설명 모달(쉬움/중간/전문가)
    bindKmeansModal();
    $('#sel-space').addEventListener('change', e => { state.space = e.target.value; runAnalysis(); });
    $('#sel-sampling').addEventListener('change', e => { state.sampling = e.target.value; runAnalysis(); });
    onRange('#rng-n', '#out-n', v => { state.N = v | 0; }, true, fmt);
    $('#btn-shuffle').addEventListener('click', () => { state.seed = (Math.random() * 1e9) | 0; runAnalysis(); });

    // 점(재분석 없이 시스템만 갱신)
    onRange('#rng-size', '#out-size', v => { state.size = v; if (system) system.opts.baseSize = v; });
    $('#sel-colormode').addEventListener('change', e => { state.colorMode = e.target.value; if (system) system.setColorMode(state.colorMode); });
    onRange('#rng-mcell', '#out-mcell', v => { state.mosaicCell = v | 0; if (system) { system.opts.mosaicCell = state.mosaicCell; system.remap(imageRect(), true); } });

    // 움직임(실시간 반영)
    $('#sel-mode').addEventListener('change', e => { state.mode = e.target.value; $('#row-3d').style.display = state.mode === '3d' ? '' : 'none'; });
    $('#sel-motion').addEventListener('change', e => state.motionMode = e.target.value);
    onRange('#rng-return', '#out-return', v => state.returnForce = v);
    onRange('#rng-vibration', '#out-vibration', v => state.vibration = v);
    onRange('#rng-trail', '#out-trail', v => state.trail = v | 0);
    $('#chk-additive').addEventListener('change', e => state.additive = e.target.checked);
    onRange('#rng-rotate', '#out-rotate', v => state.rotateSpeed = v);
    onRange('#rng-depth', '#out-depth', v => state.depth = v | 0);

    // 인터랙션(마우스)
    $('#sel-mouse').addEventListener('change', e => state.mouseMode = e.target.value);
    onRange('#rng-mradius', '#out-mradius', v => state.mouseRadius = v | 0);
    onRange('#rng-mstrength', '#out-mstrength', v => state.mouseStrength = v);
    $('#chk-explode').addEventListener('change', e => state.clickExplode = e.target.checked);

    // 인터랙션(마이크)
    $('#btn-mic').addEventListener('click', toggleMic);
    onRange('#rng-msens', '#out-msens', v => state.micSens = v);
    $('#sel-mtarget').addEventListener('change', e => state.micTarget = e.target.value);
    $('#chk-freq').addEventListener('change', e => state.freqOn = e.target.checked);

    // 프리셋
    document.querySelectorAll('[data-preset]').forEach(b =>
      b.addEventListener('click', () => applyPreset(b.dataset.preset)));

    // 내보내기
    $('#btn-save-img').addEventListener('click', saveImage);
    $('#btn-record').addEventListener('click', e => toggleRecord(e.currentTarget));
    $('#btn-copy-palette').addEventListener('click', copyPalette);
    $('#btn-save-settings').addEventListener('click', exportSettings);
    $('#btn-load-settings').addEventListener('click', () => $('#settings-input').click());
    $('#settings-input').addEventListener('change', e => { if (e.target.files[0]) importSettings(e.target.files[0]); });
    $('#btn-report').addEventListener('click', exportReport);

    // 메타(윤리/리포트)
    bindMeta('#in-title', 'title'); bindMeta('#in-artist', 'artist');
    bindMeta('#in-source', 'source'); bindMeta('#in-student', 'student');
    bindMeta('#in-intent', 'intent');

    // 도움말
    $('#btn-help').addEventListener('click', () => $('#modal-help').classList.add('show'));
    $('#btn-help-close').addEventListener('click', () => $('#modal-help').classList.remove('show'));
    $('#modal-help').addEventListener('click', e => { if (e.target.id === 'modal-help') $('#modal-help').classList.remove('show'); });

    // 패널 열기/닫기(모바일)
    $('#btn-toggle-panel').addEventListener('click', () => document.body.classList.toggle('panel-open'));

    initSplitter();
    addTooltips();
  }

  // 각 항목에 마우스를 올리면 '무엇을 해야 하는지/왜 흥미로운지' 안내(동기부여)
  function addTooltips() {
    const sumTips = [
      '먼저 그림을 넣어요 — 데모를 고르거나 파일을 끌어다 놓아도 돼요.',
      'K-means로 색을 K개의 대표색으로 요약해요. K를 바꿔 분위기가 어떻게 변하는지 비교해 보세요.',
      '점 개수(해상도)와 크기·색으로 표현 전략을 정해요.',
      '복귀력·진동·잔상으로 움직임을 디자인 — ‘원위치 유지/자유’도 골라 보세요.',
      '마우스·소리로 관람자가 작품을 ‘연주’하게 만들어요.',
      '한 번에 분위기를 잡는 프리셋 — 적용 후 내 취향으로 다듬어요.',
      '이미지·영상·리포트·설정으로 제출물을 만들어요.',
      '출처·의도·AI 기여를 정직하게 기록해요(미술 + 윤리).'
    ];
    document.querySelectorAll('.panel > details > summary').forEach((s, i) => { if (sumTips[i]) s.title = sumTips[i]; });
    const tip = (sel, t) => { const el = $(sel); if (el) el.title = t; };
    tip('#rng-n', '점이 많을수록 자세하지만 무거워요. 메시지에 맞는 ‘해상도’를 골라 보세요.');
    tip('#rng-size', '점 크기 — 작으면 섬세, 크면 대담해요.');
    tip('#sel-colormode', '대표색 = 요약된 분위기 / 원본색 = 사진처럼 풍부.');
    tip('#sel-mode', '점 / 점+선 / 3D 조각(밝기→깊이)으로 표현을 바꿔 보세요.');
    tip('#rng-return', '클수록 그림을 단단히 유지, 작을수록 흩어져 떠돌아요.');
    tip('#rng-vibration', '떨림의 세기 — 0이면 고요, 크면 들썩여요.');
    tip('#rng-trail', '낮출수록 자취(궤적)가 남아 ‘흐름’이 보여요.');
    tip('#chk-additive', '겹친 빛이 더 밝아지는 발광 효과 — 성운·네온 느낌.');
    tip('#sel-mouse', '관람자의 마우스에 어떻게 반응할지 — 밀기/끌기/부풀리기/흩뿌리기.');
    tip('#btn-mic', '마이크로 소리에 반응 — 잔잔한 곡엔 천천히, 격한 곡엔 폭발처럼 연주돼요.');
    tip('#btn-report', '분석 리포트 + 인터랙션 설계서(.md)로 과정평가 제출물을 완성해요.');
    tip('#btn-shuffle', '같은 설정이라도 시작점이 달라지면 결과가 살짝 달라져요(시드).');
  }

  // K-means 설명 모달: 쉬움 / 중간 / 전문가 탭 전환
  function bindKmeansModal() {
    const btn = $('#btn-kmeans'), modal = $('#modal-kmeans');
    if (!btn || !modal) return;
    btn.addEventListener('click', () => modal.classList.add('show'));
    $('#km-close').addEventListener('click', () => modal.classList.remove('show'));
    modal.addEventListener('click', e => { if (e.target.id === 'modal-kmeans') modal.classList.remove('show'); });
    document.querySelectorAll('[data-kmtab]').forEach(b => b.addEventListener('click', () => {
      const lv = b.dataset.kmtab;
      document.querySelectorAll('[data-kmtab]').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('.km-level').forEach(s => s.classList.toggle('show', s.dataset.kmlevel === lv));
    }));
  }

  // 작품창 ↔ 설정창 너비를 학생이 드래그로 조절(--panel-w 변경 + 캔버스 리사이즈)
  function initSplitter() {
    const split = $('#splitter'); if (!split) return;
    let drag = false, raf = 0;
    const apply = (clientX) => {
      const layout = document.querySelector('.layout'); if (!layout) return;
      const total = layout.clientWidth;
      let w = total - clientX;                       // 패널은 오른쪽
      w = Math.max(240, Math.min(w, total - 320));   // 패널 최소 240, 작품창 최소 320
      document.documentElement.style.setProperty('--panel-w', w + 'px');
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!p5i) return;
        const holder = $('#canvas-holder');
        p5i.resizeCanvas(holder.clientWidth, holder.clientHeight);
        if (system) system.remap(imageRect(), false);
      });
    };
    const start = () => { drag = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; };
    const end = () => { drag = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    split.addEventListener('mousedown', e => { e.preventDefault(); start(); });
    window.addEventListener('mousemove', e => { if (drag) apply(e.clientX); });
    window.addEventListener('mouseup', end);
    split.addEventListener('touchstart', () => start(), { passive: true });
    window.addEventListener('touchmove', e => { if (drag && e.touches[0]) apply(e.touches[0].clientX); }, { passive: true });
    window.addEventListener('touchend', end);
    split.addEventListener('dblclick', () => { document.documentElement.style.setProperty('--panel-w', '348px'); apply(window.innerWidth - 348); });
  }

  // range 입력 도우미: 입력 중(input)에 콜백 + 출력 갱신, reanalyze면 변경 끝(change)에 재분석
  function onRange(sel, outSel, cb, reanalyze, fmtFn) {
    const el = $(sel);
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      cb(v);
      if (outSel) setOut(outSel, fmtFn ? fmtFn(v) : v);
    });
    if (reanalyze) el.addEventListener('change', runAnalysis);
  }
  function bindMeta(sel, key) { $(sel).addEventListener('input', e => state.meta[key] = e.target.value); }

  async function toggleMic() {
    const btn = $('#btn-mic');
    if (!AudioInput.enabled) {
      try {
        await AudioInput.start();
        btn.textContent = '마이크 끄기'; btn.classList.add('on');
        $('#mic-meters').classList.add('show');
        toast('마이크 켜짐 — 소리에 반응합니다. (음성은 저장되지 않음)');
      } catch (e) { toast('마이크를 켤 수 없습니다: ' + e.message); }
    } else {
      AudioInput.stop();
      btn.textContent = '마이크 켜기'; btn.classList.remove('on');
      $('#mic-meters').classList.remove('show');
    }
  }

  /* ----------------------------- 외부(사이트) 연동 훅 ----------------------------- */
  // 멀티페이지 사이트(코치/전시)에서 현재 작품 맥락을 읽기 위한 최소한의 창구.
  // 이 훅이 없어도 단일 파일(오프라인 백업)로는 그대로 동작한다.
  function describeRules() {
    const mm = { repel: '밀어내기', attract: '끌어당기기', swell: '부풀리기', scatter: '흩뿌리기', none: '없음' }[state.mouseMode];
    const mic = AudioInput.enabled ? `마이크 볼륨→${state.micTarget}${state.freqOn ? '+주파수 반응' : ''}` : '';
    return `마우스 ${mm}${state.clickExplode ? '+클릭폭발' : ''}${mic ? ' · ' + mic : ''}`;
  }
  window.ColorStudio = {
    canvas: () => p5i && p5i.canvas,
    hasAnalysis: () => !!analysis,
    context: () => ({ kind: 'color', palette: analysis ? analysis.palette : [], K: state.K, N: state.N,
      space: state.space, rules: describeRules(), intent: (state.meta && state.meta.intent) || '' }),
    meta: () => state.meta,
    settings: () => JSON.parse(JSON.stringify(state)),
    // 전시 재생용: 원본 이미지를 작게 dataURL 로 (작품을 다시 점으로 살려내기)
    sourceURL: (maxDim) => {
      if (!sourceCanvas) return '';
      maxDim = maxDim || 380;
      const ar = sourceCanvas.width / sourceCanvas.height;
      const w = Math.min(maxDim, sourceCanvas.width), h = Math.round(w / ar);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(sourceCanvas, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.72);
    },
    // 분석실 등 외부에서 이미지(dataURL)를 보내 스튜디오에서 이어 작업
    loadImageURL: (url, title) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0);
        sourceCanvas = cv;
        if (title) { state.meta.title = title; const t = document.getElementById('in-title'); if (t) t.value = title; }
        showThumb(); runAnalysis();
      };
      img.src = url;
    }
  };

  /* ----------------------------- 시작 ----------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    bindUI();
    syncControls();
    p5i = new p5(sketch);
    setVal('#sel-demo', 'starrynight');
    setTimeout(() => loadDemo('starrynight'), 120); // 시작하자마자 살아있는 화면
  });
})();
