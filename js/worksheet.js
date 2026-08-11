/*
 * worksheet.js: 단원의 '학습 계획' 층: 차시 ↔ 단계 ↔ 만들기·배우기·나누기 ↔ 학습지
 * -----------------------------------------------------------------------------
 * 이 단원은 백워드 설계(목표 → 증거 → 계획)로 짜여 있고, 세 층의 원본은 이렇다.
 *
 *   ① 목표  worksheets/unit-data-eye/unit.json  (개념·전이 목표·본질적 질문·일반화)
 *   ② 증거  같은 파일의 performanceTask·rubric·evidenceLayers + 학습지의 칸(증거 3층 표시)
 *   ③ 계획  이 파일의 COURSE 표. 차시마다 만들기·배우기·나누기 화면과 학습지를 한 묶음으로 든다.
 *
 *   COURSE  차시 ↔ 4단계 ↔ 화면·활동. 배치를 바꾸려면 이 표 한 곳만 고친다.
 *   저장    학습지 한 장 = 작업노트 한 건(kind:'worksheet').
 *           새 컬렉션을 만들지 않으므로 firestore.rules·cloud-config 를 손대지 않아도 되고,
 *           교사 대시보드·포트폴리오·내보내기가 이미 notes 를 읽으므로 저장하는 순간 취합된다.
 *   순서    앞 차시를 어느 정도 채우면 다음 차시가 열린다. 잠금은 '안내'지 '차단'이 아니다
 *           (결석·보충처럼 순서가 흐트러지는 일은 교실에서 늘 생긴다).
 *
 * 순서의 척추는 '차시 번호' 하나다. 학습지끼리 '다음 시간으로 넘기는 한 줄'(carryOver)이
 * 차시 순서로 이어져 있고, 4단계 여정(그림 → 내 소리 → 내 사진 → 사회)은 차시를
 * 주체성 기준으로 묶은 것이라 순서가 서로 같다. 지도가 두 장이 아니라 한 장이 되도록,
 * 다른 화면(허브·여정·내비)도 이 표를 기준으로 그린다.
 */
(function (global) {
  'use strict';

  const BASE = 'worksheets';          // 꾸러미 폴더(사이트 루트 기준)
  const UNIT = 'data-eye';            // 지금 쓰는 단원
  const DONE_PCT = 60;                // 이만큼 채우면 '완료'로 본다
  const OPEN_PCT = 40;                // 앞 차시가 이만큼 차면 다음 차시가 열린다

  /*
   * 차시 ↔ 단계 ↔ 화면·활동. 한 차시가 한 묶음이다: 배우기 → 만들기 → 나누기 + 학습지.
   *   stage  : 4단계 여정에서 이 차시가 속한 단계(0 = 단계 이전 · 표지)
   *   badge  : 학생 화면에 보이는 배지 글
   *   learn  : 이 차시의 배우기(개념·판별 자료). 비어 있으면 화면 속 ⓘ 설명이 그 몫을 한다.
   *   make   : 이 차시의 만들기(스튜디오·도구)
   *   share  : 이 차시의 나누기(기록·전시·소통)
   *   pages  : '학습지 열기' 단추가 뜨는 화면(learn·make·share 의 합집합).
   *            도구 옆에도, 배우기·나누기 화면 옆에도 그 차시의 종이가 함께 놓인다.
   *   logStage: 이 차시의 기록이 창작 7단계 중 어디에 해당하는가(교사 D-1 지표의 원료)
   */
  const L = (page, label) => ({ page, label });
  const COURSE = [
    { sheet: 'cover', stage: 0, badge: '표지', logStage: 'sense', learn: [], make: [], share: [] },
    { sheet: 's1', stage: 1, badge: '1단계 · 그림', logStage: 'sense',
      learn: [L('learn.html', '알고리즘 배움터'), L('literacy.html', 'AI 리터러시 1·2장 · 픽셀과 K')],
      make:  [L('lab.html', '알고리즘 분석실 · 일곱 개의 눈')],
      share: [L('quiz.html', '분석 퀴즈 · 출제하고 겨루기')] },
    { sheet: 's2', stage: 1, badge: '1단계 · 그림', logStage: 'make',
      learn: [L('literacy.html', 'AI 리터러시 3장 · 같은 조건, 다른 결과')],
      make:  [L('studio-color.html', '색 군집 스튜디오')],
      share: [L('gallery.html', '첫 작품 전시하고 감상')] },
    { sheet: 's3', stage: 1, badge: '1단계 · 규칙', logStage: 'make',
      learn: [L('critique.html', '데이터 비평 읽기 · 축과 수사')],
      make:  [L('studio-data.html', '데이터 점 스튜디오 · 규칙 A/B')],
      share: [L('notes.html', '작업 노트 · 버전과 A/B 근거')] },
    { sheet: 's4', stage: 2, badge: '2단계 · 내 소리', logStage: 'make',
      learn: [],
      make:  [L('studio-sound.html', '내 소리를 데이터로'), L('studio-data.html', '데이터 점 스튜디오')],
      share: [L('gallery.html', '소리 작품 전시')] },
    { sheet: 's5', stage: 3, badge: '3단계 · 내 사진', logStage: 'make',
      learn: [L('studio-object.html', '객체 감지 · AI 눈이 놓치는 것')],
      make:  [L('studio-life.html', '내 사진을 데이터로'), L('studio-data.html', '데이터 점 스튜디오')],
      share: [L('gallery.html', '내 삶 작품 전시')] },
    { sheet: 's6', stage: 4, badge: '4단계 · 사회', logStage: 'judge',
      learn: [L('society.html', '사회 분석 · 비평 렌즈'), L('literacy.html', 'AI 리터러시 5장 · 무엇을 셀 것인가')],
      make:  [L('project.html', '사회문제 프로젝트'), L('studio-data.html', '데이터 점 스튜디오')],
      share: [L('gallery.html', '사회 작품 전시')] },
    { sheet: 's7', stage: 4, badge: '마무리 · 진술문', logStage: 'own',
      learn: [L('literacy.html', 'AI 리터러시 7장 · 창작 진술문')],
      make:  [L('studio-word.html', '낱말 구름 스튜디오')],
      share: [L('notes.html', '작업 노트'), L('portfolio.html', '내 포트폴리오')] },
    // 8차시 학습지는 '유사도 지수'(admin.html)도 화면으로 적어 두었지만, 그 화면은 교사 전용이다.
    // 학생 단추는 달지 않고 교사가 큰 화면으로 함께 본다.
    { sheet: 's8', stage: 4, badge: '마무리 · 전시', logStage: 'share',
      learn: [L('literacy.html', 'AI 리터러시 4장 · 우리 반 유사도')],
      make:  [],
      share: [L('exhibit.html', '키오스크 전시'), L('gallery.html', '전시 갤러리'), L('work.html', '작품 페이지 · QR 비평')] }
  ];
  // '학습지 열기' 단추가 뜨는 화면 = 그 차시의 세 활동 화면 전부
  COURSE.forEach(c => {
    const seen = {};
    c.pages = [].concat(c.learn, c.make, c.share).map(x => x.page)
      .filter(p => (seen[p] ? false : (seen[p] = true)));
  });

  /* 4단계 여정의 이름: 허브·여정 화면·내비와 같은 말을 쓴다.
     단계 순서는 차시 순서를 그대로 따른다: 그림(1~3차시) → 내 소리(4차시) → 내 사진(5차시) → 사회(6차시~). */
  const STAGE_NAME = { 1: '그림을 데이터로', 2: '내 소리를 데이터로', 3: '내 사진을 데이터로', 4: '사회 문제를 데이터로' };

  const page = () => (location.pathname.split('/').pop() || 'index.html');
  const esc = (s) => (global.UI && UI.escapeHTML) ? UI.escapeHTML(s) : String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ----------------------------- 꾸러미 읽기 ----------------------------- */
  let packPromise = null, manifestPromise = null;

  // 학습지 전체(단원 + 9장): 학습지 화면에서만 필요하다
  function load() {
    if (!packPromise) packPromise = Worksheet.load(BASE, UNIT);
    return packPromise;
  }
  // 색인만(칸 목록·라벨·루브릭 표시): 허브·교사 대시보드가 쓴다
  function loadManifest() {
    if (!manifestPromise) manifestPromise = fetch(BASE + '/manifest.json', { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then(m => m.units.find(u => u.id === UNIT) || m.units[0]);
    return manifestPromise;
  }
  // 단원 메타(백워드 설계의 목표·증거 층): 여정 지도가 쓴다
  let unitPromise = null;
  function loadUnit() {
    if (!unitPromise) unitPromise = loadManifest().then(u =>
      fetch(BASE + '/' + u.dir + '/' + (u.unitFile || 'unit.json'), { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error('unit ' + r.status); return r.json(); }));
    return unitPromise;
  }

  const entryOf = (sheetId) => COURSE.find(c => c.sheet === sheetId) || null;
  const indexOf = (sheetId) => COURSE.findIndex(c => c.sheet === sheetId);
  const forPage = (p) => COURSE.filter(c => c.pages.indexOf(p || page()) >= 0);

  /* ----------------------------- 저장(작업노트) ----------------------------- */
  /*
   * 한 장 = 한 건. id 를 미리 정해 두는 것이 핵심이다.
   * 자동 저장은 디바운스로 여러 번 겹칠 수 있는데, id 없이 저장하면 그때마다 새 노트가
   * 생겨 교사 화면에서 같은 학생의 같은 차시가 여러 줄로 보인다(제출률이 어긋난다).
   */
  function noteIdOf(user, sheetId) {
    const code = (Log && Log.anonOf && Log.anonOf(user)) || (user && user.userId) || 'anon';
    return 'ws_' + String(code).replace(/[^\w-]/g, '-') + '_' + UNIT + '_' + sheetId;
  }

  function blankNote(user, sheet) {
    const c = entryOf(sheet.id) || {};
    return {
      id: noteIdOf(user, sheet.id),
      userId: user.userId, by: user.display || '', klass: user.klass || '',
      code: (Log && Log.anonOf && Log.anonOf(user)) || '',
      kind: 'worksheet', unit: UNIT, sheet: sheet.id,
      session: sheet.session || 0,
      stage: c.stage != null ? c.stage : null,   // 4단계 여정에서의 자리(숫자)
      procStage: c.logStage || 'make',           // 창작 7단계에서의 자리(키): metrics.js 가 D-1 에 쓴다
      title: (sheet.session ? sheet.session + '차시 · ' : '') + (sheet.title || '학습지'),
      answers: {}, filled: 0, total: 0
    };
  }

  // 내 학습지 노트만 (sheet id → 노트)
  // ⚠ 클라우드 모드에서 Store.listNotes 는 notes 컬렉션을 통째로 읽는다(where 절이 없다).
  //    그래서 이 함수는 '학습지 화면'에서만 부른다. 스튜디오 단추·허브는 아래 진행률 요약을 읽는다.
  async function myNotes(user) {
    const map = {};
    if (!user) return map;
    const list = await Store.listNotes(user.userId);
    list.forEach(n => { if (n.kind === 'worksheet' && n.unit === UNIT && n.sheet) map[n.sheet] = n; });
    return map;
  }

  /* ------------------------- 진행률 요약(이 기기) -------------------------
   * 학습지 단추는 14개 화면에 뜬다. 그때마다 저장소를 읽으면 클라우드에서는
   * 한 시간 수업에 학급 전체 노트를 수백 번 읽게 된다(읽기 비용·속도 둘 다 문제).
   * 그래서 '몇 %를 채웠나'만 이 기기에 남겨 두고 단추·허브는 그것만 본다.
   * 답 자체는 언제나 저장소가 원본이고, 학습지 화면을 한 번 열면 요약이 다시 맞춰진다.
   * 기기를 함께 쓰는 교실을 생각해 userId 를 함께 적고, 다른 학생이면 무시한다.
   */
  const K_PROG = 'dn_ws_prog';
  function readProgress(user) {
    try {
      const raw = JSON.parse(localStorage.getItem(K_PROG) || '{}');
      return (user && raw.userId === user.userId && raw.sheets) || {};
    } catch (e) { return {}; }
  }
  function writeProgress(user, stats) {
    if (!user) return;
    try {
      const raw = JSON.parse(localStorage.getItem(K_PROG) || '{}');
      const sheets = (raw.userId === user.userId && raw.sheets) || {};
      Object.keys(stats).forEach(k => { sheets[k] = stats[k]; });
      localStorage.setItem(K_PROG, JSON.stringify({ userId: user.userId, sheets }));
    } catch (e) { /* 용량 초과: 요약은 없어도 화면이 동작한다 */ }
  }

  /* ----------------------------- 진행 상태 ----------------------------- */
  const filledCount = (answers, paths) =>
    paths.reduce((k, p) => k + (String((answers || {})[p] == null ? '' : answers[p]).trim() ? 1 : 0), 0);

  function statOf(answers, paths) {
    const total = paths.length, filled = filledCount(answers, paths);
    return { filled, total, pct: total ? Math.round(filled * 100 / total) : 0 };
  }

  // 노트 → 차시별 진행률. 학습지 화면에서 한 번 계산해 요약으로도 남긴다.
  function statsFromNotes(entryIndex, notes) {
    const bySheet = {};
    (entryIndex.fieldIndex || []).forEach(f => { (bySheet[f.sheet] = bySheet[f.sheet] || []).push(f.path); });
    const out = {};
    Object.keys(notes || {}).forEach(id => { out[id] = statOf(notes[id].answers, bySheet[id] || []); });
    return out;
  }

  // 단원 전체 계획: 차시별 상태(완료/하는 중/열림/잠김)와 '다음에 할 차시'
  function planOf(entryIndex, stats) {
    const bySheet = {};
    (entryIndex.fieldIndex || []).forEach(f => { (bySheet[f.sheet] = bySheet[f.sheet] || []).push(f.path); });

    const rows = COURSE.map(c => {
      const paths = bySheet[c.sheet] || [];
      const st = (stats || {})[c.sheet] || { filled: 0, total: paths.length, pct: 0 };
      const meta = (entryIndex.sheets || []).find(s => s.id === c.sheet) || {};
      return { course: c, stat: st, title: meta.title || c.sheet, session: meta.session, yield: meta.yield || '', state: 'todo' };
    });

    // 잠김 = 앞 차시가 아직 OPEN_PCT 에 못 미친 상태(표지와 1차시는 언제나 열려 있다)
    let openUntil = 1;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      if (prev.stat.pct >= OPEN_PCT || prev.course.sheet === 'cover') openUntil = i + 1; else break;
    }
    rows.forEach((r, i) => {
      r.state = r.stat.pct >= DONE_PCT ? 'done' : r.stat.pct > 0 ? 'doing' : (i < openUntil ? 'open' : 'locked');
    });
    // '다음에 할 차시'는 표지를 세지 않는다. 표지는 학번 코드·작품 제목 두 칸이라
    // 비어 있다는 이유로 앞을 막으면, 차시를 다 해도 계속 표지를 가리키게 된다.
    const sessions = rows.filter(r => r.course.sheet !== 'cover');
    const next = sessions.find(r => r.state === 'doing') || sessions.find(r => r.state !== 'done') || sessions[sessions.length - 1];
    const doneCnt = sessions.filter(r => r.state === 'done').length;
    return { rows, next, doneCnt, sessions: sessions.length };
  }

  /* --------------------- 학습 로그(종이와 화면이 같은 사건을 가리키게) --------------------- */
  const K_ACTS = 'dn_ws_acts';
  const readActs = () => { try { return JSON.parse(localStorage.getItem(K_ACTS) || '{}'); } catch (e) { return {}; } };
  function logOnce(key, rec) {
    const acts = readActs();
    if (acts[key]) return;
    acts[key] = 1;
    try { localStorage.setItem(K_ACTS, JSON.stringify(acts)); } catch (e) { /* 용량 초과: 기록만 건너뛴다 */ }
    if (global.Log) Log.push(rec);
  }

  /* ----------------------------- 학습지 화면 ----------------------------- */
  async function mountPage(opts) {
    opts = opts || {};
    const host = document.getElementById(opts.el || 'sheet');
    const user = Auth.current();
    if (!host) return;

    if (!user) {
      host.innerHTML = UI.callout('학습지는 <b>내 계정에 자동 저장</b>돼요. 먼저 로그인하세요. ' +
        '<a href="index.html?next=worksheet.html">로그인하러 가기 →</a>', 'info');
      return;
    }

    let pack;
    try { pack = await load(); }
    catch (e) {
      host.innerHTML = UI.callout('<b>학습지를 불러오지 못했어요.</b> 파일을 직접 열면(<code>file://</code>) 브라우저가 JSON 을 막습니다. ' +
        '학교 주소(https://…)로 열거나 간이 서버로 실행해 주세요. <span class="muted">(' + esc(e.message) + ')</span>', 'warn');
      return;
    }

    const notes = await myNotes(user);
    const stats = statsFromNotes(pack.entry, notes);
    writeProgress(user, stats);                      // 단추·허브가 저장소를 다시 읽지 않도록
    const plan = planOf(pack.entry, stats);

    // 어느 학습지를 열 것인가: ?s=s3 > 마지막으로 보던 것 > 다음에 할 차시
    const want = new URLSearchParams(location.search).get('s');
    const row = plan.rows.find(r => r.course.sheet === want) || plan.next;
    const sheet = pack.sheets.find(s => s.id === row.course.sheet) || pack.sheets[0];
    const course = entryOf(sheet.id) || {};

    let rec = notes[sheet.id] || blankNote(user, sheet);
    rec.answers = rec.answers || {};

    renderToc(plan, sheet.id, opts);
    renderHead(plan, row, sheet, course, opts);
    renderCarryIn(pack, notes, sheet, opts);

    // 본문
    host.setAttribute('data-theme', 'light');    // 꾸러미 CSS 가 OS 다크에 반응하지 않도록(사이트 학습 화면은 라이트 고정)
    Worksheet.renderSheet(host, {
      unit: pack.unit, sheet, toc: pack.entry.toc, answers: rec.answers,
      onChange(path, value, all) { rec.answers = all; onEdit(path); }
    });

    /* ---- 자동 저장 ---- */
    const paths = (pack.entry.fieldIndex || []).filter(f => f.sheet === sheet.id).map(f => f.path);
    const statusEl = document.getElementById(opts.statusEl || 'ws-status');
    const barEl = document.getElementById(opts.progressEl || 'ws-progress');
    let timer = null, saving = false, again = false;

    function paint() {
      const st = statOf(rec.answers, paths);
      if (barEl) {
        barEl.style.width = st.pct + '%';
        barEl.parentElement && barEl.parentElement.setAttribute('aria-valuenow', String(st.pct));
      }
      const cnt = document.getElementById(opts.countEl || 'ws-count');
      if (cnt) cnt.textContent = st.filled + ' / ' + st.total + '칸 (' + st.pct + '%)';
      return st;
    }
    const say = (t, cls) => { if (statusEl) { statusEl.textContent = t; statusEl.className = 'ws-save ' + (cls || ''); } };

    async function flush() {
      if (saving) { again = true; return; }
      saving = true; say('저장 중…');
      try {
        const st = paint();
        rec.filled = st.filled; rec.total = st.total;
        writeProgress(user, { [sheet.id]: st });
        rec.id = await Store.saveNote(rec) || rec.id;
        say('저장됨 · ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }), 'ok');
        logOnce(rec.id + ':save', { stage: course.logStage || 'make', action: 'note_save', payload: { sheet: sheet.id, session: sheet.session } });
      } catch (e) {
        say('⚠ 저장 실패. 잠시 뒤 다시 시도해요', 'bad');
        console.warn('[worksheet] 저장 실패', e);
      }
      saving = false;
      if (again) { again = false; flush(); }
    }

    function onEdit(path) {
      paint();
      say('입력 중…');
      clearTimeout(timer); timer = setTimeout(flush, 1200);
      // 학습지 칸에 적힌 행동을 화면 기록으로도 남긴다(칸마다 한 번만).
      const blockId = String(path).split('.')[1];
      const block = (sheet.blocks || []).find(b => b.id === blockId);
      if (block && block.logAction) {
        logOnce(rec.id + ':' + blockId, {
          stage: course.logStage || 'make', action: block.logAction,
          payload: { sheet: sheet.id, block: blockId, session: sheet.session }
        });
      }
    }

    /*
     * 화면을 벗어날 때 아직 안 넘긴 입력을 흘리지 않는다.
     * beforeunload 안에서는 클라우드 저장(setDoc)이 끝날 시간이 없다. 그래서 링크를 먼저 가로채
     * 저장이 끝난 뒤에 옮겨 간다. beforeunload 는 뒤로가기·탭 닫기용 마지막 방책으로만 남긴다.
     */
    document.addEventListener('click', async (e) => {
      if (!timer) return;                                   // 저장 대기 중일 때만 가로챈다
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) return;
      e.preventDefault();
      clearTimeout(timer); timer = null;
      await flush();
      location.href = a.href;
    }, true);
    const bail = () => { if (timer) { clearTimeout(timer); timer = null; flush(); } };
    window.addEventListener('beforeunload', bail);
    document.addEventListener('visibilitychange', () => { if (document.hidden) bail(); });

    paint();
    say(rec.updatedAt ? '마지막 저장 ' + new Date(rec.updatedAt).toLocaleString('ko-KR') : '아직 저장 전이에요. 쓰면 자동으로 저장됩니다');
    if (global.Log) Log.push({ stage: course.logStage || 'sense', action: 'view', payload: { sheet: sheet.id, session: sheet.session } });
  }

  /* ---- 차례(단원 전체) ---- */
  function renderToc(plan, curId, opts) {
    const el = document.getElementById(opts.tocEl || 'ws-toc');
    if (!el) return;
    const MARK = { done: '✔', doing: '·', open: '', locked: '🔒' };
    el.innerHTML = plan.rows.map(r => {
      const c = r.course, on = c.sheet === curId;
      const num = c.sheet === 'cover' ? '표지' : r.session + '차시';
      const sub = [c.badge === r.title ? '' : c.badge, r.yield].filter(Boolean).join(' · ');
      return '<a class="ws-toc-item ' + r.state + (on ? ' on' : '') + '" href="worksheet.html?s=' + c.sheet + '"' +
        (on ? ' aria-current="page"' : '') + '>' +
        '<span class="n">' + num + '</span>' +
        '<span class="t"><b>' + esc(r.title) + '</b><small>' + esc(sub) + '</small></span>' +
        '<span class="s">' + (MARK[r.state] || '') + (r.stat.pct ? ' ' + r.stat.pct + '%' : '') + '</span></a>';
    }).join('');
  }

  /* ---- 머리말(배지·연결 화면·이동 단추) ---- */
  function renderHead(plan, row, sheet, course, opts) {
    const el = document.getElementById(opts.headEl || 'ws-head');
    if (!el) return;
    const i = indexOf(sheet.id);
    const prev = plan.rows[i - 1], next = plan.rows[i + 1];
    const links = (sheet.screens || []).filter(s => s.page && s.exists)
      .map(s => '<a class="btn sm" href="' + s.page + '">' + esc(s.label) + ' 열기 →</a>').join('');
    // 이 차시의 세 활동: 학습지 머리에서 배우기 → 만들기 → 나누기가 한 묶음으로 보인다
    const actLine = (label, list) => (list && list.length)
      ? '<span class="ws-acts-g"><i>' + label + '</i>' +
        list.map(x => '<a href="' + x.page + '">' + esc(x.label) + '</a>').join('') + '</span>'
      : '';
    const acts = actLine('배우기', course.learn) + actLine('만들기', course.make) + actLine('나누기', course.share);

    el.innerHTML =
      '<div class="ws-bar">' +
        '<span class="badge core">' + esc(course.badge || '') + '</span>' +
        (course.stage ? '<span class="muted" style="font-size:12px">여정 ' + course.stage + '단계 · ' + esc(STAGE_NAME[course.stage] || '') + '</span>' : '') +
        '<span class="ws-save" id="ws-status"></span>' +
      '</div>' +
      '<div class="ws-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="이 학습지 진행률">' +
        '<i id="ws-progress"></i></div>' +
      '<div class="ws-bar"><span class="muted" style="font-size:12px" id="ws-count"></span>' + links + '</div>' +
      (acts ? '<div class="ws-acts">' + acts + '</div>' : '') +
      /*
       * 잠김 안내는 꾸중이 아니다. 결석·보충으로 순서가 흐트러진 학생이 뒤 차시를 먼저
       * 열 수 있는데, 그때 "먼저 쓰세요"라고 하면 사이트가 데려다 놓고 나무라는 꼴이 된다.
       * 그래서 '무슨 일이 벌어지는지'만 알리고 가는 길을 함께 준다.
       */
      (row.state === 'locked' && prev ? UI.callout('<b>' +
        esc(prev.session ? prev.session + '차시 「' + prev.title + '」' : prev.title) +
        '에서 넘긴 한 줄</b>이 이 학습지에 쓰여요. 아직 안 썼다면 먼저 다녀와도 좋고, 여기부터 써도 괜찮아요. ' +
        '<a href="worksheet.html?s=' + prev.course.sheet + '">그 차시 보기 →</a>', 'info') : '') +
      '<div class="ws-bar ws-move">' +
        (prev ? '<a class="btn sm" href="worksheet.html?s=' + prev.course.sheet + '">← ' + (prev.session ? prev.session + '차시' : '표지') + '</a>' : '') +
        (next ? '<a class="btn sm" href="worksheet.html?s=' + next.course.sheet + '">' + (next.session ? next.session + '차시' : '') + ' →</a>' : '') +
        '<button class="btn sm" onclick="window.print()">🖨 인쇄(A4)</button>' +
      '</div>';
  }

  /* ---- 지난 차시에서 넘긴 한 줄 ---- */
  /* 학습지에는 '다음 시간으로 넘기는 한 줄'이 있다. 종이에서는 학생이 앞장을 넘겨 보지만
     화면에서는 앞 차시가 다른 문서라 사라진다. 그래서 이 자리에서 다시 보여 준다. */
  function renderCarryIn(pack, notes, sheet, opts) {
    const el = document.getElementById(opts.carryEl || 'ws-carry-in');
    if (!el) return;
    el.innerHTML = '';
    const from = pack.sheets.find(s => s.carryOver && (s.carryOver.to || []).some(t => String(t).split('.')[0] === sheet.id));
    if (!from) return;
    const rec = notes[from.id];
    const line = rec && rec.answers && rec.answers[from.id + '.' + from.carryOver.id + '.text'];
    if (!line || !String(line).trim()) return;
    el.innerHTML = UI.callout('<b>지난 ' + from.session + '차시에서 넘긴 한 줄</b>: “' + esc(line) + '”' +
      (from.carryOver.as ? ' <span class="muted">(' + esc(from.carryOver.as) + ')</span>' : ''), 'info');
  }

  /* --------------------- 스튜디오 화면의 '학습지 열기' 단추 --------------------- */
  /*
   * 학습지를 따로 찾아 들어가게 하면 수업 중에 아무도 열지 않는다.
   * 그래서 그 차시가 쓰는 화면 위에 작은 단추로 띄운다. 도구 옆에 종이가 놓여 있는 모양.
   */
  function mountLauncher() {
    const list = forPage();
    if (!list.length || document.getElementById('ws-launch')) return;
    const user = Auth.current();
    if (!user) return;

    // 저장소를 읽지 않는다. 이 기기에 남은 진행률 요약만 본다(14개 화면에 뜨는 단추라서).
    const prog = readProgress(user);

    // 한 화면을 여러 차시가 쓸 때(데이터 점 스튜디오)는 아직 덜 채운 앞 차시를 고른다
    const pctOf = (id) => (prog[id] && prog[id].pct) || 0;
    const pick = list.slice().sort((a, b) =>
      (pctOf(a.sheet) >= DONE_PCT) - (pctOf(b.sheet) >= DONE_PCT) || indexOf(a.sheet) - indexOf(b.sheet))[0];

    const pct = pctOf(pick.sheet);
    const ses = pick.sheet === 'cover' ? '표지' : pick.sheet.replace('s', '') + '차시';

    const a = document.createElement('a');
    a.id = 'ws-launch'; a.className = 'ws-launch'; a.href = 'worksheet.html?s=' + pick.sheet;
    a.setAttribute('aria-label', ses + ' 학습지 열기: ' + (pct ? pct + '% 채움' : '아직 시작 전'));
    a.innerHTML = '<span class="ic" aria-hidden="true">📄</span><span class="tx"><b>' + ses + ' 학습지</b>' +
      '<small>' + (pct ? pct + '% 채움 · 이어서 쓰기' : '이 화면에서 쓰는 학습지') + '</small></span>';
    document.body.appendChild(a);
  }

  /* --------------------- 통합 여정: 차시마다 배우기·만들기·나누기·학습지 한 묶음 --------------------- */
  /*
   * 허브와 여정 지도가 같은 화면을 그린다(지도가 두 장이 되지 않게).
   * 한 줄 = 한 차시. 그 차시의 본질적 질문 아래에 배우기 → 만들기 → 나누기 화면과
   * 학습지 단추·진행 상태가 함께 놓인다. 백워드 설계의 '학습 계획'을 학생 말로 그린 것.
   */
  async function mountJourney(elId, opts) {
    opts = opts || {};
    const el = document.getElementById(elId || 'jr');
    if (!el) return;
    const user = Auth.current();
    let entryIndex, unit = null;
    try { entryIndex = await loadManifest(); } catch (e) {
      el.innerHTML = (global.UI && UI.callout)
        ? UI.callout('<b>차시 목록을 불러오지 못했어요.</b> 파일을 직접 열면(<code>file://</code>) 브라우저가 JSON 을 막습니다. 학교 주소나 간이 서버로 열어 주세요.', 'warn')
        : '';
      return;
    }
    try { unit = await loadUnit(); } catch (e) { /* 질문 문구만 빠진 채 그린다 */ }

    const eqText = {};
    ((unit && unit.essentialQuestions) || []).forEach(q => { eqText[q.id] = q.text; });
    const metaOf = id => (entryIndex.sheets || []).find(s => s.id === id) || {};
    const plan = planOf(entryIndex, readProgress(user));
    const MARK = { done: '✔ 다 씀', doing: '· 하는 중', open: '이번 차례', locked: '🔒 아직' };
    const rows = plan.rows.filter(r => r.course.sheet !== 'cover');

    const actHTML = (label, list) => (list && list.length)
      ? '<div class="jr-act"><i>' + label + '</i><span>' +
        list.map(x => '<a href="' + x.page + '">' + esc(x.label) + '</a>').join('') + '</span></div>'
      : '<div class="jr-act off"><i>' + label + '</i><span class="muted">화면 속 ⓘ 설명으로</span></div>';

    el.innerHTML =
      '<div class="dn-cluster-head"><div><span class="eyebrow">Plan</span><h3>' +
      (opts.title || '한 차시가 한 묶음: 배우기 → 만들기 → 나누기') + '</h3>' +
      '<p>차시 번호가 곧 순서예요. 매 차시 <b>학습지 한 장</b>이 함께 가고, 쓴 내용은 자동 저장되어 ' +
      '선생님 화면과 내 포트폴리오로 이어집니다.' + (user ? '' : ' 로그인하면 진행률이 표시돼요.') + '</p></div>' +
      '<a class="more" href="worksheet.html">학습지 열기 →</a></div>' +
      '<div class="jr">' + rows.map(r => {
        const c = r.course, m = metaOf(c.sheet);
        const q = (m.eq || []).map(id => eqText[id]).filter(Boolean)[0] || '';
        const isNext = plan.next && plan.next.course.sheet === c.sheet;
        return '<div class="jr-row ' + r.state + (isNext ? ' now' : '') + '">' +
          '<div class="jr-n"><b>' + r.session + '차시</b><span class="jr-stage">' + esc(c.badge) + '</span>' +
            '<span class="jr-state ' + r.state + '">' + MARK[r.state] + (r.stat.pct ? ' · ' + r.stat.pct + '%' : '') + '</span></div>' +
          '<div class="jr-main">' +
            '<b class="jr-title">' + esc(r.title) + '</b>' +
            (q ? '<p class="jr-q">' + esc(q) + '</p>' : '') +
            '<div class="jr-acts">' + actHTML('배우기', c.learn) + actHTML('만들기', c.make) + actHTML('나누기', c.share) + '</div>' +
            '<div class="jr-foot"><a class="btn sm" href="worksheet.html?s=' + c.sheet + '">📄 학습지 쓰기</a>' +
              (r.yield ? '<span class="jr-yield">남는 것 · ' + esc(r.yield) + '</span>' : '') + '</div>' +
          '</div></div>';
      }).join('') + '</div>' +
      '<p class="muted" style="font-size:12px;margin:10px 0 0"><b>' +
      (plan.next.session ? plan.next.session + '차시 「' + esc(plan.next.title) + '」' : '표지') + '</b> 차례입니다 · ' +
      '완료 ' + plan.doneCnt + ' / ' + rows.length + '장 · 결석했더라도 잠금은 안내일 뿐, 어느 차시든 열 수 있어요.</p>';
  }

  /* 4단계 여정 노드에 '학습지 N차시' 꼬리표 달기: 단계와 차시를 한 화면에서 잇는다 */
  function tagStageNodes(sel) {
    document.querySelectorAll((sel || '#spine') + ' .dn-node').forEach(node => {
      const stage = +node.dataset.stage;
      const mine = COURSE.filter(c => c.stage === stage && c.sheet !== 'cover');
      if (!mine.length) return;
      const tx = mine.map(c => c.sheet.replace('s', '') + '차시').join('·');
      const tag = document.createElement('span');
      tag.className = 'ws-tag'; tag.textContent = '📄 학습지 ' + tx;
      node.appendChild(tag);
    });
  }

  global.WS = {
    BASE, UNIT, UNIT_ID: UNIT, COURSE, STAGE_NAME, DONE_PCT, OPEN_PCT,
    load, loadManifest, loadUnit, entryOf, indexOf, forPage, noteIdOf, blankNote, myNotes,
    statOf, statsFromNotes, readProgress, planOf, mountPage, mountLauncher,
    mountJourney, mountHub: mountJourney,   // mountHub 는 옛 이름: 같은 통합 여정을 그린다
    tagStageNodes
  };
})(window);
