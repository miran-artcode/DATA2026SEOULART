/*
 * auth.js — 로그인 (학번 · 별명 · PIN 4자리)
 * -----------------------------------------------------------------------------
 * 설계: 사이트 어디에도 실명을 두지 않는다.
 *   • 로그인 = 학번 + 별명 + PIN.  userId = "학번#별명".
 *   • 화면에 보이는 이름(display)은 언제나 별명이다 — 작품·갤러리·전시·피드백 전부.
 *   • 반(klass)은 학번에서 자동으로 읽는다(20307 → 2-3). 못 읽으면 비워 둔다.
 *   • 학습 로그(log.js)에는 학번·별명도 올라가지 않는다. 반 + 가명 코드만 남는다.
 *     → 명단(학번↔학생)을 가진 교사만 대조할 수 있는 '가명처리' 수준.
 *
 * ⚠ 보안 주의: 4자리 PIN은 '진짜 보안'이 아니라 실수로 덮어쓰는 걸 막는 잠금 수준입니다.
 *   미성년자 정보이므로 학교 개인정보 방침을 먼저 확인하세요.
 */
(function (global) {
  'use strict';
  const K_SESSION = 'dn_session', K_USERS = 'dn_users';
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /*
   * 학번 정규화 — 같은 학생이 어떻게 적든 한 계정이 되도록 5자리 GRRNN 으로 모은다.
   * 이게 없으면 "2-3-07"과 "20307"이 서로 다른 계정이 되어, 다음 시간에 하이픈을
   * 빼고 적은 학생이 자기 작품을 못 찾는다(수업에서 실제로 벌어지는 사고).
   *   "2-3-07" · "2-3-7" · "2307" · "20307"  →  모두 "20307"
   * 그 밖의 자릿수(학교마다 다름)는 숫자만 남겨 그대로 쓴다.
   */
  const pad2 = (v) => ('0' + String(+v)).slice(-2);
  function normSid(sid) {
    const parts = String(sid == null ? '' : sid).split(/[^0-9]+/).filter(Boolean);
    if (parts.length === 3) return String(+parts[0]) + pad2(parts[1]) + pad2(parts[2]);   // 학년-반-번호
    const d = parts.join('');
    if (d.length === 4) return d[0] + '0' + d.slice(1);                                    // GRNN → GRRNN
    return d;
  }

  /*
   * 학번에서 반을 읽는다. 정규화 뒤의 5자리 GRRNN(예: 20307 → 2학년 03반 07번) → "2-3".
   * 그 밖의 형식은 반을 비워 둔다(지표는 반 없이도 동작한다).
   */
  function klassOf(sid) {
    const d = normSid(sid);
    if (d.length === 5) return +d[0] + '-' + +d.slice(1, 3);
    return '';
  }

  function userKey(sid, nick) { return normSid(sid) + '#' + (nick || '').trim(); }

  const Auth = {
    klassOf,
    // 같은 학번으로 이미 만든 계정이 있으면 그 별명을 돌려준다(별명을 잊었을 때 안내용)
    nickOf(sid) {
      const d = normSid(sid), users = read(K_USERS);
      const hit = Object.keys(users).find(k => k.split('#')[0] === d);
      return hit ? hit.split('#').slice(1).join('#') : null;
    },

    // 로그인 또는 최초 등록. role: 'student' | 'teacher'
    login({ sid, nick, pin, role }) {
      const d = normSid(sid);
      nick = (nick || '').trim();
      if (!/^\d{2,6}$/.test(d)) throw new Error('학번을 숫자로 입력하세요(예: 20307).');
      if (!nick) throw new Error('별명을 입력하세요. 실명 대신 별명을 씁니다.');
      if (nick.length > 12) throw new Error('별명은 12자 이내로 지어 주세요.');
      if (!/^\d{4}$/.test(pin || '')) throw new Error('PIN은 숫자 4자리여야 합니다.');

      const users = read(K_USERS);
      const key = userKey(d, nick);
      if (users[key]) {
        if (users[key].pin !== pin) throw new Error('PIN이 일치하지 않습니다.');
      } else {
        // 같은 학번을 다른 별명으로 이미 쓰고 있다면, 새 계정이 되어 이전 작품과 분리된다고 알려 준다.
        const prev = this.nickOf(d);
        if (prev) throw new Error(`이 학번은 별명 ‘${prev}’(으)로 등록되어 있어요. 그 별명으로 로그인하세요.`);
        users[key] = { sid: d, nick, pin, role: role || 'student' };
        write(K_USERS, users);
      }
      const u = {
        userId: key,
        sid: d,
        nick,
        name: nick,              // 예전 코드 호환(이름 자리에는 언제나 별명이 들어간다)
        display: nick,           // 화면에 보이는 이름 = 별명
        klass: klassOf(d),
        role: users[key].role || role || 'student',
        at: Date.now()
      };
      write(K_SESSION, u);
      return u;
    },
    current() { const s = read(K_SESSION); return s && s.userId ? s : null; },
    isTeacher() { const u = this.current(); return !!(u && u.role === 'teacher'); },
    logout() { localStorage.removeItem(K_SESSION); },
    // 보호 페이지에서 사용: 로그인 안 되어 있으면 index 로 보냄
    requireLogin() {
      if (!this.current()) { location.href = 'index.html?next=' + encodeURIComponent(location.pathname.split('/').pop()); return false; }
      return true;
    }
  };

  global.Auth = Auth;
})(window);
