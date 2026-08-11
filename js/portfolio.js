/*
 * portfolio.js — 학생 포트폴리오(A4 인쇄용)
 * -----------------------------------------------------------------------------
 * 학생에게는 '내가 무엇을 보고 의심하고 골랐는가'가 한 장으로 돌아오고,
 * 교사에게는 그대로 과정중심평가의 근거가 된다.
 *   portfolio.html            → 로그인한 학생 본인
 *   portfolio.html?uid=2-3·k7f2 → 교사가 대시보드에서 연 특정 학생(익명 코드)
 *
 * 공개 동의(consent)를 끈 작품은 인쇄물에서 자동으로 빠진다.
 */
(function (global) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s) => document.querySelector(s);
  const fmt = (t) => new Date(t).toLocaleDateString('ko-KR');

  async function main() {
    const params = new URLSearchParams(location.search);
    let uid = params.get('uid');
    const u = global.Auth && Auth.current();
    if (!uid) {
      if (!u) { $('#pf-root').innerHTML = UI.callout('로그인하면 내 포트폴리오가 만들어져요. <a href="index.html?next=portfolio.html">로그인</a>', 'info'); return; }
      uid = Log.anonOf(u);
    }

    const [works, notes, logs, versions] = await Promise.all([
      Store.listWorks(), Store.listNotes(), Store.listLogs(), Store.listVersions()
    ]);
    const map = Metrics.nameMap(works, notes);
    const person = map[uid] || { name: (u && u.display) || '학생', klass: (u && u.klass) || '' };
    const judge = Metrics.judgementMetrics({ works, notes, logs, versions });
    const me = judge.rows.find(r => r.uid === uid) ||
      { compare: 0, revise: 0, works: 0, evidence: 0, ask: 0, answer: 0, critique: 0, reflect: 0, stage: -1 };

    const mine = works.filter(w => Log.anonOf({ userId: w.userId, klass: w.klass }) === uid);
    const shown = mine.filter(w => w.consent !== false);          // 미동의 작품은 인쇄에서 제외
    const hidden = mine.length - shown.length;
    const myNotes = notes.filter(n => {
      const w = works.find(x => x.userId === n.userId);
      return Log.anonOf({ userId: n.userId, klass: n.klass || (w ? w.klass : '') }) === uid;
    });
    const pick = (kind) => myNotes.filter(n => n.kind === kind).sort((a, b) => a.updatedAt - b.updatedAt);
    const literacy = pick('literacy'), cards = pick('card'), revisions = pick('revision');
    const reflections = pick('reflection'), statements = pick('statement');

    /* ---------- 학습지 — 차시별 진행과 '다음 시간으로 넘긴 한 줄' ----------
     * 넘긴 한 줄은 차시와 차시를 잇는 문장이라, 시간 순으로 모아 두면
     * 한 학기 동안 생각이 어떻게 옮겨 갔는지가 A4 한 장에서 읽힌다. */
    const sheets = pick('worksheet').sort((a, b) => (a.session || 0) - (b.session || 0));
    const carried = sheets.map(n => {
      const key = Object.keys(n.answers || {}).find(p => /\.next_line\.text$/.test(p));
      const line = key && String(n.answers[key] || '').trim();
      return line ? { session: n.session, line } : null;
    }).filter(Boolean);
    const sheetsDone = sheets.filter(n => n.total && (n.filled || 0) / n.total >= 0.6).length;

    /* ---------- 7단계 진행 ---------- */
    const reached = new Set(logs.filter(l => l.uid === uid).map(l => l.stage));
    if (shown.length) reached.add('make');
    if (mine.some(w => (w.intent || '').trim())) reached.add('intent');
    if (revisions.length) reached.add('revise');
    if (cards.length || literacy.length) reached.add('judge');
    if (shown.some(w => w.exhibited)) reached.add('share');
    if (reflections.length || statements.length) reached.add('own');
    sheets.forEach(n => { if (n.procStage && (n.filled || 0) > 0) reached.add(n.procStage); });
    const stageBar = Log.STAGES.map((s, i) =>
      `<span class="pf-stage ${reached.has(s.key) ? 'on' : ''}">${i + 1}. ${s.label}</span>`).join('');

    /* ---------- 화면 ---------- */
    $('#pf-root').innerHTML = `
      <header class="pf-head">
        <div><h1>${esc(person.name)}<span class="pf-klass">${esc(person.klass)}</span></h1>
          <p class="pf-sub">오늘의 시선 · 창작 과정 포트폴리오 <span class="pf-code">${esc(uid)}</span></p></div>
        <div class="pf-when">${fmt(Date.now())} 출력</div>
      </header>

      <section class="pf-sec">
        <h2>창작 과정 7단계</h2>
        <div class="pf-stages">${stageBar}</div>
      </section>

      <section class="pf-sec">
        <h2>판단의 지표</h2>
        <div class="pf-metrics">
          ${[['작품', me.works], ['비교(A/B)', me.compare], ['수정', me.revise], ['근거 작성', me.evidence],
             ['질문 카드 답', me.answer], ['비평', me.critique], ['성찰', me.reflect ? 'O' : '—']]
            .map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}
        </div>
        <p class="pf-note">숫자는 성적이 아니라 <b>과정의 흔적</b>입니다. 얼마나 견주었고 얼마나 고쳤는지를 보여 줘요.</p>
      </section>

      ${shown.length ? `<section class="pf-sec">
        <h2>작품과 진술</h2>
        ${shown.slice(0, 3).map(w => `<div class="pf-work">
          ${w.thumb ? `<img src="${w.thumb}">` : '<div class="pf-noimg">이미지 없음</div>'}
          <div>
            <b>${esc(w.title || '작품')}</b> <span class="pf-when">${fmt(w.updatedAt)}</span>
            ${w.intent ? `<p><span class="pf-lab">의도</span>${esc(w.intent)}</p>` : ''}
            ${w.evidence ? `<p><span class="pf-lab">근거</span>${esc(w.evidence)}</p>` : ''}
            ${w.statement ? `<p class="pf-statement"><span class="pf-lab">창작 진술문</span>${esc(w.statement)}</p>` : ''}
          </div></div>`).join('')}
        ${hidden ? `<p class="pf-note">※ 공개 동의를 하지 않은 작품 ${hidden}점은 인쇄에서 제외했습니다.</p>` : ''}
      </section>` : ''}

      ${sheets.length ? `<section class="pf-sec">
        <h2>학습지: 차시별 기록</h2>
        <div class="pf-stages">${sheets.map(n => {
          const pct = n.total ? Math.round((n.filled || 0) * 100 / n.total) : 0;
          return `<span class="pf-stage ${pct >= 60 ? 'on' : ''}">${n.session}차시 ${pct}%</span>`;
        }).join('')}</div>
        <p class="pf-note">${sheets.length}장 가운데 <b>${sheetsDone}장</b>을 다 썼습니다(60% 이상).</p>
        ${carried.length ? `<ul class="pf-list">${carried.map(c =>
          `<li><b>${c.session}차시 → 다음 시간으로 넘긴 한 줄</b>: ${esc(c.line)}</li>`).join('')}</ul>` : ''}
      </section>` : ''}

      ${revisions.length ? `<section class="pf-sec">
        <h2>무엇을 왜 바꿨는가</h2>
        <ul class="pf-list">${revisions.slice(-4).map(n =>
          `<li><b>${esc(n.title || '수정')}</b>: ${esc(n.line || '')}${n.myDecision ? `<span class="pf-dim"> (${esc(n.myDecision)})</span>` : ''}</li>`).join('')}</ul>
      </section>` : ''}

      ${cards.length ? `<section class="pf-sec">
        <h2>판단의 한 줄: 질문 카드</h2>
        <ul class="pf-list">${cards.slice(-4).map(n => `<li><b>${esc((n.title || '').replace('질문 카드 · ', ''))}</b>: ${esc(n.line || '')}</li>`).join('')}</ul>
      </section>` : ''}

      ${literacy.length ? `<section class="pf-sec">
        <h2>AI 리터러시: 내가 남긴 답</h2>
        <ul class="pf-list">${literacy.map(n => `<li><b>${esc((n.title || '').replace('리터러시 ', ''))}</b>: ${esc(n.line || '')}</li>`).join('')}</ul>
      </section>` : ''}

      ${(reflections.length || statements.length) ? `<section class="pf-sec">
        <h2>성찰</h2>
        <ul class="pf-list">${[...statements, ...reflections].slice(-4).map(n =>
          `<li>${n.aiHelp ? `<b>🤖 AI가 도운 것</b> ${esc(n.aiHelp)}<br>` : ''}${n.myDecision ? `<b>🙋 내가 결정한 것</b> ${esc(n.myDecision)}<br>` : ''}${esc(n.line || '')}</li>`).join('')}</ul>
      </section>` : ''}

      <footer class="pf-foot">오늘의 시선 · Seoul Arts High School · 학습 로그는 이름 없이 가명 코드로만 기록됩니다.</footer>`;

    if (global.Log && !params.get('uid')) Log.view('own');
  }

  document.addEventListener('DOMContentLoaded', () => {
    main().catch(e => { $('#pf-root').innerHTML = UI.callout('포트폴리오를 만드는 중 문제가 생겼어요: ' + esc(e.message), 'warn'); });
    const b = document.getElementById('pf-print');
    if (b) b.addEventListener('click', () => window.print());
  });
})(window);
