/*
 * studio-life.js — 내 삶을 데이터로 (학습 3단계)
 * 사진(즐거운 순간) → 밝기·따뜻함·색다양성, 챗봇 대화 → 화자·길이·물음표 를 데이터로.
 * 무엇을 데이터로 삼을지 학생이 정한다(그 선택이 곧 해석).
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => UI.escapeHTML(s);
  let rows = [], cols = [], mode = 'photo', dataName = '내 삶의 데이터';

  function hueOf(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 16) return -1; let h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; return (h * 60 + 360) % 360; }

  /* ----------------------------- 사진 ----------------------------- */
  function featImg(img) {
    const sw = 64, sh = Math.max(1, Math.round(64 * img.height / img.width));
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, sw, sh);
    const d = ctx.getImageData(0, 0, sw, sh).data, n = d.length / 4;
    let L = 0, warm = 0, cool = 0; const hues = {};
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2]; L += (0.299 * r + 0.587 * g + 0.114 * b);
      const h = hueOf(r, g, b); if (h >= 0) { if (h < 70 || h > 320) warm++; else if (h >= 160 && h <= 260) cool++; hues[Math.floor(h / 30)] = 1; }
    }
    return { 밝기: Math.round(L / n / 255 * 100), 따뜻함: Math.max(0, Math.min(100, Math.round((warm - cool) / n * 100 + 50))), 색다양성: Object.keys(hues).length * 8 };
  }
  function addPhotos(files) {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    let pending = arr.length; if (!pending) return;
    arr.forEach((f, k) => {
      const img = new Image(), url = URL.createObjectURL(f);
      img.onload = () => {
        const t = featImg(img);
        rows.push(Object.assign({ 순간: rows.length + 1 }, t));
        const thumb = document.createElement('img'); thumb.src = url; $('#ph-grid').appendChild(thumb);
        if (--pending === 0) { cols = ['순간', '밝기', '따뜻함', '색다양성']; dataName = '즐거운 순간(사진)'; renderPreview('#ph-preview'); enable(); }
      };
      img.src = url;
    });
  }

  /* ----------------------------- 챗봇 ----------------------------- */
  function parseChat(text) {
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    const meRe = /^(나|저|me|user|사용자)\s*[:：]/i, aiRe = /^(ai|봇|bot|chatgpt|claude|gpt|assistant|어시스턴트)\s*[:：]/i;
    const out = []; let speaker = '나';
    lines.forEach(l => {
      let content = l;
      if (meRe.test(l)) { speaker = '나'; content = l.replace(meRe, '').trim(); }
      else if (aiRe.test(l)) { speaker = 'AI'; content = l.replace(aiRe, '').trim(); }
      out.push({ 순서: out.length + 1, 화자: speaker, 글자수: content.length, 물음표: /[?？]/.test(content) ? 1 : 0 });
    });
    return out;
  }
  function applyChat() {
    rows = parseChat($('#chat-text').value); cols = ['순서', '화자', '글자수', '물음표']; dataName = '챗봇 대화';
    if (!rows.length) { UI.toast('대화를 붙여넣어 주세요.'); return; }
    const mine = rows.filter(r => r.화자 === '나'), ai = rows.filter(r => r.화자 === 'AI');
    const q = mine.filter(r => r.물음표).length;
    $('#chat-stats').textContent = `내 메시지 ${mine.length} · AI ${ai.length} · 내 질문 ${q}개 · 평균 길이 ${Math.round(rows.reduce((s, r) => s + r.글자수, 0) / rows.length)}자 — “나는 AI에게 무엇을 물었나?”`;
    renderPreview('#chat-preview'); enable();
  }

  /* ----------------------------- 공통 ----------------------------- */
  function renderPreview(sel) {
    const host = $(sel); if (!rows.length) { host.innerHTML = ''; return; }
    const head = '<tr>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>';
    const body = rows.slice(0, 12).map(r => '<tr>' + cols.map(c => '<td>' + esc(r[c]) + '</td>').join('') + '</tr>').join('');
    host.innerHTML = '<table class="data" style="font-size:12px">' + head + body + '</table>' + (rows.length > 12 ? '<p class="muted" style="font-size:11px">…외 ' + (rows.length - 12) + '행</p>' : '');
  }
  function enable() { $('#life-csv').disabled = !rows.length; $('#life-send').disabled = !rows.length; }
  function toCSV() { return cols.join(',') + '\n' + rows.map(r => cols.map(c => r[c]).join(',')).join('\n'); }
  function exportCSV() { const blob = new Blob(['﻿' + toCSV()], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.download = 'life_data_' + Date.now() + '.csv'; a.href = URL.createObjectURL(blob); a.click(); UI.toast('CSV로 내보냈어요.'); }
  function send() {
    if (!rows.length) return;
    const payload = { name: dataName, csv: toCSV(), intent: $('#life-intent').value.trim(), issue: '🧑 내 삶에서 온 데이터 — 무엇을 셀지 내가 정했어요' };
    try { localStorage.setItem('dn_data_incoming', JSON.stringify(payload)); } catch (e) { UI.toast('전송 실패(용량).'); return; }
    UI.toast('데이터 점 스튜디오로 보냅니다…'); setTimeout(() => location.href = 'studio-data.html', 600);
  }

  document.addEventListener('DOMContentLoaded', () => {
    UI.mountIdeaBar('idea', 'data');
    document.querySelectorAll('[data-ltab]').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.ltab; rows = []; cols = []; enable();
      document.querySelectorAll('[data-ltab]').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('.lsec').forEach(s => s.classList.toggle('on', s.id === 'lsec-' + mode));
    }));
    $('#ph-upload').addEventListener('click', () => $('#ph-file').click());
    $('#ph-file').addEventListener('change', e => addPhotos(e.target.files));
    $('#chat-apply').addEventListener('click', applyChat);
    $('#life-csv').addEventListener('click', exportCSV);
    $('#life-send').addEventListener('click', send);
  });
})();
