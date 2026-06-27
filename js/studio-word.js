/*
 * studio-word.js — 「작가의 말을 그림으로」 · 자연어 분석 → 낱말 구름 → 굿즈
 * -----------------------------------------------------------------------------
 * 수업 파이프라인을 코드로:
 *   글(감상문·작가 정보) → 토큰화/불용어/조사 다듬기 → 낱말 빈도(자연어 분석)
 *        → 빈도를 글자 '크기'로
 *        → 글자 '색'은 그림의 대표색(K-means)·비율 순으로 (analysis.js + kmeans.js 재사용)
 *        → 낱말을 '모양 틀'(원·하트·글자·업로드 실루엣…)에 격자 충돌검사 + 나선 배치로 채우고
 *        → 엽서·카드·책갈피 같은 '실생활 굿즈'로 합성·인쇄(PNG) 내보내기
 *
 * 색·전시·저장·코치는 사이트 공용 모듈(store.js·coach.js·ui.js)을 그대로 쓴다.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => (window.UI ? UI.escapeHTML(s) : String(s));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ===================== 작가 글 예시(감상문·작가 정보) ===================== */
  // painting = analysis.js의 PAINTINGS 키(있으면 색을 자동으로 가져옴). 없으면 업로드 안내.
  const ARTISTS = {
    gogh: { name: '빈센트 반 고흐', caption: '소용돌이치는 밤하늘의 화가', painting: 'starrynight',
      text: '고흐의 별이 빛나는 밤은 밤하늘을 가만히 두지 않는다. 별은 소용돌이치고, 달은 불타오르며, 하늘 전체가 거대한 물결처럼 흐른다. 짧고 두꺼운 붓질이 층층이 쌓여 별빛은 노랗게 번지고 하늘은 깊은 파랑으로 출렁인다. 사이프러스 나무는 검은 불꽃처럼 하늘로 솟구치고, 마을은 고요히 잠들어 있다. 고흐는 눈에 보이는 풍경이 아니라 마음속에서 요동치는 감정을 그렸다. 외로움과 불안, 그러나 동시에 세상을 향한 뜨거운 사랑이 별빛 속에 함께 담겨 있다. 노랑과 파랑, 별과 어둠, 고요와 격정이 한 화면에서 부딪치며 밤은 살아 움직인다. 이 그림 앞에서 우리는 밤하늘을 새롭게, 떨리는 마음으로 다시 바라보게 된다.' },
    monet: { name: '클로드 모네', caption: '빛과 물의 인상', painting: 'monet',
      text: '모네의 인상, 해돋이는 항구의 새벽을 흐릿한 빛으로 감싼다. 형태는 또렷하지 않고, 물 위에는 주황빛 해가 번지며 안개 낀 하늘과 바다가 부드럽게 섞인다. 모네는 사물의 윤곽보다 그 위에 내려앉은 빛과 색의 인상을 그렸다. 잔물결마다 빛이 부서지고, 작은 배들은 푸른 안개 속에 실루엣으로 떠 있다. 순간의 빛, 순간의 공기, 순간의 색. 모네에게 중요한 것은 변하지 않는 형태가 아니라 시시각각 달라지는 빛의 떨림이었다. 따뜻한 주황과 차가운 파랑이 만나 새벽의 공기는 촉촉하게 흐른다. 우리는 이 그림에서 풍경을 보는 것이 아니라, 빛이 물 위에서 태어나는 그 순간을 함께 호흡한다.' },
    seurat: { name: '조르주 쇠라', caption: '점으로 쌓은 빛', painting: 'seurat',
      text: '쇠라의 그랑드자트섬의 일요일 오후는 수많은 색점으로 이루어져 있다. 가까이 보면 무수한 점이지만, 멀리서 보면 점들은 우리 눈 안에서 섞여 하나의 빛나는 풍경이 된다. 쇠라는 색을 팔레트에서 섞지 않고, 순수한 색점을 나란히 찍어 보는 사람의 눈이 색을 섞게 했다. 잔디의 초록, 양산의 흰빛, 강물의 파랑이 점점이 어우러진다. 평화로운 일요일 오후, 사람들은 멈춘 듯 고요하고 시간은 천천히 흐른다. 점묘는 곧 색의 군집화다. 빛을 분석하고, 색을 나누고, 다시 모아 질서 있는 화면으로 쌓아 올린 쇠라의 점들은 과학이면서 동시에 시였다.' },
    hokusai: { name: '가쓰시카 호쿠사이', caption: '거대한 파도와 후지산', painting: 'hokusai',
      text: '호쿠사이의 가나가와 해변의 높은 파도는 거대한 파랑의 파도가 하늘을 집어삼킬 듯 솟구치는 순간을 담는다. 파도의 끝은 날카로운 손톱처럼 갈라지고, 그 아래 작은 배와 사람들은 자연의 힘 앞에 한없이 작아 보인다. 멀리 후지산은 흔들림 없이 고요하게 서 있다. 거센 파도와 고요한 산, 움직임과 멈춤이 한 화면에서 강렬하게 맞선다. 짙은 파랑과 흰 물거품, 곡선과 직선이 만들어 내는 긴장은 보는 이의 마음을 단숨에 사로잡는다. 호쿠사이는 자연의 두려움과 아름다움을 동시에 보여 준다. 파도는 위협이면서 동시에 눈부시게 아름답다.' },
    klimt: { name: '구스타프 클림트', caption: '황금빛 입맞춤', painting: 'klimt',
      text: '클림트의 키스는 황금빛으로 빛나는 사랑의 순간이다. 두 연인은 금박과 화려한 무늬에 감싸여 하나로 녹아든다. 남자의 옷에는 단단한 사각의 무늬가, 여자의 옷에는 둥근 꽃무늬가 흐른다. 금빛은 사랑을 영원하고 신성한 것으로 끌어올리고, 꽃밭은 두 사람을 부드럽게 받쳐 준다. 화려한 장식 속에서도 여자의 얼굴은 평온하고 깊은 감정에 잠겨 있다. 클림트는 장식과 관능, 황금과 색채를 결합해 사랑의 황홀함을 표현했다. 빛나는 금, 따뜻한 색, 섬세한 무늬가 어우러져 입맞춤의 순간은 시간이 멈춘 듯 영원해진다.' },
    munch: { name: '에드바르 뭉크', caption: '불안의 절규', painting: 'scream',
      text: '뭉크의 절규는 인간의 불안과 공포를 가장 솔직하게 드러낸 그림이다. 다리 위의 인물은 두 손으로 얼굴을 감싸고 입을 벌린 채 비명을 지른다. 하늘은 핏빛 주황과 붉은 물결로 일렁이고, 풍경 전체가 인물의 내면처럼 휘어진다. 곡선으로 흐르는 하늘과 강물은 멈추지 않는 불안의 떨림을 닮았다. 뒤편의 두 사람은 무심히 걸어가고, 인물은 홀로 거대한 불안 속에 갇혀 있다. 뭉크는 보이는 풍경이 아니라 마음의 비명을 그렸다. 강렬한 색과 일그러진 선은 현대인이 느끼는 고독과 두려움을 시대를 넘어 우리에게 전한다.' },
    vermeer: { name: '요하네스 베르메르', caption: '진주의 고요한 빛', painting: 'pearl',
      text: '베르메르의 진주 귀고리를 한 소녀는 어두운 배경 속에서 한 줄기 빛으로 떠오른다. 소녀는 어깨 너머로 고개를 돌려 우리를 바라보고, 그 눈빛에는 말로 다 할 수 없는 고요한 감정이 담겨 있다. 푸른 터번과 노란 옷이 차분하게 빛나고, 귓가의 진주는 부드러운 빛을 머금는다. 베르메르는 빛을 다루는 데 천재였다. 진주 위의 작은 반짝임, 입술의 촉촉한 광택, 피부에 스며든 부드러운 명암이 소녀를 살아 숨 쉬게 한다. 화려하지 않은 색과 단순한 구도 속에서, 소녀의 시선은 오래도록 마음에 남는 깊은 여운을 남긴다.' },
    hockney: { name: 'David Hockney', caption: '빛과 물, 평면의 색면 (그림은 직접 올리세요)', painting: 'monet',
      text: '데이비드 호크니의 수영장 그림은 캘리포니아의 눈부신 빛과 물의 반짝임을 평면적인 색면으로 담는다. 물결은 단순한 흰 곡선으로 그려지고, 수영장의 청록은 맑고 시원하다. 호크니는 사진처럼 정밀하게 그리기보다, 빛과 색과 공간을 자기만의 명랑한 언어로 재구성한다. 강렬한 햇살, 깨끗한 색채, 평온한 일상. 그의 그림에는 따뜻한 낙관과 즐거움이 흐른다. 물과 빛, 색과 평면, 일상과 환희가 만나 호크니의 화면은 언제나 밝고 경쾌하다. 그는 보는 즐거움 그 자체를 그림으로 만들었다.' },
    kahlo: { name: 'Frida Kahlo', caption: '고통과 자아의 초상 (그림은 직접 올리세요)', painting: 'klimt',
      text: '프리다 칼로는 자신의 고통과 삶을 정면으로 그린 화가다. 그녀의 자화상에는 강렬한 눈빛과 진한 눈썹, 멕시코의 화려한 색과 식물, 동물이 가득하다. 칼로는 사고로 인한 평생의 고통과 사랑의 상처를 숨기지 않고 캔버스에 새겼다. 붉은 꽃, 푸른 잎, 강렬한 색채는 고통 속에서도 꺾이지 않는 생명력을 보여 준다. 그녀의 그림은 아름다우면서도 아프고, 화려하면서도 슬프다. 프리다 칼로는 자신의 진실을 그림으로써, 여성과 자아와 정체성에 대한 가장 솔직하고 용감한 목소리를 남겼다.' },
    picasso: { name: 'Pablo Picasso', caption: '형태를 해체한 시선 (그림은 직접 올리세요)', painting: 'kandinsky',
      text: '피카소는 하나의 사물을 여러 각도에서 동시에 보는 새로운 시선을 그림에 들여왔다. 입체주의 그림 속 얼굴과 사물은 조각조각 해체되고 다시 조립되어, 정면과 옆면이 한 화면에 함께 나타난다. 피카소는 평생 끊임없이 변화하며 청색 시대의 우울, 장미 시대의 따뜻함, 입체주의의 분석을 거쳐 갔다. 직선과 곡선, 분할된 면, 대담한 색은 세상을 보는 익숙한 방식을 무너뜨린다. 피카소에게 그림은 보이는 대로 그리는 것이 아니라, 생각하고 해체하고 재구성하는 일이었다.' }
  };

  /* ===================== 불용어 · 조사 ===================== */
  const STOP_KO = new Set(('그리고 그러나 하지만 그래서 그런데 또한 또 즉 및 등 의 가 이 은 는 을 를 에 와 과 도 만 로 으로 에서 에게 까지 부터 한 그 저 이런 그런 저런 것 수 때 더 매우 아주 너무 정말 가장 잘 못 안 좀 또는 처럼 보다 위해 통해 대한 대해 위한 듯 채 뿐 만큼 같이 같은 어떤 무슨 모든 여러 우리 그것 이것 저것').split(/\s+/));
  const STOP_EN = new Set('the a an and or but of to in on at for with is are was were be been being it its this that these those as by from he she his her they them their you your i we our not no yes do does did has have had will would can could should may might must so if then than too very just about into out up down over under more most some any all each its it\'s'.split(/\s+/));
  // 한국어 조사·어미 어림 제거(형태소 분석기 없이) — 끝에서 '긴 것부터' 떼어 본다.
  // 1글자 조사(이·가·은·는…)는 '고양이→고양'처럼 명사를 망가뜨릴 위험이 커, 아래 토큰화에서
  // '근거가 있을 때만'(같은 어간이 따로 등장하거나 여러 형태로 변할 때) 떼어 낸다.
  const PARTICLES = ['으로써', '으로서', '이라는', '이라고', '에서는', '에서도', '에게서', '라는', '라고', '으로', '로서', '로써', '에서', '에게', '한테', '까지', '부터', '마다', '조차', '처럼', '보다', '이다', '에는', '에도', '이나', '거나', '은', '는', '이', '가', '을', '를', '에', '의', '도', '만', '로', '와', '과', '요', '고'];

  /* ===================== 상태 ===================== */
  const BG = { paper: [244, 239, 227], white: [255, 255, 255], cream: [251, 247, 236], ink: [17, 32, 63], black: [10, 10, 12] };
  const FONTS = {
    sans: { weight: 800, family: '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif' },
    serif: { weight: 700, family: 'Georgia,"Nanum Myeongjo","Noto Serif KR","Apple SD Gothic Neo",serif' },
    round: { weight: 700, family: '"Apple SD Gothic Neo","Pretendard","Noto Sans KR",system-ui,sans-serif' },
    mono: { weight: 700, family: 'ui-monospace,"D2Coding",Menlo,Consolas,"Noto Sans KR",monospace' }
  };
  const DEFAULT_PALETTE = [
    { r: 31, g: 59, b: 110, ratio: 0.3 }, { r: 47, g: 122, b: 168, ratio: 0.22 },
    { r: 143, g: 192, b: 181, ratio: 0.18 }, { r: 201, g: 154, b: 64, ratio: 0.16 },
    { r: 122, g: 31, b: 18, ratio: 0.14 }
  ];

  const state = {
    rawText: '', allWords: [], words: [],            // allWords=전체 빈도, words=상위 N
    palette: DEFAULT_PALETTE.slice(), K: 8, paintingTitle: '', srcThumb: '', srcImg: '',
    colors: [],                                       // words 인덱스별 글자색(hex)
    placed: [], layoutW: 1000, layoutH: 1414,         // 배치 결과 + 배치 캔버스 크기
    colorMode: 'rank', mono: '#1f3b6e', bg: 'paper', contrast: true,
    shape: 'rect', letter: '', maskImg: null, ratio: 1.414, pad: 2, rotate: false, font: 'sans',
    scale: 'sqrt', minFont: 16, maxFont: 120, maxWords: 120, minLen: 2,
    particle: true, useStop: true, extraStop: [],
    seed: 12345, product: 'postcard', view: 'cloud', side: 'front',
    name: '', caption: ''
  };

  /* ===================== 토큰화 · 빈도(자연어 분석) ===================== */
  // 한 낱말의 '어간 후보' — 끝에서 가장 긴 조사 하나를 떼어 본다. p=뗀 조사(없으면 null).
  function candidateStem(tok) {
    if (!state.particle || !/[가-힣]/.test(tok)) return { stem: tok, p: null };
    for (const p of PARTICLES) {
      if (tok.length > p.length + 1 && tok.endsWith(p)) return { stem: tok.slice(0, -p.length), p };
    }
    return { stem: tok, p: null };
  }
  function tokenize(text) {
    const extra = new Set(state.extraStop);
    const toks = (text || '').toLowerCase().split(/[^0-9a-zÀ-ɏ가-힣]+/i).filter(Boolean);

    // 1패스 — '어림 형태소 정규화'의 근거 모으기.
    //   2글자 이상 조사(으로·에서·처럼…)는 명사와 겹칠 위험이 낮아 그대로 떼고,
    //   1글자 조사(이·가·은…)는 어간이 '믿을 만할 때만' 떼어 명사 훼손(고양이→고양)을 막는다.
    //   믿을 만함 = 어간이 그 자체로도 등장(빛 ↔ 빛이) 또는 두 가지 이상 형태로 변함(빛이·빛을·빛은).
    const rawSet = new Set(toks);
    const stemForms = new Map();                      // 어간 → 등장한 표면형 집합
    toks.forEach(t => { const { stem, p } = candidateStem(t); if (p) { if (!stemForms.has(stem)) stemForms.set(stem, new Set()); stemForms.get(stem).add(t); } });
    const trusted = stem => rawSet.has(stem) || ((stemForms.get(stem) || new Set()).size >= 2);

    // 2패스 — 정규화 후 빈도 세기
    const counts = new Map();
    for (const t of toks) {
      const { stem, p } = candidateStem(t);
      let word = t;
      if (p && (p.length >= 2 || trusted(stem))) word = stem;
      if (word.length < state.minLen) continue;
      if (/^\d+$/.test(word)) continue;              // 순수 숫자 제외
      if (state.useStop && (STOP_KO.has(word) || STOP_EN.has(word))) continue;
      if (extra.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([w, c]) => ({ w, c })).sort((a, b) => b.c - a.c);
  }
  function analyzeText() {
    state.rawText = $('#ta-text').value || '';
    state.allWords = tokenize(state.rawText);
    state.words = state.allWords.slice(0, state.maxWords);
    recolor();                                       // 현재 낱말 집합에 맞춰 색을 먼저 계산(범례 색이 맞도록)
    renderLegend();
    const total = state.allWords.reduce((s, x) => s + x.c, 0);
    $('#word-stat').textContent = state.allWords.length
      ? `서로 다른 낱말 ${state.allWords.length}개 · 전체 ${total}회 · 상위 ${state.words.length}개 사용`
      : '분석할 낱말이 없어요. 글을 더 입력해 보세요.';
    layout();
  }

  /* ===================== 그림 색(대표색 K·비율) ===================== */
  function analyzePalette(canvas, title) {
    try {
      const res = ImageAnalysis.analyze(canvas, { K: state.K, space: 'lab', sampling: 'uniform', N: 1200, seed: state.seed });
      state.palette = res.palette;                   // 비율 내림차순 정렬됨
    } catch (e) { state.palette = DEFAULT_PALETTE.slice(); }
    _srcCanvas = canvas;
    state.paintingTitle = title || state.paintingTitle;
    state.srcThumb = thumbOf(canvas, 360);
    state.srcImg = thumbOf(canvas, 720);
    renderPalette();
    $('#paint-stat').textContent = (state.paintingTitle ? state.paintingTitle + ' · ' : '') + '대표색 ' + state.palette.length + '개 추출(비율 순)';
    recolor(); renderLegend(); render();
  }
  function loadPaintingByKey(key) {
    if (!key) return;
    busy(true);
    ImageAnalysis.loadPainting(key, (cv, title) => { busy(false); analyzePalette(cv, title); }, () => {});
  }
  function thumbOf(canvas, w) {
    const h = Math.round(w * canvas.height / canvas.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(canvas, 0, 0, w, h);
    try { return c.toDataURL('image/jpeg', 0.72); } catch (e) { return ''; }
  }
  function renderPalette() {
    const host = $('#palette'); if (!host) return;
    host.innerHTML = state.palette.map(p =>
      `<div class="sw" style="background:rgb(${p.r},${p.g},${p.b})" title="비율 ${Math.round((p.ratio || 0) * 100)}%"><small>${Math.round((p.ratio || 0) * 100)}</small></div>`).join('');
  }

  /* ===================== 색 입히기(빈도↔비율 매칭) ===================== */
  function hex(r, g, b) { return '#' + [r, g, b].map(v => clamp(v | 0, 0, 255).toString(16).padStart(2, '0')).join(''); }
  function lum(r, g, b) { return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
  function adjustContrast(c) {
    if (!state.contrast) return c;
    const bg = BG[state.bg], bl = lum(bg[0], bg[1], bg[2]);
    let r = c.r, g = c.g, b = c.b, tries = 0;
    while (Math.abs(lum(r, g, b) - bl) < 0.24 && tries < 8) {
      if (bl > 0.5) { r *= 0.78; g *= 0.78; b *= 0.78; }      // 밝은 배경 → 글자 어둡게
      else { r = r + (255 - r) * 0.28; g = g + (255 - g) * 0.28; b = b + (255 - b) * 0.28; } // 어두운 배경 → 밝게
      tries++;
    }
    return { r, g, b };
  }
  // 시드 난수(배치/가중색 재현)
  function rngFrom(seed) { return KMeans.makeRNG(seed >>> 0); }
  function recolor() {
    const n = state.words.length, pal = state.palette.length ? state.palette : DEFAULT_PALETTE;
    const K = pal.length;
    const rng = rngFrom(state.seed + 777);
    // 비율 가중 누적분포(weighted 모드)
    const cdf = []; let acc = 0; pal.forEach(p => { acc += (p.ratio || 0.001); cdf.push(acc); });
    state.colors = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 0 : i / (n - 1);            // 0=가장 빈도 높음
      let c;
      if (state.colorMode === 'weighted') {
        const r = rng() * acc; let k = 0; while (k < K - 1 && cdf[k] < r) k++; c = pal[k];
      } else if (state.colorMode === 'dominant') {
        const k = t < 0.34 ? 0 : t < 0.67 ? 1 : 2; c = pal[Math.min(K - 1, k)];
      } else if (state.colorMode === 'mono') {
        const m = hexToRgb(state.mono);              // 빈도 높을수록 진하게
        const f = 0.45 + (1 - t) * 0.55;             // 0.45~1.0
        c = { r: m.r * f + 255 * (1 - f) * 0.12, g: m.g * f + 255 * (1 - f) * 0.12, b: m.b * f + 255 * (1 - f) * 0.12 };
      } else {                                        // rank(기본): 빈도 순위 ↔ 비율 순위
        const k = Math.min(K - 1, Math.floor(t * K)); c = pal[k];
      }
      const a = adjustContrast(c);
      state.colors[i] = hex(a.r, a.g, a.b);
    }
  }
  function hexToRgb(h) { h = String(h || '#888').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }

  /* ===================== 모양 틀(마스크) ===================== */
  function drawShapeMask(ctx, W, H) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    const cx = W / 2, cy = H / 2;
    if (state.shape === 'rect') {
      const m = Math.min(W, H) * 0.04; ctx.fillRect(m, m, W - 2 * m, H - 2 * m);
    } else if (state.shape === 'circle') {
      ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.46, H * 0.46, 0, 0, 7); ctx.fill();
    } else if (state.shape === 'triangle') {
      ctx.beginPath(); ctx.moveTo(cx, H * 0.06); ctx.lineTo(W * 0.95, H * 0.94); ctx.lineTo(W * 0.05, H * 0.94); ctx.closePath(); ctx.fill();
    } else if (state.shape === 'heart') {
      const s = Math.min(W, H) * 0.46; ctx.save(); ctx.translate(cx, cy - s * 0.18); heartPath(ctx, s); ctx.fill(); ctx.restore();
    } else if (state.shape === 'star') {
      starPath(ctx, cx, cy, Math.min(W, H) * 0.48, Math.min(W, H) * 0.20, 5); ctx.fill();
    } else if (state.shape === 'letter') {
      const ch = (state.letter || 'A').slice(0, 3);
      let fs = H * 0.8; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fam = '900 ' + fs + 'px ' + FONTS.sans.family;
      ctx.font = fam;
      let w = ctx.measureText(ch).width;
      if (w > W * 0.92) { fs *= (W * 0.92) / w; ctx.font = '900 ' + fs + 'px ' + FONTS.sans.family; }
      ctx.fillText(ch, cx, cy + fs * 0.02);
    } else if (state.shape === 'upload' && state.maskImg) {
      // 업로드 실루엣: 어둡거나 불투명한 영역을 틀로. contain 배치.
      const img = state.maskImg, sc = Math.min(W * 0.92 / img.width, H * 0.92 / img.height);
      const dw = img.width * sc, dh = img.height * sc;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      // 어두운/불투명 영역만 흰색으로 환원
      const id = ctx.getImageData(0, 0, W, H), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const on = d[i + 3] > 40 && lum(d[i], d[i + 1], d[i + 2]) < 0.62;
        d[i] = d[i + 1] = d[i + 2] = on ? 255 : 0; d[i + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
    } else {
      const m = Math.min(W, H) * 0.04; ctx.fillRect(m, m, W - 2 * m, H - 2 * m);
    }
  }
  function heartPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(s * 0.02, s * 0.0, s * 0.5, -s * 0.05, s * 0.5, s * 0.32);
    ctx.bezierCurveTo(s * 0.5, s * 0.62, s * 0.12, s * 0.78, 0, s);
    ctx.bezierCurveTo(-s * 0.12, s * 0.78, -s * 0.5, s * 0.62, -s * 0.5, s * 0.32);
    ctx.bezierCurveTo(-s * 0.5, -s * 0.05, -s * 0.02, s * 0.0, 0, s * 0.35);
    ctx.closePath();
  }
  function starPath(ctx, cx, cy, R, r, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const rad = i % 2 ? r : R, a = (i * Math.PI / n) - Math.PI / 2;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  // 마스크 → 격자 허용표(allowed) + 중심
  function buildGrid(W, H, cell) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    drawShapeMask(ctx, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
    const allowed = new Uint8Array(cols * rows);
    let sx = 0, sy = 0, cnt = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = Math.min(W - 1, c * cell + (cell >> 1)), y = Math.min(H - 1, r * cell + (cell >> 1));
      const i = (y * W + x) * 4;
      if (px[i] > 128) { allowed[r * cols + c] = 1; sx += c; sy += r; cnt++; }
    }
    const cx = cnt ? (sx / cnt) * cell : W / 2, cy = cnt ? (sy / cnt) * cell : H / 2;
    return { allowed, cols, rows, cell, cx, cy, cnt };
  }

  /* ===================== 배치(나선 + 격자 충돌) ===================== */
  let _tmp = document.createElement('canvas');
  let _tctx = _tmp.getContext('2d', { willReadFrequently: true });
  let _srcCanvas = null;                            // 마지막으로 색을 분석한 그림(명화·업로드) — K 변경 시 재분석
  function fontStr(size) { const f = FONTS[state.font] || FONTS.sans; return f.weight + ' ' + size + 'px ' + f.family; }

  // 한 낱말의 스프라이트(차지하는 격자 셀, 패딩 팽창 포함)
  function spriteCells(text, size, rot, cell, pad) {
    _tctx.font = fontStr(size);
    const w0 = Math.max(2, Math.ceil(_tctx.measureText(text).width));
    const h0 = Math.max(2, Math.ceil(size * 1.18));
    const sw = rot ? h0 : w0, sh = rot ? w0 : h0;          // 스프라이트 픽셀 크기(회전 반영)
    _tmp.width = sw; _tmp.height = sh;
    _tctx.clearRect(0, 0, sw, sh);
    _tctx.fillStyle = '#fff'; _tctx.textAlign = 'center'; _tctx.textBaseline = 'middle';
    _tctx.font = fontStr(size);
    if (rot) { _tctx.save(); _tctx.translate(sw / 2, sh / 2); _tctx.rotate(-Math.PI / 2); _tctx.fillText(text, 0, 0); _tctx.restore(); }
    else _tctx.fillText(text, sw / 2, sh / 2);
    const d = _tctx.getImageData(0, 0, sw, sh).data;
    const scols = Math.ceil(sw / cell), srows = Math.ceil(sh / cell);
    const on = new Uint8Array(scols * srows);
    for (let r = 0; r < srows; r++) for (let c = 0; c < scols; c++) {
      let hit = 0;
      const x1 = Math.min(sw, (c + 1) * cell), y1 = Math.min(sh, (r + 1) * cell);
      for (let y = r * cell; y < y1 && !hit; y += 2) for (let x = c * cell; x < x1; x += 2) {
        if (d[(y * sw + x) * 4 + 3] > 50) { hit = 1; break; }
      }
      if (hit) on[r * scols + c] = 1;
    }
    // 패딩 팽창
    const cells = [];
    if (pad > 0) {
      const dil = new Uint8Array(scols * srows);
      for (let r = 0; r < srows; r++) for (let c = 0; c < scols; c++) {
        if (!on[r * scols + c]) continue;
        for (let dr = -pad; dr <= pad; dr++) for (let dc = -pad; dc <= pad; dc++) {
          const nr = r + dr, nc = c + dc; if (nr < 0 || nc < 0 || nr >= srows || nc >= scols) continue;
          dil[nr * scols + nc] = 1;
        }
      }
      for (let r = 0; r < srows; r++) for (let c = 0; c < scols; c++) if (dil[r * scols + c]) cells.push([c, r]);
    } else {
      for (let r = 0; r < srows; r++) for (let c = 0; c < scols; c++) if (on[r * scols + c]) cells.push([c, r]);
    }
    return { cells, sw, sh, scols, srows };
  }

  function layout() {
    if (!state.words.length) { state.placed = []; render(); return; }
    busy(true);
    // 비동기로 한 틱 양보(스피너 표시)
    setTimeout(() => { try { layoutCore(); } finally { busy(false); render(); } }, 16);
  }
  function layoutCore() {
    const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    const ratio = state.ratio;
    const LW = 1000, LH = Math.round(1000 * ratio);
    state.layoutW = LW; state.layoutH = LH;
    const cell = clamp(Math.round(Math.min(LW, LH) / 170), 4, 8);
    const grid = buildGrid(LW, LH, cell);
    const occ = new Uint8Array(grid.cols * grid.rows);
    const rng = rngFrom(state.seed);

    // 빈도 → 글자 크기
    const ws = state.words, maxC = ws[0].c, minC = ws[ws.length - 1].c, rangeC = (maxC - minC) || 1;
    const sizeOf = (c) => {
      if (maxC === minC) return Math.round((state.minFont + state.maxFont) * 0.5); // 빈도가 모두 같으면 중간 크기
      let t = (c - minC) / rangeC;                  // 0~1
      if (state.scale === 'sqrt') t = Math.sqrt(t);
      else if (state.scale === 'log') t = Math.log(1 + (c - minC)) / Math.log(1 + rangeC);
      return Math.round(state.minFont + (state.maxFont - state.minFont) * t);
    };

    const placed = [];
    const budget = 1600;                            // ms 안전 예산
    for (let i = 0; i < ws.length; i++) {
      const word = ws[i].w;
      let size = sizeOf(ws[i].c);
      const rot = state.rotate && rng() < 0.32;
      let ok = false, attempt = 0;
      while (!ok && attempt < 3 && size >= state.minFont * 0.7) {
        const sp = spriteCells(word, size, rot, cell, state.pad);
        const found = spiralPlace(sp, grid, occ, cell, rng);
        if (found) {
          // 점유 표시
          for (const [dc, dr] of sp.cells) occ[(found.or + dr) * grid.cols + (found.oc + dc)] = 1;
          placed.push({
            idx: i, text: word, size, rot,
            cx: found.oc * cell + sp.sw / 2, cy: found.or * cell + sp.sh / 2
          });
          ok = true;
        } else { size = Math.round(size * 0.82); attempt++; }
      }
      const now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (now - t0 > budget) { /* 예산 초과 → 나머지 작은 낱말은 생략 */ break; }
    }
    state.placed = placed;
    const skipped = ws.length - placed.length;
    $('#word-stat').textContent = `상위 ${ws.length}개 중 ${placed.length}개 배치` + (skipped > 0 ? ` · ${skipped}개는 틀이 좁아 생략(틀을 키우거나 낱말 수를 줄여 보세요)` : '');
    recolor(); renderLegend();
  }
  // 나선 탐색: 마스크 중심에서 바깥으로 돌며 빈 자리를 찾는다.
  function spiralPlace(sp, grid, occ, cell, rng) {
    const cols = grid.cols, rows = grid.rows;
    const maxR = Math.max(cols, rows) * cell * 0.62;
    let a = rng() * Math.PI * 2, r = 0;
    const dirSign = rng() < 0.5 ? 1 : -1;
    let guard = 0;
    while (r < maxR && guard < 5000) {
      guard++;
      const px = grid.cx + r * Math.cos(a), py = grid.cy + r * Math.sin(a);
      const oc = Math.round((px - sp.sw / 2) / cell), or = Math.round((py - sp.sh / 2) / cell);
      if (fits(sp, grid, occ, oc, or)) return { oc, or };
      a += dirSign * (0.20 + r * 0.0008); r += cell * 0.12;
    }
    return null;
  }
  function fits(sp, grid, occ, oc, or) {
    const cols = grid.cols, rows = grid.rows, allowed = grid.allowed;
    for (const [dc, dr] of sp.cells) {
      const c = oc + dc, rr = or + dr;
      if (c < 0 || rr < 0 || c >= cols || rr >= rows) return false;
      const k = rr * cols + c;
      if (!allowed[k] || occ[k]) return false;
    }
    return true;
  }

  /* ===================== 그리기 ===================== */
  function bgCss(name) { const c = BG[name] || BG.paper; return `rgb(${c[0]},${c[1]},${c[2]})`; }
  // 배치 좌표를 (rx,ry,rw,rh) 사각형에 contain으로 그린다.
  function paintCloudInto(ctx, rx, ry, rw, rh) {
    if (!state.placed.length) return;
    const sc = Math.min(rw / state.layoutW, rh / state.layoutH);
    const cw = state.layoutW * sc, ch = state.layoutH * sc;
    const ox = rx + (rw - cw) / 2, oy = ry + (rh - ch) / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of state.placed) {
      const x = ox + p.cx * sc, y = oy + p.cy * sc, size = p.size * sc;
      ctx.fillStyle = state.colors[p.idx] || '#333';
      ctx.font = fontStr(size);
      if (p.rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 2); ctx.fillText(p.text, 0, 0); ctx.restore(); }
      else ctx.fillText(p.text, x, y);
    }
  }

  // 전체 미리보기 갱신
  function render() {
    const cv = $('#wcanvas'); if (!cv) return;
    if (state.view === 'goods') drawProduct(cv);
    else {
      cv.width = state.layoutW; cv.height = state.layoutH;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = bgCss(state.bg); ctx.fillRect(0, 0, cv.width, cv.height);
      paintCloudInto(ctx, 0, 0, cv.width, cv.height);
    }
    syncStageBar();
  }

  /* ===================== 굿즈(실생활용품) ===================== */
  function productSize() {
    if (state.product === 'bookmark') return { w: 520, h: 1480 };
    if (state.product === 'sticker') return { w: 1100, h: 1100 };
    return { w: 1040, h: 1468 };                    // 엽서/카드(세로 100x140 비율 근사)
  }
  function drawProduct(cv) {
    const { w, h } = productSize();
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    if (state.product === 'postcard') (state.side === 'back' ? postcardBack : postcardFront)(ctx, w, h);
    else if (state.product === 'card') cardFront(ctx, w, h);
    else if (state.product === 'bookmark') bookmark(ctx, w, h);
    else stickerR(ctx, w, h);
  }
  function paperFill(ctx, w, h) { ctx.fillStyle = bgCss(state.bg); ctx.fillRect(0, 0, w, h); }
  function darkInk() { const c = BG[state.bg]; return lum(c[0], c[1], c[2]) > 0.5 ? '#2a2f3a' : '#e9eef7'; }
  function footerText(ctx, w, h, yTop) {
    const ink = darkInk();
    if (state.name) { ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = '800 ' + Math.round(w * 0.052) + 'px ' + FONTS.serif.family; ctx.fillText(clipText(ctx, state.name, w * 0.86), w / 2, yTop + h * 0.052); }
    if (state.caption) { ctx.fillStyle = ink; ctx.globalAlpha = 0.72; ctx.font = '500 ' + Math.round(w * 0.026) + 'px ' + FONTS.sans.family; ctx.fillText(clipText(ctx, state.caption, w * 0.86), w / 2, yTop + h * 0.052 + Math.round(w * 0.046)); ctx.globalAlpha = 1; }
  }
  function clipText(ctx, t, maxW) { if (ctx.measureText(t).width <= maxW) return t; let s = t; while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }
  function postcardFront(ctx, w, h) {
    paperFill(ctx, w, h);
    const m = w * 0.06;
    paintCloudInto(ctx, m, m, w - 2 * m, h * 0.82 - m);
    footerText(ctx, w, h, h * 0.84);
  }
  function postcardBack(ctx, w, h) {
    const c = BG.white; ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(0, 0, w, h);
    const ink = '#33384a', light = '#c8cedb';
    ctx.strokeStyle = light; ctx.lineWidth = 2;
    // 중앙 세로 분할선
    ctx.beginPath(); ctx.moveTo(w * 0.52, h * 0.08); ctx.lineTo(w * 0.52, h * 0.92); ctx.stroke();
    // 왼쪽: 메시지 줄
    ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.font = '700 ' + Math.round(w * 0.03) + 'px ' + FONTS.sans.family;
    ctx.fillText('MESSAGE', w * 0.08, h * 0.12);
    ctx.strokeStyle = light;
    for (let i = 0; i < 9; i++) { const y = h * 0.18 + i * h * 0.066; ctx.beginPath(); ctx.moveTo(w * 0.08, y); ctx.lineTo(w * 0.46, y); ctx.stroke(); }
    // 오른쪽: 우표칸 + 주소 줄
    ctx.strokeStyle = light; ctx.strokeRect(w * 0.82, h * 0.10, w * 0.12, h * 0.075);
    ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'center'; ctx.font = '600 ' + Math.round(w * 0.016) + 'px ' + FONTS.sans.family;
    ctx.fillText('STAMP', w * 0.88, h * 0.142);
    ctx.strokeStyle = light;
    for (let i = 0; i < 5; i++) { const y = h * 0.30 + i * h * 0.060; ctx.beginPath(); ctx.moveTo(w * 0.58, y); ctx.lineTo(w * 0.94, y); ctx.stroke(); }
    ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.font = '700 ' + Math.round(w * 0.024) + 'px ' + FONTS.sans.family;
    ctx.fillText('TO.', w * 0.58, h * 0.285);
    // 오른쪽 아래: 원본 그림 미니 + 캡션
    if (state.srcThumb) drawMini(ctx, state.srcThumb, w * 0.58, h * 0.66, w * 0.36, h * 0.24);
  }
  function drawMini(ctx, url, x, y, mw, mh) {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(mw / img.width, mh / img.height), dw = img.width * sc, dh = img.height * sc;
      ctx.drawImage(img, x + (mw - dw) / 2, y, dw, dh);
      ctx.strokeStyle = '#d6dbe6'; ctx.lineWidth = 2; ctx.strokeRect(x + (mw - dw) / 2, y, dw, dh);
      if (state.paintingTitle) { ctx.fillStyle = '#8a93a6'; ctx.textAlign = 'left'; ctx.font = '500 ' + Math.round(mw * 0.066) + 'px ' + FONTS.sans.family; ctx.fillText(clipText(ctx, state.paintingTitle, mw), x + (mw - dw) / 2, y + dh + Math.round(mw * 0.09)); }
    };
    img.src = url;
  }
  function cardFront(ctx, w, h) {
    paperFill(ctx, w, h);
    // 접는 카드 표지: 가는 테두리 + 구름
    ctx.strokeStyle = darkInk(); ctx.globalAlpha = 0.18; ctx.lineWidth = 3; ctx.strokeRect(w * 0.045, w * 0.045, w - w * 0.09, h - w * 0.09); ctx.globalAlpha = 1;
    const m = w * 0.10;
    paintCloudInto(ctx, m, m, w - 2 * m, h * 0.80 - m);
    footerText(ctx, w, h, h * 0.83);
  }
  function bookmark(ctx, w, h) {
    paperFill(ctx, w, h);
    ctx.strokeStyle = darkInk(); ctx.globalAlpha = 0.16; ctx.lineWidth = 3; ctx.strokeRect(w * 0.08, w * 0.08, w - w * 0.16, h - w * 0.16); ctx.globalAlpha = 1;
    paintCloudInto(ctx, w * 0.10, w * 0.12, w * 0.80, h * 0.80);
    if (state.name) { ctx.save(); ctx.translate(w * 0.5, h * 0.95); ctx.fillStyle = darkInk(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 ' + Math.round(w * 0.10) + 'px ' + FONTS.serif.family; ctx.fillText(clipText(ctx, state.name, h * 0.8), 0, 0); ctx.restore(); }
  }
  function stickerR(ctx, w, h) {
    paperFill(ctx, w, h);
    ctx.save(); ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.47, 0, 7); ctx.clip();
    paintCloudInto(ctx, w * 0.08, h * 0.08, w * 0.84, h * 0.84);
    ctx.restore();
    ctx.strokeStyle = darkInk(); ctx.globalAlpha = 0.25; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.47, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  }

  /* ===================== 범례 ===================== */
  function renderLegend() {
    const host = $('#wlegend'); if (!host) return;
    if (!state.words.length) { host.innerHTML = ''; return; }
    const top = state.words.slice(0, 22);
    host.innerHTML = top.map((x, i) =>
      `<span class="wchip"><i style="background:${state.colors[i] || '#888'}"></i><b>${esc(x.w)}</b> <small>${x.c}</small></span>`).join('');
  }

  /* ===================== 무대 바 동기화 ===================== */
  function syncStageBar() {
    $('#side-seg').style.display = (state.view === 'goods' && state.product === 'postcard') ? 'inline-flex' : 'none';
    document.querySelectorAll('#view-seg button').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
    document.querySelectorAll('#side-seg button').forEach(b => b.classList.toggle('on', b.dataset.side === state.side));
  }

  /* ===================== 내보내기 / 저장 ===================== */
  function busy(on) { const b = $('#wbusy'); if (b) b.classList.toggle('on', !!on); }
  function exportProduct(side) {
    const prev = { view: state.view, side: state.side };
    state.view = 'goods'; state.side = side;
    const cv = document.createElement('canvas');
    drawProduct(cv);
    // 뒷면 미니 그림은 비동기 로드라, 한 박자 뒤 저장
    setTimeout(() => {
      const a = document.createElement('a'); a.download = 'goods_' + state.product + '_' + side + '_' + Date.now() + '.png';
      try { a.href = cv.toDataURL('image/png'); a.click(); UI.toast('인쇄용 PNG로 저장했어요(' + (side === 'back' ? '뒤' : '앞') + ').'); }
      catch (e) { UI.toast('저장에 실패했어요. 다른 브라우저로 시도해 보세요.'); }
      state.view = prev.view; state.side = prev.side;
    }, side === 'back' ? 220 : 0);
  }
  function saveImage() {
    const cv = $('#wcanvas');
    const a = document.createElement('a'); a.download = 'wordcloud_' + Date.now() + '.png';
    try { a.href = cv.toDataURL('image/png'); a.click(); UI.toast('이미지를 저장했어요.'); } catch (e) { UI.toast('저장 실패.'); }
  }
  function saveJSON() {
    const cfg = settings();
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.download = 'wordcloud_settings_' + Date.now() + '.json'; a.href = URL.createObjectURL(blob); a.click();
    UI.toast('설정(JSON)을 저장했어요.');
  }

  /* ===================== 코치 ===================== */
  function mdToHtml(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/\n/g, '<br>'); }
  async function coach() {
    UI.modal('🧭 감상 코치', '<div class="spinner"></div> 질문을 준비하는 중…', '답이 아니라 질문이에요');
    const topWords = state.words.slice(0, 5).map(x => x.w).join(', ');
    const res = await Coach.ask({
      kind: 'word', intent: $('#in-intent').value, dataName: state.name || $('#in-title').value,
      palette: state.palette, K: state.K, rules: '상위 낱말: ' + topWords
    });
    const note = res.source.indexOf('api') === 0 ? '실제 모델' : '오프라인 코치';
    UI.modal('🧭 감상 코치 <span class="badge">' + note + '</span>', '<div class="lvl-b">' + mdToHtml(res.text) + '</div>', '답이 아니라 질문이에요');
  }

  /* ===================== 저장 / 전시 ===================== */
  function settings() {
    const v = id => { const el = $('#' + id); return el ? el.value.trim() : ''; };
    return {
      text: state.rawText, words: state.words.slice(0, 60),
      palette: state.palette, K: state.K, paintingTitle: state.paintingTitle, srcImg: state.srcImg,
      colorMode: state.colorMode, mono: state.mono, bg: state.bg, contrast: state.contrast,
      shape: state.shape, letter: state.letter, ratio: state.ratio, pad: state.pad, rotate: state.rotate, font: state.font,
      scale: state.scale, minFont: state.minFont, maxFont: state.maxFont, maxWords: state.maxWords, minLen: state.minLen,
      seed: state.seed, product: state.product, name: v('in-name'), caption: v('in-caption'),
      title: v('in-title'), intent: v('in-intent'), evidence: v('in-evidence')
    };
  }
  function workThumb() {
    const prev = { view: state.view, side: state.side };
    state.view = 'goods'; state.side = 'front';
    const cv = document.createElement('canvas'); drawProduct(cv);
    const t = thumbOf(cv, 360);
    state.view = prev.view; state.side = prev.side;
    return t;
  }
  function requireUser() { const u = Auth.current(); if (!u) { UI.toast('로그인이 필요합니다.'); setTimeout(() => location.href = 'index.html?next=studio-word.html', 900); return null; } return u; }
  async function saveNote() {
    const u = requireUser(); if (!u) return;
    await Store.saveNote({ userId: u.userId, by: u.display, kind: 'word', title: ($('#in-title').value || state.name || '낱말 구름'), intent: $('#in-intent').value, evidence: $('#in-evidence').value, settings: settings() });
    UI.toast('작업노트에 저장했습니다.');
  }
  async function exhibit() {
    const u = requireUser(); if (!u) return;
    const intent = $('#in-intent').value.trim(), evidence = $('#in-evidence').value.trim();
    if (!intent || !evidence) { UI.toast('전시 전에 ‘의도 한 문장 + 근거 1개 이상’을 채워 주세요.'); return; }
    await Store.saveWork({
      userId: u.userId, by: u.display, klass: u.klass, kind: 'word',
      title: ($('#in-title').value || state.name || '낱말 구름'), intent, evidence,
      srcImg: state.srcImg, settings: settings(), thumb: workThumb(), exhibited: true
    });
    UI.toast('🎉 갤러리에 전시했습니다!');
  }

  /* ===================== UI 채우기 ===================== */
  function fillSelects() {
    const sa = $('#sel-artist');
    sa.innerHTML = '<option value="">— 직접 입력 —</option>' + Object.keys(ARTISTS).map(k => `<option value="${k}">${esc(ARTISTS[k].name)} · ${esc(ARTISTS[k].caption.split('(')[0].trim())}</option>`).join('');
    const sp = $('#sel-painting');
    const P = ImageAnalysis.PAINTINGS || {};
    sp.innerHTML = Object.keys(P).map(k => `<option value="${k}">${esc(P[k].title)}</option>`).join('');
  }

  /* ===================== 이벤트 ===================== */
  function bindRange(id, out, key, after) {
    const el = $('#' + id); if (!el) return;
    el.addEventListener('input', () => { const o = $('#' + out); if (o) o.textContent = el.value; });
    el.addEventListener('change', () => { state[key] = +el.value; if (after) after(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.UI) UI.mountIdeaBar('idea', 'word');
    fillSelects();

    // 기본 작가 글 + 그림 로드
    const first = 'gogh';
    $('#sel-artist').value = first;
    applyArtist(first, true);

    // 1) 텍스트
    $('#sel-artist').addEventListener('change', e => applyArtist(e.target.value, true));
    $('#btn-analyze').addEventListener('click', analyzeText);
    $('#btn-upload-txt').addEventListener('click', () => $('#txtfile').click());
    $('#txtfile').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#ta-text').value = r.result; analyzeText(); }; r.readAsText(f); });
    $('#btn-wiki').addEventListener('click', fetchWiki);
    bindRange('r-maxwords', 'o-maxwords', 'maxWords', analyzeText);
    bindRange('r-minlen', 'o-minlen', 'minLen', analyzeText);
    $('#chk-particle').addEventListener('change', e => { state.particle = e.target.checked; analyzeText(); });
    $('#chk-stop').addEventListener('change', e => { state.useStop = e.target.checked; analyzeText(); });
    $('#in-stop').addEventListener('change', e => { state.extraStop = e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean); analyzeText(); });

    // 2) 그림 색
    $('#sel-painting').addEventListener('change', e => loadPaintingByKey(e.target.value));
    $('#btn-upload-img').addEventListener('click', () => $('#imgfile').click());
    $('#imgfile').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.onload = () => { const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0); analyzePalette(cv, f.name.replace(/\.[^.]+$/, '')); }; img.src = URL.createObjectURL(f); });
    bindRange('r-k', 'o-k', 'K', () => { /* K는 색만 바꿈 → 같은 그림을 K로 재분석 */ if (_srcCanvas) analyzePalette(_srcCanvas, state.paintingTitle); else { recolor(); render(); renderLegend(); } });

    // 3) 색·배경 (가벼움: 재배치 없이 다시 칠하기)
    $('#sel-colormode').addEventListener('change', e => { state.colorMode = e.target.value; $('#mono-row').style.display = e.target.value === 'mono' ? 'flex' : 'none'; recolor(); render(); renderLegend(); });
    $('#in-mono').addEventListener('input', e => { state.mono = e.target.value; recolor(); render(); renderLegend(); });
    $('#sel-bg').addEventListener('change', e => { state.bg = e.target.value; recolor(); render(); renderLegend(); });
    $('#chk-contrast').addEventListener('change', e => { state.contrast = e.target.checked; recolor(); render(); renderLegend(); });

    // 4) 모양 틀 (무거움: 재배치)
    $('#sel-shape').addEventListener('change', e => { state.shape = e.target.value; $('#letter-row').style.display = e.target.value === 'letter' ? 'block' : 'none'; $('#upload-row').style.display = e.target.value === 'upload' ? 'block' : 'none'; layout(); });
    $('#in-letter').addEventListener('change', e => { state.letter = e.target.value; if (state.shape === 'letter') layout(); });
    $('#btn-upload-mask').addEventListener('click', () => $('#maskfile').click());
    $('#maskfile').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.onload = () => { state.maskImg = img; state.shape = 'upload'; $('#sel-shape').value = 'upload'; $('#upload-row').style.display = 'block'; layout(); }; img.src = URL.createObjectURL(f); });
    $('#sel-ratio').addEventListener('change', e => { state.ratio = +e.target.value; layout(); });
    bindRange('r-pad', 'o-pad', 'pad', layout);
    $('#chk-rotate').addEventListener('change', e => { state.rotate = e.target.checked; layout(); });
    $('#sel-font').addEventListener('change', e => { state.font = e.target.value; layout(); });

    // 5) 빈도→크기
    $('#sel-scale').addEventListener('change', e => { state.scale = e.target.value; layout(); });
    bindRange('r-minf', 'o-minf', 'minFont', layout);
    bindRange('r-maxf', 'o-maxf', 'maxFont', layout);

    // 6) 굿즈
    $('#sel-product').addEventListener('change', e => { state.product = e.target.value; const bb = $('#btn-png-back'); if (bb) { const pc = state.product === 'postcard'; bb.disabled = !pc; bb.title = pc ? '' : '뒷면은 엽서에만 있어요'; } if (state.view === 'goods') render(); });
    $('#in-name').addEventListener('input', e => { state.name = e.target.value; if (state.view === 'goods') render(); });
    $('#in-caption').addEventListener('input', e => { state.caption = e.target.value; if (state.view === 'goods') render(); });
    $('#btn-png-front').addEventListener('click', () => exportProduct('front'));
    $('#btn-png-back').addEventListener('click', () => exportProduct(state.product === 'postcard' ? 'back' : 'front'));
    $('#btn-json').addEventListener('click', saveJSON);

    // 무대 바
    document.querySelectorAll('#view-seg button').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.view; render(); }));
    document.querySelectorAll('#side-seg button').forEach(b => b.addEventListener('click', () => { state.side = b.dataset.side; render(); }));
    $('#btn-generate').addEventListener('click', () => { analyzeText(); });
    $('#btn-shuffle').addEventListener('click', () => { state.seed = (state.seed * 1103515245 + 12345) & 0x7fffffff; layout(); });

    // 8) 코치/저장/전시
    $('#btn-coach').addEventListener('click', coach);
    $('#btn-img').addEventListener('click', saveImage);
    $('#btn-note').addEventListener('click', saveNote);
    $('#btn-exhibit').addEventListener('click', exhibit);
  });

  function applyArtist(key, loadPaint) {
    const a = ARTISTS[key];
    if (!a) return;
    $('#ta-text').value = a.text;
    $('#in-name').value = a.name; state.name = a.name;
    $('#in-caption').value = a.caption.split('(')[0].trim(); state.caption = $('#in-caption').value;
    if (!$('#in-title').value) $('#in-title').value = a.name + ' — 감상으로 만든 낱말 구름';
    analyzeText();
    if (loadPaint && a.painting) { const sp = $('#sel-painting'); if (sp) sp.value = a.painting; loadPaintingByKey(a.painting); }
  }

  // 위키백과 요약 가져오기(선택·온라인). CORS 허용 공개 REST API. 실패 시 안내.
  function fetchWiki() {
    const name = (state.name || $('#in-name').value || '').trim();
    const q = prompt('위키백과에서 가져올 인물/작품 제목을 입력하세요(한국어):', name || '');
    if (!q) return;
    busy(true);
    const url = 'https://ko.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(q);
    fetch(url).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(j => {
        busy(false);
        const extra = j.extract || '';
        if (!extra) { UI.toast('요약을 찾지 못했어요. 글을 직접 붙여넣어 주세요.'); return; }
        const cur = $('#ta-text').value.trim();
        $('#ta-text').value = (cur ? cur + '\n\n' : '') + extra;
        if (!$('#in-name').value && j.title) { $('#in-name').value = j.title; state.name = j.title; }
        analyzeText();
        UI.toast('위키백과 요약을 가져와 덧붙였어요. 출처: 위키백과.');
      })
      .catch(() => { busy(false); UI.toast('가져오기 실패(오프라인/차단). 감상문을 직접 입력하면 똑같이 분석돼요.'); });
  }
})();
