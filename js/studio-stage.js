/*
 * studio-stage.js — 「라이브 렌즈」 · 관객을 읽는 실시간 미디어아트 무대
 * -----------------------------------------------------------------------------
 *  카메라(또는 사진)를 실시간으로 읽어, AI가 감지한 '내용'을 종류별로 '다르게' 표현한다.
 *    · 사람: 나이대(아이·청년·어른·노년)·감정(표정)·안경 여부로 다른 점·움직임
 *    · 동물: 종류별 색 + 활발한 무리 움직임
 *    · 사물: 차분한 점
 *  감지 = COCO-SSD(사람·동물·사물 80범주) + (선택) face-api(나이·성별·표정) + 안경 휴리스틱.
 *
 *  ▶ 윤리·프라이버시(이 수업의 핵심): 영상·얼굴은 '브라우저 안에서만' 처리하고 저장·전송하지 않는다.
 *    나이·감정·안경은 모두 '추정'이며 자주 틀린다(편향) — 그 오류조차 작품의 '비평거리'다.
 *
 *  ▶ 오프라인 안전: 모델 CDN이 막히거나 카메라가 없어도 '데모(가상 관객)'로 모든 연출이 살아 있다.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ----------------------------- 모델 CDN(지연 로드 + 폴백) ----------------------------- */
  const TF = ['https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', 'https://unpkg.com/@tensorflow/tfjs@4.22.0/dist/tf.min.js'];
  const SSD = ['https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js', 'https://unpkg.com/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js'];
  const FACE = ['https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js', 'https://unpkg.com/@vladmandic/face-api/dist/face-api.js'];
  const FACE_MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

  // COCO 동물·자주 나오는 사물 → 한국어
  const ANIMALS = { cat: '고양이', dog: '개', bird: '새', horse: '말', sheep: '양', cow: '소', elephant: '코끼리', bear: '곰', zebra: '얼룩말', giraffe: '기린' };
  const OBJECT_KO = {
    bicycle: '자전거', car: '자동차', motorcycle: '오토바이', bus: '버스', truck: '트럭', umbrella: '우산', backpack: '가방',
    handbag: '핸드백', tie: '넥타이', bottle: '병', cup: '컵', 'cell phone': '휴대폰', laptop: '노트북', book: '책',
    chair: '의자', couch: '소파', 'potted plant': '화분', tv: 'TV', clock: '시계', 'wine glass': '와인잔', 'teddy bear': '곰인형'
  };

  /* ----------------------------- 종류(kind)별 표현 프로필 ----------------------------- */
  // sub=한 대상이 만드는 하위 점 개수, baseR=기본 크기, speed=움직임 속도, spread=퍼지는 반경, hue=기본 색상
  const KINDS = {
    child: { ko: '아이', hue: 330, sub: 6, baseR: 6, speed: 2.2, spread: 30 },   // 밝고 통통, 다수
    youth: { ko: '청년', hue: 150, sub: 3, baseR: 12, speed: 1.4, spread: 22 },
    adult: { ko: '어른', hue: 205, sub: 2, baseR: 17, speed: 0.9, spread: 16 },
    elder: { ko: '노년', hue: 40, sub: 1, baseR: 30, speed: 0.45, spread: 10 },  // 크고 느린 금빛
    person: { ko: '사람', hue: 220, sub: 2, baseR: 16, speed: 1.0, spread: 18 },
    animal: { ko: '동물', hue: 18, sub: 5, baseR: 11, speed: 2.0, spread: 34 },
    object: { ko: '사물', hue: 265, sub: 1, baseR: 13, speed: 0.6, spread: 12 }
  };
  const EMO_KO = { neutral: '무표정', happy: '기쁨', sad: '슬픔', angry: '화남', surprised: '놀람', fearful: '두려움', disgusted: '싫음' };

  /* ----------------------------- 연출 사례(시나리오) ----------------------------- */
  // 학생이 '어떤 화면을 녹화해 어떤 작품으로'를 고를 수 있는 큐레이션된 미디어아트 사례.
  const SCENES = {
    ages: {
      name: '세대의 강', emoji: '🌊', bg: [6, 10, 22], trail: 0.16, behavior: 'river',
      desc: '카메라에 잡힌 사람들의 <b>나이</b>가 한 줄기 강물이 돼요. <b>노년</b>은 깊고 느린 금빛 큰 물줄기, <b>아이</b>는 빠르고 밝은 물보라처럼 위에서 튀어요. 여러 세대가 한 화면에 섞여 흐릅니다.',
      film: '여러 세대가 함께 있는 곳 — 명절 가족모임, 경로당 옆 놀이터, 시장. 할머니와 손주가 한 프레임에 들어오면 강이 가장 아름다워요.',
      map: '나이대 → 강의 깊이·색·속도 (노년=아래·느림·금빛 / 아이=위·빠름·분홍)'
    },
    animals: {
      name: '누가 누구를 보는가', emoji: '🐾', bg: [9, 16, 9], trail: 0.2, behavior: 'animals',
      desc: '사람과 <b>동물</b>이 같은 화면에. 동물이 감지되면 무대가 <b>야생의 색</b>으로 물들고, 동물의 점이 사람 주위를 <b>맴돌아요</b> — 보는 자와 보이는 자가 뒤집히는 순간.',
      film: '반려동물과 사람이 함께 있는 거실, 동물원 유리 너머, 길고양이가 있는 골목. 사람과 동물이 서로를 바라보는 장면.',
      map: '동물 → 종류별 색 + 빠른 공전(사람 주위를 맴돎) · 동물이 있으면 배경이 초록으로'
    },
    glasses: {
      name: '안경 너머', emoji: '👓', bg: [8, 8, 16], trail: 0.14, behavior: 'glasses',
      desc: '<b>안경 쓴 사람</b>만 또렷한 빛의 테로 빛나고, 나머지는 흐려져요. ‘본다는 것’, ‘렌즈를 낀다는 것’은 무엇일까요? (안경 감지는 픽셀로 ‘추정’ — 자주 틀려요. 그 오류도 이야기예요.)',
      film: '안경 쓴 사람과 안 쓴 사람이 섞인 교실·도서관. 누군가 안경을 썼다 벗었다 하는 장면이면 변화가 극적이에요.',
      map: '안경(추정) → 또렷한 흰 테 + 100% 선명 / 그 외 → 흐릿하게 12%'
    },
    weather: {
      name: '표정의 날씨', emoji: '⛅', bg: [10, 12, 22], trail: 0.12, behavior: 'weather',
      desc: '관객의 <b>표정(감정)</b>이 무대의 <b>날씨</b>가 돼요. 기쁨=맑은 빛이 위로, 슬픔=비처럼 아래로, 놀람=번쩍이는 펄스, 화남=붉게 요동. 모두의 표정이 모여 하늘을 만듭니다.',
      film: '거울 앞에서 표정을 바꿔 보는 사람, 함께 웃는 친구들, 영화를 보는 관객의 얼굴. (정밀 얼굴 분석을 켜야 표정이 읽혀요.)',
      map: '표정 → 색·움직임 (기쁨=상승·밝음 / 슬픔=하강·푸름 / 놀람=확 커짐 / 화남=붉은 진동)'
    },
    crowd: {
      name: '사라지는 군중', emoji: '👥', bg: [7, 8, 13], trail: 0.06, behavior: 'crowd',
      desc: '사람이 많을수록 점이 <b>빽빽이 차오르고</b>, 프레임을 떠나면 잔상으로 <b>천천히 소멸</b>해요. 도시의 밀집과 고독 — 머물던 자리의 온기가 서서히 식습니다.',
      film: '붐비는 복도·지하철·횡단보도, 그리고 같은 장소가 텅 비는 순간. 사람이 들고 나는 ‘흐름’이 보이는 곳.',
      map: '사람 수 → 밀도(많을수록 점↑) · 긴 잔상으로 떠난 자리가 천천히 사라짐'
    },
    together: {
      name: '혼자, 함께', emoji: '🤝', bg: [8, 10, 20], trail: 0.12, behavior: 'together',
      desc: '사람이 <b>혼자</b>면 점이 차갑게 식어 가장자리로 밀려나고, <b>여럿</b>이면 따뜻해지며 서로 빛의 <b>실</b>로 이어져요. 연결과 고립을 같은 화면에서.',
      film: '혼자 앉은 사람과, 모여 이야기하는 무리. 한 사람이 무리에 합류하거나 떠나는 순간이면 변화가 극적이에요.',
      map: '사람 수 → 온기·연결선 (혼자=차갑게 고립 / 여럿=따뜻하게 빛의 실로 이어짐)'
    },
    approach: {
      name: '다가오는 것', emoji: '🌗', bg: [10, 8, 16], trail: 0.14, behavior: 'approach',
      desc: '카메라에 <b>가까이</b> 올수록 그 점이 크고 또렷해져 화면을 지배하고, <b>멀수록</b> 작고 흐려져요. 관람자가 다가오는 만큼 작품이 그를 <b>중심으로 재편</b>됩니다.',
      film: '카메라를 향해 천천히 다가오거나 멀어지는 사람. 가까운 얼굴과 먼 배경이 함께 있는 장면.',
      map: '박스 크기(거리) → 점 크기·선명도 (가까울수록 크고 또렷, 멀수록 작고 흐림)'
    }
  };

  /* ----------------------------- 상태 ----------------------------- */
  const state = {
    scene: 'ages', faceOn: false, preview: true, mirror: true,
    live: false, demo: true
  };
  let cocoModel = null, faceReady = false, faceLoading = false;
  let stream = null, video = null, srcCanvas = null;
  let entities = [];            // 현재 감지된 대상들(정규화 좌표)
  let lastDetect = 0, detectBusy = false;
  let artCv = null, artCtx = null, raf = null;

  function setStatus(msg, kind) {
    const el = $('#stg-status'); if (!el) return;
    el.innerHTML = msg || '';
    el.className = 'muted' + (kind === 'warn' ? ' stg-warn' : '');
  }

  /* ----------------------------- 스크립트/모델 로드 ----------------------------- */
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load fail ' + src)); document.head.appendChild(s); }); }
  async function loadFirst(urls) { let err; for (const u of urls) { try { await loadScript(u); return; } catch (e) { err = e; } } throw (err || new Error('all CDNs failed')); }
  async function ensureCoco() {
    if (cocoModel) return cocoModel;
    if (!window.tf) await loadFirst(TF);
    if (!window.cocoSsd) await loadFirst(SSD);
    cocoModel = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
    return cocoModel;
  }
  async function ensureFace() {
    if (faceReady) return true;
    if (faceLoading) return false;
    faceLoading = true;
    try {
      if (!window.faceapi) await loadFirst(FACE);
      const F = window.faceapi;
      await F.nets.tinyFaceDetector.loadFromUri(FACE_MODELS);
      await F.nets.faceLandmark68Net.loadFromUri(FACE_MODELS);
      await F.nets.ageGenderNet.loadFromUri(FACE_MODELS);
      await F.nets.faceExpressionNet.loadFromUri(FACE_MODELS);
      faceReady = true; return true;
    } catch (e) { faceReady = false; throw e; }
    finally { faceLoading = false; }
  }

  /* ----------------------------- 감지 → 대상(entity) ----------------------------- */
  function kindForAge(age) { return age < 13 ? 'child' : age < 35 ? 'youth' : age < 55 ? 'adult' : 'elder'; }
  function hueForAnimal(cls) { let h = 0; for (let i = 0; i < cls.length; i++) h = (h * 33 + cls.charCodeAt(i)) % 360; return h; }

  // COCO 감지 박스 배열 → entity 배열(정규화). 사람/동물/사물로 분류.
  function cocoToEntities(dets, W, H) {
    const out = [];
    dets.forEach(d => {
      if (d.score < 0.45) return;
      const [bx, by, bw, bh] = d.bbox;
      const e = {
        cx: (bx + bw / 2) / W, cy: (by + bh / 2) / H, w: bw / W, h: bh / H,
        score: d.score, raw: d.class, ph: Math.random() * 6.283
      };
      if (d.class === 'person') { e.kind = 'person'; e.label = '사람'; }
      else if (ANIMALS[d.class]) { e.kind = 'animal'; e.label = ANIMALS[d.class]; e.hue = hueForAnimal(d.class); }
      else { e.kind = 'object'; e.label = OBJECT_KO[d.class] || d.class; }
      out.push(e);
    });
    return out;
  }

  // 안경 휴리스틱: 얼굴 박스의 '눈 띠'에서 어둡고 대비 큰 가로 띠가 보이면 안경으로 추정(자주 틀림).
  function guessGlasses(box, W, H) {
    try {
      const ctx = srcCanvas.getContext('2d');
      const bx = clamp(box.x | 0, 0, W - 1), bw = clamp(box.width | 0, 1, W - bx);
      const y0 = clamp((box.y + box.height * 0.30) | 0, 0, H - 1);
      const y1 = clamp((box.y + box.height * 0.52) | 0, y0 + 1, H);
      if (bw < 10 || y1 - y0 < 2) return false;
      const data = ctx.getImageData(bx, y0, bw, y1 - y0).data;
      let sum = 0, sum2 = 0, dark = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        sum += l; sum2 += l * l; if (l < 72) dark++; n++;
      }
      if (!n) return false;
      const mean = sum / n, std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
      return std > 46 && dark / n > 0.13;
    } catch (e) { return false; }
  }

  // face-api 결과 → 사람 entity(나이대·성별·감정·안경). coco 'person'은 얼굴 결과로 대체.
  async function faceEntities(W, H) {
    const F = window.faceapi;
    const opts = new F.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
    let res = await F.detectAllFaces(srcCanvas, opts).withFaceLandmarks().withAgeAndGender().withFaceExpressions();
    return res.map(r => {
      const b = r.detection.box, age = Math.round(r.age);
      let emo = 'neutral', best = 0;
      Object.entries(r.expressions).forEach(([k, v]) => { if (v > best) { best = v; emo = k; } });
      return {
        cx: (b.x + b.width / 2) / W, cy: (b.y + b.height / 2) / H, w: b.width / W, h: b.height / H,
        score: r.detection.score, kind: kindForAge(age), age, gender: r.gender,
        emotion: emo, glasses: guessGlasses(b, W, H), label: KINDS[kindForAge(age)].ko,
        ph: Math.random() * 6.283
      };
    });
  }

  /* ----------------------------- 가상 관객(오프라인 데모) ----------------------------- */
  // 카메라/모델 없이도 모든 연출을 보여 주는 결정적 데모. 매 종류·감정·안경을 한 명씩.
  function demoEntities(t) {
    const wob = (i) => Math.sin(t * 0.6 + i) * 0.012;
    const childEmo = ['happy', 'surprised', 'happy', 'neutral'][(t / 2 | 0) % 4];
    const youthEmo = ['surprised', 'happy', 'sad', 'neutral'][(t / 2.5 | 0) % 4];
    return [
      { cx: 0.18 + wob(1), cy: 0.30, w: 0.14, h: 0.30, score: 0.95, kind: 'elder', age: 71, gender: 'female', emotion: 'happy', glasses: true, label: '노년', ph: 1.1 },
      { cx: 0.40 + wob(2), cy: 0.40, w: 0.13, h: 0.28, score: 0.93, kind: 'adult', age: 42, gender: 'male', emotion: 'neutral', glasses: true, label: '어른', ph: 2.2 },
      { cx: 0.62 + wob(3), cy: 0.34, w: 0.11, h: 0.24, score: 0.9, kind: 'youth', age: 21, gender: 'female', emotion: youthEmo, glasses: false, label: '청년', ph: 3.3 },
      { cx: 0.80 + wob(4), cy: 0.46, w: 0.08, h: 0.16, score: 0.88, kind: 'child', age: 7, gender: 'male', emotion: childEmo, glasses: false, label: '아이', ph: 4.4 },
      { cx: 0.30 + wob(5), cy: 0.74, w: 0.12, h: 0.12, score: 0.84, kind: 'animal', label: '개', hue: 28, ph: 5.5 },
      { cx: 0.70 + wob(6), cy: 0.76, w: 0.09, h: 0.09, score: 0.8, kind: 'animal', label: '고양이', hue: 280, ph: 0.6 },
      { cx: 0.50 + wob(7), cy: 0.62, w: 0.07, h: 0.12, score: 0.7, kind: 'object', label: '의자', ph: 1.7 },
      { cx: 0.90 + wob(8), cy: 0.30, w: 0.10, h: 0.22, score: 0.86, kind: 'person', emotion: 'sad', label: '사람', ph: 2.8 }
    ];
  }

  /* ----------------------------- 감지 루프(라이브) ----------------------------- */
  async function detectFrame() {
    if (!state.live || !video || detectBusy) return;
    if (video.readyState < 2 || !video.videoWidth) return;
    detectBusy = true;
    try {
      const W = video.videoWidth, H = video.videoHeight;
      if (!srcCanvas || srcCanvas.width !== W || srcCanvas.height !== H) { srcCanvas = document.createElement('canvas'); srcCanvas.width = W; srcCanvas.height = H; }
      srcCanvas.getContext('2d').drawImage(video, 0, 0, W, H);
      const dets = await ensureCoco().then(m => m.detect(srcCanvas, 20));
      let ents = cocoToEntities(dets, W, H);
      if (state.faceOn && faceReady && window.faceapi) {
        try {
          const faces = await faceEntities(W, H);
          if (faces.length) ents = ents.filter(e => e.kind !== 'person').concat(faces);   // 사람은 얼굴 결과로 대체
        } catch (e) { /* 얼굴 분석 프레임 오류는 건너뜀 */ }
      }
      entities = ents;
      drawPreview(W, H);
      renderChips();
    } catch (e) { /* coco 미로드/프레임 오류 */ }
    finally { detectBusy = false; }
  }

  function drawPreview(W, H) {
    const cam = $('#stg-cam'); if (!cam || !state.preview || !srcCanvas) return;
    const ar = W / H; let cw = cam.clientWidth || 320, ch = Math.round(cw / ar);
    cam.width = cw; cam.height = ch;
    const x = cam.getContext('2d');
    x.save();
    if (state.mirror) { x.translate(cw, 0); x.scale(-1, 1); }
    x.drawImage(srcCanvas, 0, 0, cw, ch);
    x.restore();
    x.lineWidth = 2; x.font = '12px sans-serif'; x.textBaseline = 'top';
    entities.forEach(e => {
      const ex = state.mirror ? (1 - e.cx) : e.cx;
      const bw = e.w * cw, bh = e.h * ch, bx = ex * cw - bw / 2, by = e.cy * ch - bh / 2;
      const hue = e.kind === 'animal' ? (e.hue || 18) : KINDS[e.kind].hue;
      x.strokeStyle = `hsl(${hue},85%,62%)`; x.strokeRect(bx, by, bw, bh);
      let tag = (KINDS[e.kind] ? KINDS[e.kind].ko : '') ;
      if (e.label && e.label !== tag) tag = e.label;
      if (e.age != null) tag += ' ' + e.age;
      if (e.emotion) tag += '·' + (EMO_KO[e.emotion] || e.emotion);
      if (e.glasses) tag += '·👓';
      x.fillStyle = `hsl(${hue},85%,58%)`; x.fillRect(bx, Math.max(0, by - 15), x.measureText(tag).width + 8, 15);
      x.fillStyle = '#0a0c12'; x.fillText(tag, bx + 4, Math.max(0, by - 15) + 2);
    });
  }

  function renderChips() {
    const host = $('#stg-chips'); if (!host) return;
    if (!entities.length) { host.innerHTML = '<span class="muted" style="font-size:12px">감지된 대상이 없어요.</span>'; return; }
    const c = {};
    entities.forEach(e => { const k = (KINDS[e.kind] ? KINDS[e.kind].ko : e.kind) + (e.glasses ? '·👓' : ''); c[k] = (c[k] || 0) + 1; });
    host.innerHTML = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="stg-chip">${k} ×${v}</span>`).join(' ');
  }

  /* ----------------------------- 미디어아트 렌더 ----------------------------- */
  function softDot(ctx, x, y, r, hue, sat, light, a) {
    const A = clamp(a, 0, 0.96);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    g.addColorStop(0, `hsla(${hue},${sat}%,${light}%,${A})`);
    g.addColorStop(1, `hsla(${hue},${sat}%,${light}%,0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, 6.283); ctx.fill();
    ctx.fillStyle = `hsla(${hue},${Math.min(98, sat + 8)}%,${Math.min(90, light + 18)}%,${Math.min(1, A + 0.2)})`;
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.3, r * 0.42), 0, 6.283); ctx.fill();
  }

  // 감정 → 움직임/색 보정
  function emoMod(emotion, t, ph) {
    switch (emotion) {
      case 'happy': return { dx: 0, dy: -6 - Math.abs(Math.sin(t * 2 + ph)) * 7, dHue: 8, dSat: 6, dLight: 8, dR: 0 };
      case 'sad': return { dx: Math.sin(t + ph) * 2, dy: 7 + ((t * 12 + ph * 9) % 16), dHue: 210 - 0, dSat: -34, dLight: -6, dR: -2, blue: true };
      case 'angry': return { dx: (Math.random() - 0.5) * 9, dy: (Math.random() - 0.5) * 9, dHue: 0, dSat: 30, dLight: 0, dR: 1, red: true };
      case 'surprised': return { dx: 0, dy: 0, dHue: 0, dSat: 10, dLight: 12, dR: 4 + Math.abs(Math.sin(t * 3 + ph)) * 7 };
      case 'fearful': return { dx: Math.sin(t * 4 + ph) * 5, dy: 2, dHue: 260, dSat: -10, dLight: -2, dR: -1 };
      case 'disgusted': return { dx: 0, dy: 1, dHue: 90, dSat: 8, dLight: -4, dR: 0 };
      default: return { dx: 0, dy: 0, dHue: 0, dSat: 0, dLight: 0, dR: 0 };
    }
  }

  function aggregateMoodHue(ents) {
    // 표정의 날씨 배경용: 다수 감정에 따라 하늘색 이동
    let happy = 0, sad = 0, angry = 0, surp = 0, n = 0;
    ents.forEach(e => { if (!e.emotion) return; n++; if (e.emotion === 'happy') happy++; else if (e.emotion === 'sad') sad++; else if (e.emotion === 'angry') angry++; else if (e.emotion === 'surprised') surp++; });
    if (!n) return null;
    if (angry >= sad && angry >= happy && angry > 0) return [22, 8, 8];
    if (sad >= happy && sad > 0) return [8, 12, 26];
    if (happy > 0) return [22, 20, 8];
    return null;
  }

  function drawArt(t) {
    if (!artCtx) return;
    const W = artCv.width, H = artCv.height, sc = SCENES[state.scene];
    const ents = entities;
    // 배경(잔상): 시나리오별 trail 알파로 이전 프레임이 서서히 사라짐
    let bg = sc.bg;
    if (sc.behavior === 'animals' && ents.some(e => e.kind === 'animal')) bg = [10, 22, 12];
    if (sc.behavior === 'weather') { const mh = aggregateMoodHue(ents); if (mh) bg = mh; }
    if (sc.behavior === 'together') {
      const pc = ents.filter(e => e.kind !== 'animal' && e.kind !== 'object').length, warm = clamp((pc - 1) / 4, 0, 1);
      bg = [Math.round(8 + warm * 16), Math.round(10 + warm * 4), Math.round(20 - warm * 10)];   // 여럿일수록 따뜻
    }
    artCtx.globalCompositeOperation = 'source-over';
    artCtx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},${sc.trail})`;
    artCtx.fillRect(0, 0, W, H);

    if (!ents.length) {
      artCtx.fillStyle = '#566'; artCtx.font = '15px sans-serif'; artCtx.textAlign = 'center';
      artCtx.fillText('카메라를 켜거나 데모를 누르면, 감지된 관객이 여기서 살아나요', W / 2, H / 2);
      return;
    }
    const pad = 26, IW = W - pad * 2, IH = H - pad * 2;
    const showLabel = $('#stg-label') ? $('#stg-label').checked : true;
    const anyGlasses = ents.some(e => e.glasses);
    // 동물 연출: 가장 가까운 사람 좌표(맴돌 중심)
    const persons = ents.filter(e => e.kind !== 'animal' && e.kind !== 'object');
    const maxArea = Math.max(0.0004, ...ents.map(e => (e.w || 0.05) * (e.h || 0.05)));   // '다가오는 것' 정규화용
    const warmth = clamp((persons.length - 1) / 4, 0, 1);
    // '혼자, 함께': 사람들 사이를 빛의 실로 연결(여럿일수록 진하게)
    if (sc.behavior === 'together' && persons.length > 1) {
      artCtx.globalCompositeOperation = 'lighter'; artCtx.lineWidth = 1.4;
      for (let a = 0; a < persons.length; a++) for (let b = a + 1; b < persons.length; b++) {
        const A = persons[a], B = persons[b];
        const ax = pad + clamp(state.mirror ? 1 - A.cx : A.cx, 0, 1) * IW, ay = pad + clamp(A.cy, 0, 1) * IH;
        const bx = pad + clamp(state.mirror ? 1 - B.cx : B.cx, 0, 1) * IW, by = pad + clamp(B.cy, 0, 1) * IH;
        artCtx.strokeStyle = `hsla(42,90%,66%,${(0.05 + warmth * 0.22).toFixed(3)})`;
        artCtx.beginPath(); artCtx.moveTo(ax, ay); artCtx.lineTo(bx, by); artCtx.stroke();
      }
      artCtx.globalCompositeOperation = 'source-over';
    }

    ents.forEach((e, idx) => {
      const prof = KINDS[e.kind] || KINDS.object;
      const baseHue = e.kind === 'animal' ? (e.hue != null ? e.hue : 18) : prof.hue;
      let ex = state.mirror ? (1 - e.cx) : e.cx;
      let ey = e.cy;

      // ── 시나리오 배치/움직임 보정 ──
      let flowX = 0, flowY = 0, alpha = 0.45 + (e.score || 0.8) * 0.4, rScale = 1, tintHue = null, tintSat = null;
      if (sc.behavior === 'river') {
        // 나이대별 강의 깊이(세로 위치)와 속도
        const lane = { child: 0.18, youth: 0.36, adult: 0.56, elder: 0.78, person: 0.5, animal: 0.66, object: 0.5 }[e.kind];
        ey = lane + Math.sin(t * prof.speed * 0.5 + e.ph) * 0.03;
        ex = ((e.cx + t * (0.02 + (3 - prof.speed) * 0.004) + e.ph * 0.02) % 1.1) - 0.05;
        if (ex < 0) ex += 1.1;
        flowX = Math.cos(t * 1.2 + e.ph) * prof.spread * 0.4;
      } else if (sc.behavior === 'animals') {
        if (e.kind === 'animal' && persons.length) {
          const tgt = persons[idx % persons.length];
          const tx = state.mirror ? (1 - tgt.cx) : tgt.cx;
          const orbit = 0.06 + 0.04 * Math.sin(e.ph);
          ex = tx + Math.cos(t * 1.6 + e.ph) * orbit;
          ey = tgt.cy + Math.sin(t * 1.6 + e.ph) * orbit;
        }
      } else if (sc.behavior === 'glasses') {
        if (anyGlasses) { alpha = e.glasses ? 0.95 : 0.12; rScale = e.glasses ? 1.15 : 0.7; }
      } else if (sc.behavior === 'crowd') {
        rScale = e.kind === 'object' ? 0.6 : 1; // 사람 중심
      } else if (sc.behavior === 'together') {
        if (e.kind !== 'animal' && e.kind !== 'object') {
          if (persons.length <= 1) { tintHue = 212; tintSat = 38; alpha *= 0.72; flowX = (ex < 0.5 ? -1 : 1) * 16; }  // 혼자=차갑게 가장자리로
          else { tintSat = 92; }                                                                                     // 함께=선명·따뜻
        }
      } else if (sc.behavior === 'approach') {
        const prox = clamp(((e.w || 0.05) * (e.h || 0.05)) / maxArea, 0.12, 1);   // 가까울수록(박스 클수록) 1에 가까움
        rScale = 0.5 + prox * 2.3; alpha = 0.14 + prox * 0.82;
      }

      const cx0 = pad + clamp(ex, 0, 1) * IW, cy0 = pad + clamp(ey, 0, 1) * IH;
      const em = e.emotion && (sc.behavior === 'weather' || sc.behavior === 'crowd' || sc.behavior === 'river') ? emoMod(e.emotion, t, e.ph) : null;
      const sub = prof.sub;
      const sizeScale = 0.7 + Math.min(1.6, (e.w || 0.1) * 4);

      for (let k = 0; k < sub; k++) {
        const a2 = e.ph + k * (6.283 / sub);
        const wob = prof.spread * (0.5 + 0.5 * Math.sin(t * prof.speed + a2));
        let x = cx0 + Math.cos(t * prof.speed * 0.8 + a2) * wob + flowX;
        let y = cy0 + Math.sin(t * prof.speed + a2 * 1.3) * wob + flowY;
        let hue = baseHue, sat = 85, light = 60, r = prof.baseR * sizeScale * rScale * (0.85 + 0.15 * Math.sin(t * 2 + a2));
        if (em) { x += em.dx; y += em.dy; r += em.dR; sat = clamp(sat + em.dSat, 15, 98); light = clamp(light + em.dLight, 28, 88); if (em.blue) hue = 215; if (em.red) hue = 2; if (!em.blue && !em.red) hue = baseHue + (em.dHue || 0) * 0.1; }
        if (tintHue != null && (!em || (!em.blue && !em.red))) hue = tintHue;          // 혼자=차가운 색
        if (tintSat != null) sat = clamp(tintSat, 15, 98);
        artCtx.globalCompositeOperation = 'lighter';
        softDot(artCtx, x, y, Math.max(2, r), hue, sat, light, alpha);
      }
      artCtx.globalCompositeOperation = 'source-over';
      // 안경 테
      if (e.glasses && (sc.behavior === 'glasses' || state.faceOn)) {
        artCtx.strokeStyle = `rgba(255,255,255,${sc.behavior === 'glasses' ? 0.9 : 0.5})`;
        artCtx.lineWidth = 2.5; artCtx.beginPath(); artCtx.arc(cx0, cy0, prof.baseR * sizeScale * 1.5 + 6, 0, 6.283); artCtx.stroke();
      }
      if (showLabel && alpha > 0.2) {
        let tag = e.label || prof.ko;
        if (e.age != null) tag += ' ' + e.age;
        if (e.emotion && sc.behavior === 'weather') tag += '·' + (EMO_KO[e.emotion] || '');
        artCtx.fillStyle = 'rgba(255,255,255,0.8)'; artCtx.font = '12px sans-serif'; artCtx.textAlign = 'center';
        artCtx.fillText(tag, cx0, cy0 + prof.baseR * sizeScale + 14);
      }
    });
  }

  function loop(ts) {
    const t = ts / 1000;
    if (state.demo) entities = demoEntities(t);
    drawArt(t);
    if (state.demo) { renderChipsThrottled(t); }
    raf = requestAnimationFrame(loop);
  }
  let lastChip = 0;
  function renderChipsThrottled(t) { if (t - lastChip > 0.5) { lastChip = t; renderChips(); } }

  // 라이브 감지는 별도 타이머로(렌더와 분리, 과부하 방지)
  function detectTick() { if (state.live) { detectFrame(); } setTimeout(detectTick, 120); }

  /* ----------------------------- 내보내기: CSV · 데이터 스튜디오 · 녹화 ----------------------------- */
  const CSV_COLS = ['종류', '나이', '감정', '안경', '중심x', '중심y', '크기', '신뢰도'];
  function snapshotRows() {
    return entities.map(e => ({
      종류: KINDS[e.kind] ? KINDS[e.kind].ko : (e.label || e.kind),
      나이: (e.age != null ? Math.round(e.age) : ''),
      감정: (e.emotion ? (EMO_KO[e.emotion] || e.emotion) : ''),
      안경: (e.kind === 'animal' || e.kind === 'object') ? '' : (e.glasses ? '예' : '아니오'),
      중심x: Math.round(clamp(state.mirror ? 1 - e.cx : e.cx, 0, 1) * 100),
      중심y: Math.round(clamp(e.cy, 0, 1) * 100),
      크기: Math.round((e.w || 0) * (e.h || 0) * 100),
      신뢰도: Math.round((e.score || 0) * 100)
    }));
  }
  function rowsToCSV(rows) { return CSV_COLS.join(',') + '\n' + rows.map(o => CSV_COLS.map(c => o[c]).join(',')).join('\n'); }
  function exportCSV() {
    const rows = snapshotRows(); if (!rows.length) { UI.toast('감지된 대상이 없어요(카메라나 데모를 켜 보세요).'); return; }
    const blob = new Blob(['﻿' + rowsToCSV(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.download = 'live_lens_' + Date.now() + '.csv'; a.href = URL.createObjectURL(blob); a.click();
    setStatus('CSV를 저장했어요 · ' + rows.length + '행.');
  }
  function sendToData() {
    const rows = snapshotRows(); if (!rows.length) { UI.toast('감지된 대상이 없어요(카메라나 데모를 켜 보세요).'); return; }
    const sc = SCENES[state.scene];
    const payload = {
      name: '라이브 렌즈 · ' + sc.name, csv: rowsToCSV(rows),
      issue: '🪞 라이브 렌즈에서 온 데이터 — 관객을 읽은 ‘' + sc.name + '’. 종류·나이·감정·안경을 점의 무엇으로 바꿀까요?',
      intent: '', omit: 'AI는 겉모습만 분류 — 사람의 이야기·관계·존엄은 못 봄(나이·감정·안경은 추정값)'
    };
    try { localStorage.setItem('dn_data_incoming', JSON.stringify(payload)); } catch (e) { UI.toast('전송 실패(용량).'); return; }
    UI.toast('데이터 점 스튜디오로 보냈어요!');
    setTimeout(() => location.href = 'studio-data.html', 500);
  }

  let recorder = null, recChunks = [], recording = false;
  function toggleRecord() {
    const btn = $('#btn-stg-rec');
    if (!recording) {
      if (!artCv || !artCv.captureStream) { UI.toast('이 브라우저는 무대 녹화를 지원하지 않아요.'); return; }
      let mime = 'video/webm';
      if (window.MediaRecorder && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) mime = 'video/webm;codecs=vp9';
      try { recorder = new MediaRecorder(artCv.captureStream(30), { mimeType: mime }); }
      catch (e) { try { recorder = new MediaRecorder(artCv.captureStream(30)); } catch (e2) { UI.toast('녹화를 시작할 수 없어요.'); return; } }
      recChunks = [];
      recorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recChunks, { type: 'video/webm' });
        const a = document.createElement('a'); a.download = 'live_lens_' + Date.now() + '.webm'; a.href = URL.createObjectURL(blob); a.click();
        setStatus('무대 영상을 저장했어요(WebM) — 갤러리·발표에 쓸 수 있어요.');
      };
      recorder.start(); recording = true;
      if (btn) { btn.textContent = '■ 녹화 중지·저장'; btn.classList.add('rec'); }
      setStatus('● 무대를 녹화 중… 다시 누르면 영상이 저장돼요.');
    } else {
      try { recorder && recorder.stop(); } catch (e) {}
      recording = false; if (btn) { btn.textContent = '● 무대 녹화'; btn.classList.remove('rec'); }
    }
  }

  /* ----------------------------- 카메라 ----------------------------- */
  async function startCam() {
    if (state.live) return;
    setStatus('카메라를 켜는 중…');
    try {
      await ensureCoco();
    } catch (e) { setStatus('AI 모델(COCO-SSD)을 불러오지 못했어요 — 네트워크 차단일 수 있어요. ‘가상 관객 데모’로 연출을 먼저 체험해 보세요.', 'warn'); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: false });
      video = document.createElement('video'); video.playsInline = true; video.muted = true; video.srcObject = stream;
      await video.play();
      state.live = true; state.demo = false;
      const b = $('#btn-stg-cam'); if (b) { b.textContent = '■ 카메라 끄기'; b.classList.add('rec'); }
      $('#stg-cam-wrap').style.display = state.preview ? 'block' : 'none';
      if (state.faceOn) ensureFace().catch(() => setStatus('얼굴 분석 모델을 불러오지 못했어요 — 나이·감정·안경 없이 진행해요.', 'warn'));
      setStatus('📹 실시간 감지 중 — 영상은 저장·전송되지 않아요. 관객(또는 여러분 자신)을 비춰 보세요.');
    } catch (e) {
      state.live = false;
      setStatus('카메라를 쓸 수 없어요(권한 거부/카메라 없음). 주소창의 카메라 허용을 확인하거나, ‘가상 관객 데모’로 체험해 보세요.', 'warn');
    }
  }
  function stopCam() {
    state.live = false; state.demo = true;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    video = null;
    const b = $('#btn-stg-cam'); if (b) { b.textContent = '📹 실시간 카메라 켜기'; b.classList.remove('rec'); }
    const cw = $('#stg-cam-wrap'); if (cw) cw.style.display = 'none';
    setStatus('카메라를 껐어요. 가상 관객 데모로 돌아왔어요.');
  }
  function toggleCam() { state.live ? stopCam() : startCam(); }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) { UI.toast('이미지 파일을 넣어 주세요.'); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const W = Math.min(960, img.width), H = Math.round(W * img.height / img.width);
      srcCanvas = document.createElement('canvas'); srcCanvas.width = W; srcCanvas.height = H;
      srcCanvas.getContext('2d').drawImage(img, 0, 0, W, H);
      state.demo = false; state.live = false; state.mirror = false;
      setStatus('사진을 감지하는 중…');
      try {
        const dets = await ensureCoco().then(m => m.detect(srcCanvas, 30));
        let ents = cocoToEntities(dets, W, H);
        if (state.faceOn) { try { await ensureFace(); const f = await faceEntities(W, H); if (f.length) ents = ents.filter(e => e.kind !== 'person').concat(f); } catch (e) {} }
        entities = ents; drawPreview(W, H); renderChips();
        setStatus(ents.length ? '사진 감지 완료 · ' + ents.length + '개 — 아래 무대에서 연출돼요.' : '아무것도 못 찾았어요 — 그 ‘빈자리’도 작품의 발언이에요.');
        $('#stg-cam-wrap').style.display = state.preview ? 'block' : 'none';
      } catch (e) { setStatus('모델을 불러오지 못했어요(네트워크 차단). 데모로 체험해 보세요.', 'warn'); state.demo = true; }
    };
    img.onerror = () => { URL.revokeObjectURL(url); UI.toast('이미지를 불러오지 못했어요.'); };
    img.src = url;
  }

  /* ----------------------------- 시나리오 카드 UI ----------------------------- */
  function renderScenes() {
    const host = $('#stg-scenes'); if (!host) return;
    host.innerHTML = Object.entries(SCENES).map(([id, s]) =>
      `<button class="stg-scene${id === state.scene ? ' on' : ''}" data-scene="${id}">
         <span class="se">${s.emoji}</span><b>${s.name}</b></button>`).join('');
    host.querySelectorAll('[data-scene]').forEach(b => b.addEventListener('click', () => selectScene(b.dataset.scene)));
  }
  function selectScene(id) {
    if (!SCENES[id]) return;
    state.scene = id;
    document.querySelectorAll('.stg-scene').forEach(b => b.classList.toggle('on', b.dataset.scene === id));
    const s = SCENES[id], host = $('#stg-scene-detail');
    if (host) host.innerHTML =
      `<h3 style="margin:0 0 6px">${s.emoji} ${s.name}</h3>
       <p style="font-size:13.5px;line-height:1.6;margin:0 0 10px">${s.desc}</p>
       <div class="stg-meta"><b>감지 → 표현</b><span>${s.map}</span></div>
       <div class="stg-meta"><b>📹 무엇을 녹화할까</b><span>${s.film}</span></div>`;
    // 무대 배경 즉시 초기화(이전 잔상 제거)
    if (artCtx) { artCtx.globalCompositeOperation = 'source-over'; artCtx.fillStyle = `rgb(${s.bg.join(',')})`; artCtx.fillRect(0, 0, artCv.width, artCv.height); }
  }

  async function toggleFace(on) {
    state.faceOn = on;
    if (on) {
      setStatus('얼굴 분석 모델(나이·표정)을 준비하는 중… 처음 한 번만 받아와요.');
      try { await ensureFace(); setStatus('정밀 얼굴 분석 켜짐 — 나이·표정·안경(추정)을 읽어요. 모두 ‘추정’이라 자주 틀려요.'); }
      catch (e) { state.faceOn = false; const c = $('#stg-face'); if (c) c.checked = false; setStatus('얼굴 분석 모델을 불러오지 못했어요(CDN 차단). COCO-SSD 감지만 사용해요.', 'warn'); }
    } else setStatus('정밀 얼굴 분석 꺼짐 — 사람·동물·사물만 감지해요.');
  }

  /* ----------------------------- 시작 ----------------------------- */
  function fitArt() {
    if (!artCv) return;
    const wrap = $('#stg-art-wrap'); if (!wrap) return;
    const w = wrap.clientWidth || 900;
    artCv.width = w; artCv.height = Math.round(clamp(w * 0.5, 320, 520));
  }

  document.addEventListener('DOMContentLoaded', () => {
    artCv = $('#stg-art'); if (artCv) artCtx = artCv.getContext('2d');
    fitArt(); window.addEventListener('resize', fitArt);
    renderScenes(); selectScene(state.scene);

    $('#btn-stg-cam').addEventListener('click', toggleCam);
    $('#btn-stg-demo').addEventListener('click', () => { stopCam(); state.demo = true; state.mirror = true; setStatus('가상 관객 데모 — 카메라·인터넷 없이 모든 연출을 체험해요.'); });
    $('#btn-stg-upload').addEventListener('click', () => $('#stg-file').click());
    $('#stg-file').addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
    const fc = $('#stg-face'); if (fc) fc.addEventListener('change', e => toggleFace(e.target.checked));
    const rb = $('#btn-stg-rec'); if (rb) rb.addEventListener('click', toggleRecord);
    const cb = $('#btn-stg-csv'); if (cb) cb.addEventListener('click', exportCSV);
    const sb = $('#btn-stg-send'); if (sb) sb.addEventListener('click', sendToData);
    const pv = $('#stg-preview'); if (pv) pv.addEventListener('change', e => { state.preview = e.target.checked; const w = $('#stg-cam-wrap'); if (w) w.style.display = (state.preview && (state.live || (!state.demo && srcCanvas))) ? 'block' : 'none'; });

    detectTick();                 // 라이브 감지 타이머 시작(라이브일 때만 동작)
    raf = requestAnimationFrame(loop);
  });

  // (테스트/디버그용 최소 창구)
  window.LiveStage = { entities: () => entities, scene: () => state.scene, scenes: Object.keys(SCENES) };
})();
