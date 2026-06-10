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
  const COLS = ['시간', '음량', '저음', '중음', '고음'];
  let rows = [], analyser = null, timer = null, ac = null, micStream = null, recording = false;

  /* ----------------------------- 특징 추출 ----------------------------- */
  function frameValues() {
    const N = analyser.frequencyBinCount;
    const td = new Uint8Array(N), fd = new Uint8Array(N);
    analyser.getByteTimeDomainData(td); analyser.getByteFrequencyData(fd);
    let sum = 0; for (let i = 0; i < N; i++) { const x = (td[i] - 128) / 128; sum += x * x; }
    const vol = Math.sqrt(sum / N);
    const avg = (lo, hi) => { let s = 0, c = 0; for (let i = lo; i < hi; i++) { s += fd[i]; c++; } return c ? s / c / 255 : 0; };
    const low = avg(0, Math.floor(N * 0.1)), mid = avg(Math.floor(N * 0.1), Math.floor(N * 0.4)), high = avg(Math.floor(N * 0.4), N);
    return { vol, low, mid, high };
  }
  function pushFrame() {
    const f = frameValues();
    rows.push({ 시간: rows.length, 음량: Math.round(f.vol * 100), 저음: Math.round(f.low * 100), 중음: Math.round(f.mid * 100), 고음: Math.round(f.high * 100) });
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
      rows = []; $('#sample-story').style.display = 'none';
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
        const rate = Math.max(1, buf.duration / 8); srcN.playbackRate.value = rate; // 너무 길면 빠르게 처리
        const g = ac.createGain(); g.gain.value = 0;           // 무음 재생(특징만 추출)
        srcN.connect(analyser); analyser.connect(g); g.connect(ac.destination);
        rows = []; srcN.start();
        $('#rec-status').textContent = '추출 중… (' + buf.duration.toFixed(1) + '초 오디오)';
        timer = setInterval(pushFrame, FRAME_MS);
        srcN.onended = () => { try { ac.close(); } catch (e) {} finalize('파일 추출 완료 · ' + rows.length + '프레임'); };
      } catch (e) { $('#rec-status').textContent = '오디오를 읽지 못했어요: ' + e.message; }
    };
    r.readAsArrayBuffer(file);
  }

  /* ----------------------------- 샘플: 아빠의 한 달 코골이 ----------------------------- */
  function snoringSample() {
    rows = [];
    for (let n = 1; n <= 30; n++) {
      const loud = 38 + Math.round(34 * Math.abs(Math.sin(n * 0.5)) + Math.random() * 14); // 어떤 밤은 크게, 어떤 밤은 잠잠
      rows.push({ 시간: n, 음량: loud, 저음: Math.min(100, loud + 8 + Math.round(Math.random() * 12)), 중음: Math.round(loud * 0.5), 고음: Math.round(loud * 0.2 + Math.random() * 8) });
    }
    renderViz();
    $('#frame-info').textContent = '30밤 · 코골이 특징';
    $('#sample-story').style.display = '';
    $('#sample-story').innerHTML = '<span class="ic">🛏</span><div><b>아빠의 한 달 코골이</b> — 어떤 밤은 크고, 어떤 밤은 잠잠해요. <b>저음이 우세</b>한 건 코골이의 특징이죠. 여기엔 데이터를 넘어선 것이 담겨요: 가족의 피로, 하루의 무게, <b>곁에 누군가 있다는 감각</b>. “이 소리를 점으로 옮긴다면, 나는 아빠의 무엇을 보여주고 싶은가?”</div>';
    $('#snd-intent').value = $('#snd-intent').value || '아빠의 코골이에서 하루의 무게와 곁에 있다는 감각을';
    finalize('샘플 불러옴 · 30밤');
  }

  /* ----------------------------- 시각화 ----------------------------- */
  function renderViz() {
    const cv = $('#wave'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.fillStyle = '#07080d'; ctx.fillRect(0, 0, W, H);
    if (!rows.length) return;
    const series = [['음량', '#e8ecf6'], ['저음', '#ff5a5f'], ['중음', '#ffb454'], ['고음', '#4ec3ff']];
    const n = rows.length, pad = 10;
    series.forEach(([key, col]) => {
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
      rows.forEach((r, i) => { const x = pad + (n === 1 ? 0.5 : i / (n - 1)) * (W - pad * 2); const y = H - pad - (r[key] / 100) * (H - pad * 2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    });
  }

  /* ----------------------------- 내보내기 / 전송 ----------------------------- */
  function toCSV() { return COLS.join(',') + '\n' + rows.map(r => COLS.map(c => r[c]).join(',')).join('\n'); }
  function exportCSV() {
    const blob = new Blob(['﻿' + toCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.download = 'sound_data_' + Date.now() + '.csv'; a.href = URL.createObjectURL(blob); a.click();
    UI.toast('CSV로 내보냈어요.');
  }
  function sendToData() {
    if (!rows.length) return;
    const payload = { name: '소리 데이터', csv: toCSV(), intent: $('#snd-intent').value.trim(), omit: $('#snd-omit').value.trim() };
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
