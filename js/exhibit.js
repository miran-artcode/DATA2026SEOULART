/*
 * exhibit.js — 키오스크 전시 슬라이드쇼 (QR + 작가노트 + 자동 넘김)
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => UI.escapeHTML(s);
  const KIND = { color: '색 군집', data: '데이터 점', lab: '분석' };
  const COLORLBL = { value: '값 그라데이션', warm: '난색', cool: '한색' };
  const ADVANCE = 9000;

  let works = [], idx = 0, playing = true, timer = null, progTimer = null, progStart = 0;

  function baseURL() {
    const saved = localStorage.getItem('dn_exhibit_base');
    if (saved) return saved.replace(/\/?$/, '/');
    return location.origin + location.pathname.replace(/[^/]*$/, '');
  }
  const workURL = id => baseURL() + 'work.html?id=' + encodeURIComponent(id);

  function story(w) {
    const s = w.settings || {}, parts = [];
    if (w.kind === 'data') {
      parts.push('데이터: ' + (w.dataName || '—'));
      const mp = s.mapping || {}, m = [];
      if (mp.mSize) m.push('크기'); if (mp.mSpeed) m.push('속도'); if (mp.mDir) m.push('방향'); if (mp.mDensity) m.push('밀도'); if (mp.mAlpha) m.push('투명도'); if (mp.mShape) m.push('형태');
      if (m.length) parts.push('매핑: ' + m.join('·'));
      if (s.color) parts.push('색: ' + (COLORLBL[s.color] || s.color));
    } else if (w.kind === 'color') {
      if (s.K) parts.push('K=' + s.K); if (s.space) parts.push(String(s.space).toUpperCase()); if (s.N) parts.push('점 N=' + s.N);
    }
    return parts.join(' · ');
  }

  async function renderSlide() {
    const w = works[idx]; if (!w) return;
    const fbs = await Store.listFeedback(w.id);
    const st = story(w);
    $('#kroot').innerHTML = `
      <div class="stage">
        <div class="art">${w.thumb ? `<img src="${w.thumb}" alt="작품">` : '<span class="muted">미리보기 없음</span>'}</div>
        <div class="info">
          <div class="eyebrow2">데이터의 눈 · 학생 전시</div>
          <h1>${esc(w.title || '제목 없음')}</h1>
          <div class="artist">${esc(w.by || '익명')} <span class="badge">${KIND[w.kind] || w.kind}</span></div>
          ${w.intent ? `<div class="statement"><b>작가노트</b> — ${esc(w.intent)}</div>` : ''}
          ${w.evidence ? `<div class="statement muted">근거 · ${esc(w.evidence)}</div>` : ''}
          ${st ? `<div class="meta">${esc(st)}</div>` : ''}
          <div class="qr-box">
            <canvas id="qr"></canvas>
            <div class="cap"><b>📱 스캔하면 감상·비평</b><br>휴대폰으로 QR을 찍어 이 작품에 감상과 비평을 남겨 주세요.<br><span class="muted">현재 비평 ${fbs.length}개</span></div>
          </div>
        </div>
      </div>`;
    if (window.QR) QR.draw($('#qr'), workURL(w.id), { size: 150, margin: 2 });
    $('#k-counter').textContent = (idx + 1) + ' / ' + works.length;
    restartProgress();
  }

  function go(n) { idx = (n + works.length) % works.length; renderSlide(); if (playing) schedule(); }
  function next() { go(idx + 1); }
  function prev() { go(idx - 1); }
  function schedule() { clearTimeout(timer); timer = setTimeout(next, ADVANCE); }
  function restartProgress() {
    const bar = $('#progress'); bar.style.transition = 'none'; bar.style.width = '0';
    progStart = Date.now();
    requestAnimationFrame(() => {
      if (!playing) { bar.style.width = ((idx + 1) / works.length * 100) + '%'; return; }
      bar.style.transition = 'width ' + ADVANCE + 'ms linear'; bar.style.width = '100%';
    });
  }
  function setPlaying(p) {
    playing = p; $('#k-play').textContent = p ? '⏸' : '▶';
    if (p) { schedule(); restartProgress(); } else { clearTimeout(timer); $('#progress').style.transition = 'none'; }
  }

  async function init() {
    works = await Store.listWorks({ exhibited: true });
    if (!works.length) {
      $('#kroot').innerHTML = `<div class="empty">${UI.callout('아직 전시된 작품이 없어요. 스튜디오에서 ‘전시하기’로 작품을 올리면 여기 키오스크에 자동으로 나타납니다.', 'info')}</div>`;
      return;
    }
    $('#controls').hidden = false;
    $('#k-prev').addEventListener('click', () => { prev(); });
    $('#k-next').addEventListener('click', () => { next(); });
    $('#k-play').addEventListener('click', () => setPlaying(!playing));
    $('#k-full').addEventListener('click', toggleFull);
    $('#k-base').addEventListener('click', setBase);
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
      else if (e.key.toLowerCase() === 'f') toggleFull();
    });
    renderSlide(); schedule();
  }
  function toggleFull() {
    if (!document.fullscreenElement) (document.documentElement.requestFullscreen && document.documentElement.requestFullscreen());
    else document.exitFullscreen && document.exitFullscreen();
  }
  function setBase() {
    const cur = baseURL();
    const v = prompt('QR이 가리킬 사이트 주소(배포 URL 또는 교실 LAN 주소). 비우면 자동.', cur);
    if (v === null) return;
    if (v.trim()) localStorage.setItem('dn_exhibit_base', v.trim()); else localStorage.removeItem('dn_exhibit_base');
    UI.toast('QR 주소를 설정했습니다.'); renderSlide();
  }

  init();
})();
