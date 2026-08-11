/*
 * version.js — 버전 스냅샷과 A/B 비교 (수정의 근거를 남기는 장치)
 * -----------------------------------------------------------------------------
 * 저장할 때마다 '설정(JSON) + 작은 썸네일'을 한 벌씩 쌓고, 두 버전을 좌우로 비교한다.
 * 학생은 "1차 → 2차에서 무엇을 왜 바꿨는가"를 한 줄로 적는다. 그 한 줄이 곧 수정의 근거.
 *
 * 사용:
 *   Versions.mount(document.getElementById('host'), {
 *     workId : () => Log.workId(),          // 작업 중 작품 id
 *     canvas : () => p5i.canvas,            // 썸네일을 뜰 캔버스
 *     settings: () => currentSettings(),    // 이 순간의 설정(JSON 가능한 값)
 *     labels : { K:'대표색 수', N:'점 개수' }  // (선택) 설정 키의 한글 이름
 *   });
 */
(function (global) {
  'use strict';

  const KEY_LABEL = {
    K: '대표색 수(K)', N: '점 개수(N)', space: '색공간', mouseMode: '마우스 규칙', clickExplode: '클릭 폭발',
    micTarget: '마이크 대상', freqOn: '주파수 반응', mapping: '매핑', baseSpeed: '기본 속도', vib: '떨림',
    trail: '잔상', layout: '배치', motionStyle: '움직임', pointScale: '점 크기', cohesion: '응집', bg: '배경',
    dataName: '데이터 이름', palette: '팔레트', size: '크기', speed: '속도', color: '색', alpha: '투명도'
  };

  // 설정 객체를 '키: 값' 한 층으로 펴서 비교 가능하게(배열·객체는 요약 문자열로)
  function flatten(obj, prefix, out, depth) {
    out = out || {}; depth = depth || 0;
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(k => {
      const v = obj[k], key = prefix ? prefix + '.' + k : k;
      if (v == null) return;
      if (Array.isArray(v)) out[key] = v.length > 6 ? `[${v.length}개]` : JSON.stringify(v);
      else if (typeof v === 'object') { if (depth < 1) flatten(v, key, out, depth + 1); else out[key] = '{…}'; }
      else out[key] = String(v);
    });
    return out;
  }
  function labelOf(key) {
    const last = key.split('.').pop();
    return KEY_LABEL[last] || KEY_LABEL[key] || key;
  }
  function diff(a, b) {
    const fa = flatten(a), fb = flatten(b), keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
    const rows = [];
    keys.forEach(k => { if (fa[k] !== fb[k]) rows.push({ key: k, from: fa[k] == null ? '—' : fa[k], to: fb[k] == null ? '—' : fb[k] }); });
    return rows;
  }

  const Versions = {
    diff,

    async mount(host, opts) {
      if (!host || !global.Store || !Store.saveVersion) return;
      opts = opts || {};
      const esc = DNW.esc;
      host.innerHTML = `<div class="dnw-panel">
        <h4>📸 버전 기록: 첫 결과에 머물지 않기</h4>
        <p class="dnw-sub">설정을 바꿀 때마다 <b>버전을 저장</b>해 두면, 두 버전을 나란히 놓고
          “무엇을 왜 바꿨는가”를 말할 수 있어요. 이 기록이 그대로 <b>수정의 근거</b>가 됩니다.</p>
        <div class="dnw-vlist" id="dnw-vlist"><span class="dnw-sub">아직 저장한 버전이 없어요.</span></div>
        <div class="dnw-row">
          <button class="dnw-btn primary" id="dnw-vsave">📸 지금 버전 저장</button>
          <button class="dnw-btn" id="dnw-vcmp" disabled>⇄ 두 버전 비교하기</button>
          <span class="dnw-sub" id="dnw-vcnt" style="margin:0"></span>
        </div></div>`;

      const listEl = host.querySelector('#dnw-vlist');
      const cntEl = host.querySelector('#dnw-vcnt');
      const cmpBtn = host.querySelector('#dnw-vcmp');
      let versions = [];

      async function refresh() {
        const wid = opts.workId ? opts.workId() : null;
        versions = wid ? await Store.listVersions(wid) : [];
        cmpBtn.disabled = versions.length < 2;
        cntEl.textContent = versions.length ? `저장한 버전 ${versions.length}개 · 수정 ${Math.max(0, versions.length - 1)}회` : '';
        listEl.innerHTML = versions.length
          ? versions.map((v, i) => `<div class="dnw-vitem" data-i="${i}" title="${esc(new Date(v.createdAt).toLocaleString('ko-KR'))}">
              ${v.thumb ? `<img src="${v.thumb}" alt="${i + 1}차">` : '<img alt="">'}<span>${i + 1}차</span></div>`).join('')
          : '<span class="dnw-sub">아직 저장한 버전이 없어요.</span>';
      }

      host.querySelector('#dnw-vsave').addEventListener('click', async () => {
        const wid = opts.workId ? opts.workId() : null;
        if (!wid) { DNW.toast('작품을 먼저 시작해 주세요.'); return; }
        if (global.Auth && Auth.current && !Auth.current()) { DNW.toast('로그인하면 버전이 기록돼요.'); return; }
        const rec = {
          workId: wid,
          uid: (global.Log && Log.uid()) || null,          // 이름 대신 익명 코드만
          settings: opts.settings ? JSON.parse(JSON.stringify(opts.settings() || {})) : {},
          thumb: DNW.thumb(opts.canvas ? opts.canvas() : null, 200),
          page: location.pathname.split('/').pop()
        };
        try { await Store.saveVersion(rec); } catch (e) { DNW.toast('버전 저장에 실패했어요(저장 공간 확인).'); return; }
        await refresh();
        if (global.Log) Log.push({ stage: 'revise', action: 'revise', workId: wid, payload: { n: versions.length } });
        DNW.toast(`${versions.length}차 버전을 저장했어요.`);
        if (versions.length >= 2) compare(versions.length - 2, versions.length - 1);
      });

      cmpBtn.addEventListener('click', () => compare(Math.max(0, versions.length - 2), versions.length - 1));
      listEl.addEventListener('click', e => {
        const it = e.target.closest('.dnw-vitem'); if (!it) return;
        const i = +it.dataset.i;
        if (versions.length < 2) return;
        compare(i === 0 ? 0 : i - 1, i === 0 ? 1 : i);
      });

      /* ----------------------------- 비교 화면 ----------------------------- */
      function compare(ai, bi) {
        const A = versions[ai], B = versions[bi];
        if (!A || !B) return;
        const rows = diff(A.settings, B.settings);
        const body = DNW.modal(`⇄ ${ai + 1}차 ↔ ${bi + 1}차 비교`, `
          <p class="dnw-sub">같은 자리에서 <b>A와 B를 번갈아</b> 보세요. 눈이 먼저 알아챈 차이를 아래에 한 줄로 적습니다.</p>
          <div class="dnw-ab">
            <button class="dnw-btn on" data-ab="A">A · ${ai + 1}차</button>
            <button class="dnw-btn" data-ab="B">B · ${bi + 1}차</button>
          </div>
          <img id="dnw-abimg" src="${A.thumb || ''}" style="width:100%;border-radius:12px;border:1px solid rgba(127,140,180,.35);display:block;min-height:80px">
          <div class="dnw-cmp" style="margin-top:12px">
            <div><span class="dnw-sub">A · ${ai + 1}차 · ${esc(new Date(A.createdAt).toLocaleString('ko-KR'))}</span>${A.thumb ? `<img src="${A.thumb}">` : ''}</div>
            <div><span class="dnw-sub">B · ${bi + 1}차 · ${esc(new Date(B.createdAt).toLocaleString('ko-KR'))}</span>${B.thumb ? `<img src="${B.thumb}">` : ''}</div>
          </div>
          <div class="dnw-diff">${rows.length
            ? '<b>바뀐 설정 ' + rows.length + '개</b><br>' + rows.slice(0, 12).map(r =>
              `· ${esc(labelOf(r.key))} <code>${esc(r.from)} → ${esc(r.to)}</code>`).join('<br>')
            : '<b>설정은 그대로예요.</b> 그렇다면 무엇이 달라졌나요? (같은 설정, 다른 순간)'}</div>
          <p class="dnw-sub" style="margin:14px 0 4px"><b>무엇을 왜 바꿨나요?</b> (한 줄 · 이 문장이 평가의 근거가 됩니다)</p>
          <textarea class="dnw-ta" id="dnw-vreason" rows="2" placeholder="예: 대표색을 12→6으로 줄여 시선을 인물에 모으려 했다"></textarea>
          <div class="dnw-row"><button class="dnw-btn primary" id="dnw-vreason-go">기록 저장</button></div>`);

        let cur = 'A';
        body.querySelectorAll('[data-ab]').forEach(b => b.addEventListener('click', () => {
          const to = b.dataset.ab; if (to === cur) return;
          body.querySelectorAll('[data-ab]').forEach(x => x.classList.toggle('on', x === b));
          body.querySelector('#dnw-abimg').src = (to === 'A' ? A.thumb : B.thumb) || '';
          if (global.Log) Log.push({ stage: 'judge', action: 'ab_switch', workId: A.workId,
            payload: { from: cur, to, a: ai + 1, b: bi + 1, changed: rows.length } });
          cur = to;
        }));
        body.querySelector('#dnw-vreason-go').addEventListener('click', async () => {
          const reason = body.querySelector('#dnw-vreason').value.trim();
          if (!reason) { DNW.toast('한 줄만 적어 주세요.'); return; }
          if (global.Log) await Log.push({ stage: 'revise', action: 'revise', workId: A.workId,
            payload: { from: ai + 1, to: bi + 1, reason, changed: rows.map(r => r.key).slice(0, 8) } });
          const u = global.Auth && Auth.current();
          if (u && Store.saveNote) {
            try { await Store.saveNote({ userId: u.userId, by: u.display, kind: 'revision',
              title: `수정 근거 · ${ai + 1}차 → ${bi + 1}차`, line: reason,
              myDecision: rows.map(r => `${labelOf(r.key)}: ${r.from}→${r.to}`).join(' / ') }); } catch (e) {}
          }
          DNW.close(); DNW.toast('수정의 근거를 기록했어요.');
        });
      }

      await refresh();
      return { refresh, compare };
    }
  };

  global.Versions = Versions;
})(window);
