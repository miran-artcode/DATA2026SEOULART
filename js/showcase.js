/*
 * showcase.js: 우수 사례 학급(가상)을 저장소에 실어 두는 층
 * -----------------------------------------------------------------------------
 * 왜 필요한가
 *   저장소가 비어 있으면 갤러리도 키오스크도 교사 대시보드도 빈 화면이다. 처음 열어 보는
 *   사람에게는 "기능이 없는 사이트"와 구분되지 않는다. 그래서 여덟 명이 8차시를 마친
 *   가상 기록 한 벌(data/showcase-class.json)을 처음 한 번 저장소에 싣는다.
 *
 * 어떻게 끼어드는가
 *   페이지마다 코드를 고치지 않는다. Store 의 '읽기' 메서드를 감싸서, 처음 읽을 때
 *   한 번만 적재를 기다리게 한다. 그래서 어느 화면에서 무엇을 조회하든 순서가 어긋나지
 *   않는다(갤러리가 목록을 먼저 그려 놓고 데이터가 나중에 오는 사고가 없다).
 *
 * 언제 싣지 않는가 — 남의 수업을 망치지 않기 위한 다섯 가지 잠금
 *   ① 이미 실은 뒤     : 표시를 남겨 두 번 싣지 않는다.
 *   ② 교사가 지운 뒤   : '지우기'는 꺼짐으로 표시하고, 그 뒤로는 다시 싣지 않는다.
 *   ③ 클라우드 공유 중 : 학급이 한 저장소를 함께 쓰는 중이면 손대지 않는다
 *                        (가져오기는 이 기기에만 쓰이므로 학급 화면과 어긋나기도 한다).
 *   ④ 학생 기록이 있을 때 : 자동 적재의 이유는 '빈 화면'을 막는 것뿐이다. 이미 채워진 저장소는
 *                        막을 빈 화면이 없다. 그런데 이 자료는 1MB가 넘어, 밀어 넣으면 브라우저
 *                        용량 한계에 닿고 js/store.js 의 안전판이 자리를 만들려고 학생의 학습
 *                        로그를 절반 버린다. 얻을 것이 없는 자리에서 남의 기록을 지울 수는 없다.
 *   ⑤ 앞서 실패한 뒤   : 시도했다는 표시를 먼저 남긴다. 표시가 없으면 실패가 화면을 열 때마다
 *                        되풀이되고, 그때마다 용량 정리가 한 번씩 더 일어난다. 두 번까지만 한다.
 *
 * 실은 기록에는 전부 demo 표시가 붙어 있어, 교사 대시보드에서 한 번에 걷어 낼 수 있다.
 * 실제 학생 기록과 섞이지 않는다.
 */
(function (global) {
  'use strict';

  const URL_ = 'data/showcase-class.json';
  const K = 'dn_showcase';                     // { mode:'on'|'off', at, counts, version }
  // 지우기가 만지는 저장소 키. ⚠ js/store.js 의 상수와 같아야 한다(그쪽을 바꾸면 여기도).
  const KEYS = ['dn_works', 'dn_feedback', 'dn_notes', 'dn_quizzes', 'dn_quizans', 'dn_logs', 'dn_versions'];

  const read = () => { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) { return {}; } };
  const write = (v) => { try { localStorage.setItem(K, JSON.stringify(v)); } catch (e) { /* 표시를 못 남겨도 화면은 돈다 */ } };

  /*
   * 잠금 ④ — 이 기기에 학생의 진짜 기록이 있는가.
   * 학습 로그(dn_logs)는 화면을 열기만 해도 쌓이므로 '기록이 있다'의 근거로 쓰지 않는다.
   * 나머지 키는 학생이 무언가를 해야 생긴다. 표시가 'none' 이면 이 모듈이 아직 아무것도
   * 싣지 않았다는 뜻이라, 거기 남아 있는 것은 전부 학생 것이다 — demo 표시를 가려낼 필요가 없다.
   * 그래서 통째로 JSON 을 푸는 대신 글자 수만 본다(자동 적재를 거른 뒤에도 표시가 'none' 으로
   * 남아 화면을 열 때마다 다시 도는 검사이므로, 매번 몇 MB를 파싱하면 그 자체가 느려진다).
   */
  const PROBE = KEYS.filter(k => k !== 'dn_logs');
  const hasStudentData = () => PROBE.some(k => {
    const raw = localStorage.getItem(k);
    return !!raw && raw.length > 2;            // '[]' 보다 길면 무언가 들어 있다
  });

  /* 학생 화면(포트폴리오·학습지)은 '로그인한 사람의 것'만 그린다. 계정이 없으면 그 화면들을
     보여 줄 수 없으므로, 작품에 적힌 별명으로 계정을 만들어 둔다(PIN 0000). */
  function seedUsers(bundle) {
    let n = 0;
    try {
      const users = JSON.parse(localStorage.getItem('dn_users') || '{}');
      const seen = {};
      (bundle.works || []).forEach(w => {
        if (!w.userId || seen[w.userId]) return;
        seen[w.userId] = 1;
        const i = w.userId.indexOf('#');
        const sid = i > 0 ? w.userId.slice(0, i) : '', nick = i > 0 ? w.userId.slice(i + 1) : '';
        if (!sid || !nick || users[w.userId]) return;
        users[w.userId] = { sid, nick, pin: '0000', role: 'student', demo: true };
        n++;
      });
      localStorage.setItem('dn_users', JSON.stringify(users));
    } catch (e) { /* 계정이 없어도 갤러리·전시·대시보드는 그대로 동작한다 */ }
    return n;
  }

  async function fetchBundle() {
    const res = await fetch(URL_, { cache: 'no-cache' });
    if (!res.ok) throw new Error(URL_ + ' (' + res.status + ')');
    return res.json();
  }

  const MAX_TRIES = 2;

  /*
   * 적재. force 면 잠금 다섯을 무시하고 다시 싣는다(교사 대시보드의 단추).
   * 반환: { loaded:boolean, why?:string, counts?:object, users?:number }
   *
   * '시도했다'는 표시는 자동 적재(force 가 아닐 때)에서만 남긴다. 교사가 누른 적재가 실패했을 때
   * 표시를 덮으면 '지운 상태(off)'가 '시도 중'으로 바뀌어, 다음 새로고침에 지운 자료가 되살아난다
   * — 잠금 ②가 풀린다. 위 잠금들을 이미 지나온 자리에서만 표시를 쓰는 이유다.
   */
  async function apply(force) {
    const s = read();
    if (!force) {
      if (s.mode === 'off') return { loaded: false, why: 'off' };
      if (s.mode === 'on') return { loaded: false, why: 'already' };
      if (s.mode === 'trying' && (s.tries || 0) >= MAX_TRIES) return { loaded: false, why: 'failed' };
      if (global.Store && Store.mode === 'cloud') return { loaded: false, why: 'cloud' };
      if (hasStudentData()) return { loaded: false, why: 'busy' };
      write({ mode: 'trying', at: Date.now(), tries: (s.tries || 0) + 1 });
    }
    const bundle = await fetchBundle();
    const counts = Store.importJSON(bundle);
    const users = seedUsers(bundle);
    write({ mode: 'on', at: Date.now(), counts, version: bundle.exportedAt });
    return { loaded: true, counts, users, bundle };
  }

  // 걷어 내기: demo 표시가 붙은 것만. 실제 학생 기록은 건드리지 않는다.
  function clear() {
    let removed = 0;
    KEYS.forEach(k => {
      try {
        const list = JSON.parse(localStorage.getItem(k) || '[]');
        if (!Array.isArray(list)) return;
        const keep = list.filter(x => !(x && x.demo === true));
        removed += list.length - keep.length;
        localStorage.setItem(k, JSON.stringify(keep));
      } catch (e) { /* 이 키만 건너뛴다 */ }
    });
    try {
      const users = JSON.parse(localStorage.getItem('dn_users') || '{}');
      /*
       * 진행률 요약(dn_ws_prog)도 함께 버린다. 그 요약에는 '저장소를 통째로 확인해 맞췄다'는
       * 표시(syncedAt)가 붙어 있어, WS.ensureProgress 가 저장소를 다시 읽지 않고 그대로 쓴다.
       * 노트를 지우고 요약만 남겨 두면 허브·여정이 '8차시 다 마침'이라고 말하는데 정작
       * 저장소에는 학습지가 한 장도 없는 상태가 된다. 예시 계정의 요약일 때만 버린다.
       * (계정 목록을 지우기 전에 읽어야 누구의 요약인지 알 수 있다.)
       */
      try {
        const prog = JSON.parse(localStorage.getItem('dn_ws_prog') || '{}');
        if (prog.userId && users[prog.userId] && users[prog.userId].demo) localStorage.removeItem('dn_ws_prog');
      } catch (e2) { /* 요약을 못 읽으면 학습지 화면이 한 번 열릴 때 다시 맞춰진다 */ }
      Object.keys(users).forEach(k => { if (users[k] && users[k].demo) delete users[k]; });
      localStorage.setItem('dn_users', JSON.stringify(users));
    } catch (e) { /* 계정이 남아도 화면에는 영향이 없다 */ }
    write({ mode: 'off', at: Date.now(), removed });
    ready = Promise.resolve({ loaded: false, why: 'off' });
    return removed;
  }

  /*
   * ensure: 이 페이지에서 한 번만 적재를 시도한다.
   * 실패해도 예외를 올리지 않는다(자료를 못 받아도 수업 화면은 그대로 열려야 한다).
   */
  let ready = null;
  function ensure() {
    if (!ready) ready = apply(false).catch(e => {
      console.warn('[showcase] 적재 실패 → 저장소에 있는 것만 보여 준다', e && e.message);
      return { loaded: false, why: 'error' };
    });
    return ready;
  }

  /*
   * 허브·여정의 '차시 진행률'은 여기서 손대지 않는다.
   * 그 요약(dn_ws_prog)의 주인은 js/worksheet.js 하나이고, WS.ensureProgress 가 저장소의 노트에서
   * 되살린다. 그 길이 Store.listNotes 를 지나가고 아래 감싸기가 적재를 기다리게 하므로,
   * 자료를 밖에서 실어 넣어도 진행률은 저절로 맞는다. 두 곳에서 같은 키를 쓰면 어느 쪽이
   * 최신인지 알 수 없게 된다.
   */

  /*
   * Store 읽기 감싸기: 조회는 언제나 적재를 기다린 뒤에 일어난다.
   * 쓰기(saveWork·addFeedback…)는 감싸지 않는다. 학생이 저장하는 순간을 늦출 이유가 없고,
   * 저장은 어차피 자기가 만든 것을 넣는 일이라 예시 자료를 기다릴 필요가 없다.
   */
  const READERS = ['listWorks', 'getWork', 'listNotes', 'listFeedback', 'listLogs',
    'listVersions', 'listQuizzes', 'getQuiz', 'listQuizAnswers'];
  function wrap() {
    if (!global.Store) return;
    READERS.forEach(name => {
      const orig = Store[name];
      if (typeof orig !== 'function') return;
      Store[name] = function () {
        const args = arguments;
        return ensure().then(() => orig.apply(Store, args));
      };
    });
  }
  wrap();

  global.Showcase = {
    status() { const s = read(); return { mode: s.mode || 'none', at: s.at || 0, counts: s.counts || null }; },
    ensure,
    // 교사 대시보드의 '다시 불러오기'. 부른 쪽은 실패를 알아야 하므로 원래 약속을 돌려주되,
    // 이 페이지의 조회가 기다리는 약속은 실패를 삼킨 것으로 둔다(한 번 실패했다고 화면 전체가
    // 멈추면 안 된다 — 감싼 읽기가 전부 거절되어 갤러리·지표가 통째로 비어 버린다).
    load() {
      const p = apply(true);
      ready = p.catch(() => ({ loaded: false, why: 'error' }));
      return p;
    },
    clear,
    URL: URL_
  };
})(window);
