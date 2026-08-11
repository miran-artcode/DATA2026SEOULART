/*
 * log.js — 학습 로그 계층 (대시보드의 원료)
 * -----------------------------------------------------------------------------
 * 지금까지는 '결과물'(작품·노트)만 남았다. 이 모듈은 '판단의 행동'을 남긴다.
 *   Log.push({ stage:'judge', action:'ab_switch', payload:{...}, workId:'...' })
 *
 * 설계 원칙
 *   1) 개인정보 최소화(가명처리) — 로그에 학번·별명을 절대 저장하지 않는다. 반 + 가명 코드만.
 *      코드는 로그인 정보(학번#별명)를 단방향 해시로 바꿔 만들지만 4글자로 짧으므로,
 *      학급 명단을 가진 사람은 대조가 가능하다 — '완전 익명화'가 아니라 '가명처리'다.
 *      교사 화면은 로그가 아니라 works/notes 가 이미 가진 별명과 조인해 신원을 알아본다.
 *      (실명은 애초에 어디에도 없다 — 로그인 자체가 학번+별명이다.)
 *   2) 기록량 최소화 — 화면 이동·클릭 전부가 아니라 아래 11개 action 만 남긴다.
 *      (오프라인·저용량 환경에서도 안전하게 돌아가야 하므로)
 *   3) 의존성 없음 — UI/site.css 를 쓰지 않는 페이지(색 스튜디오)에서도 그대로 동작.
 *      Store 가 없으면 localStorage 에 직접 쓴다.
 */
(function (global) {
  'use strict';

  const K_LOGS = 'dn_logs';          // Store 가 없을 때의 직접 저장 키(같은 키를 공유)
  const K_DRAFT = 'dn_draftid';      // 페이지별 '작업 중 작품' 임시 id
  const CAP = 4000;                  // 브라우저 용량 보호: 넘으면 오래된 것부터 버린다

  /* 7단계 — 창작 과정의 어디인가 */
  const STAGES = [
    { key: 'sense', label: '감각·문제', desc: '데이터가 되기 전, 몸으로 먼저 느끼기' },
    { key: 'intent', label: '의도', desc: '무엇을 말할 것인가 한 문장으로' },
    { key: 'make', label: '작업', desc: '규칙을 정하고 만들어 보기' },
    { key: 'judge', label: '판별', desc: '그럴듯함과 타당함을 갈라 보기' },
    { key: 'revise', label: '선택·수정', desc: '첫 결과에 머무르지 않기' },
    { key: 'share', label: '공유', desc: '전시하고 비평을 주고받기' },
    { key: 'own', label: '책임·성찰', desc: '내 감각으로 돌아와 책임지기' }
  ];

  /* 11개 action — 이것 말고는 기록하지 않는다 */
  const ACTIONS = {
    view: '화면 열기',
    analyze: '분석 실행',
    map_apply: '매핑 규칙 적용',
    ab_switch: 'A/B 비교',
    coach_ask: '코치에게 질문',
    coach_answer: '코치 질문에 답함',
    note_save: '작업노트 저장',
    revise: '수정(버전 저장)',
    exhibit: '전시',
    critique_write: '비평 작성',
    reflect_submit: '성찰 제출'
  };

  /* ----------------------------- 가명 코드 ----------------------------- */
  // FNV-1a 32bit — 단방향이고, 같은 학생이면 항상 같은 값(재현성). 짧으므로 '가명'이지 '익명'은 아니다.
  function hash32(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36).slice(0, 4);
  }
  // 반은 그대로 쓰고(개인 식별 아님·지도에 필요), 학번·별명 자리엔 해시 4글자만.
  // 반이 비어 있으면(학번 형식이 특이한 경우) '무반'으로 묶는다.
  function anonOf(u) {
    if (!u || !u.userId) return null;
    return ((u.klass || '').trim() || '무반') + '·' + hash32(u.userId);
  }

  function readRaw() { try { return JSON.parse(localStorage.getItem(K_LOGS) || '[]'); } catch (e) { return []; } }
  function writeRaw(list) {
    try { localStorage.setItem(K_LOGS, JSON.stringify(list)); return true; }
    catch (e) { // 용량 초과 → 절반으로 줄여 한 번 더
      try { localStorage.setItem(K_LOGS, JSON.stringify(list.slice(-Math.floor(list.length / 2)))); return true; }
      catch (e2) { return false; }
    }
  }
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const page = () => (location.pathname.split('/').pop() || 'index.html');

  /* ----------------------------- 공개 API ----------------------------- */
  const seenView = {};   // 같은 화면에서 view 는 1회만

  const Log = {
    STAGES, ACTIONS,
    stageIndex(key) { return STAGES.findIndex(s => s.key === key); },
    stageLabel(key) { const s = STAGES.find(x => x.key === key); return s ? s.label : key; },
    anonOf,

    // 현재 로그인 학생의 익명 코드(로그인 전이면 null → 기록하지 않는다)
    uid() {
      const u = (global.Auth && Auth.current && Auth.current()) || null;
      return anonOf(u);
    },

    /*
     * 지금 이 화면에서 작업 중인 '작품 임시 id'.
     * 작품(work)은 전시할 때 비로소 만들어지므로, 그 전의 로그·버전을 묶을 자리표가 필요하다.
     * 전시할 때 work.draftId 로 함께 저장하면 교사 화면에서 로그·버전·작품이 한 줄로 이어진다.
     */
    workId(reset) {
      const k = K_DRAFT + '_' + page();
      let v = reset ? null : localStorage.getItem(k);
      if (!v) { v = 'd_' + rid(); try { localStorage.setItem(k, v); } catch (e) {} }
      return v;
    },
    newWork() { return this.workId(true); },

    /*
     * push({stage, action, payload, workId}) → Promise<보관 여부>
     * 절대 예외를 던지지 않는다(수업이 로그 때문에 멈추면 안 되므로).
     */
    async push(rec) {
      try {
        rec = rec || {};
        if (!ACTIONS[rec.action]) return false;          // 정의된 11개만
        const uid = this.uid();
        if (!uid) return false;                          // 로그인 전 행동은 남기지 않는다
        const u = Auth.current();
        const row = {
          id: rid(), uid,
          klass: (u.klass || '').trim(),
          ts: Date.now(),
          page: page(),
          stage: rec.stage || 'make',
          action: rec.action,
          payload: rec.payload || {},
          workId: rec.workId || null
        };
        if (global.Store && typeof Store.addLog === 'function') { await Store.addLog(row); return true; }
        const list = readRaw(); list.push(row);
        writeRaw(list.length > CAP ? list.slice(list.length - CAP) : list);
        return true;
      } catch (e) { return false; }
    },

    // 화면 진입 기록(한 화면당 1회). 두 번째 인자로 이 화면이 속한 단계를 준다.
    view(stage) {
      const p = page();
      if (seenView[p]) return Promise.resolve(false);
      seenView[p] = 1;
      return this.push({ stage: stage || 'sense', action: 'view' });
    },

    async list(filter) {
      let list;
      if (global.Store && typeof Store.listLogs === 'function') list = await Store.listLogs();
      else list = readRaw();
      list = list.slice().sort((a, b) => a.ts - b.ts);
      if (filter && filter.uid) list = list.filter(l => l.uid === filter.uid);
      if (filter && filter.workId) list = list.filter(l => l.workId === filter.workId);
      return list;
    },
    // 내 로그만(학생 포트폴리오용)
    mine() { const uid = this.uid(); return uid ? this.list({ uid }) : Promise.resolve([]); },
    async clear() {
      if (global.Store && typeof Store.clearLogs === 'function') return Store.clearLogs();
      localStorage.removeItem(K_LOGS);
    }
  };

  /*
   * 화면 → 7단계 자동 대응.
   * 페이지가 스스로 Log.view(stage) 를 부르면 그 값이 우선한다(먼저 부른 쪽이 이긴다).
   * 이 자동 기록이 있어야 '어느 단계에서 멈춰 있는가'(D-1)를 로그만으로 읽을 수 있다.
   */
  const PAGE_STAGE = {
    'start.html': 'sense', 'journey.html': 'sense', 'learn.html': 'sense', 'literacy.html': 'sense',
    'lab.html': 'sense', 'society.html': 'sense',
    'studio-color.html': 'make', 'studio-data.html': 'make', 'studio-sound.html': 'make',
    'studio-life.html': 'make', 'studio-object.html': 'make', 'project.html': 'intent',
    'critique.html': 'judge', 'quiz.html': 'judge',
    'gallery.html': 'share', 'work.html': 'share', 'exhibit.html': 'share',
    'notes.html': 'own', 'portfolio.html': 'own'
  };
  document.addEventListener('DOMContentLoaded', () => {
    const st = PAGE_STAGE[page()];
    if (st) setTimeout(() => Log.view(st), 300);   // 페이지 스크립트가 먼저 부를 틈을 준다
  });

  global.Log = Log;
})(window);
