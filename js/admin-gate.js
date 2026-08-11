/*
 * admin-gate.js: 교사 관리자 페이지 비밀번호 잠금
 * -----------------------------------------------------------------------------
 * ⚠ 정적 사이트의 '가벼운 잠금'입니다(강한 보안 아님). 인증은 SHA-256 해시 비교로만 하지만,
 *   시연 편의를 위해 비밀번호(PREFILL)를 평문으로 두고 입력칸에 미리 채웁니다. 즉 잠금은
 *   사실상 열려 있는 셈이니, 이 페이지에는 민감정보를 올리지 마세요.
 *   관리자 계정 표기는 심사용 블라인드 처리(표시 전용 문자열이며 인증에 쓰이지 않음).
 *   인증은 아래 HASH 와의 SHA-256 비교로만 이뤄집니다.
 */
(function (global) {
  'use strict';
  const HASH = '6051fc84a7a0d74c225fb18a496b09952da5642e60723ecae543298edd7d82d6';
  const EMAIL = '관리자 계정 (블라인드)'; // 표시 전용: 인증은 HASH 비교로만 한다
  const KEY = 'dn_admin_ok';
  // 시연 편의: 비밀번호를 입력칸에 미리 채워 둔다(바로 '입장'만 누르면 됨).
  // 잠금이 사실상 열려 있는 상태가 되므로, 민감정보는 이 페이지에 올리지 않는다.
  const PREFILL = 'admin2026';

  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    const mp = Math.pow, maxWord = mp(2, 32); let result = '';
    const words = []; const asciiBitLength = ascii.length * 8;
    let hash = sha256.h = sha256.h || []; const k = sha256.k = sha256.k || [];
    let primeCounter = k.length; const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mp(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mp(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80'; while (ascii.length % 64 - 56) ascii += '\x00';
    let i, j;
    for (i = 0; i < ascii.length; i++) { j = ascii.charCodeAt(i); if (j >> 8) return; words[i >> 2] |= j << ((3 - i) % 4) * 8; }
    words[words.length] = ((asciiBitLength / maxWord) | 0); words[words.length] = (asciiBitLength);
    for (j = 0; j < words.length;) {
      const w = words.slice(j, j += 16); const oldHash = hash; hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2]; const a = hash[0], e = hash[4];
        const temp1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i]
          + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash); hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { const b = (hash[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); }
    return result;
  }

  const unlocked = () => sessionStorage.getItem(KEY) === '1';

  function injectStyle() {
    if (document.getElementById('admin-gate-style')) return;
    const s = document.createElement('style'); s.id = 'admin-gate-style';
    s.textContent = `html.will-lock .wrap{visibility:hidden}
      .admin-locked .wrap{filter:blur(7px);pointer-events:none;user-select:none}
      #admin-lock{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;background:rgba(4,6,12,.85);backdrop-filter:blur(5px);padding:18px}
      #admin-lock .box{background:var(--panel);border:1px solid var(--line);border-radius:16px;max-width:400px;width:100%;padding:26px}
      #admin-unlock-btn{position:fixed;left:14px;bottom:14px;z-index:60}`;
    document.head.appendChild(s);
  }
  function reveal() {
    document.body.classList.remove('admin-locked');
    const o = document.getElementById('admin-lock'); if (o) o.remove();
    addLockBtn();
  }
  function addLockBtn() {
    if (document.getElementById('admin-unlock-btn')) return;
    const b = document.createElement('button');
    b.id = 'admin-unlock-btn'; b.className = 'btn sm'; b.textContent = '🔒 관리자 잠금';
    b.addEventListener('click', () => { sessionStorage.removeItem(KEY); location.reload(); });
    document.body.appendChild(b);
  }
  function showLock() {
    injectStyle(); document.body.classList.add('admin-locked');
    const o = document.createElement('div'); o.id = 'admin-lock';
    o.innerHTML = `<div class="box">
      <h2 style="margin:0 0 6px">🔒 교사 관리자 로그인</h2>
      <p class="muted" style="font-size:12.5px;margin:0 0 14px">관리자 전용 페이지입니다. 관리자 <b>${EMAIL}</b></p>
      <label class="field">관리자 비밀번호</label>
      <input id="admin-pw" type="password" placeholder="비밀번호" autocomplete="off" value="${PREFILL}">
      <button id="admin-go" class="btn primary wide" style="margin-top:12px">입장</button>
      <p class="muted" style="font-size:11px;margin-top:10px">※ 정적 사이트의 가벼운 잠금입니다(강한 보안 아님). 민감정보는 올리지 마세요.</p>
      <p style="font-size:12px;margin-top:8px"><a href="hub.html">← 학생 허브로</a></p>
    </div>`;
    document.body.appendChild(o);
    const tryUnlock = () => {
      const v = document.getElementById('admin-pw').value;
      if (sha256(v) === HASH) { sessionStorage.setItem(KEY, '1'); reveal(); global.UI && UI.toast('관리자 모드로 입장했습니다.'); }
      else { global.UI ? UI.toast('비밀번호가 올바르지 않습니다.') : alert('비밀번호 오류'); }
    };
    document.getElementById('admin-go').addEventListener('click', tryUnlock);
    document.getElementById('admin-pw').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
    setTimeout(() => { const el = document.getElementById('admin-pw'); if (el) { el.focus(); el.select(); } }, 50);
  }

  global.AdminGate = { email: EMAIL, isUnlocked: unlocked, lock: () => { sessionStorage.removeItem(KEY); location.reload(); } };
  // 가능한 한 일찍 잠금(콘텐츠 깜빡임 최소화)
  injectStyle();
  if (!unlocked()) document.documentElement.classList.add('will-lock');
  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.remove('will-lock');
    unlocked() ? addLockBtn() : showLock();
  });
})(window);
