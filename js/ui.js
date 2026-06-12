/*
 * ui.js — 공용 셸: 내비게이션 · 설명 팝업(ⓘ) · 토스트 · 안내 콜아웃
 * -----------------------------------------------------------------------------
 * 모든 페이지가 이 파일을 불러오고, <div id="app-header"></div> 한 줄만 두면
 * 상단 내비가 자동으로 채워진다. 설명 아이콘은 [data-info="key"] 만 달면 동작한다.
 */
(function (global) {
  'use strict';

  // 저장된 테마를 가능한 한 일찍 적용(깜빡임 최소화)
  try { if (localStorage.getItem('dn_theme') === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch (e) {}

  const NAV = [
    { label: '사용 안내', href: 'start.html' },
    { label: '만들기', drop: [
      { href: 'studio-color.html', t: '색 군집 스튜디오', s: '명화를 대표색 점으로 · 1단계 기초' },
      { href: 'studio-data.html', t: '데이터 점 스튜디오', s: '데이터를 춤추는 점으로 · 1단계 기초' },
      { href: 'studio-sound.html', t: '소리를 데이터로', s: '녹음·소리에서 특징 추출 · 2단계' },
      { href: 'studio-life.html', t: '내 삶을 데이터로', s: '사진·대화를 데이터로 · 3단계' },
      { href: 'project.html', t: '사회문제 프로젝트', s: '공공데이터로 사회적 발언 · 4단계' },
      { href: 'studio-object.html', t: '객체 감지 · AI의 눈', s: '사진 속 사물을 AI로 · AI 렌즈' },
      { href: 'lab.html', t: '알고리즘 분석실', s: '7가지 분석 + 재창조 · 도구' }
    ] },
    { label: '배우기', drop: [
      { href: 'learn.html', t: '알고리즘 배움터', s: '쉬운→깊은 설명' },
      { href: 'critique.html', t: '데이터 비평 읽기', s: '차트를 비판적으로 (질문 3층위)' },
      { href: 'journey.html', t: '학습 여정 지도', s: '4단계·2축·평가 4영역' }
    ] },
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
        <button class="btn sm ghost" id="theme-toggle" title="밝은/어두운 테마" style="margin-right:4px">🌗</button>
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

    const tt = document.getElementById('theme-toggle');
    if (tt) { updateThemeIcon(tt); tt.addEventListener('click', UI.toggleTheme); }
    UI.renderUser();
  };

  function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function updateThemeIcon(btn) { const light = currentTheme() === 'light'; btn.textContent = light ? '🌙' : '🌞'; btn.title = light ? '어둡게' : '밝게'; }
  UI.toggleTheme = function () {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    if (next === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('dn_theme', next); } catch (e) {}
    const tt = document.getElementById('theme-toggle'); if (tt) updateThemeIcon(tt);
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

  // 사이트 공통 푸터(저작권) — 모든 페이지 맨 아래
  UI.mountFooter = function () {
    if (document.getElementById('site-footer')) return;
    const f = document.createElement('footer');
    f.id = 'site-footer';
    f.style.cssText = 'text-align:center; color:var(--muted2); font-size:12px; padding:24px 18px 30px; border-top:1px solid var(--line); margin-top:28px;';
    f.innerHTML = '© 2026 <b style="color:var(--muted)">MIRAN HWANG</b> · <a href="mailto:MIRAN726@GMAIL.COM" style="color:var(--muted)">MIRAN726@GMAIL.COM</a> · 데이터 미디어아트 스튜디오 · 교육용';
    document.body.appendChild(f);
  };

  global.UI = UI;
  document.addEventListener('DOMContentLoaded', () => { UI.mountHeader(); UI.mountFooter(); });
})(window);
