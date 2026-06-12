/*
 * studio-sound.js — 소리를 데이터로 (학습 2단계)
 * -----------------------------------------------------------------------------
 * 마이크 녹음(5~20초) 또는 오디오 파일에서 약 0.15초 프레임마다
 * 음량(RMS)·저/중/고 주파수 에너지를 추출 → 시계열 데이터(CSV) → 데이터 점 스튜디오로.
 * 음성 원본은 저장하지 않고 특징값(숫자)만 사용한다.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const FRAME_MS = 150, MAX_MS = 20000;
  // 라이브 추출 시계열 열(샘플은 자체 열을 가질 수 있어 toCSV는 실제 키를 사용)
  const LIVE_COLS = ['시간', '음량', '저음', '중음', '고음', '날카로움', '변화', '음높이'];
  // 각 특징의 의미(시각화·설명용)
  const FEAT = {
    음량: ['#e8ecf6', '소리의 세기(RMS) — 클수록 크게'],
    저음: ['#ff5a5f', '낮은 주파수 에너지 — 둥둥/우르릉'],
    중음: ['#ffb454', '가운데 주파수 — 말소리·멜로디 영역'],
    고음: ['#4ec3ff', '높은 주파수 — 쉭/치/반짝임'],
    날카로움: ['#a78bfa', '스펙트럼 무게중심 — 높을수록 밝고 날카로움'],
    변화: ['#51d88a', '직전 순간 대비 변화량 — 리듬·요동'],
    음높이: ['#f6e58d', '가장 강한 주파수(Hz) — 낮을수록 저음, 높을수록 고음'],
    깊이: ['#4ec3ff', '코골이의 깊이(가정)'],
    규칙성: ['#51d88a', '숨의 규칙성 — 높을수록 고른 리듬'],
    뒤척임: ['#ff8e53', '몸 뒤척임 — 높을수록 불안한 잠']
  };
  const SERIES_FALLBACK = ['#e8ecf6', '#ff5a5f', '#ffb454', '#4ec3ff', '#a78bfa', '#51d88a', '#ff8e53', '#f6e58d'];
  let rows = [], analyser = null, timer = null, ac = null, micStream = null, recording = false, prevSpectrum = null, datasetName = '소리 데이터', datasetIssue = '';

  /* ----------------------------- 특징 추출 ----------------------------- */
  function frameValues() {
    const N = analyser.frequencyBinCount;
    const td = new Uint8Array(N), fd = new Uint8Array(N);
    analyser.getByteTimeDomainData(td); analyser.getByteFrequencyData(fd);
    // 음량(RMS)
    let sum = 0; for (let i = 0; i < N; i++) { const x = (td[i] - 128) / 128; sum += x * x; }
    const vol = Math.sqrt(sum / N);
    const avg = (lo, hi) => { let s = 0, c = 0; for (let i = lo; i < hi; i++) { s += fd[i]; c++; } return c ? s / c / 255 : 0; };
    const low = avg(0, Math.floor(N * 0.1)), mid = avg(Math.floor(N * 0.1), Math.floor(N * 0.4)), high = avg(Math.floor(N * 0.4), N);
    // 날카로움 = 스펙트럼 무게중심(에너지가 높은 주파수에 쏠릴수록 ↑)
    let ws = 0, es = 0; for (let i = 0; i < N; i++) { ws += i * fd[i]; es += fd[i]; }
    const centroid = es ? (ws / es) / N : 0;
    // 변화 = 직전 프레임 대비 스펙트럼 증가량(spectral flux) — 리듬·요동
    let flux = 0; if (prevSpectrum) { for (let i = 0; i < N; i++) { const d = fd[i] - prevSpectrum[i]; if (d > 0) flux += d; } flux = Math.min(1, flux / (N * 48)); }
    prevSpectrum = fd.slice();
    // 음높이(Hz) = 에너지가 가장 큰 주파수 빈 → 헤르츠(bin × 표본율 / fftSize). 무음이면 0.
    let peak = 0, peakV = 0; for (let i = 1; i < N; i++) { if (fd[i] > peakV) { peakV = fd[i]; peak = i; } }
    const sr = (analyser.context && analyser.context.sampleRate) || 44100;
    const hz = peakV > 8 ? Math.round(peak * sr / analyser.fftSize) : 0;
    return { vol, low, mid, high, centroid, flux, hz };
  }
  const r100 = v => Math.max(0, Math.min(100, Math.round(v * 100)));
  function pushFrame() {
    const f = frameValues();
    rows.push({ 시간: rows.length, 음량: r100(f.vol), 저음: r100(f.low), 중음: r100(f.mid), 고음: r100(f.high), 날카로움: r100(f.centroid), 변화: r100(f.flux), 음높이: f.hz });
    renderViz(); $('#frame-info').textContent = rows.length + ' 프레임 (' + (rows.length * FRAME_MS / 1000).toFixed(1) + '초)';
  }
  function finalize(msg) {
    if (timer) { clearInterval(timer); timer = null; }
    $('#btn-csv').disabled = rows.length === 0; $('#btn-send').disabled = rows.length === 0;
    $('#rec-status').innerHTML = msg || (rows.length ? '추출 완료 · ' + rows.length + '프레임' : '');
    $('#btn-rec').textContent = '🎤 녹음 시작'; $('#btn-rec').classList.remove('rec'); recording = false;
  }

  /* ----------------------------- 마이크 ----------------------------- */
  async function toggleMic() {
    if (recording) { stopMic(); return; }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaStreamSource(micStream);
      analyser = ac.createAnalyser(); analyser.fftSize = 1024; src.connect(analyser);
      rows = []; prevSpectrum = null; datasetName = '내 소리(녹음)'; $('#sample-story').style.display = 'none';
      const t0 = Date.now(); recording = true;
      $('#btn-rec').textContent = '■ 녹음 중지'; $('#btn-rec').classList.add('rec');
      $('#rec-status').innerHTML = '<span class="rec-dot">●</span> 녹음 중… (최대 20초)';
      timer = setInterval(() => { pushFrame(); if (Date.now() - t0 > MAX_MS) stopMic(); }, FRAME_MS);
    } catch (e) { $('#rec-status').textContent = '마이크를 켤 수 없어요: ' + e.message; }
  }
  function stopMic() {
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    if (ac) { try { ac.close(); } catch (e) {} }
    finalize('녹음 완료 · ' + rows.length + '프레임');
  }

  /* ----------------------------- 오디오 파일 ----------------------------- */
  function loadFile(file) {
    if (!file) return;
    $('#rec-status').textContent = '분석 중…'; $('#sample-story').style.display = 'none';
    const r = new FileReader();
    r.onload = async () => {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const buf = await ac.decodeAudioData(r.result);
        analyser = ac.createAnalyser(); analyser.fftSize = 1024;
        const srcN = ac.createBufferSource(); srcN.buffer = buf;
        // 긴 파일(예: 1시간)도 받게: 길수록 빠르게 재생해 ~150프레임으로 압축 추출(짧은 건 거의 실시간).
        const rate = Math.max(1, buf.duration / 22); srcN.playbackRate.value = rate;
        const g = ac.createGain(); g.gain.value = 0;           // 무음 재생(특징만 추출)
        srcN.connect(analyser); analyser.connect(g); g.connect(ac.destination);
        rows = []; prevSpectrum = null; datasetName = (file.name ? file.name.replace(/\.[^.]+$/, '') : '오디오 파일'); srcN.start();
        const mins = buf.duration >= 60 ? (buf.duration / 60).toFixed(1) + '분' : buf.duration.toFixed(1) + '초';
        $('#rec-status').textContent = '추출 중… (' + mins + ' 오디오' + (rate > 1.5 ? ' · ' + rate.toFixed(0) + '배속 압축' : '') + ')';
        timer = setInterval(pushFrame, FRAME_MS);
        srcN.onended = () => { try { ac.close(); } catch (e) {} finalize('파일 추출 완료 · ' + rows.length + '프레임'); };
      } catch (e) { $('#rec-status').textContent = '오디오를 읽지 못했어요: ' + e.message; }
    };
    r.readAsArrayBuffer(file);
  }

  /* ----------------------------- 샘플: 아빠의 한 달 코골이(이야기) ----------------------------- */
  // 같은 코골이도 그날의 '상황'에 따라 달라진다 — 한 달(30밤)의 리듬을 이야기로 인코딩.
  function snoringSample() {
    const ctxByDay = (n) => {
      if (n === 10 || n === 25) return '월급날';                  // 급여일(가정)
      if (n === 18) return '아픈날';                              // 감기
      const dow = (n - 1) % 7;
      if (dow === 5 || dow === 6) return '주말';                  // 금·토 밤(늦잠)
      if (n % 9 === 0) return '야근';                            // 가끔 야근
      return '평일';
    };
    const story = {                                              // [최소,최대] 범위로 이야기를 숫자에 새김
      평일:   { 음량: [48, 60], 깊이: [55, 68], 규칙성: [62, 74], 뒤척임: [12, 24] },
      야근:   { 음량: [72, 88], 깊이: [80, 94], 규칙성: [34, 48], 뒤척임: [46, 62] },
      월급날: { 음량: [58, 70], 깊이: [64, 76], 규칙성: [56, 68], 뒤척임: [26, 38] },
      주말:   { 음량: [66, 82], 깊이: [86, 98], 규칙성: [60, 72], 뒤척임: [16, 28] },
      아픈날: { 음량: [34, 50], 깊이: [40, 55], 규칙성: [28, 44], 뒤척임: [52, 68] }
    };
    const rnd = (a, b) => a + Math.round(Math.random() * (b - a));
    rows = [];
    for (let n = 1; n <= 30; n++) {
      const c = ctxByDay(n), s = story[c];
      rows.push({ 밤: n, 상황: c, 음량: rnd(s.음량[0], s.음량[1]), 깊이: rnd(s.깊이[0], s.깊이[1]), 규칙성: rnd(s.규칙성[0], s.규칙성[1]), 뒤척임: rnd(s.뒤척임[0], s.뒤척임[1]) });
    }
    datasetName = '아빠의 한 달 코골이';
    datasetIssue = '🛏 아빠의 한 달 — 상황(평일·야근·월급날·주말·아픈날)에 따라 달라지는 코골이의 리듬';
    renderViz();
    $('#frame-info').textContent = '30밤 · 상황별 코골이 이야기';
    $('#sample-story').style.display = '';
    $('#sample-story').innerHTML = '<span class="ic">🛏</span><div><b>아빠의 한 달 코골이 — 30밤의 이야기</b><br>같은 코골이도 그날의 <b>상황</b>에 따라 달라져요:<br>• <b>야근</b>한 밤 — 크고 깊지만 <b>불규칙·뒤척임↑</b>(고단함).<br>• <b>월급날</b> — 한결 편안·규칙적.<br>• <b>주말</b> — 늦잠으로 가장 <b>깊고 길게</b>.<br>• <b>아픈 날</b> — 코가 막혀 작고 거칠고 뒤척여요.<br><br>점 스튜디오에서 <b>색 = 상황</b>으로 칠하고 <b>음량 → 크기 · 뒤척임 → 진동</b>으로 매핑하면, 숫자 뒤의 ‘피로의 들썩임’과 ‘한 달의 리듬’이 보여요. “이 소리를 점으로 옮긴다면, 나는 아빠의 <b>무엇</b>을 보여주고 싶은가?”</div>';
    $('#snd-intent').value = $('#snd-intent').value || '아빠의 코골이에서 한 달의 리듬과 고단함, 곁에 있다는 감각을';
    $('#snd-omit').value = $('#snd-omit').value || '소리의 크기·깊이·뒤척임만 셈 · 말소리·음색은 제외';
    finalize('샘플 불러옴 · 30밤(상황별)');
  }

  /* ----------------------------- 시각화 ----------------------------- */
  // 데이터의 '수치 열'을 자동 감지(시간/밤/상황 같은 인덱스·범주는 제외)
  function numericKeys() {
    if (!rows.length) return [];
    return Object.keys(rows[0]).filter(k => k !== '시간' && k !== '밤' && typeof rows[0][k] === 'number');
  }
  function colorOf(k, i) { return (FEAT[k] && FEAT[k][0]) || SERIES_FALLBACK[i % SERIES_FALLBACK.length]; }
  function renderViz() {
    const cv = $('#wave'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.fillStyle = '#07080d'; ctx.fillRect(0, 0, W, H);
    const keys = numericKeys();
    const leg = $('#wave-legend');
    if (leg) leg.innerHTML = keys.map((k, i) => '<span title="' + ((FEAT[k] && FEAT[k][1]) || '') + '"><i style="background:' + colorOf(k, i) + '"></i>' + k + '</span>').join('');
    if (!rows.length) return;
    // 각 특징을 자기 최댓값으로 정규화해 한 화면에서 '리듬'을 비교
    const maxes = {}; keys.forEach(k => { let mx = 1; rows.forEach(r => { const v = +r[k]; if (v > mx) mx = v; }); maxes[k] = mx; });
    const n = rows.length, pad = 10;
    keys.forEach((k, ki) => {
      ctx.strokeStyle = colorOf(k, ki); ctx.lineWidth = 2; ctx.beginPath();
      rows.forEach((r, i) => { const x = pad + (n === 1 ? 0.5 : i / (n - 1)) * (W - pad * 2); const y = H - pad - ((+r[k] || 0) / maxes[k]) * (H - pad * 2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    });
  }

  /* ----------------------------- 내보내기 / 전송 ----------------------------- */
  function toCSV() { if (!rows.length) return ''; const cols = Object.keys(rows[0]); return cols.join(',') + '\n' + rows.map(r => cols.map(c => r[c]).join(',')).join('\n'); }
  function exportCSV() {
    const blob = new Blob(['﻿' + toCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.download = 'sound_data_' + Date.now() + '.csv'; a.href = URL.createObjectURL(blob); a.click();
    UI.toast('CSV로 내보냈어요.');
  }
  function sendToData() {
    if (!rows.length) return;
    const payload = { name: datasetName, issue: datasetIssue, csv: toCSV(), intent: $('#snd-intent').value.trim(), omit: $('#snd-omit').value.trim() };
    try { localStorage.setItem('dn_data_incoming', JSON.stringify(payload)); } catch (e) { UI.toast('전송 실패(용량).'); return; }
    UI.toast('데이터 점 스튜디오로 보냅니다…');
    setTimeout(() => location.href = 'studio-data.html', 600);
  }

  document.addEventListener('DOMContentLoaded', () => {
    UI.mountIdeaBar('idea', 'data');
    $('#btn-rec').addEventListener('click', toggleMic);
    $('#btn-file').addEventListener('click', () => $('#audio-file').click());
    $('#audio-file').addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
    $('#btn-sample').addEventListener('click', snoringSample);
    $('#btn-csv').addEventListener('click', exportCSV);
    $('#btn-send').addEventListener('click', sendToData);
    renderViz();
  });
})();
