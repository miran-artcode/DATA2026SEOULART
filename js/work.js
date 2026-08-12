/*
 * work.js: 작품 단독 페이지: 작가노트 + 감상·비평(펠드먼 4단계)
 * QR/갤러리에서 work.html?id=<workId> 로 진입.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = (s) => UI.escapeHTML(s);
  const rubSel = id => '<select id="' + id + '"><option value="0">미평가</option><option value="3">상 ●●●</option><option value="2">중 ●●</option><option value="1">하 ●</option></select>';
  const KIND = { color: '색 군집', data: '데이터 점', word: '낱말 구름', lab: '분석', society: '사회 분석' };
  const COLORLBL = { value: '값 그라데이션', warm: '난색', cool: '한색' };
  const id = new URLSearchParams(location.search).get('id');
  let work = null;

  function story(w) {
    const s = w.settings || {}, parts = [];
    if (w.kind === 'data') {
      parts.push('데이터: ' + (w.dataName || '-'));
      const m = (window.Docent && Docent.mapSummary) ? Docent.mapSummary(s.mapping) : [];
      if (m.length) parts.push('매핑: ' + m.join(' · '));
      const cm = s.mapping && s.mapping.colorMode;
      if (cm) parts.push('색: ' + ({ gradient: '그라데이션', category: '범주별', solid: '단색' }[cm] || cm));
      else if (s.color) parts.push('색: ' + (COLORLBL[s.color] || s.color));
    } else if (w.kind === 'color') {
      if (s.K) parts.push('대표색 K=' + s.K);
      if (s.space) parts.push('색공간 ' + String(s.space).toUpperCase());
      if (s.N) parts.push('점 N=' + s.N);
    } else if (w.kind === 'society') {
      const m = s.meta;
      if (m) {
        parts.push(m.sdg + ' · ' + m.label);
        if (m.changePct != null) parts.push('변화 ' + m.yearThen + '→' + m.latestYear + ' ' + (m.changePct > 0 ? '+' : '') + m.changePct + '%');
        if (m.top5 && m.top5[0]) parts.push('최고 ' + m.top5[0][0] + (m.bottom5 && m.bottom5[0] ? ' / 최저 ' + m.bottom5[0][0] : ''));
      } else if (s.lenses) {
        const LK = ['공감', '대립', '형평', '참여', '책임', '연대', '지속가능'];
        parts.push('주체 ' + (s.subjects ? s.subjects.length : 0) + ' · 관점 ' + (s.perspectives ? s.perspectives.length : 0));
        parts.push(LK.filter(k => s.lenses[k] != null).map(k => k + ' ' + (+s.lenses[k]).toFixed(2)).join(' · '));
      }
    }
    return parts;
  }

  function critiqueCard(f) {
    const stars = f.rating ? '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating) : '';
    const steps = [];
    if (f.describe) steps.push(['① 기술', f.describe]);
    if (f.analyze) steps.push(['② 분석', f.analyze]);
    if (f.interpret) steps.push(['③ 해석', f.interpret]);
    if (f.judge) steps.push(['④ 평가', f.judge]);
    // 갤러리식 평점(있으면)
    const old = (f.intent || f.evidence || f.interaction || f.ethics) ?
      `<div class="muted" style="font-size:12px">의도 ${'★'.repeat(f.intent||0)} 근거 ${'★'.repeat(f.evidence||0)} 인터랙션 ${'★'.repeat(f.interaction||0)} 윤리 ${'★'.repeat(f.ethics||0)}</div>` : '';
    const rub = f.rubric ? `<div class="muted" style="font-size:12px">🎯 매핑의도 ${'●'.repeat(f.rubric.intent||0)} · 판단흔적 ${'●'.repeat(f.rubric.trace||0)} · 도구주체성 ${'●'.repeat(f.rubric.agency||0)} · 감각귀환 ${'●'.repeat(f.rubric.ret||0)}</div>` : '';
    return `<div class="lvl" style="margin:8px 0"><div class="lvl-b">
      <b>${esc(f.by || '관람객')}</b> <span style="color:var(--accent)">${stars}</span>
      ${f.comment ? `<div style="margin:4px 0">${esc(f.comment)}</div>` : ''}
      ${old}${rub}
      ${steps.map(([k, v]) => `<div style="margin:3px 0"><b style="color:var(--accent2)">${k}</b> ${esc(v)}</div>`).join('')}
    </div></div>`;
  }

  const NOTE_KIND = { reflection: '성찰', lab: '분석 메모', data: '데이터 작업', color: '색 작업' };
  function noteHTML(n) {
    const when = n.updatedAt ? new Date(n.updatedAt).toLocaleDateString('ko-KR') : '';
    let inner = '';
    if (n.memos && Object.keys(n.memos).length) inner = Object.entries(n.memos).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v)}`).join('<br>');
    else inner = [n.aiHelp && ('🤖 ' + esc(n.aiHelp)), n.myDecision && ('🙋 ' + esc(n.myDecision)), n.line && ('✍ ' + esc(n.line)), n.intent && ('의도: ' + esc(n.intent))].filter(Boolean).join('<br>');
    return `<div class="lvl" style="margin:8px 0"><div class="lvl-b"><span class="badge">${NOTE_KIND[n.kind] || n.kind}</span>
      <span class="muted" style="font-size:11px">${when}</span><div style="margin-top:4px">${inner || '<span class="muted">내용 없음</span>'}</div></div></div>`;
  }
  const hasContent = n => n.line || n.aiHelp || n.myDecision || (n.memos && Object.keys(n.memos).length) || n.intent;

  async function render() {
    work = await Store.getWork(id);
    if (!work) { $('#work-root').innerHTML = UI.callout('작품을 찾을 수 없어요. 클라우드 전시라면 같은 링크/네트워크인지 확인하세요.', 'warn'); return; }
    const fbs = await Store.listFeedback(id);
    const u = Auth.current();
    const st = story(work);
    const docentHTML = window.Docent ? `
      <div class="card" style="margin-top:16px">
        <h3>🎙 도슨트 해설 <span class="muted" style="font-size:12px">(자동 생성)</span></h3>
        <p style="line-height:1.75;margin:0">${esc(Docent.commentary(work))}</p>
      </div>` : '';
    const rec = (work.settings && work.settings.record) || {};
    const recItems = [['감각 먼저', rec.sense], ['무엇을 셌나', rec.count], ['뺀 것(생략)', rec.omit], ['척도·매핑 이유', rec.scale], ['놓친 진실(메타비평)', rec.miss]].filter(x => x[1]);
    const recordHTML = recItems.length ? `
      <div class="card" style="margin-top:16px">
        <h3 class="with-info">📝 데이터 선택 기록 <span class="info-ic" data-info="data-humanism">ⓘ</span></h3>
        ${recItems.map(([k, v]) => `<p style="margin:5px 0"><b>${k}</b> · ${esc(v)}</p>`).join('')}
      </div>` : '';
    const notes = (work.userId ? (await Store.listNotes(work.userId)) : []).filter(hasContent).slice(0, 8);
    const processHTML = notes.length ? `
      <div class="card" style="margin-top:16px">
        <h3>🧭 작가의 과정·성찰 <span class="muted" style="font-size:12px">· 학습 과정도 작품의 일부예요</span></h3>
        ${notes.map(noteHTML).join('')}
      </div>` : '';
    /* Player 는 data·color 만 살아 움직이게 재생한다. 낱말 구름·사회 분석은 캔버스를 주면
       빈 화면이 되므로(QR로 온 관람객이 처음 보는 화면이다) 갤러리와 같은 규칙으로 썸네일을 쓴다. */
    const canLive = work.kind === 'data' || work.kind === 'color';
    const liveMedia = work.video
      ? `<video id="live-video" src="${work.video}" controls autoplay loop muted playsinline${work.thumb ? ` poster="${work.thumb}"` : ''} style="width:100%;aspect-ratio:4/3;object-fit:contain;background:#000;border-radius:12px;border:1px solid var(--line);display:block"></video>`
      : canLive
      ? `<canvas id="live-canvas" style="width:100%;aspect-ratio:4/3;background:#07080d;border-radius:12px;border:1px solid var(--line);display:block"></canvas>`
      : work.thumb
      ? `<img src="${work.thumb}" alt="${esc(work.title || '')}" style="width:100%;aspect-ratio:4/3;object-fit:contain;background:#07080d;border-radius:12px;border:1px solid var(--line);display:block">`
      : `<div style="width:100%;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;background:#07080d;border-radius:12px;border:1px solid var(--line);color:var(--muted)">미리보기가 없는 작품이에요</div>`;
    $('#work-root').innerHTML = `
      <div class="card">
        ${liveMedia}
        ${canLive || work.video ? '<p class="muted" style="font-size:11px;margin:6px 0 0">▶ 살아 움직이는 재생 · 마우스를 올려 반응을 느껴 보세요</p>' : ''}
        <h1 style="margin:14px 0 4px;font-size:24px">${esc(work.title || '제목 없음')}</h1>
        <p class="muted" style="margin:0">${esc(work.by || '익명')} · <span class="badge">${KIND[work.kind] || work.kind}</span>${
          /* 우수 사례(가상 학급)의 작품이면 그렇다고 적는다. QR 로 들어온 관람객은 이 화면만 보므로,
             여기에 표시가 없으면 가상 기록을 실제 학생 작품으로 읽게 된다. */
          work.demo ? ' <span class="badge" style="background:rgba(127,140,180,.18)">예시 · 가상 학급</span>' : ''}</p>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>작가노트</h3>
        ${work.statement ? `<p style="font-size:14.5px;line-height:1.8;border-left:3px solid var(--accent);padding-left:12px">${esc(work.statement)}</p>` : ''}
        ${work.intent ? `<p><b>의도</b> · ${esc(work.intent)}</p>` : ''}
        ${work.evidence ? `<p><b>조형/데이터 근거</b> · ${esc(work.evidence)}</p>` : ''}
        ${st.length ? `<p class="muted" style="font-size:13px"><b>데이터·알고리즘</b> · ${st.map(esc).join(' · ')}</p>` : ''}
      </div>

      ${docentHTML}
      ${recordHTML}
      ${processHTML}

      <div class="card" style="margin-top:16px">
        <h3 class="with-info">감상·비평 <span class="info-ic" data-info="critique">ⓘ</span> <span class="muted" style="font-size:12px">(${fbs.length})</span></h3>
        <div id="crit-list">${fbs.length ? fbs.map(critiqueCard).join('') : '<p class="muted">첫 감상을 남겨 보세요.</p>'}</div>

        <hr class="sep">
        <h3 style="font-size:15px">비평 남기기</h3>
        <div class="grid c2">
          <div><label class="field">별명(관람객)</label><input id="c-name" type="text" value="${u ? esc(u.display) : ''}" placeholder="별명 (실명은 적지 마세요)"></div>
          <div><label class="field">별점</label>
            <select id="c-rating"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3" selected>★★★</option><option value="2">★★</option><option value="1">★</option></select></div>
        </div>
        <label class="field">한마디 감상</label>
        <textarea id="c-comment" rows="2" placeholder="무엇이 마음에 남았나요? 근거와 함께"></textarea>

        <details style="margin-top:10px">
          <summary style="cursor:pointer;color:var(--accent2);font-weight:700;font-size:13.5px">＋ 펠드먼 4단계로 자세히 비평하기</summary>
          <label class="field">① 기술: 무엇이 보이나(객관)</label><textarea id="c-describe" rows="2" placeholder="예: 파란색이 화면의 대부분, 중앙에 밝은 점들"></textarea>
          <label class="field">② 분석: 색·명도·구도·리듬이 어떻게</label><textarea id="c-analyze" rows="2" placeholder="예: 보색 대비가 시선을 중앙으로 모음"></textarea>
          <label class="field">③ 해석: 무엇을 말하나(의도·감정)</label><textarea id="c-interpret" rows="2" placeholder="예: 불안 속의 한 줄기 평온"></textarea>
          <label class="field">④ 평가: 근거 있는 판단</label><textarea id="c-judge" rows="2" placeholder="예: 데이터를 절제해 의도가 분명, 설득력 있음"></textarea>
        </details>
        <details style="margin-top:6px">
          <summary style="cursor:pointer;color:var(--good);font-weight:700;font-size:13.5px">＋ 4영역 평가(자기·동료) <span class="info-ic" data-info="rubric">ⓘ</span></summary>
          <div class="grid c2">
            <div><label class="field">① 매핑의 의도성</label>${rubSel('rb-intent')}</div>
            <div><label class="field">② 판단의 흔적</label>${rubSel('rb-trace')}</div>
            <div><label class="field">③ 도구에 대한 주체성</label>${rubSel('rb-agency')}</div>
            <div><label class="field">④ 감각으로의 귀환</label>${rubSel('rb-return')}</div>
          </div>
        </details>
        <button id="c-submit" class="btn primary" style="margin-top:12px">비평 등록</button>
      </div>`;
    if (work.video) { const lv = document.getElementById('live-video'); if (lv) { lv.muted = true; const pp = lv.play(); if (pp && pp.catch) pp.catch(() => {}); } }
    else { const lc = document.getElementById('live-canvas'); if (lc && window.Player) { if (window._wPlayer) window._wPlayer.stop(); window._wPlayer = Player.mount(lc, work, { interactive: true }); } }
    $('#c-submit').addEventListener('click', submit);
  }

  async function submit() {
    const v = id => ($('#' + id) ? $('#' + id).value.trim() : '');
    const name = v('c-name') || '관람객';
    const comment = v('c-comment'), d = v('c-describe'), a = v('c-analyze'), i = v('c-interpret'), j = v('c-judge');
    const rb = { intent: +v('rb-intent'), trace: +v('rb-trace'), agency: +v('rb-agency'), ret: +v('rb-return') };
    const hasRb = rb.intent || rb.trace || rb.agency || rb.ret;
    if (!comment && !d && !a && !i && !j && !hasRb) { UI.toast('한마디·4단계·4영역 중 하나는 남겨 주세요.'); return; }
    const u = Auth.current();
    await Store.addFeedback({
      workId: id, userId: u ? u.userId : undefined, by: name, kind: 'critique',
      rating: +$('#c-rating').value, comment, describe: d, analyze: a, interpret: i, judge: j,
      rubric: hasRb ? rb : null
    });
    if (window.Log) Log.push({ stage: 'share', action: 'critique_write', workId: id,
      payload: { rubric: hasRb, steps: [d, a, i, j].filter(Boolean).length } });
    UI.toast('비평을 등록했습니다. 고맙습니다!');
    render();
  }

  if (!id) {
    // 8차시 여정 링크로 맨손으로 들어온 학생을 위한 길 안내(막다른 경고가 아니라)
    $('#work-root').innerHTML = UI.callout('아직 작품을 고르지 않았어요. <a href="gallery.html?s=s8">전시 갤러리</a>에서 작품을 눌러 ' +
      '「🔍 단독 페이지」로 들어오거나, <a href="exhibit.html?s=s8">키오스크 화면</a>의 QR을 휴대폰으로 찍으면 이 화면이 열려요.', 'info');
  }
  else render();
})();
