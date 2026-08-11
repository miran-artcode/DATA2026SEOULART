/*
 * literacy.js: 생성형 AI 리터러시 7챕터 (읽기 → 해 보기 → 한 줄 답하기)
 * -----------------------------------------------------------------------------
 * 읽기만 하는 페이지는 약하다. 챕터마다 '직접 해 보는 위젯 1개'와 '한 줄 답'을 붙였다.
 * 그 한 줄이 학습 로그(log.js)와 포트폴리오(portfolio.html)로 그대로 이어진다.
 *
 * 주의(정직하게 밝힐 것): 3장의 '5회 생성'은 실제 생성 모델을 부르지 않는다.
 * 확률적 생성이 '학습 데이터의 평균'으로 끌리는 성질만 절차적으로 흉내 낸 시뮬레이션이며,
 * 화면에도 그렇게 표시한다. 무설치·오프라인 원칙을 지키기 위한 선택이다.
 */
(function (global) {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const K_ANS = 'dn_literacy';
  const answers = () => { try { return JSON.parse(localStorage.getItem(K_ANS) || '{}'); } catch (e) { return {}; } };
  const saveAns = (o) => { try { localStorage.setItem(K_ANS, JSON.stringify(o)); } catch (e) {} };

  /* ============================ 챕터 정의 ============================ */
  const CH = [
    {
      id: 'ch1', n: 1, stage: 'sense', action: 'analyze',
      title: '이미지는 어떻게 숫자가 되는가',
      lead: '그림은 이미 데이터다',
      read: `화면의 그림은 아주 작은 사각형(<b>픽셀</b>) 수십만 개로 되어 있고, 픽셀 하나는
        <b>빨강·초록·파랑</b>의 세기를 각각 0~255로 적은 <b>숫자 세 개</b>일 뿐이다.
        그러니 “미술을 데이터로 바꾼다”는 말은 정확하지 않다. 디지털 그림은 <b>처음부터 데이터였다</b>.
        우리가 하는 일은 그 숫자를 <b>어떻게 읽고 무엇으로 되돌릴지</b> 정하는 것이다.`,
      task: '그림 위에 마우스를 올려 보세요(휴대전화는 손가락으로 문지르세요). 그 점의 숫자가 그대로 보입니다.',
      ask: '숫자로 적히지 <b>않는</b> 것은 무엇인가요? (예: 붓의 힘, 그날의 마음)'
    },
    {
      id: 'ch2', n: 2, stage: 'sense', action: 'analyze',
      title: '요약은 손실이다',
      lead: 'K개로 줄일 때 무엇이 사라지는가',
      read: `K-평균(K-means)은 수만 가지 색을 비슷한 것끼리 <b>K개 무리</b>로 묶고, 무리마다 가운데 색 하나로 대신한다.
        요약은 언제나 <b>버리는 일</b>이다. K를 줄이면 화면은 단순하고 강해지지만, 그늘의 미묘한 색·붓자국의 떨림은 사라진다.
        중요한 건 “몇 개가 정답인가”가 아니라 <b>“무엇을 잃어도 되는가”</b>를 내가 정하는 일이다.`,
      task: 'K를 1에서 24까지 밀어 보세요. 오른쪽이 요약된 그림, 아래가 남은 대표색입니다.',
      ask: '지금 K에서 <b>사라져서 아까운 것</b>은 무엇인가요?'
    },
    {
      id: 'ch3', n: 3, stage: 'judge', action: 'analyze',
      title: '생성형 AI는 무엇을 잘하는가',
      lead: '학습 데이터의 평균에 가까운 결과',
      read: `생성형 AI는 “무엇이 아름다운가”를 아는 게 아니라, <b>많이 본 것과 닮은 것</b>을 확률적으로 만든다.
        그래서 같은 조건을 여러 번 주면 <b>서로 닮은 결과</b>가 나온다. 무작위처럼 보여도 <b>평균 쪽으로 끌린다</b>.
        이것이 생성형 AI의 힘이자 한계다. 빠르게 그럴듯한 것을 주지만, 그 그럴듯함은 <b>이미 많은 사람이 본 것</b>이다.`,
      task: '같은 조건으로 5번 만들어 보세요. 다섯 결과가 서로 얼마나 닮았는지 숫자로 잽니다.',
      ask: '다섯 개가 닮았다면, 그중 <b>내 것</b>이라 할 수 있는 부분은 어디인가요?',
      note: '⚠ 이 위젯은 실제 생성 모델을 부르지 않아요. 확률적 생성이 평균으로 끌리는 성질만 흉내 낸 <b>시뮬레이션</b>입니다(오프라인 동작을 위해).'
    },
    {
      id: 'ch4', n: 4, stage: 'judge', action: 'ab_switch',
      title: '그럴듯함의 함정',
      lead: '완성도와 타당성은 다르다',
      read: `매끈한 결과는 <b>맞는 결과</b>가 아니다. 그리고 평균에서 멀리 떨어진 결과는 <b>오답이 아니라 다른 답</b>이다.
        한 연구는 생성형 AI가 개인의 창의성 점수는 올리지만, 여러 사람의 결과를 모아 놓고 보면
        <b>집단의 참신성은 오히려 줄어든다</b>고 보고했다(Doshi &amp; Hauser, 2024).
        각자는 더 잘하는데, 우리는 더 닮아진다. 그렇다면 우리 반은 어떨까?`,
      task: '우리 반이 전시한 작품들이 서로 얼마나 닮았는지 직접 재 봅니다.',
      ask: '우리 반에서 <b>가장 닮지 않은 작품</b>은 무엇을 다르게 했나요?'
    },
    {
      id: 'ch5', n: 5, stage: 'judge', action: 'critique_write',
      title: '데이터는 관점이다',
      lead: '무엇을 세고 무엇을 뺐는가',
      read: `데이터는 세상을 그대로 옮긴 것이 아니라, 누군가 <b>세기로 정한 것</b>만 모은 결과다.
        평균 신체 치수로 만든 의자·교복·자동차는 <b>평균에 가까운 몸</b>에 맞는다. 그 바깥의 몸은 “불편한 사람”이 되고,
        기준을 정한 사람은 보이지 않는다. <b>기본값(default)은 늘 누군가의 기준</b>이다.`,
      task: '아래 신체측정 데이터에서 무엇을 셀지 골라 보세요. 고르는 순간 “표준”이 달라집니다.',
      ask: '이 기준 <b>바깥에 남는 사람</b>은 누구이고, 그를 위해 무엇을 바꿔야 할까요?'
    },
    {
      id: 'ch6', n: 6, stage: 'own', action: 'note_save',
      title: '저작권 · 약관 · 개인정보',
      lead: '쓰기 전에 확인하는 습관',
      read: `남의 이미지를 쓸 때는 <b>출처와 이용 조건</b>을, 친구가 나온 사진을 쓸 때는 <b>초상권</b>을,
        AI 서비스를 쓸 때는 <b>연령 조건과 약관</b>을 먼저 본다. 생성물의 권리는 서비스마다 다르고,
        “올린 자료를 학습에 쓸 수 있다”는 조항이 있는 곳도 있다. <b>확인은 실력의 일부</b>다.`,
      task: '내가 전시한 작품의 자료 목록을 자동으로 점검합니다. 빠진 항목은 지금 채워 넣으세요.',
      ask: '내 작품에서 <b>가장 조심해야 할 자료</b> 하나와 그 이유는?'
    },
    {
      id: 'ch7', n: 7, stage: 'own', action: 'reflect_submit',
      title: '창작의 책임',
      lead: '왜 이것이 나에게 의미가 있는가',
      read: `도구는 의도를 <b>대체</b>하지 않고 <b>뒤따른다</b>. 마지막에 남는 질문은 늘 같다.
        “왜 <b>내가</b> 이것을 만들었고, 왜 이것이 <b>작품</b>인가?” 이 답을 쓸 수 있을 때, 도구는 비로소 내 것이 된다.`,
      task: '150자 창작 진술문을 씁니다. 전시·포트폴리오·평가에 함께 붙습니다.',
      ask: '이 작품을 한 사람에게만 보여 줄 수 있다면, <b>누구에게</b> 보여 주고 싶나요?'
    }
  ];

  /* ============================ 위젯들 ============================ */
  const W = {};

  /* --- 1장 · 픽셀 값 읽기 --- */
  W.ch1 = function (host) {
    host.innerHTML = `<div class="lit-widget">
      <select id="w1-demo" style="width:auto"></select>
      <div class="lit-2col" style="margin-top:10px">
        <canvas id="w1-cv" width="420" height="315" style="width:100%;border-radius:10px;border:1px solid var(--line);cursor:crosshair"></canvas>
        <div id="w1-out" class="lit-readout"><p class="muted" style="font-size:12.5px">그림 위에 마우스를 올리면 그 점의 숫자가 여기 나타납니다.</p></div>
      </div></div>`;
    const sel = $('#w1-demo', host);
    const list = [['starrynight', '고흐 · 별이 빛나는 밤'], ['mondrian', '몬드리안 · 구성'], ['seurat', '쇠라 · 점묘'], ['rothko', '로스코 · 색면'], ['kandinsky', '칸딘스키 · 구성']];
    sel.innerHTML = list.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    const cv = $('#w1-cv', host), ctx = cv.getContext('2d', { willReadFrequently: true });
    function load() {
      const demo = ImageAnalysis.generateDemo(sel.value, cv.width, cv.height);
      ctx.drawImage(demo, 0, 0, cv.width, cv.height);
    }
    sel.addEventListener('change', load);
    let logged = false;
    function readAt(cx, cy) {
      const r = cv.getBoundingClientRect();
      const x = Math.floor((cx - r.left) / r.width * cv.width), y = Math.floor((cy - r.top) / r.height * cv.height);
      if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return;
      const d = ctx.getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
      const p = ctx.getImageData(x, y, 1, 1).data;
      let grid = '';
      for (let j = 0; j < 5; j++) {
        grid += '<div>';
        for (let i = 0; i < 5; i++) {
          const k = (j * 5 + i) * 4;
          grid += `<span style="background:rgb(${d[k]},${d[k + 1]},${d[k + 2]})" title="${d[k]},${d[k + 1]},${d[k + 2]}"></span>`;
        }
        grid += '</div>';
      }
      const L = Math.round(0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]);
      $('#w1-out', host).innerHTML = `
        <div class="lit-swatch" style="background:rgb(${p[0]},${p[1]},${p[2]})"></div>
        <table class="lit-kv"><tr><td>위치</td><td>(${x}, ${y})</td></tr>
          <tr><td>빨강 R</td><td><b>${p[0]}</b> / 255</td></tr>
          <tr><td>초록 G</td><td><b>${p[1]}</b> / 255</td></tr>
          <tr><td>파랑 B</td><td><b>${p[2]}</b> / 255</td></tr>
          <tr><td>밝기</td><td>${L} <span class="muted">(0.299R+0.587G+0.114B)</span></td></tr></table>
        <p class="muted" style="font-size:11.5px;margin:8px 0 4px">이 점 둘레 5×5 픽셀입니다. 눈에는 한 색이지만 숫자는 제각각이에요</p>
        <div class="lit-grid">${grid}</div>`;
      if (!logged && global.Log) { logged = true; Log.push({ stage: 'sense', action: 'analyze', payload: { ch: 1, demo: sel.value } }); }
    }
    cv.addEventListener('mousemove', e => readAt(e.clientX, e.clientY));
    cv.addEventListener('touchmove', e => { e.preventDefault(); readAt(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    load();
  };

  /* --- 2장 · K를 밀며 사라지는 색 보기 --- */
  W.ch2 = function (host) {
    host.innerHTML = `<div class="lit-widget">
      <div class="lit-row">
        <select id="w2-demo" style="width:auto"></select>
        <label style="flex:1;min-width:200px;display:flex;gap:8px;align-items:center;font-size:12.5px">
          K <input id="w2-k" type="range" min="1" max="24" value="8" style="flex:1"> <b id="w2-kv" style="width:26px">8</b>
        </label>
      </div>
      <div class="lit-2col" style="margin-top:10px">
        <div><span class="muted" style="font-size:11.5px">원본</span><canvas id="w2-a" width="300" height="225" class="lit-cv"></canvas></div>
        <div><span class="muted" style="font-size:11.5px">K개로 요약</span><canvas id="w2-b" width="300" height="225" class="lit-cv"></canvas></div>
      </div>
      <div id="w2-pal" class="lit-pal"></div>
      <div id="w2-msg" class="lit-msg"></div></div>`;
    const sel = $('#w2-demo', host);
    sel.innerHTML = [['starrynight', '별이 빛나는 밤'], ['monet', '인상, 해돋이'], ['seurat', '점묘'], ['mondrian', '구성'], ['hokusai', '파도']]
      .map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    let src = null, uniq = 0, timer = null;
    function loadSrc() {
      src = ImageAnalysis.generateDemo(sel.value, 480, 360);
      const a = $('#w2-a', host); a.getContext('2d').drawImage(src, 0, 0, a.width, a.height);
      // 원본이 가진 '서로 다른 색'의 대략 수(5비트로 뭉뚱그려 셈)
      const d = a.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, a.width, a.height).data;
      const set = new Set();
      for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 3) * 1024 + (d[i + 1] >> 3) * 32 + (d[i + 2] >> 3));
      uniq = set.size;
      run();
    }
    let logged = false;
    function run() {
      if (!src) return;
      const K = +$('#w2-k', host).value;
      $('#w2-kv', host).textContent = K;
      const r = Algos.kmeansArt(src, { K, space: 'rgb', seed: 12345 });
      const b = $('#w2-b', host), bc = b.getContext('2d');
      bc.clearRect(0, 0, b.width, b.height); bc.drawImage(r.recreate, 0, 0, b.width, b.height);
      $('#w2-pal', host).innerHTML = r.palette.map(p =>
        `<span style="background:rgb(${p[0]},${p[1]},${p[2]})" title="rgb(${p[0]},${p[1]},${p[2]})"></span>`).join('');
      const lost = Math.max(0, uniq - K);
      $('#w2-msg', host).innerHTML = `원본에는 서로 다른 색이 <b>약 ${uniq.toLocaleString()}가지</b> 있었어요.
        지금은 <b>${K}가지</b>로 말하고 있으니, <b>${lost.toLocaleString()}가지</b>를 버린 셈입니다
        (${Math.round(K / uniq * 1000) / 10}%만 남김).<br>
        <span class="muted">K를 1까지 내려 보세요. 그림은 사라지고 ‘평균색’ 한 장만 남습니다. 그것도 하나의 해석이에요.</span>`;
      if (!logged && global.Log) { logged = true; Log.push({ stage: 'sense', action: 'analyze', payload: { ch: 2, K } }); }
    }
    sel.addEventListener('change', loadSrc);
    $('#w2-k', host).addEventListener('input', () => { $('#w2-kv', host).textContent = $('#w2-k', host).value; clearTimeout(timer); timer = setTimeout(run, 90); });
    loadSrc();
  };

  /* --- 3장 · 같은 조건으로 5회 생성 --- */
  W.ch3 = function (host) {
    host.innerHTML = `<div class="lit-widget">
      <div class="lit-row">
        <label style="font-size:12.5px">조건(프롬프트) <select id="w3-p" style="width:auto">
          <option value="sunset">“따뜻한 노을의 추상화”</option>
          <option value="ocean">“차가운 바다의 추상화”</option>
          <option value="forest">“깊은 숲의 추상화”</option></select></label>
        <label style="font-size:12.5px;display:flex;gap:8px;align-items:center">개성(온도)
          <input id="w3-t" type="range" min="0" max="100" value="25" style="width:120px"> <b id="w3-tv">0.25</b></label>
        <button class="btn sm primary" id="w3-go">5번 만들기</button>
      </div>
      <div class="lit-gen" id="w3-out"></div>
      <div id="w3-msg" class="lit-msg"></div></div>`;
    const PROMPT = {
      sunset: { base: [[248, 176, 92], [232, 108, 74], [120, 62, 96], [58, 36, 74]], name: '노을' },
      ocean: { base: [[40, 92, 150], [72, 152, 186], [16, 44, 88], [206, 226, 232]], name: '바다' },
      forest: { base: [[36, 78, 52], [92, 132, 62], [22, 44, 34], [186, 176, 118]], name: '숲' }
    };
    // 시드 난수(재현 가능): '같은 조건, 다른 시드'가 곧 생성 모델의 무작위성 자리
    function rngOf(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function generate(kind, seed, temp) {
      const cv = document.createElement('canvas'); cv.width = 200; cv.height = 150;
      const ctx = cv.getContext('2d'), rnd = rngOf(seed), P = PROMPT[kind].base;
      // temp(온도)만큼 '학습된 평균 팔레트'에서 흔들린다. 온도가 낮으면 결과가 서로 닮는다
      const jit = (c) => c.map(v => Math.max(0, Math.min(255, Math.round(v + (rnd() - 0.5) * 255 * temp))));
      const pal = P.map(jit);
      const g = ctx.createLinearGradient(0, 0, cv.width * (0.4 + rnd() * 0.6), cv.height);
      g.addColorStop(0, `rgb(${pal[0]})`); g.addColorStop(0.55, `rgb(${pal[1]})`); g.addColorStop(1, `rgb(${pal[3]})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < 26; i++) {
        const c = pal[Math.floor(rnd() * pal.length)];
        ctx.globalAlpha = 0.18 + rnd() * 0.4; ctx.fillStyle = `rgb(${c})`;
        ctx.beginPath(); ctx.ellipse(rnd() * cv.width, rnd() * cv.height, 8 + rnd() * 46, 6 + rnd() * 30, rnd() * 3.2, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return cv;
    }
    $('#w3-t', host).addEventListener('input', e => $('#w3-tv', host).textContent = (e.target.value / 100).toFixed(2));
    $('#w3-go', host).addEventListener('click', () => {
      const kind = $('#w3-p', host).value, temp = +$('#w3-t', host).value / 100;
      const out = $('#w3-out', host); out.innerHTML = '';
      const cvs = [];
      for (let i = 0; i < 5; i++) {
        const cv = generate(kind, 1000 + i * 7919, temp);
        const wrap = document.createElement('div'); wrap.className = 'lit-genitem';
        wrap.appendChild(cv); const cap = document.createElement('span'); cap.textContent = (i + 1) + '회'; wrap.appendChild(cap);
        out.appendChild(wrap); cvs.push(cv);
      }
      const sigs = cvs.map(c => Metrics.signatureOf(c)).filter(Boolean);
      let sum = 0, pairs = 0;
      for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++) { sum += Metrics.cosine(sigs[i], sigs[j]); pairs++; }
      const idx = Math.round(sum / pairs * 100);
      $('#w3-msg', host).innerHTML = `다섯 결과의 서로 닮음 정도: <b style="font-size:18px;color:var(--accent)">${idx}</b> / 100<br>
        ${idx >= 85 ? '거의 같은 그림이라 해도 될 만큼 닮았어요. <b>무작위였는데도</b> 결과는 평균 근처에 모입니다.'
          : idx >= 65 ? '조금씩 다르지만 한 식구처럼 보이죠. 확률적 생성의 <b>중력</b>이 평균 쪽으로 작용합니다.'
          : '개성(온도)을 높이니 흩어졌어요. 대신 “조건에 맞는가”는 점점 흔들립니다. <b>맞바꿈</b>이에요.'}<br>
        <span class="muted">개성(온도)을 올렸다 내렸다 하며 다시 만들어 보세요.</span>`;
      if (global.Log) Log.push({ stage: 'judge', action: 'analyze', payload: { ch: 3, temp, index: idx } });
    });
    $('#w3-go', host).click();
  };

  /* --- 4장 · 우리 반 유사도 --- */
  W.ch4 = function (host) {
    host.innerHTML = `<div class="lit-widget">
      <button class="btn sm primary" id="w4-go">우리 반 작품 재 보기</button>
      <div id="w4-out" class="lit-msg"><span class="muted">전시된 작품이 2점 이상이면 잴 수 있어요.</span></div></div>`;
    $('#w4-go', host).addEventListener('click', async () => {
      const out = $('#w4-out', host);
      out.innerHTML = '<div class="spinner"></div> 재는 중…';
      const works = await Store.listWorks();
      const r = await Metrics.similarity(works.filter(w => w.consent !== false));
      if (r.index == null) { out.innerHTML = '아직 비교할 작품이 부족해요(썸네일 있는 작품 2점 이상 필요). 먼저 전시해 보세요.'; return; }
      out.innerHTML = `우리 반 유사도 지수 <b style="font-size:22px;color:var(--accent)">${r.index}</b> / 100
        <span class="muted">(작품 ${r.n}점 · ${r.pairs}쌍 비교)</span><br>
        ${r.index >= 70 ? '매우 닮았어요. 대부분 <b>기본값·자동 추천을 그대로</b> 썼을 가능성이 큽니다.'
          : r.index >= 50 ? '어느 정도 닮았어요. 무리를 이룬 작품과 혼자 떨어진 작품을 견주어 보세요.'
          : '서로 꽤 다릅니다. 각자의 선택이 살아 있다는 신호예요.'}
        <div class="lit-out3">${r.outliers.map((o, i) => `<div class="lit-outitem">
          ${o.work.thumb ? `<img src="${o.work.thumb}">` : ''}
          <b>비전형 ${i + 1}</b><span>${esc(o.work.title || '작품')} · ${esc(o.work.by || '')}</span>
          <span class="muted">평균 유사도 ${Math.round(o.avg * 100)}</span></div>`).join('')}</div>
        <p class="muted" style="font-size:11.5px;margin-top:8px">평균에서 멀다는 건 <b>틀렸다</b>는 뜻이 아니에요. 그 작품은 무엇을 다르게 골랐을까요?</p>`;
      if (global.Log) Log.push({ stage: 'judge', action: 'ab_switch', payload: { ch: 4, index: r.index, n: r.n } });
    });
  };

  /* --- 5장 · 무엇을 셀 것인가(신체측정) --- */
  W.ch5 = function (host) {
    // 예시 데이터(가상): 이름 대신 번호만: 데이터에도 익명을 적용한다는 것을 보여 주는 장치
    const PEOPLE = [
      { id: 1, h: 158, arm: 68, sit: 84, foot: 235 }, { id: 2, h: 172, arm: 75, sit: 90, foot: 262 },
      { id: 3, h: 165, arm: 71, sit: 87, foot: 245 }, { id: 4, h: 181, arm: 80, sit: 95, foot: 275 },
      { id: 5, h: 149, arm: 63, sit: 79, foot: 225 }, { id: 6, h: 168, arm: 73, sit: 88, foot: 250 },
      { id: 7, h: 176, arm: 77, sit: 92, foot: 268 }, { id: 8, h: 162, arm: 69, sit: 85, foot: 240 },
      { id: 9, h: 155, arm: 66, sit: 82, foot: 232 }, { id: 10, h: 190, arm: 84, sit: 99, foot: 288 }
    ];
    const FIELD = { h: '키(cm)', arm: '팔 길이(cm)', sit: '앉은키(cm)', foot: '발 길이(mm)' };
    host.innerHTML = `<div class="lit-widget">
      <p class="muted" style="font-size:12.5px;margin:0 0 8px">우리 반 10명(가상)의 몸 치수예요. <b>무엇을 기준으로</b> ‘표준 책상’을 만들지 골라 보세요.</p>
      <div class="lit-row">
        ${Object.keys(FIELD).map((k, i) => `<label class="lit-chk"><input type="checkbox" data-f="${k}" ${i === 0 ? 'checked' : ''}> ${FIELD[k]}</label>`).join('')}
        <label class="lit-chk"><input type="checkbox" id="w5-trim"> 양 끝값(가장 크고 작은 사람) 빼기</label>
        <label style="font-size:12.5px;display:flex;gap:6px;align-items:center">허용 오차 ±<input id="w5-tol" type="range" min="2" max="15" value="5" style="width:90px"><b id="w5-tolv">5</b>%</label>
      </div>
      <div id="w5-out" class="lit-msg"></div></div>`;
    let logged = false;
    function run() {
      const fields = [...host.querySelectorAll('[data-f]')].filter(c => c.checked).map(c => c.dataset.f);
      const tol = +$('#w5-tol', host).value; $('#w5-tolv', host).textContent = tol;
      const out = $('#w5-out', host);
      if (!fields.length) { out.innerHTML = '<b>아무것도 세지 않기로 했어요.</b> 그러면 기준도 없습니다. 무엇을 셀지 고르는 일이 곧 첫 번째 선택이에요.'; return; }
      let people = PEOPLE.slice();
      if ($('#w5-trim', host).checked) {
        const by = fields[0];
        people = people.slice().sort((a, b) => a[by] - b[by]).slice(1, -1);
      }
      const mean = {}; fields.forEach(f => mean[f] = people.reduce((s, p) => s + p[f], 0) / people.length);
      // '표준'에 드는 사람 = 고른 항목이 모두 평균 ±tol% 안
      const fits = PEOPLE.filter(p => fields.every(f => Math.abs(p[f] - mean[f]) / mean[f] * 100 <= tol));
      const outs = PEOPLE.filter(p => !fits.includes(p));
      out.innerHTML = `기준: ${fields.map(f => `<b>${FIELD[f]} ${mean[f].toFixed(1)}</b>`).join(' · ')}
        ${$('#w5-trim', host).checked ? '<span class="muted">(양 끝값 2명을 빼고 계산)</span>' : ''}<br>
        이 ‘표준 책상’에 <b>맞는 사람 ${fits.length}명</b> · <b style="color:var(--danger)">맞지 않는 사람 ${outs.length}명</b>
        <div class="lit-people">${PEOPLE.map(p => `<span class="${fits.includes(p) ? 'fit' : 'unfit'}" title="키 ${p.h} · 팔 ${p.arm} · 앉은키 ${p.sit} · 발 ${p.foot}">${p.id}번</span>`).join('')}</div>
        <p class="muted" style="font-size:11.5px;margin-top:8px">항목을 늘릴수록, 오차를 줄일수록 <b>‘표준’에서 밀려나는 사람이 늘어납니다.</b>
          양 끝값을 빼면 숫자는 깔끔해지지만, 빠진 두 사람은 <b>없는 사람</b>이 됩니다. 데이터를 다듬는 일은 늘 이 대가를 치릅니다.</p>`;
      if (!logged && global.Log) { logged = true; Log.push({ stage: 'judge', action: 'critique_write', payload: { ch: 5, fields, tol } }); }
    }
    host.querySelectorAll('[data-f], #w5-trim').forEach(c => c.addEventListener('change', run));
    $('#w5-tol', host).addEventListener('input', run);
    run();
  };

  /* --- 6장 · 자료 점검 --- */
  W.ch6 = function (host) {
    host.innerHTML = `<div class="lit-widget"><div id="w6-out"><div class="spinner"></div> 내 작품을 살펴보는 중…</div>
      <div class="lit-row" style="margin-top:10px">
        <label class="lit-chk"><input type="checkbox" data-v="age"> 사용한 AI 서비스의 <b>연령·약관 조건</b>을 확인했다</label>
        <label class="lit-chk"><input type="checkbox" data-v="portrait"> 사람이 나온 사진은 <b>본인의 허락</b>을 받았다</label>
        <label class="lit-chk"><input type="checkbox" data-v="license"> 생성물의 <b>이용 범위</b>(수업·전시)를 확인했다</label>
      </div>
      <div id="w6-msg" class="lit-msg"></div></div>`;
    (async function () {
      const u = global.Auth && Auth.current();
      const out = $('#w6-out', host);
      if (!u) { out.innerHTML = '<span class="muted">로그인하면 내 작품의 자료를 자동으로 점검해요.</span>'; return; }
      const works = (await Store.listWorks({ userId: u.userId })) || [];
      if (!works.length) { out.innerHTML = '<span class="muted">아직 전시한 작품이 없어요. 작품을 만들면 여기서 자동 점검됩니다.</span>'; return; }
      out.innerHTML = `<table class="data" style="font-size:12.5px"><thead><tr><th>작품</th><th>출처 표기</th><th>사진 원본</th><th>의도</th><th>근거</th></tr></thead><tbody>` +
        works.map(w => {
          const src = (w.meta && w.meta.source) || w.dataName || '';
          const ok = (v) => v ? '<span style="color:var(--good)">✅</span>' : '<span style="color:var(--danger)">✗</span>';
          return `<tr><td>${esc(w.title || '작품')}</td><td>${src ? esc(String(src).slice(0, 24)) : ok(false)}</td>
            <td>${w.srcImg || w.thumb ? '있음' : '없음'}</td><td>${ok(!!(w.intent || '').trim())}</td><td>${ok(!!(w.evidence || '').trim())}</td></tr>`;
        }).join('') + '</tbody></table>' +
        `<p class="muted" style="font-size:11.5px;margin:8px 0 0">✗ 가 있는 칸은 스튜디오의 ‘윤리·리포트 정보’에서 지금 채울 수 있어요.</p>`;
    })();
    let logged = false;
    host.querySelectorAll('[data-v]').forEach(c => c.addEventListener('change', () => {
      const n = [...host.querySelectorAll('[data-v]')].filter(x => x.checked).length;
      $('#w6-msg', host).innerHTML = n === 3
        ? '<b>세 가지를 모두 확인했어요.</b> 확인하는 습관이 곧 창작자의 태도입니다.'
        : `확인 ${n}/3. 남은 항목은 서비스의 <b>이용약관·개인정보 처리방침</b>에서 찾을 수 있어요.`;
      if (n === 3 && !logged && global.Log) { logged = true; Log.push({ stage: 'own', action: 'note_save', payload: { ch: 6, checked: 3 } }); }
    }));
  };

  /* --- 7장 · 창작 진술문 --- */
  W.ch7 = function (host) {
    host.innerHTML = `<div class="lit-widget">
      <label class="field">어느 작품의 진술문인가요?</label>
      <select id="w7-work" style="width:auto;min-width:240px"><option value="">작품을 고르세요</option></select>
      <label class="field" style="margin-top:10px">창작 진술문 (150자)</label>
      <textarea id="w7-txt" rows="4" maxlength="150" placeholder="예: 나는 아빠의 코골이 소리를 데이터로 삼았다. 소음이 아니라 곁에 있다는 증거로 들리게 하려고, 큰 소리일수록 점을 크고 느리게 만들었다. 가족을 다시 듣는 일이 나에게는 그림이었다."></textarea>
      <div class="lit-row"><span class="muted" id="w7-cnt" style="font-size:11.5px">0 / 150자</span>
        <button class="btn sm primary" id="w7-go">진술문 저장 · 작품에 붙이기</button></div>
      <div id="w7-msg" class="lit-msg"></div></div>`;
    const sel = $('#w7-work', host), ta = $('#w7-txt', host);
    let works = [];
    (async function () {
      const u = global.Auth && Auth.current();
      if (!u) { $('#w7-msg', host).innerHTML = '<span class="muted">로그인하면 내 작품에 진술문을 붙일 수 있어요.</span>'; return; }
      works = (await Store.listWorks({ userId: u.userId })) || [];
      sel.innerHTML = '<option value="">작품을 고르세요</option>' +
        works.map(w => `<option value="${w.id}">${esc(w.title || '작품')}</option>`).join('');
      sel.addEventListener('change', () => {
        const w = works.find(x => x.id === sel.value);
        if (w && w.statement) { ta.value = w.statement; count(); }
      });
    })();
    function count() { $('#w7-cnt', host).textContent = ta.value.length + ' / 150자'; }
    ta.addEventListener('input', count);
    $('#w7-go', host).addEventListener('click', async () => {
      const txt = ta.value.trim();
      if (txt.length < 30) { UI.toast('30자 이상 적어 주세요. 진술문은 작품의 목소리예요.'); return; }
      const u = global.Auth && Auth.current();
      if (!u) { UI.toast('로그인이 필요합니다.'); return; }
      const w = works.find(x => x.id === sel.value);
      if (w) { w.statement = txt; await Store.saveWork(w); }
      await Store.saveNote({ ...(window.WS && WS.stampOf ? WS.stampOf() : {}), userId: u.userId, by: u.display, kind: 'statement', title: '창작 진술문' + (w ? ' · ' + (w.title || '') : ''), line: txt });
      if (global.Log) Log.push({ stage: 'own', action: 'reflect_submit', workId: w ? w.id : null, payload: { ch: 7, len: txt.length } });
      $('#w7-msg', host).innerHTML = w
        ? '<b>저장했어요.</b> 이 진술문은 작품 페이지와 포트폴리오에 함께 표시됩니다.'
        : '<b>작업노트에 저장했어요.</b> 작품을 고르면 그 작품에도 함께 붙습니다.';
      UI.toast('창작 진술문을 저장했습니다.');
    });
  };

  /* ============================ 페이지 조립 ============================ */
  function render() {
    const host = document.getElementById('lit-root');
    const saved = answers();
    host.innerHTML = CH.map(c => `
      <section class="card lit-ch" id="${c.id}">
        <div class="lit-head"><span class="lit-n">${c.n}</span>
          <div><h3 style="margin:0">${c.title}</h3><span class="muted" style="font-size:12.5px">${c.lead}</span></div></div>
        <div class="lit-read">${c.read}</div>
        ${c.note ? `<p class="callout warn" style="font-size:12px"><span class="ic">⚠️</span><div>${c.note}</div></p>` : ''}
        <div class="lit-tasklabel">🖐 해 보기 · ${c.task}</div>
        <div class="lit-host" id="host-${c.id}"></div>
        <div class="lit-answer">
          <label class="field">✍ 한 줄 답하기: ${c.ask}</label>
          <div class="lit-row"><input type="text" id="ans-${c.id}" value="${esc(saved[c.id] || '')}" placeholder="한 문장으로">
            <button class="btn sm" data-save="${c.id}">기록</button></div>
        </div>
      </section>`).join('');

    CH.forEach(c => { try { W[c.id](document.getElementById('host-' + c.id)); } catch (e) { console.warn('[literacy] ' + c.id, e); } });

    host.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.save, c = CH.find(x => x.id === id);
      const v = document.getElementById('ans-' + id).value.trim();
      if (v.length < 4) { UI.toast('한 문장만 적어 주세요.'); return; }
      const a = answers(); a[id] = v; saveAns(a);
      const u = global.Auth && Auth.current();
      if (u) {
        await Store.saveNote({ ...(window.WS && WS.stampOf ? WS.stampOf() : {}), userId: u.userId, by: u.display, kind: 'literacy',
          title: `리터러시 ${c.n}장 · ${c.title}`, line: v });
      }
      if (global.Log) await Log.push({ stage: c.stage, action: 'coach_answer', payload: { ch: c.n, len: v.length } });
      UI.toast(`${c.n}장의 한 줄을 기록했어요.`);
      renderProgress();
    }));
    renderProgress();
    if (location.hash) { const el = document.querySelector(location.hash); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
  }

  function renderProgress() {
    const a = answers(), done = CH.filter(c => a[c.id]).length;
    document.getElementById('lit-progress').innerHTML = `
      <div class="lit-prog"><div style="width:${Math.round(done / CH.length * 100)}%"></div></div>
      <span class="muted" style="font-size:12px">${done} / ${CH.length}장 · 한 줄 답하기 완료</span>
      ${done === CH.length ? ' <b style="color:var(--good)">모두 마쳤어요!</b> <a href="portfolio.html">→ 내 포트폴리오에서 보기</a>' : ''}`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (global.Log) Log.view('sense');
    render();
    if (global.UI && UI.mountIdeaBar) UI.mountIdeaBar('idea', 'learn');
  });

  global.Literacy = { CH, answers };
})(window);
