/*
 * cards.js: 질문 카드 4종 (판단의 순간을 화면에 붙잡아 두는 장치)
 * -----------------------------------------------------------------------------
 * 스튜디오마다 흩어져 있던 '판단의 순간'을 한 위젯으로 모은다. 카드는 답을 주지 않고
 * 지금 화면 상태(팔레트·K·매핑 규칙)를 읽어 되묻는다. coach.js 와 같은 철학.
 * 오프라인에서 항상 동작하고, 교사가 실제 모델을 켜면 '더 묻기'로 확장된다.
 *
 * 사용:
 *   Cards.mount(host, { ctx: () => window.ColorStudio.context(), workId: () => Log.workId() });
 */
(function (global) {
  'use strict';

  const K_DONE = 'dn_cards_done';
  const read = () => { try { return JSON.parse(localStorage.getItem(K_DONE) || '{}'); } catch (e) { return {}; } };
  const save = (o) => { try { localStorage.setItem(K_DONE, JSON.stringify(o)); } catch (e) {} };

  function colorWord(p) {
    if (!p) return '가장 큰 색';
    const { r, g, b } = p, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    if (mx - mn < 22) return L > 180 ? '밝은 회색빛' : L < 70 ? '어두운 회색빛' : '중간 회색빛';
    let h = 0, d = mx - mn;
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const names = [[15, '빨강'], [45, '주황'], [70, '노랑'], [160, '초록'], [200, '청록'], [255, '파랑'], [290, '보라'], [330, '자홍'], [360, '빨강']];
    for (const [t, nm] of names) if (h < t) return nm;
    return '빨강';
  }

  /*
   * 카드 4종: when(언제 뜨나) · q(ctx)(무엇을 묻나) · stage(7단계 중 어디)
   * stage 배정: 인상→조형(sense), 그럴듯함 판별(judge), 결정의 근거(revise), 기본값 되묻기(own)
   */
  const CARDS = [
    {
      key: 'read', icon: '👁', title: '조형적 읽기', when: '분석 직후',
      hint: '인상을 조형 요소의 말로 옮기기', stage: 'sense',
      ph: '예: “쓸쓸하다”는 인상은 채도가 낮은 청회색이 화면의 7할을 덮고, 밝은 점이 오른쪽 위 한 곳에만 모여 있기 때문이다',
      q(ctx) {
        const qs = ['먼저 인상을 한 낱말로 적어 보세요. 그 인상은 <b>어떤 조형 요소</b> 때문에 생겼나요? (색·명도·대비·구도·리듬 중에서)'];
        if (ctx.palette && ctx.palette.length) {
          const p = ctx.palette[0];
          qs.push(`가장 비율이 큰 색은 <b>${colorWord(p)}</b>(약 ${Math.round((p.ratio || 0) * 100)}%)예요. 이 색이 분위기를 어느 쪽으로 끌고 가나요? 이 색을 빼면 무엇이 사라질까요?`);
        }
        if (ctx.mapping) qs.push('지금의 배치·움직임이 만드는 <b>리듬</b>을 말로 옮기면 어떤 낱말인가요?');
        return qs;
      }
    },
    {
      key: 'plausible', icon: '🔍', title: '그럴듯함 판별', when: '첫 결과가 나온 직후',
      hint: '완성도와 타당성은 다르다', stage: 'judge',
      ph: '예: 색은 그럴듯하지만 원본의 붓자국 질감이 통째로 빠졌다. 알고리즘은 색이 어디에 있는지를 모르기 때문이다',
      q(ctx) {
        const qs = ['결과가 <b>매끈해 보인다</b>는 것과 <b>맞다</b>는 것은 다릅니다. 이 결과에서 <b>빠진 것·왜곡된 것</b>을 한 가지만 짚어 보세요.'];
        if (ctx.K) qs.push(`색을 ${ctx.K}개로 요약했다는 건 그만큼 <b>버렸다</b>는 뜻이에요. 버려진 것 중 아까운 것은 무엇인가요?`);
        if (ctx.kind === 'data') qs.push('이 데이터에 <b>세어지지 않은 사람·상황</b>은 누구인가요? 그 빈자리는 화면 어디에 있어야 할까요?');
        qs.push('평균에서 멀리 떨어진 결과는 <b>오답이 아니라 다른 답</b>일 수 있어요. 지금 결과는 평균 쪽인가요, 바깥쪽인가요?');
        return qs;
      }
    },
    {
      key: 'reason', icon: '⚖️', title: '결정의 근거', when: '규칙을 확정할 때',
      hint: '고른 것과 버린 것의 기준', stage: 'revise',
      ph: '예: 값→크기 대신 값→속도를 골랐다. 크기는 한눈에 보이지만, 속도는 “쉬지 못한다”는 느낌을 몸으로 전하기 때문이다',
      q(ctx) {
        const qs = ['지금 확정하려는 규칙을 <b>한 문장</b>으로 적어 보세요. 그리고 <b>고려했지만 버린 다른 규칙</b> 하나와, 버린 이유를 적어 보세요.'];
        if (ctx.rules) qs.push(`현재 규칙: <i>${DNW.esc(String(ctx.rules))}</i>. 이 규칙이 의도를 <b>받쳐 주나요</b>, 아니면 그저 <b>재미있나요</b>?`);
        qs.push('이 선택을 친구가 “왜 그렇게 했어?”라고 물으면, 취향 말고 <b>작품의 의도</b>로 답할 수 있나요?');
        return qs;
      }
    },
    {
      key: 'default', icon: '🧭', title: '기본값 되묻기', when: '자동 추천을 적용할 때',
      hint: '기본값은 누구의 기준인가', stage: 'own',
      ph: '예: 자동 추천 팔레트를 그대로 썼다가, 우리 반 열두 명이 거의 같은 색이 되는 걸 보고 두 색을 내 손으로 바꿨다',
      q() {
        return [
          '지금 쓴 값은 <b>내가 정한 것</b>인가요, <b>도구가 정해 준 것</b>인가요?',
          '자동 추천은 대개 <b>많은 사람의 평균</b>에서 나옵니다. 그 평균 <b>바깥에 있는 사람</b>은 이 화면 어디에 있나요?',
          '기본값을 <b>일부러 어긋나게</b> 바꾼다면 무엇을 먼저 바꾸겠어요? 그 어긋남이 내 의도에 도움이 되나요?'
        ];
      }
    }
  ];

  const Cards = {
    CARDS,

    mount(host, opts) {
      if (!host) return;
      opts = opts || {};
      const ctxOf = () => { try { return (opts.ctx && opts.ctx()) || {}; } catch (e) { return {}; } };
      const widOf = () => { try { return (opts.workId && opts.workId()) || (global.Log && Log.workId()) || null; } catch (e) { return null; } };

      function render() {
        const done = read()[widOf()] || {};
        host.innerHTML = `<div class="dnw-panel">
          <h4>🃏 질문 카드: 여기서는 질문만 드려요</h4>
          <p class="dnw-sub">지금 화면을 읽고 되묻습니다. 여기에 남긴 한 줄이 <b>판단의 흔적</b>으로 기록돼요.</p>
          <div class="dnw-cards">${CARDS.map(c => `
            <button class="dnw-card ${done[c.key] ? 'done' : ''}" data-card="${c.key}">
              ${done[c.key] ? '<span class="dnw-tick">✓</span>' : ''}
              <b>${c.icon} ${c.title}</b>${c.hint} <span style="opacity:.6">· ${c.when}</span>
            </button>`).join('')}</div>
        </div>`;
        host.querySelectorAll('[data-card]').forEach(b =>
          b.addEventListener('click', () => open(CARDS.find(c => c.key === b.dataset.card))));
      }

      function open(card) {
        if (!card) return;
        const ctx = ctxOf(), wid = widOf();
        if (global.Log) Log.push({ stage: card.stage, action: 'coach_ask', workId: wid, payload: { card: card.key } });
        const qs = card.q(ctx) || [];
        const body = DNW.modal(`${card.icon} ${card.title}`, `
          <p class="dnw-sub">${DNW.esc(card.when)} · ${DNW.esc(card.hint)}</p>
          ${qs.map(q => `<p class="dnw-q">${q}</p>`).join('')}
          <textarea class="dnw-ta" id="dnw-cans" rows="3" placeholder="${DNW.esc(card.ph)}"></textarea>
          <div class="dnw-row">
            <button class="dnw-btn primary" id="dnw-cgo">이 한 줄 기록하기</button>
            <button class="dnw-btn" id="dnw-cmore">🤖 코치에게 더 묻기</button>
          </div>
          <div id="dnw-cmore-box"></div>`);

        body.querySelector('#dnw-cgo').addEventListener('click', async () => {
          const ans = body.querySelector('#dnw-cans').value.trim();
          if (ans.length < 5) { DNW.toast('한 문장만 적어 주세요(5자 이상).'); return; }
          if (global.Log) await Log.push({ stage: card.stage, action: 'coach_answer', workId: wid,
            payload: { card: card.key, len: ans.length } });        // 답의 '내용'은 노트에, 로그엔 길이만
          const u = global.Auth && Auth.current && Auth.current();
          if (u && global.Store && Store.saveNote) {
            try { await Store.saveNote({ userId: u.userId, by: u.display, kind: 'card',
              title: `질문 카드 · ${card.title}`, line: ans, cardKey: card.key, workId: wid }); } catch (e) {}
          }
          const d = read(); d[wid] = d[wid] || {}; d[wid][card.key] = Date.now(); save(d);
          DNW.close(); DNW.toast('판단의 흔적으로 기록했어요.'); render();
        });

        body.querySelector('#dnw-cmore').addEventListener('click', async () => {
          const box = body.querySelector('#dnw-cmore-box');
          if (!global.Coach) { box.innerHTML = '<p class="dnw-sub">코치 모듈이 없는 화면이에요.</p>'; return; }
          box.innerHTML = '<p class="dnw-sub">질문을 준비하는 중…</p>';
          try {
            const res = await Coach.ask(ctx);
            box.innerHTML = `<div class="dnw-q" style="margin-top:12px">${DNW.md(res.text)}</div>`;
          } catch (e) { box.innerHTML = `<div class="dnw-q" style="margin-top:12px">${DNW.md(Coach.offline(ctx))}</div>`; }
        });
      }

      render();
      return { render, open: (k) => open(CARDS.find(c => c.key === k)) };
    }
  };

  global.Cards = Cards;
})(window);
