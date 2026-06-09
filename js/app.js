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
    size: 3, colorMode: 'cluster',
    // 움직임
    mode: 'points', returnForce: 0.08, vibration: 0, trail: 255, additive: false,
    rotateSpeed: 0.004, depth: 220,
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
    system = Particles.create(analysis, imageRect(), { colorMode: state.colorMode, baseSize: state.size });
  }

  // 팔레트(대표색 + 비율) 표시 — 클릭하면 해당 색 군집 켜기/끄기
  function renderPalette() {
    const box = $('#palette'); box.innerHTML = '';
    analysis.palette.forEach((p, i) => {
      const sw = document.createElement('button');
      sw.className = 'swatch';
      sw.style.background = 'rgb(' + p.r + ',' + p.g + ',' + p.b + ')';
      sw.title = '클릭: 이 색 군집 켜기/끄기';
      const pct = Math.round(p.ratio * 100);
      sw.innerHTML = '<span class="pct">' + pct + '%</span>';
      sw.addEventListener('click', () => {
        if (!system) return;
        const on = !system.visible[i];
        system.setVisibility(i, on);
        sw.classList.toggle('off', !on);
      });
      box.appendChild(sw);
    });
    $('#palette-meta').textContent =
      'K=' + state.K + ' · ' + (state.space === 'lab' ? 'LAB' : 'RGB') + ' 색공간 · 비율 높은 순';
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
        rotateSpeed: state.mode === '3d' && !dragging ? state.rotateSpeed : 0
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
    setVal('#rng-k', state.K); setOut('#out-k', state.K);
    setVal('#sel-space', state.space); setVal('#sel-sampling', state.sampling);
    setVal('#rng-n', state.N); setOut('#out-n', fmt(state.N));
    setVal('#rng-size', state.size); setOut('#out-size', state.size);
    setVal('#sel-colormode', state.colorMode);
    setVal('#sel-mode', state.mode);
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
    onRange('#rng-k', '#out-k', v => { state.K = v | 0; }, true);
    $('#sel-space').addEventListener('change', e => { state.space = e.target.value; runAnalysis(); });
    $('#sel-sampling').addEventListener('change', e => { state.sampling = e.target.value; runAnalysis(); });
    onRange('#rng-n', '#out-n', v => { state.N = v | 0; }, true, fmt);
    $('#btn-shuffle').addEventListener('click', () => { state.seed = (Math.random() * 1e9) | 0; runAnalysis(); });

    // 점(재분석 없이 시스템만 갱신)
    onRange('#rng-size', '#out-size', v => { state.size = v; if (system) system.opts.baseSize = v; });
    $('#sel-colormode').addEventListener('change', e => { state.colorMode = e.target.value; if (system) system.setColorMode(state.colorMode); });

    // 움직임(실시간 반영)
    $('#sel-mode').addEventListener('change', e => { state.mode = e.target.value; $('#row-3d').style.display = state.mode === '3d' ? '' : 'none'; });
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

  /* ----------------------------- 시작 ----------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    bindUI();
    syncControls();
    p5i = new p5(sketch);
    setTimeout(() => loadDemo('sunset'), 120); // 시작하자마자 살아있는 화면
  });
})();
