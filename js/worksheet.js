/*
 * worksheet.js: 단원의 '학습 계획' 층: 차시 ↔ 단계 ↔ 만들기·배우기·나누기 ↔ 학습지
 * -----------------------------------------------------------------------------
 * 이 단원은 목표를 먼저 정하고 그것을 확인할 방법을 정한 다음, 그 둘에 맞춰 차시를
 * 짰다. 세 층의 원본은 이렇다.
 *
 *   ① 목표  worksheets/unit-data-eye/unit.json  (큰 개념·이 단원이 남기는 힘·되풀이해 묻는 질문)
 *   ② 확인  같은 파일의 performanceTask·rubric·evidenceLayers + 학습지의 칸(무엇을 남기는지 세 갈래로 표시)
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
  /*
   * L(화면, 라벨, 앵커)
   *   page  는 화면의 '신원'이다. 여기에 # 나 ? 를 절대 넣지 않는다.
   *         forPage() 가 주소창의 파일명과 문자열로 대조하는 열쇠이고,
   *         오염되면 18개 화면에서 위치 스트립과 학습지 단추가 통째로 사라진다.
   *   hash  는 그 화면 안의 도착 지점(리터러시 5장 같은 것). 주소를 만들 때만 붙인다.
   * 주소 만들기는 hrefOf() 한 곳에서만 한다: page?s=차시#앵커
   */
  const L = (page, label, hash) => ({ page, label, hash: hash || '' });
  const COURSE = [
    { sheet: 'cover', stage: 0, badge: '표지', logStage: 'sense', learn: [], make: [], share: [] },
    { sheet: 's1', stage: 1, badge: '1단계 · 그림', logStage: 'sense',
      learn: [L('learn.html', '알고리즘 배움터'), L('literacy.html', 'AI 리터러시 1·2장 · 이미지가 숫자가 되는 원리', 'ch1')],
      make:  [L('lab.html', '알고리즘 분석실 · 일곱 개의 눈')],
      share: [L('quiz.html', '분석 퀴즈 · 출제하고 겨루기')] },
    { sheet: 's2', stage: 1, badge: '1단계 · 그림', logStage: 'make',
      learn: [L('literacy.html', 'AI 리터러시 3장 · 생성형 AI는 무엇을 잘하는가', 'ch3')],
      make:  [L('studio-color.html', '색 군집 스튜디오')],
      share: [L('gallery.html', '첫 작품 전시하고 감상')] },
    { sheet: 's3', stage: 1, badge: '1단계 · 규칙', logStage: 'make',
      learn: [L('critique.html', '데이터 비평 읽기 · 축과 수사')],
      make:  [L('studio-data.html', '데이터 점 스튜디오 · 규칙 A/B')],
      share: [L('notes.html', '작업 노트 · 버전과 A/B 근거')] },
    { sheet: 's4', stage: 2, badge: '2단계 · 내 소리', logStage: 'make',
      learn: [L('learn.html', '배움터 · 데이터를 점으로 옮기는 매핑')],
      make:  [L('studio-sound.html', '내 소리를 데이터로'), L('studio-data.html', '데이터 점 스튜디오')],
      share: [L('gallery.html', '소리 작품 전시하고 감상')] },
    { sheet: 's5', stage: 3, badge: '3단계 · 내 사진', logStage: 'make',
      learn: [L('studio-object.html', '객체 감지 · AI 눈이 놓치는 것'),
              L('literacy.html', 'AI 리터러시 6장 · 저작권과 초상권', 'ch6')],
      make:  [L('studio-life.html', '내 사진을 데이터로'), L('studio-data.html', '데이터 점 스튜디오')],
      share: [L('gallery.html', '내 삶 작품 전시하고 감상')] },
    { sheet: 's6', stage: 4, badge: '4단계 · 사회', logStage: 'judge',
      learn: [L('society.html', '사회 분석 · 비평 렌즈'),
              L('literacy.html', 'AI 리터러시 5장 · 데이터는 관점이다', 'ch5')],
      make:  [L('project.html', '사회문제 프로젝트'), L('studio-data.html', '데이터 점 스튜디오')],
      share: [L('gallery.html', '사회 작품 전시하고 감상')] },
    { sheet: 's7', stage: 4, badge: '마무리 · 진술문', logStage: 'own',
      learn: [L('literacy.html', 'AI 리터러시 7장 · 창작의 책임과 진술문', 'ch7')],
      make:  [L('studio-word.html', '낱말 구름 스튜디오')],
      share: [L('notes.html', '작업 노트'), L('portfolio.html', '내 포트폴리오')] },
    // 8차시 학습지는 '유사도 지수'(admin.html)도 적어 두었지만 그 화면은 교사 전용이다.
    // 학생 단추는 달지 않고 교사가 큰 화면으로 함께 본다(학습지 JSON 도 exists:false 로 막아 두었다).
    { sheet: 's8', stage: 4, badge: '마무리 · 전시', logStage: 'share',
      learn: [L('literacy.html', 'AI 리터러시 4장 · 그럴듯함의 함정과 우리 반 유사도', 'ch4')],
      make:  [L('portfolio.html', '내 포트폴리오 · 여덟 차시를 한 장으로')],
      share: [L('exhibit.html', '키오스크 전시'), L('gallery.html', '전시 갤러리 · 친구 작품 비평'),
              L('work.html', '작품 페이지 · 갤러리나 QR 로 작품을 고른 뒤 열려요')] }
  ];
  // 위치 스트립·학습지 단추가 뜨는 화면 = 그 차시의 세 활동 화면 전부(앵커는 신원이 아니라 제외)
  COURSE.forEach(c => {
    const seen = {};
    c.pages = [].concat(c.learn, c.make, c.share).map(x => x.page)
      .filter(p => (seen[p] ? false : (seen[p] = true)));
  });

  /* 척추 안의 주소는 전부 여기서 만든다: 어느 차시로 들어가는지(?s=)와 도착 지점(#)을 함께 싣는다.
     공용 화면(데이터 점 스튜디오·갤러리·리터러시)이 '지금 몇 차시인가'를 추측하지 않게 하는 장치다. */
  const hrefOf = (x, sheetId) => x.page + (sheetId ? '?s=' + sheetId : '') + (x.hash ? '#' + x.hash : '');

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
  // 단원 메타(목표·확인 방법의 원본): 여정 지도가 쓴다
  let unitPromise = null;
  function loadUnit() {
    if (!unitPromise) unitPromise = loadManifest().then(u =>
      fetch(BASE + '/' + u.dir + '/' + (u.unitFile || 'unit.json'), { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error('unit ' + r.status); return r.json(); }));
    return unitPromise;
  }

  // 학습지 한 장만: 도구 옆 서랍이 쓴다. 아홉 장을 다 받을 이유가 없다.
  const sheetCache = {};
  function loadSheet(sheetId) {
    if (!sheetCache[sheetId]) sheetCache[sheetId] = loadManifest().then(ix => {
      const meta = (ix.sheets || []).find(s => s.id === sheetId);
      if (!meta) throw new Error('없는 학습지: ' + sheetId);
      return fetch(BASE + '/' + ix.dir + '/' + meta.file, { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error('sheet ' + r.status); return r.json(); });
    });
    return sheetCache[sheetId];
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

  /*
   * 내 학습지 노트만 (sheet id → 노트)
   * ⚠ 클라우드 모드에서 Store.listNotes 는 notes 컬렉션을 통째로 읽는다(where 절이 없다).
   *   그래서 이 함수는 '학습지를 실제로 여는 순간'에만 부르고, 한 번 읽은 것은 이 페이지가
   *   살아 있는 동안 다시 읽지 않는다(학습지 화면 · 도구 옆 서랍이 같은 약속을 나눠 쓴다).
   *   화면 여기저기의 단추·진행 표시는 저장소가 아니라 아래의 진행률 요약을 본다.
   *
   * 한 장만 집어 오는 편법(getNote)을 쓰지 않는 이유: store.call() 은 클라우드에 없는
   * 메서드를 조용히 로컬로 넘긴다. 클라우드 수업에서 빈 답을 받아 들고 첫 타자에 그것을
   * 덮어쓰면 학생이 쓴 것이 사라진다. 통째로 읽더라도 한 번만 읽는 쪽이 안전하다.
   */
  let notesPromise = null, notesFor = null;
  async function myNotes(user) {
    if (!user) return {};
    if (notesPromise && notesFor === user.userId) return notesPromise;
    notesFor = user.userId;
    notesPromise = Store.listNotes(user.userId).then(list => {
      const map = {};
      list.forEach(n => { if (n.kind === 'worksheet' && n.unit === UNIT && n.sheet) map[n.sheet] = n; });
      return map;
    }).catch(e => { notesPromise = null; throw e; });
    return notesPromise;
  }

  /* ------------------------- 진행률 요약(이 기기) -------------------------
   * 학습지 단추와 위치 스트립은 18개 화면에 뜬다. 그때마다 저장소를 읽으면 클라우드에서는
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

    const rec = notes[sheet.id] || blankNote(user, sheet);

    renderToc(plan, sheet.id, opts);
    renderHead(plan, row, sheet, course, opts);
    renderCarryIn(pack, notes, sheet, opts);

    const statusEl = document.getElementById(opts.statusEl || 'ws-status');
    const barEl = document.getElementById(opts.progressEl || 'ws-progress');
    const eng = attachSheet(host, {
      user, unit: pack.unit, sheet, course, rec, toc: pack.entry.toc,
      paths: (pack.entry.fieldIndex || []).filter(f => f.sheet === sheet.id).map(f => f.path),
      onStat(st) {
        if (barEl) {
          barEl.style.width = st.pct + '%';
          barEl.parentElement && barEl.parentElement.setAttribute('aria-valuenow', String(st.pct));
        }
        const cnt = document.getElementById(opts.countEl || 'ws-count');
        if (cnt) cnt.textContent = st.filled + ' / ' + st.total + '칸 (' + st.pct + '%)';
      },
      say(t, cls) { if (statusEl) { statusEl.textContent = t; statusEl.className = 'ws-save ' + (cls || ''); } }
    });

    /*
     * 화면을 벗어날 때 아직 안 넘긴 입력을 흘리지 않는다.
     * beforeunload 안에서는 클라우드 저장(setDoc)이 끝날 시간이 없다. 그래서 링크를 먼저 가로채
     * 저장이 끝난 뒤에 옮겨 간다. beforeunload 는 뒤로가기·탭 닫기용 마지막 방책으로만 남긴다.
     * (이 가로채기는 '학습지 한 장이 곧 화면 전부'인 여기서만 한다. 도구 화면에서 같은 짓을 하면
     *  캔버스 위의 온갖 링크·단추를 문서 단계에서 가로채게 되어 도구가 이상하게 움직인다.)
     */
    document.addEventListener('click', async (e) => {
      if (!eng.pending()) return;                           // 저장 대기 중일 때만 가로챈다
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) return;
      e.preventDefault();
      await eng.flush();
      location.href = a.href;
    }, true);

    eng.say(rec.updatedAt ? '마지막 저장 ' + new Date(rec.updatedAt).toLocaleString('ko-KR') : '아직 저장 전이에요. 쓰면 자동으로 저장됩니다');
    if (global.Log) Log.push({ stage: course.logStage || 'sense', action: 'view', payload: { sheet: sheet.id, session: sheet.session } });
  }

  /* --------------------- 한 장 쓰기 엔진(그리기 + 자동 저장) ---------------------
   * 학습지 화면과 도구 옆 서랍이 이 하나를 나눠 쓴다. 같은 노트 id, 같은 저장 경로,
   * 같은 진행률이라 어느 쪽에서 쓰든 한 장이다("두 군데에 따로 쓰는" 일이 생기지 않는다).
   * 화면에 붙는 부분(진행 막대·저장 문구)은 부르는 쪽이 콜백으로 받아 자기 자리에 그린다.
   */
  function attachSheet(host, o) {
    const { user, unit, sheet, course, rec, paths } = o;
    rec.answers = rec.answers || {};

    host.setAttribute('data-theme', 'light');   // 꾸러미 CSS 가 OS 다크에 반응하지 않도록(학습 화면은 라이트 고정)
    Worksheet.renderSheet(host, {
      unit, sheet, toc: o.toc || null, answers: rec.answers,
      hideScreens: true,                        // 화면 목록은 COURSE 표에서 '누를 수 있는' 링크로 그린다
      onChange(path, value, all) { rec.answers = all; onEdit(path); }
    });

    let timer = null, saving = false, again = false;
    const say = (t, cls) => { o.say && o.say(t, cls); };

    function paint() {
      const st = statOf(rec.answers, paths);
      o.onStat && o.onStat(st);
      return st;
    }

    async function flush() {
      if (saving) { again = true; return; }
      clearTimeout(timer); timer = null;
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
      clearTimeout(timer); timer = setTimeout(flush, o.delay || 1200);
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

    const bail = () => { if (timer) flush(); };
    const onHide = () => { if (document.hidden) bail(); };
    window.addEventListener('beforeunload', bail);
    document.addEventListener('visibilitychange', onHide);
    const detach = () => {
      bail();
      window.removeEventListener('beforeunload', bail);
      document.removeEventListener('visibilitychange', onHide);
    };

    paint();
    return { flush, bail, detach, paint, say, pending: () => !!timer, rec };
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
    /*
     * 이 차시의 세 활동: 배우기 → 만들기 → 나누기가 한 묶음으로 보인다.
     * 예전에는 학습지 JSON 의 screens 로도 같은 단추를 한 번 더 그려서, 같은 화면이
     * 두 모양으로 두 번 나왔다(교사가 말한 '산발적'의 코드 수준 정체). 표를 COURSE 하나로 줄였다.
     */
    const actLine = (label, list) => (list && list.length)
      ? '<span class="ws-acts-g"><i>' + label + '</i>' +
        list.map(x => '<a href="' + hrefOf(x, sheet.id) + '">' + esc(x.label) + '</a>').join('') + '</span>'
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
      '<div class="ws-bar"><span class="muted" style="font-size:12px" id="ws-count"></span></div>' +
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

  /* ============================ 위치 스트립 ============================
   * 교사의 지적("사이트가 산발적이다")의 본체는 여기였다. 여정 지도는 넷이나 있는데,
   * 정작 학생이 서 있는 18개 화면은 자기가 몇 차시인지, 앞뒤가 무엇인지 한마디도 하지 않았다.
   * 지도로 데려가는 대신, 서 있는 자리에서 말하게 한다.
   *
   *   [3차시 · 1단계 규칙 · 만들기]
   *   앞: 2차시 · 그림이 분해되어 다시 연주되다
   *   다음: 나누기 · 작업 노트 →           [📄 3차시 학습지]
   *
   * 규칙
   *   · 문구를 손으로 적지 않는다. COURSE 표에서 만든다(원본이 하나여야 어긋나지 않는다).
   *   · 로그인 게이트가 없다. 진행률(%)만 로그인한 학생에게 덧붙는다.
   *   · 동기 렌더. 차시 제목은 manifest 가 도착하면 그때 갈아 끼운다(file:// 로 열어도 뜬다).
   *   · 자기 삽입. #spine-strip 이 있으면 거기, 없으면 body 맨 앞. 그래서 독립 셸 화면
   *     (색 군집 스튜디오처럼 site.css 를 쓰지 않는 화면)도 마크업을 한 글자도 안 고치고 붙는다.
   *   · CSS 를 site.css 에 기대지 않고 자기 <style> 을 한 번 주입한다(같은 이유).
   */
  const SLOT = { learn: '배우기', make: '만들기', share: '나누기' };

  function injectStripCSS() {
    if (document.getElementById('spine-strip-css')) return;
    const st = document.createElement('style');
    st.id = 'spine-strip-css';
    st.textContent =
      '.spine-strip{font:400 13px/1.6 Pretendard,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;' +
      'display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:0 0 14px;padding:10px 14px;' +
      'border:1px solid rgba(128,140,170,.28);border-left:3px solid #4c6ef5;border-radius:12px;' +
      'background:rgba(128,150,200,.07);color:inherit}' +
      '.spine-strip.fixed{position:fixed;left:12px;right:12px;bottom:12px;z-index:70;margin:0;' +
      'background:rgba(16,18,28,.92);color:#e8ecf6;backdrop-filter:blur(6px)}' +
      '.spine-strip b{font-weight:800}' +
      '.spine-strip .ss-now{display:inline-flex;gap:7px;align-items:center;font-weight:800}' +
      '.spine-strip .ss-n{background:#4c6ef5;color:#fff;border-radius:999px;padding:1px 9px;font-size:11.5px}' +
      '.spine-strip .ss-slot{border:1px solid rgba(128,140,170,.45);border-radius:999px;padding:1px 9px;font-size:11.5px;font-weight:700}' +
      '.spine-strip .ss-seg{font-size:12px;opacity:.85}' +
      '.spine-strip a{color:#4c6ef5;font-weight:700;text-decoration:none}' +
      '.spine-strip a:hover{text-decoration:underline}' +
      '.spine-strip.fixed a{color:#93a4e8}' +
      '.spine-strip .ss-sheet{margin-left:auto;border:1px solid rgba(128,140,170,.45);border-radius:9px;padding:4px 11px;font-size:12px}' +
      '.spine-strip .ss-pick{display:inline-flex;gap:6px;flex-wrap:wrap}' +
      '.spine-strip .ss-steps{display:inline-flex;gap:5px;align-items:center;flex-wrap:wrap}' +
      '.spine-strip .ss-step{border:1px solid rgba(128,140,170,.4);border-radius:999px;padding:1px 10px;' +
      'font-size:11.5px;font-weight:600;color:inherit;opacity:.75}' +
      '.spine-strip .ss-step:hover{opacity:1;text-decoration:none;border-color:#4c6ef5}' +
      '.spine-strip .ss-step.on{opacity:1;font-weight:800;color:#fff;background:#4c6ef5;border-color:#4c6ef5}' +
      '.spine-strip .ss-arrow{opacity:.4;font-size:11px}' +
      '@media print{.spine-strip{display:none!important}}';
    document.head.appendChild(st);
  }

  const sesName = (id) => id === 'cover' ? '표지' : id.replace('s', '') + '차시';

  /* 이 화면이 그 차시의 어느 자리인가(배우기·만들기·나누기) */
  function slotOf(course, pageName) {
    for (const k of ['learn', 'make', 'share']) {
      if ((course[k] || []).some(x => x.page === pageName)) return k;
    }
    return null;
  }

  /* 이 차시 안에서 이 화면 '다음'에 갈 곳: 같은 자리의 다음 화면 → 다음 자리의 첫 화면 */
  function nextInSession(course, pageName) {
    const order = ['learn', 'make', 'share'];
    const slot = slotOf(course, pageName);
    if (!slot) return null;
    const here = (course[slot] || []).findIndex(x => x.page === pageName);
    const rest = (course[slot] || []).slice(here + 1);
    if (rest.length) return { slot, item: rest[0] };
    for (const k of order.slice(order.indexOf(slot) + 1)) {
      if ((course[k] || []).length) return { slot: k, item: course[k][0] };
    }
    return null;
  }

  /*
   * 여러 차시가 함께 쓰는 화면(데이터 점 스튜디오·갤러리·리터러시·작업노트·포트폴리오)은
   * '지금 몇 차시인가'를 추측하지 않는다. 추측이 틀리면 두 번 클릭보다 나쁘다.
   *   1순위 주소의 ?s=sN   2순위 후보가 하나뿐   3순위 학생에게 고르게 한다
   */
  function resolveSession(list) {
    const want = new URLSearchParams(location.search).get('s');
    if (want) { const hit = list.find(c => c.sheet === want); if (hit) return hit; }
    if (list.length === 1) return list[0];
    return null;
  }

  function mountContext(opts) {
    opts = opts || {};
    const list = forPage();
    if (!list.length || document.getElementById('spine-strip-el')) return;
    injectStripCSS();

    const host = document.createElement('div');
    host.id = 'spine-strip-el';
    host.className = 'spine-strip' + (opts.fixed ? ' fixed' : '');
    const slot = document.getElementById(opts.el || 'spine-strip');
    if (slot) slot.replaceWith(host);
    else document.body.insertBefore(host, document.body.firstChild);

    const me = page();
    const course = resolveSession(list);

    if (!course) {
      // 어느 차시인지 모른다: 고르게 한다(틀린 확신보다 한 번 더 묻는 편이 낫다)
      host.innerHTML = '<span class="ss-now"><span class="ss-n">여러 차시</span></span>' +
        '<span class="ss-seg">이 화면은 ' + list.map(c => sesName(c.sheet)).join('·') +
        '가 함께 써요. 오늘 차시를 골라 주세요.</span>' +
        '<span class="ss-pick">' + list.map(c =>
          '<a href="' + me + '?s=' + c.sheet + '">' + sesName(c.sheet) + '</a>').join('') + '</span>';
      /*
       * 고르는 순간 화면을 새로 읽지 않는다. 이 화면(데이터 점 스튜디오)은 여러 차시가
       * 함께 쓰는 자리이고, 학생은 이미 CSV 를 올리고 매핑을 만들어 두었을 수 있다.
       * 차시를 고르려고 그것을 잃게 하면, 학습지 단추에서 없앤 문제를 여기로 옮겨 놓는 꼴이다.
       * (서랍이 없는 화면이라면 href 가 그대로 살아 있어 예전처럼 주소로 이동한다.)
       */
      host.querySelectorAll('.ss-pick a').forEach((a, i) => a.addEventListener('click', (e) => {
        if (!dock) return;
        e.preventDefault();
        pickSession(list[i].sheet);
      }));
      return;
    }
    paintContext(host, course, me);
  }

  function paintContext(host, course, me) {
    const k = slotOf(course, me);
    const nx = nextInSession(course, me);
    const i = indexOf(course.sheet);
    const prev = i > 1 ? COURSE[i - 1] : null;      // 표지(0번)는 앞 차시로 치지 않는다

    /* 이 차시의 세 걸음을 통째로 보여 준다. 학생이 지금 어디이고 다음이 무엇인지
       한 줄로 읽힌다("다음: …" 한 마디만으로는 전체 길이 안 보였다). */
    const steps = ['learn', 'make', 'share'].map(s => {
      const items = course[s] || [];
      if (!items.length) return '';
      const here = s === k;
      const x = (here && items.find(y => y.page === me)) || items[0];
      return '<a class="ss-step' + (here ? ' on' : '') + '" href="' + hrefOf(x, course.sheet) + '"' +
        ' title="' + esc(x.label) + '">' + SLOT[s] + (here ? ' · 지금' : '') + '</a>';
    }).join('<span class="ss-arrow" aria-hidden="true">→</span>');

    host.innerHTML =
      '<span class="ss-now"><span class="ss-n">' + sesName(course.sheet) + '</span>' +
        esc(course.badge) + '</span>' +
      (prev ? '<span class="ss-seg">앞: <a href="worksheet.html?s=' + prev.sheet + '">' +
        sesName(prev.sheet) + '</a></span>' : '') +
      '<span class="ss-steps">' + steps + '</span>' +
      (nx ? '<span class="ss-seg">다음 <a href="' + hrefOf(nx.item, course.sheet) + '">' +
        esc(nx.item.label) + ' →</a></span>' : '') +
      '<a class="ss-sheet" id="ss-sheet" href="worksheet.html?s=' + course.sheet + '">📄 ' +
        sesName(course.sheet) + ' 학습지 여기서 쓰기<span id="ss-pct"></span></a>';

    /* 학습지 단추는 화면을 떠나지 않는다: 이 자리에서 서랍으로 펼친다.
       (서랍이 없는 화면이라면 href 가 그대로 살아 있어 예전처럼 학습지 화면으로 간다.) */
    const sheetBtn = host.querySelector('#ss-sheet');
    if (sheetBtn) sheetBtn.addEventListener('click', (e) => {
      if (!dock) return;
      e.preventDefault();
      openDock(course.sheet);
    });

    // 진행률은 로그인한 학생에게만, 이 기기의 요약에서(저장소를 다시 읽지 않는다)
    try {
      const u = Auth.current();
      if (u) {
        const pct = (readProgress(u)[course.sheet] || {}).pct || 0;
        if (pct) document.getElementById('ss-pct').textContent = ' · ' + pct + '%';
      }
    } catch (e) { /* 진행률은 덤이다. 없어도 위치는 보인다 */ }

    // 차시 제목은 색인에 있다. 도착하면 배지 옆에 덧붙인다(없어도 스트립은 이미 서 있다).
    loadManifest().then(ix => {
      const meta = (ix.sheets || []).find(s => s.id === course.sheet);
      if (!meta || !meta.title) return;
      const seg = document.createElement('span');
      seg.className = 'ss-seg';
      seg.innerHTML = '<b>「' + esc(meta.title) + '」</b>';
      host.querySelector('.ss-now').insertAdjacentElement('afterend', seg);
    }).catch(() => { /* file:// 로 연 경우: 제목만 없고 나머지는 그대로 뜬다 */ });
  }

  /* ========================= 도구 옆에 붙는 학습지 서랍 =========================
   * 교사의 다음 지적("학습지랑 만드는 사이트를 왔다갔다 해야 해서 불편하다")의 본체는
   * 학습지가 '다른 화면'이라는 데 있었다. 예전 단추는 worksheet.html 로 데려갔고,
   * 그 순간 만들던 것(불러온 그림·녹음·매핑 설정)은 화면과 함께 사라졌다. 그래서 학생은
   * 도구에서 한참 만들다가 마지막에 몰아서 쓰거나, 아예 쓰지 않았다.
   *
   * 이제 학습지가 도구 쪽으로 온다. 같은 화면 오른쪽에서 열리고, 만들던 것은 그대로 있다.
   *
   * 지키는 것
   *   · 한 장이다. worksheet.html 과 같은 노트 id·같은 저장 경로·같은 진행률을 쓴다
   *     (attachSheet 하나를 나눠 쓴다). 어디서 쓰든 선생님 화면에는 한 줄로 모인다.
   *   · 도구를 건드리지 않는다. 문서 단계에서 클릭을 가로채지 않고, 무거운 것(렌더러·꾸러미
   *     CSS·학습지 JSON)은 학생이 실제로 열 때 받아 온다. 자기 마크업·자기 CSS 라서
   *     site.css 를 쓰지 않는 색 군집 스튜디오에도 한 글자 안 고치고 붙는다.
   *   · 차시를 넘겨짚지 않는다. 여러 차시가 함께 쓰는 화면(데이터 점 스튜디오·갤러리)에서는
   *     쓰기 전에 물어본다. 이건 링크가 아니라 '쓰는' 자리여서, 넘겨짚으면 답이 남의 차시
   *     칸에 저장된다.
   *   · 열어 둔 채로 화면을 옮기면 다음 화면에서도 열려 있다. 왔다갔다가 사라지는 지점.
   */
  const K_DOCK = 'dn_ws_dock';
  let rendererP = null, paperCssP = null, dock = null;

  function loadRenderer() {
    if (global.Worksheet) return Promise.resolve();
    if (!rendererP) rendererP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = BASE + '/render/worksheet.js';
      s.onload = res;
      s.onerror = () => { rendererP = null; rej(new Error('학습지 렌더러를 불러오지 못했어요')); };
      document.head.appendChild(s);
    });
    return rendererP;
  }

  /* 꾸러미 CSS 는 <link> 로 붙이지 않는다. 그 파일 끝의 @page 규칙은 문서 전체의 인쇄 여백을
     바꾸는데, 서랍을 한 번 열었다는 이유로 그 화면의 인쇄(포트폴리오 A4 등)가 달라지면 안 된다. */
  function loadPaperCSS() {
    if (paperCssP) return paperCssP;
    if (document.getElementById('ws-paper-css')) return (paperCssP = Promise.resolve());
    paperCssP = fetch(BASE + '/render/worksheet.css', { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('css ' + r.status); return r.text(); })
      .then(css => {
        const st = document.createElement('style');
        st.id = 'ws-paper-css';
        st.textContent = css.replace(/@page\s*\{[^}]*\}/g, '');
        document.head.appendChild(st);
      })
      .catch(e => { paperCssP = null; throw e; });
    return paperCssP;
  }

  function injectDockCSS() {
    if (document.getElementById('ws-dock-css')) return;
    const st = document.createElement('style');
    st.id = 'ws-dock-css';
    st.textContent =
      '.wsdock-tab,.wsdock{font:400 13px/1.55 Pretendard,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;' +
      'box-sizing:border-box}.wsdock *,.wsdock-tab *{box-sizing:border-box}' +
      /* 층 순서: 서랍(78) 은 위치 스트립(70)·헤더 위, 모달(.modal-bg 80 · 색 스튜디오 210 ·
         교사 잠금 120)과 토스트(90) 아래다. 모달은 "지금 이것만 보라"는 요구라 서랍보다 위여야 한다. */
      '.wsdock-tab{position:fixed;right:16px;bottom:16px;z-index:74;display:flex;gap:9px;align-items:center;' +
      'padding:9px 14px 9px 11px;border-radius:14px;border:1px solid #cdd6e4;background:#fff;color:#17202e;' +
      'box-shadow:0 8px 24px rgba(10,14,24,.22);cursor:pointer;text-align:left;text-decoration:none}' +
      '.wsdock-tab:hover{border-color:#2f6be0;transform:translateY(-1px)}' +
      '.wsdock-tab .ic{font-size:17px}.wsdock-tab b{display:block;font-size:12.5px;font-weight:800}' +
      '.wsdock-tab small{display:block;font-size:10.5px;color:#5a6678}' +
      '.wsdock-tab[data-open="1"]{display:none}' +
      '.wsdock-bd{position:fixed;inset:0;z-index:76;background:rgba(6,8,16,.45);border:0;display:none}' +
      '.wsdock-bd.on{display:block}' +
      '.wsdock{position:fixed;top:0;right:0;bottom:0;width:min(580px,100vw);z-index:78;display:flex;' +
      'flex-direction:column;background:#fff;color:#17202e;color-scheme:light;border-left:1px solid #d7dee8;' +
      'box-shadow:-18px 0 46px rgba(10,14,24,.3);visibility:hidden;transform:translateX(103%);' +
      'transition:transform .22s ease,visibility 0s linear .22s}' +
      '.wsdock.on{visibility:visible;transform:none;transition:transform .22s ease}' +
      '.wsdock-hd{padding:11px 14px 9px;border-bottom:1px solid #e3e9f1;background:#f7f9fc}' +
      '.wsdock-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
      '.wsdock-ses{background:#2f6be0;color:#fff;border-radius:999px;padding:2px 10px;font-size:11.5px;font-weight:800}' +
      '.wsdock-title{font-weight:800;font-size:14px}' +
      '.wsdock-hd .sp{margin-left:auto;display:flex;gap:6px}' +
      '.wsdock-ic{border:1px solid #cdd6e4;background:#fff;color:#3b475c;border-radius:9px;padding:3px 9px;' +
      'font-size:12px;cursor:pointer;text-decoration:none;line-height:1.5}' +
      '.wsdock-ic:hover{border-color:#2f6be0;color:#2f6be0}' +
      '.wsdock-steps{display:flex;gap:6px;flex-wrap:wrap;margin:9px 0 0}' +
      '.wsdock-step{display:inline-flex;gap:5px;align-items:baseline;border:1px solid #d7dee8;border-radius:999px;' +
      'padding:3px 10px;font-size:11.5px;color:#3b475c;text-decoration:none;background:#fff}' +
      '.wsdock-step i{font-style:normal;font-weight:800;color:#8a94a6;font-size:10.5px}' +
      '.wsdock-step:hover{border-color:#2f6be0;color:#2f6be0}' +
      '.wsdock-step.on{background:#eaf0fd;border-color:#2f6be0;color:#1c47a6;font-weight:800}' +
      '.wsdock-step.on i{color:#2f6be0}' +
      '.wsdock-meter{height:5px;border-radius:999px;background:#e3e9f1;overflow:hidden;margin:10px 0 5px}' +
      '.wsdock-meter i{display:block;height:100%;width:0;background:#2f6be0;transition:width .2s}' +
      '.wsdock-say{display:flex;gap:10px;align-items:baseline;font-size:11.5px;color:#5a6678}' +
      '.wsdock-say .ok{color:#1c7a4a}.wsdock-say .bad{color:#c0392b}.wsdock-say .cnt{margin-left:auto}' +
      '.wsdock-body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;background:#fff}' +
      '.wsdock-msg{padding:22px 18px;font-size:13px;color:#3b475c}' +
      '.wsdock-msg a{color:#2f6be0;font-weight:700}' +
      '.wsdock-pick{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}' +
      '.wsdock-pick button{border:1px solid #cdd6e4;background:#fff;border-radius:10px;padding:7px 13px;' +
      'font-size:13px;font-weight:700;color:#17202e;cursor:pointer}' +
      '.wsdock-pick button:hover{border-color:#2f6be0;color:#2f6be0}' +
      '.wsdock-ft{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:9px 14px;' +
      'border-top:1px solid #e3e9f1;background:#f7f9fc;font-size:12px}' +
      '.wsdock-ft a{color:#2f6be0;font-weight:700;text-decoration:none}' +
      '.wsdock-ft a:hover{text-decoration:underline}.wsdock-ft .go{margin-left:auto}' +
      /* 종이는 언제나 흰 종이다: 어두운 도구 화면의 테마 변수가 흘러들지 않게 여기서 못 박는다 */
      '.wsdock .wsdock-paper .ws{--ws-fg:#17202e;--ws-bg:#fff;--ws-line:#c5cfdd;--ws-band:#f1f4f9;' +
      '--ws-muted:#5a6678;--ws-ink:#2f6be0;max-width:none;margin:0;padding:14px 16px 44px}' +
      '.wsdock .wsdock-paper .ws-in{border-bottom:1px solid #dbe2ec}' +
      '.wsdock .wsdock-paper .ws-in:focus{border-bottom-color:transparent}' +
      '@media (max-width:640px){.wsdock{width:100vw}.wsdock-tab{right:10px;bottom:10px}}' +
      '@media print{.wsdock,.wsdock-tab,.wsdock-bd{display:none!important}}';
    document.head.appendChild(st);
  }

  function mountDock() {
    const list = forPage();
    if (!list.length || document.getElementById('ws-dock')) return;
    injectDockCSS();

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'wsdock-tab';
    tab.id = 'ws-dock-tab';
    tab.setAttribute('aria-controls', 'ws-dock');
    tab.setAttribute('aria-expanded', 'false');

    const bd = document.createElement('div');
    bd.className = 'wsdock-bd';
    bd.id = 'ws-dock-bd';

    const panel = document.createElement('aside');
    panel.className = 'wsdock';
    panel.id = 'ws-dock';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '학습지');
    panel.innerHTML =
      '<div class="wsdock-hd">' +
        '<div class="wsdock-top">' +
          '<span class="wsdock-ses" id="wsd-ses"></span>' +
          '<span class="wsdock-title" id="wsd-title">학습지</span>' +
          '<span class="sp">' +
            '<button type="button" class="wsdock-ic" id="wsd-switch" hidden>차시 바꾸기</button>' +
            '<a class="wsdock-ic" id="wsd-full" href="worksheet.html" title="전체 화면으로 보기 · 인쇄">전체·인쇄 ↗</a>' +
            '<button type="button" class="wsdock-ic" id="wsd-close" aria-label="학습지 접기">✕</button>' +
          '</span>' +
        '</div>' +
        '<div class="wsdock-steps" id="wsd-steps"></div>' +
        '<div class="wsdock-meter"><i id="wsd-bar"></i></div>' +
        '<div class="wsdock-say"><span id="wsd-say"></span><span class="cnt" id="wsd-cnt"></span></div>' +
      '</div>' +
      '<div class="wsdock-body"><div class="wsdock-paper" id="wsd-paper">' +
        '<div class="wsdock-msg">학습지를 여는 중…</div></div></div>' +
      '<div class="wsdock-ft" id="wsd-ft"></div>';

    document.body.appendChild(tab);
    document.body.appendChild(bd);
    document.body.appendChild(panel);

    dock = { tab, bd, panel, list, eng: null, sheetId: null, open: false, loading: false };
    paintTab();

    tab.addEventListener('click', () => openDock());
    panel.querySelector('#wsd-close').addEventListener('click', () => closeDock());
    bd.addEventListener('click', () => closeDock());
    panel.querySelector('#wsd-switch').addEventListener('click', () => askSession());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dock.open) closeDock();
    });

    /*
     * 서랍 안의 링크(다음 활동·앞 차시·전체 화면)로 나갈 때는 쓰던 것을 먼저 저장하고 옮긴다.
     * 학습지 화면과 달리 여기서는 문서 전체가 아니라 이 서랍 안만 가로챈다.
     * 도구의 캔버스·단추는 이 handler 를 스치지도 않는다.
     */
    panel.addEventListener('click', async (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || !dock.eng || !dock.eng.pending()) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) return;
      e.preventDefault();
      await dock.eng.flush();
      location.href = a.href;
    });

    /* 열어 둔 채로 화면을 옮겼다면 다음 화면에서도 열어 준다.
       좁은 화면에서는 서랍이 도구를 통째로 덮으므로 학생이 직접 열게 둔다. */
    try {
      if (localStorage.getItem(K_DOCK) === '1' && window.innerWidth >= 900) setTimeout(() => openDock(), 60);
    } catch (e) { /* 저장소를 못 읽어도 단추는 있다 */ }
  }

  function paintTab() {
    const user = (global.Auth && Auth.current && Auth.current()) || null;
    const c = resolveSession(dock.list);
    const pct = (user && c) ? ((readProgress(user)[c.sheet] || {}).pct || 0) : 0;
    const name = c ? sesName(c.sheet) + ' 학습지' : '오늘 학습지';
    const sub = !user ? '로그인하면 여기서 바로 써요'
      : !c ? '차시를 고르고 여기서 바로 쓰기'
      : pct ? pct + '% 채움 · 이어서 쓰기'
      : '이 화면 옆에서 바로 쓰기';
    dock.tab.innerHTML = '<span class="ic" aria-hidden="true">📄</span><span class="tx"><b>' +
      esc(name) + '</b><small>' + esc(sub) + '</small></span>';
    dock.tab.setAttribute('aria-label', name + ' 열기 · ' + sub);
  }

  function showDock(on) {
    dock.open = on;
    dock.tab.setAttribute('data-open', on ? '1' : '0');
    dock.tab.setAttribute('aria-expanded', on ? 'true' : 'false');
    // 좁은 화면에서만 뒷막: 넓은 화면에서는 서랍을 연 채로 도구를 계속 쓴다
    dock.bd.classList.toggle('on', on && window.innerWidth < 900);
    dock.panel.classList.toggle('on', on);
    try { localStorage.setItem(K_DOCK, on ? '1' : '0'); } catch (e) { /* 기억은 덤이다 */ }
  }

  function closeDock() {
    if (dock.eng && dock.eng.pending()) dock.eng.flush();
    showDock(false);
    paintTab();
  }

  const msg = (html) => { document.getElementById('wsd-paper').innerHTML = '<div class="wsdock-msg">' + html + '</div>'; };

  /* 어느 차시로 쓸지 물어본다. 고르면 주소에 ?s= 를 새겨서 이 화면의 다른 부분
     (위치 스트립·보내기 단추·기록 꼬리표)도 같은 차시를 말하게 한다. */
  function askSession() {
    showDock(true);
    document.getElementById('wsd-ses').textContent = '차시';
    document.getElementById('wsd-title').textContent = '오늘은 몇 차시인가요?';
    document.getElementById('wsd-steps').innerHTML = '';
    document.getElementById('wsd-ft').innerHTML = '';
    msg('이 화면은 <b>' + dock.list.map(c => sesName(c.sheet)).join(' · ') +
      '</b>가 함께 써요. 쓴 답이 그 차시 학습지에 저장되니, 오늘 차시를 골라 주세요.' +
      '<div class="wsdock-pick">' + dock.list.map(c =>
        '<button type="button" data-s="' + c.sheet + '">' + sesName(c.sheet) + ' · ' + esc(c.badge) + '</button>').join('') +
      '</div>');
    document.getElementById('wsd-paper').querySelectorAll('button[data-s]').forEach(b => {
      b.addEventListener('click', () => pickSession(b.getAttribute('data-s'), true));
    });
  }

  /* 오늘 차시를 정한다: 화면을 새로 읽지 않고 주소에만 새긴다.
     ?s= 를 심어 두면 위치 스트립·보내기 단추(goTo)·기록 꼬리표(stampOf)가 모두 같은 차시를 말한다. */
  function pickSession(sheetId, open) {
    try {
      const u = new URL(location.href);
      u.searchParams.set('s', sheetId);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* 주소를 못 고쳐도 아래에서 차시를 직접 넘긴다 */ }
    const strip = document.getElementById('spine-strip-el');
    if (strip) paintContext(strip, entryOf(sheetId), page());
    paintTab();
    if (open) openDock(sheetId);
  }

  async function openDock(forceSheet) {
    showDock(true);
    const user = (global.Auth && Auth.current && Auth.current()) || null;
    if (!user) {
      document.getElementById('wsd-title').textContent = '학습지';
      msg('학습지는 <b>내 계정에 자동 저장</b>돼요. 먼저 로그인하면 이 화면 옆에서 바로 쓸 수 있어요.<br>' +
        '<a href="index.html?next=' + encodeURIComponent(page() + location.search) + '">로그인하러 가기 →</a>');
      return;
    }

    const c = (forceSheet && entryOf(forceSheet)) || resolveSession(dock.list);
    if (!c) return askSession();
    /*
     * 두 번 펼치지 않는다. 저절로 열리는 타이머와 학생의 탭 클릭이 겹칠 수 있는데,
     * 그때 아래를 두 번 지나면 엔진이 둘 붙고, 아직 저장된 적 없는 학습지라면 같은 id 를
     * 가진 rec 두 개가 서로를 덮어쓴다. 그래서 '펼치는 중'도 이미 그 차시로 친다.
     */
    if (dock.sheetId === c.sheet && (dock.eng || dock.loading)) return;
    if (dock.eng) { dock.eng.detach(); dock.eng = null; }  // 차시를 바꾼다: 앞 장을 저장하고 손을 뗀다

    dock.sheetId = c.sheet;
    dock.loading = true;
    paintDockHead(c);
    msg('학습지를 여는 중…');

    try {
      const [, , ix, unit, sheet, notes] =
        await Promise.all([loadRenderer(), loadPaperCSS(), loadManifest(), loadUnit(), loadSheet(c.sheet), myNotes(user)]);

      // 통째로 한 번 읽은 김에 진행률 요약도 맞춰 둔다(스트립·허브가 이것만 본다)
      writeProgress(user, statsFromNotes(ix, notes));

      const meta = (ix.sheets || []).find(s => s.id === c.sheet) || {};
      const host = document.createElement('div');
      const paper = document.getElementById('wsd-paper');
      paper.innerHTML = '';
      paper.appendChild(host);

      const barEl = document.getElementById('wsd-bar');
      const cntEl = document.getElementById('wsd-cnt');
      const sayEl = document.getElementById('wsd-say');
      const rec = notes[c.sheet] || blankNote(user, sheet);

      dock.eng = attachSheet(host, {
        user, unit, sheet, course: c, rec, toc: ix.toc,
        paths: (ix.fieldIndex || []).filter(f => f.sheet === c.sheet).map(f => f.path),
        /* 도구 화면에서는 문서 전체의 클릭을 가로채지 않는다(도구를 건드리지 않으려고).
           대신 넘기는 간격을 줄여, 내비·스트립 링크로 훌쩍 나가도 잃는 입력이 적게 한다. */
        delay: 500,
        onStat(st) {
          barEl.style.width = st.pct + '%';
          cntEl.textContent = st.filled + ' / ' + st.total + '칸 (' + st.pct + '%)';
          const t = dock.tab.querySelector('small');
          if (t) t.textContent = st.pct + '% 채움 · 이어서 쓰기';
        },
        say(t, cls) { sayEl.textContent = t; sayEl.className = cls || ''; }
      });
      dock.eng.say(rec.updatedAt
        ? '마지막 저장 ' + new Date(rec.updatedAt).toLocaleString('ko-KR')
        : '쓰면 자동으로 저장돼요');
      paintDockHead(c, meta.title);
      dock.loading = false;
      if (global.Log) Log.push({ stage: c.logStage || 'sense', action: 'view', payload: { sheet: c.sheet, session: meta.session } });
    } catch (e) {
      dock.sheetId = null;
      dock.loading = false;
      console.warn('[worksheet] 서랍 열기 실패', e);
      msg('<b>학습지를 불러오지 못했어요.</b> 파일을 직접 열면(<code>file://</code>) 브라우저가 JSON 을 막습니다. ' +
        '학교 주소(https://…)로 열거나, <a href="worksheet.html?s=' + c.sheet + '">학습지 화면</a>에서 써 주세요. ' +
        '<span style="opacity:.7">(' + esc(e.message) + ')</span>');
    }
  }

  /* 서랍 머리말: 이 차시의 배우기 → 만들기 → 나누기를 전부 보여 주고 지금 자리를 켠다.
     "뭘 누르고 뭘 해야 할지 모르겠다"에 대한 답이 여기 있다: 오늘 할 일 세 개가 종이 위에 있다. */
  function paintDockHead(c, title) {
    const me = page();
    document.getElementById('wsd-ses').textContent = sesName(c.sheet);
    document.getElementById('wsd-title').textContent = title || c.badge || '';
    document.getElementById('wsd-full').setAttribute('href', 'worksheet.html?s=' + c.sheet);
    document.getElementById('wsd-switch').hidden = dock.list.length < 2;

    document.getElementById('wsd-steps').innerHTML = ['learn', 'make', 'share'].map(k => {
      const items = c[k] || [];
      if (!items.length) return '';
      const here = items.find(x => x.page === me);
      const x = here || items[0];
      return '<a class="wsdock-step' + (here ? ' on' : '') + '" href="' + hrefOf(x, c.sheet) + '">' +
        '<i>' + SLOT[k] + '</i>' + esc(x.label) + (here ? ' · 지금' : '') + '</a>';
    }).join('');

    const nx = nextInSession(c, me);
    const i = indexOf(c.sheet);
    const prev = i > 1 ? COURSE[i - 1] : null;
    document.getElementById('wsd-ft').innerHTML =
      (prev ? '<a href="worksheet.html?s=' + prev.sheet + '">← ' + sesName(prev.sheet) + ' 학습지</a>' : '') +
      (nx ? '<a class="go" href="' + hrefOf(nx.item, c.sheet) + '">다 썼으면 다음: ' +
        SLOT[nx.slot] + ' · ' + esc(nx.item.label) + ' →</a>' : '');
  }

  /* --------------------- 통합 여정: 차시마다 배우기·만들기·나누기·학습지 한 묶음 --------------------- */
  /*
   * 허브와 여정 지도가 같은 화면을 그린다(지도가 두 장이 되지 않게).
   * 한 줄 = 한 차시. 그 차시가 되풀이해 묻는 질문 아래에 배우기 → 만들기 → 나누기 화면과
   * 학습지 단추·진행 상태가 함께 놓인다. 목표에서 시작해 짠 '학습 계획'을 학생 말로 그린 것.
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

    // 링크마다 ?s= 를 실어 보낸다. 공용 화면이 '지금 몇 차시인가'를 추측하지 않게 하는 장치.
    const actHTML = (label, list, sheetId) => (list && list.length)
      ? '<div class="jr-act"><i>' + label + '</i><span>' +
        list.map(x => '<a href="' + hrefOf(x, sheetId) + '">' + esc(x.label) + '</a>').join('') + '</span></div>'
      : '<div class="jr-act off"><i>' + label + '</i><span class="muted">화면 속 ⓘ 설명으로</span></div>';

    /*
     * 한 줄의 주 단추가 어디를 가리키는가는 화면마다 다르다.
     *   허브: '오늘 할 일' 자리다. 학습지만 따로 여는 단추를 주면, 바로 위의 「시작하기」와
     *         서로 다른 곳을 가리켜 학생이 또 헤맨다. 그 차시의 첫 활동으로 보내고
     *         학습지는 그 화면에서 옆에 펼쳐지게 한다(start:true).
     *   여정 지도: 읽고 계획하는 화면이다. 학습지 전체를 여는 편이 맞다.
     */
    const start = !!opts.start;
    el.innerHTML =
      '<div class="dn-cluster-head"><div><span class="eyebrow">Plan</span><h3>' +
      (opts.title || '한 차시가 한 묶음: 배우기 → 만들기 → 나누기') + '</h3>' +
      '<p>매 차시 <b>학습지 한 장</b>이 함께 가고, 쓴 내용은 자동 저장되어 ' +
      '선생님 화면과 내 포트폴리오로 이어집니다.' + (user ? '' : ' 로그인하면 진행률이 표시돼요.') + '</p></div>' +
      '<a class="more" href="worksheet.html">학습지 전체 보기 →</a></div>' +
      '<div class="jr">' + rows.map(r => {
        const c = r.course, m = metaOf(c.sheet);
        const q = (m.eq || []).map(id => eqText[id]).filter(Boolean)[0] || '';
        const isNext = plan.next && plan.next.course.sheet === c.sheet;
        const first = c.learn[0] || c.make[0] || c.share[0];
        const go = (start && first)
          ? '<a class="btn sm" href="' + hrefOf(first, c.sheet) + '" data-open-sheet="1">' +
            r.session + '차시 시작하기 →</a>'
          : '<a class="btn sm" href="worksheet.html?s=' + c.sheet + '">📄 학습지 쓰기</a>';
        return '<div class="jr-row ' + r.state + (isNext ? ' now' : '') + '">' +
          '<div class="jr-n"><b>' + r.session + '차시</b><span class="jr-stage">' + esc(c.badge) + '</span>' +
            '<span class="jr-state ' + r.state + '">' + MARK[r.state] + (r.stat.pct ? ' · ' + r.stat.pct + '%' : '') + '</span></div>' +
          '<div class="jr-main">' +
            '<b class="jr-title">' + esc(r.title) + '</b>' +
            (q ? '<p class="jr-q">' + esc(q) + '</p>' : '') +
            '<div class="jr-acts">' + actHTML('배우기', c.learn, c.sheet) + actHTML('만들기', c.make, c.sheet) +
              actHTML('나누기', c.share, c.sheet) + '</div>' +
            '<div class="jr-foot">' + go +
              (r.yield ? '<span class="jr-yield">결과물 · ' + esc(r.yield) + '</span>' : '') + '</div>' +
          '</div></div>';
      }).join('') + '</div>' +
      '<p class="muted" style="font-size:12px;margin:10px 0 0"><b>' +
      (plan.next.session ? plan.next.session + '차시 「' + esc(plan.next.title) + '」' : '표지') + '</b> 차례입니다 · ' +
      '완료 ' + plan.doneCnt + ' / ' + rows.length + '장 · 결석했더라도 잠금은 안내일 뿐, 어느 차시든 열 수 있어요.</p>';

    // 「시작하기」로 나가면 도착한 화면에서 학습지가 옆에 펼쳐진 채로 시작한다
    el.querySelectorAll('[data-open-sheet]').forEach(a => a.addEventListener('click', () => {
      try { localStorage.setItem(K_DOCK, '1'); } catch (e) { /* 안 열려도 📄 단추는 있다 */ }
    }));
  }

  /*
   * 화면 안의 '보내기' 단추가 다음 화면으로 갈 때 지금 차시를 함께 싣는다.
   * -----------------------------------------------------------------------------
   * 이것이 없으면 수업에서 제일 많이 지나는 길이 끊긴다. 4차시 학생이 소리를 녹음하고
   * '데이터 점 스튜디오로 보내기'를 누르면 맨 주소로 떨어지고, 그 화면은 3·4·5·6차시가
   * 함께 쓰므로 방금 4차시에서 온 학생에게 "몇 차시인지 골라 주세요"라고 되묻게 된다.
   * 보내는 화면은 자기 차시를 알고 있으니, 그것을 주소에 실어 보낸다.
   */
  function goTo(targetPage, ms) {
    const c = resolveSession(forPage());
    const url = targetPage + (c && c.sheet !== 'cover' ? '?s=' + c.sheet : '');
    if (ms) setTimeout(() => { location.href = url; }, ms);
    else location.href = url;
  }

  /* 이 차시가 남기는 기록을 저장할 때 붙일 꼬리표.
     이게 없으면 비평·프로젝트·리터러시에 남긴 기록이 어느 차시 것인지 알 수 없어
     교사 화면의 차시별 진행에 한 칸도 들어가지 않는다. */
  function stampOf(pageName) {
    // 어느 차시인지 확실할 때만 붙인다. 틀린 차시로 귀속되는 것은 귀속이 없는 것보다 나쁘다.
    const c = resolveSession(forPage(pageName));
    if (!c || c.sheet === 'cover') return {};
    return { unit: UNIT, sheet: c.sheet, session: +c.sheet.replace('s', '') || null, procStage: c.logStage };
  }

  global.WS = {
    BASE, UNIT, UNIT_ID: UNIT, COURSE, STAGE_NAME, SLOT, DONE_PCT, OPEN_PCT,
    load, loadSheet, loadManifest, loadUnit, entryOf, indexOf, forPage, hrefOf, slotOf, resolveSession, stampOf, goTo,
    noteIdOf, blankNote, myNotes, attachSheet,
    statOf, statsFromNotes, readProgress, planOf, mountPage, mountContext, mountDock,
    openDock, closeDock,
    // mountLauncher 는 옛 이름이다. 18개 화면이 이 이름으로 부르고 있어 그대로 살려 둔다
    // (이제 학습지 화면으로 '데려가는' 단추가 아니라 그 자리에서 펼치는 서랍이다).
    mountLauncher: mountDock,
    mountJourney, mountHub: mountJourney    // mountHub 는 옛 이름: 같은 통합 여정을 그린다
  };
})(window);
