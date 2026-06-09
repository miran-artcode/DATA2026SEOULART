/*
 * ui.js — 공용 셸: 내비게이션 · 설명 팝업(ⓘ) · 토스트 · 안내 콜아웃
 * -----------------------------------------------------------------------------
 * 모든 페이지가 이 파일을 불러오고, <div id="app-header"></div> 한 줄만 두면
 * 상단 내비가 자동으로 채워진다. 설명 아이콘은 [data-info="key"] 만 달면 동작한다.
 */
(function (global) {
  'use strict';

  const NAV = [
    { label: '만들기', drop: [
      { href: 'studio-color.html', t: '색 군집 스튜디오', s: '명화를 대표색 점으로 (5.10.5)' },
      { href: 'studio-data.html', t: '데이터 점 스튜디오', s: '우리 데이터가 춤추는 점 (5.10.4)' },
      { href: 'lab.html', t: '알고리즘 분석실', s: '7가지 분석 + 차트 + 재창조' }
    ] },
    { label: '배우기', href: 'learn.html' },
    { label: '나누기', drop: [
      { href: 'gallery.html', t: '전시 갤러리', s: '작품 감상 + 또래 피드백' },
      { href: 'exhibit.html', t: '키오스크 전시', s: '큰 화면 슬라이드쇼 + QR 비평' },
      { href: 'quiz.html', t: '분석 퀴즈', s: '출제하고 맞히고 겨루기' },
      { href: 'notes.html', t: '작업 노트', s: '과정·버전·성찰 기록' }
    ] },
    { label: '교사', href: 'admin.html' }
  ];

  const UI = {};
  const cur = () => location.pathname.split('/').pop() || 'index.html';

  UI.mountHeader = function (activeOverride) {
    const host = document.getElementById('app-header');
    if (!host) return;
    const active = activeOverride || cur();
    const navHTML = NAV.map((n, i) => {
      if (n.drop) {
        const isActive = n.drop.some(d => d.href === active);
        const items = n.drop.map(d =>
          `<a href="${d.href}" class="${d.href === active ? 'active' : ''}">${d.t}<small>${d.s}</small></a>`).join('');
        return `<div class="navdrop" data-drop="${i}">
            <button class="${isActive ? 'active' : ''}">${n.label} ▾</button>
            <div class="navdrop-menu">${items}</div></div>`;
      }
      return `<a href="${n.href}" class="${n.href === active ? 'active' : ''}">${n.label}</a>`;
    }).join('');

    host.outerHTML = `
      <header class="site-header">
        <a class="site-brand" href="hub.html"><span class="logo">◎</span> 데이터의 눈</a>
        <nav class="site-nav">${navHTML}</nav>
        <div class="site-user" id="site-user"></div>
      </header>`;

    // 드롭다운 토글
    document.querySelectorAll('.navdrop').forEach(dd => {
      dd.querySelector('button').addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.navdrop').forEach(o => { if (o !== dd) o.classList.remove('open'); });
        dd.classList.toggle('open');
      });
    });
    document.addEventListener('click', () => document.querySelectorAll('.navdrop').forEach(o => o.classList.remove('open')));

    UI.renderUser();
  };

  UI.renderUser = function () {
    const el = document.getElementById('site-user');
    if (!el) return;
    const u = (global.Auth && Auth.current && Auth.current()) || null;
    if (u) {
      el.innerHTML = `<span class="dot"></span> <b>${escapeHTML(u.display || u.name)}</b>
        <button class="btn sm ghost" id="btn-logout">로그아웃</button>`;
      const lo = document.getElementById('btn-logout');
      if (lo) lo.addEventListener('click', () => { Auth.logout(); location.href = 'index.html'; });
    } else {
      el.innerHTML = `<span class="dot off"></span> <a href="index.html">로그인</a>`;
    }
  };

  /* ----------------------------- 모달 ----------------------------- */
  function ensureModal() {
    let m = document.getElementById('ui-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'ui-modal'; m.className = 'modal-bg';
    m.innerHTML = `<div class="modal-card"><div class="mc-head"><button class="modal-close" aria-label="닫기">✕</button>
      <h2 id="ui-modal-title"></h2><div class="lv" id="ui-modal-lv"></div></div><div class="mc-body" id="ui-modal-body"></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) UI.closeModal(); });
    m.querySelector('.modal-close').addEventListener('click', UI.closeModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeModal(); });
    return m;
  }
  UI.modal = function (title, bodyHTML, levelText) {
    const m = ensureModal();
    m.querySelector('#ui-modal-title').innerHTML = title;
    m.querySelector('#ui-modal-lv').innerHTML = levelText || '';
    m.querySelector('#ui-modal-body').innerHTML = bodyHTML;
    m.classList.add('show');
  };
  UI.closeModal = function () { const m = document.getElementById('ui-modal'); if (m) m.classList.remove('show'); };

  /* ----------------------------- 설명 팝업(ⓘ) ----------------------------- */
  UI.info = function (key) {
    const e = (global.EXPLAIN || {})[key];
    if (!e) { UI.toast('설명 준비 중: ' + key); return; }
    const badge = e.badge === 'adv' ? '<span class="badge adv">심화</span>' : '<span class="badge core">핵심</span>';
    let body = '';
    if (e.easy) body += section('easy', '🟡 쉽게 — 한눈에', e.easy);
    if (e.deep) body += section('deep', '🔵 더 깊이 — 원리', e.deep);
    if (e.limit) body += section('limit', '🔴 이 분석이 놓친 것 (한계)', e.limit);
    if (e.ideas && e.ideas.length) {
      body += section('idea', '🟢 이렇게 해보면 — 아이디어',
        '<ul>' + e.ideas.map(i => `<li>${i}</li>`).join('') + '</ul>');
    }
    UI.modal(escapeHTML(e.title) + ' ' + badge, body, 'ⓘ 설명은 쉬운 버전 → 깊은 버전 → 한계 → 아이디어 순서예요.');
  };
  function section(cls, head, html) {
    return `<div class="lvl ${cls}"><div class="lvl-h">${head}</div><div class="lvl-b">${html}</div></div>`;
  }
  UI.infoButton = function (key, label) {
    return `<button class="info-ic" data-info="${key}" title="${label || '설명 보기'}" aria-label="설명">ⓘ</button>`;
  };
  // 전역 위임: 어떤 페이지든 [data-info] 클릭이면 팝업
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-info]');
    if (b) { e.preventDefault(); UI.info(b.getAttribute('data-info')); }
  });

  /* ----------------------------- 토스트 ----------------------------- */
  UI.toast = function (msg, ms) {
    let t = document.getElementById('ui-toast');
    if (!t) { t = document.createElement('div'); t.id = 'ui-toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(UI.toast._t); UI.toast._t = setTimeout(() => t.classList.remove('show'), ms || 2400);
  };

  /* ----------------------------- 안내 콜아웃 / 아이디어 로테이터 ----------------------------- */
  UI.callout = function (html, type) {
    const ic = type === 'warn' ? '⚠️' : type === 'info' ? '💬' : '💡';
    return `<div class="callout ${type || ''}"><span class="ic">${ic}</span><div>${html}</div></div>`;
  };
  // 컨테이너(id)에 페이지별 아이디어를 한 개씩 돌려가며 보여줌
  UI.mountIdeaBar = function (containerId, pageKey) {
    const host = document.getElementById(containerId);
    if (!host) return;
    const list = ((global.GUIDE || {})[pageKey] || (global.GUIDE || {}).general || []).slice();
    if (!list.length) return;
    let i = Math.floor(Math.random() * list.length);
    const render = () => {
      host.innerHTML = `<div class="callout idea-rotator"><span class="ic">💡</span>
        <div><b>아이디어</b> · ${list[i]}</div><span class="next">다음 ▸</span></div>`;
      host.querySelector('.idea-rotator').addEventListener('click', () => { i = (i + 1) % list.length; render(); });
    };
    render();
  };

  function escapeHTML(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  UI.escapeHTML = escapeHTML;

  global.UI = UI;
  document.addEventListener('DOMContentLoaded', () => UI.mountHeader());
})(window);
