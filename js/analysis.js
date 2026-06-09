/*
 * analysis.js — 이미지 "여러 방법으로" 분석하기
 * -----------------------------------------------------------------------------
 * 수업의 파이프라인을 그대로 코드로 옮긴 모듈:
 *   이미지 → (전처리: 리사이즈/색공간) → 픽셀 색 데이터 추출
 *        → K-means 군집화(대표색 K개 + 비율)
 *        → 점 샘플링(무작위 / 밝은영역 / 어두운영역 / 윤곽=에지 가중)
 *        → 점 리스트(N개: 위치·대표색·밝기) "JSON 같은 구조"로 출력
 *
 * 즉 ImageAnalysis.analyze(...) 의 반환값이 곧 "점 데이터(JSON)"에 해당한다.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 색공간 변환 (RGB ↔ LAB)                                             */
  /*   RGB: 화면 색 그대로. LAB: 사람 눈에 가까운 거리 → 군집이 더 자연스러움 */
  /* ------------------------------------------------------------------ */
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function rgb2lab(r, g, b) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    // 선형 RGB → XYZ (D65)
    let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
    let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  // 픽셀(r,g,b)을 선택한 색공간 벡터로
  function toSpace(r, g, b, space) {
    return space === 'lab' ? rgb2lab(r, g, b) : [r, g, b];
  }
  // 표준 휘도(밝기) 0~1
  function luminance(r, g, b) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

  /* ------------------------------------------------------------------ */
  /* 소스(업로드/데모) → 작은 분석용 캔버스로 리사이즈                    */
  /* ------------------------------------------------------------------ */
  function fitCanvas(src, maxDim) {
    const sw = src.width, sh = src.height;
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    return { canvas: cv, ctx, w, h };
  }

  // Sobel 윤곽(에지) 세기 맵 — 명암이 급변하는 곳(윤곽선)에서 값이 커진다.
  function edgeMap(gray, w, h) {
    const out = new Float32Array(w * h);
    let max = 1e-6;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx =
          -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
          gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
        const gy =
          -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
          gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
        const m = Math.hypot(gx, gy);
        out[i] = m;
        if (m > max) max = m;
      }
    }
    for (let i = 0; i < out.length; i++) out[i] /= max; // 0~1 정규화
    return out;
  }

  // 가중치 맵에서 N개의 픽셀 인덱스를 뽑는다(누적분포 + 이분 탐색).
  function sampleIndices(weights, n, rng) {
    const len = weights.length;
    const cdf = new Float64Array(len);
    let acc = 0;
    for (let i = 0; i < len; i++) { acc += weights[i]; cdf[i] = acc; }
    if (acc <= 0) { // 전부 0이면 균등으로
      const out = new Int32Array(n);
      for (let k = 0; k < n; k++) out[k] = (rng() * len) | 0;
      return out;
    }
    const out = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      const t = rng() * acc;
      let lo = 0, hi = len - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < t) lo = mid + 1; else hi = mid;
      }
      out[k] = lo;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 메인: analyze(source, opts)                                         */
  /* ------------------------------------------------------------------ */
  function analyze(source, opts) {
    opts = opts || {};
    const K = Math.max(2, Math.min(opts.K || 8, 32));
    const space = opts.space === 'lab' ? 'lab' : 'rgb';
    const sampling = opts.sampling || 'uniform';
    const N = Math.max(100, Math.min(opts.N || 4000, 30000));
    const maxDim = opts.maxDim || 320;
    const seed = opts.seed != null ? opts.seed : 12345;
    const rng = KMeans.makeRNG(seed);

    // (1) 전처리: 리사이즈 + 픽셀 읽기
    const { ctx, w, h } = fitCanvas(source, maxDim);
    const px = ctx.getImageData(0, 0, w, h).data; // RGBA
    const total = w * h;

    // 밝기/회색조 미리 계산(샘플링·3D 깊이·주파수 매핑에 사용)
    const gray = new Float32Array(total);
    const bright = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      const L = luminance(r, g, b);
      gray[i] = L * 255;
      bright[i] = L;
    }

    // (2) K-means 입력: 픽셀을 골고루 표본추출(최대 6000개)해서 학습
    const sampleStep = Math.max(1, Math.floor(total / 6000));
    const data = [];
    for (let i = 0; i < total; i += sampleStep) {
      data.push(toSpace(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], space));
    }
    const km = KMeans.cluster(data, K, { seed, maxIter: 24 });

    // 군집 중심을 RGB 팔레트로 환산 + 비율(%) 계산
    // (LAB 중심은 직접 역변환 대신, 그 군집에 속한 원본 RGB들의 평균색을 쓴다.)
    const sumR = new Float64Array(K), sumG = new Float64Array(K), sumB = new Float64Array(K);
    const cnt = new Int32Array(K);
    for (let s = 0; s < data.length; s++) {
      const c = km.assignments[s];
      const src = s * sampleStep;
      sumR[c] += px[src * 4]; sumG[c] += px[src * 4 + 1]; sumB[c] += px[src * 4 + 2];
      cnt[c]++;
    }
    let palette = [];
    for (let c = 0; c < K; c++) {
      const n = Math.max(1, cnt[c]);
      palette.push({
        r: clamp255(sumR[c] / n), g: clamp255(sumG[c] / n), b: clamp255(sumB[c] / n),
        ratio: cnt[c] / data.length,
        _cen: km.centroids[c]            // 점 배정을 위해 색공간 중심 보관
      });
    }
    // 비율 높은 색 순으로 정렬(리포트 가독성)
    palette.sort((a, b) => b.ratio - a.ratio);
    const centroidsSpace = palette.map(p => p._cen);
    palette.forEach(p => { delete p._cen; });

    // (3) 점 샘플링: 방식별 가중치 맵 만들기
    const weights = new Float32Array(total);
    if (sampling === 'edge') {
      const e = edgeMap(gray, w, h);
      for (let i = 0; i < total; i++) weights[i] = 0.05 + e[i]; // 윤곽 강조
    } else if (sampling === 'bright') {
      for (let i = 0; i < total; i++) weights[i] = 0.05 + bright[i];      // 밝은 곳 ↑
    } else if (sampling === 'dark') {
      for (let i = 0; i < total; i++) weights[i] = 0.05 + (1 - bright[i]); // 어두운 곳 ↑
    } else {
      for (let i = 0; i < total; i++) weights[i] = 1;                      // 무작위(균등)
    }
    const idx = sampleIndices(weights, N, rng);

    // (4) 점 리스트(JSON 같은 구조, 성능 위해 Typed Array로)
    const nx = new Float32Array(N), ny = new Float32Array(N);
    const clusterArr = new Int16Array(N), brArr = new Float32Array(N);
    const orr = new Uint8Array(N), ogg = new Uint8Array(N), obb = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      const i = idx[k];
      const x = i % w, y = (i / w) | 0;
      // 픽셀 안에서 살짝 흔들어 격자 느낌 제거
      nx[k] = (x + rng()) / w;
      ny[k] = (y + rng()) / h;
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      orr[k] = r; ogg[k] = g; obb[k] = b;
      brArr[k] = bright[i];
      // 가장 가까운 대표색(군집)에 배정 = "대표색 점으로 치환"
      const v = toSpace(r, g, b, space);
      let best = 0, bestD = Infinity;
      for (let c = 0; c < centroidsSpace.length; c++) {
        const cc = centroidsSpace[c];
        let dd = 0;
        for (let d = 0; d < cc.length; d++) { const df = v[d] - cc[d]; dd += df * df; }
        if (dd < bestD) { bestD = dd; best = c; }
      }
      clusterArr[k] = best;
    }

    return {
      width: w, height: h, count: N, K, space, sampling, seed,
      palette,                       // [{r,g,b,ratio}] 비율 내림차순
      nx, ny, cluster: clusterArr, br: brArr,
      or: orr, og: ogg, ob: obb
    };
  }

  /* ------------------------------------------------------------------ */
  /* 데모 이미지: 네트워크/저작권 걱정 없이 즉시 쓸 수 있는 절차적 그림     */
  /* ------------------------------------------------------------------ */
  function generateDemo(name, w, h) {
    w = w || 640; h = h || 480;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');

    if (name === 'abstract') {
      // 추상: 겹치는 반투명 도형 (칸딘스키풍)
      ctx.fillStyle = '#1d2540'; ctx.fillRect(0, 0, w, h);
      const cols = ['#ff5a5f', '#ffb400', '#00b3a4', '#2e86de', '#e056fd', '#f6e58d'];
      for (let i = 0; i < 26; i++) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = cols[i % cols.length];
        const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 140;
        ctx.beginPath();
        if (i % 3 === 0) ctx.rect(x - r / 2, y - r / 2, r, r);
        else ctx.arc(x, y, r / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (name === 'forest') {
      // 바다·숲: 차가운 그라데이션 + 물결 획
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0b486b'); g.addColorStop(0.5, '#3b8686'); g.addColorStop(1, '#79bd9a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        const y = Math.random() * h;
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 12);
        ctx.stroke();
      }
    } else if (name === 'portrait') {
      // 인물 습작(난색 피부톤) — 피부톤 팔레트·구도 분석용
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a2a3f'); g.addColorStop(1, '#5a3a2a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2a1a12'; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.5, w * 0.26, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      const skin = ctx.createRadialGradient(w * 0.5, h * 0.46, 20, w * 0.5, h * 0.5, w * 0.25);
      skin.addColorStop(0, '#f1c9a5'); skin.addColorStop(1, '#c98a63');
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.5, w * 0.19, h * 0.27, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(220,120,110,.4)'; ctx.beginPath(); ctx.arc(w * 0.42, h * 0.55, 22, 0, 7); ctx.arc(w * 0.58, h * 0.55, 22, 0, 7); ctx.fill();
      ctx.fillStyle = '#2b2b3a'; ctx.beginPath(); ctx.arc(w * 0.43, h * 0.47, 9, 0, 7); ctx.arc(w * 0.57, h * 0.47, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = '#a8434a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.58, 18, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else if (name === 'pointillism') {
      // 쇠라풍 점묘(보색 점) — '점묘=색 군집화' 연결, 산점도 분석용
      ctx.fillStyle = '#e8e0c8'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const x = Math.random() * w, y = Math.random() * h, t = y / h;
        const base = t < 0.55 ? (Math.random() < 0.5 ? [120, 170, 220] : [210, 190, 120])
                              : (Math.random() < 0.5 ? [110, 160, 70] : [200, 140, 90]);
        ctx.fillStyle = `rgb(${base[0] + (Math.random() * 40 - 20) | 0},${base[1] + (Math.random() * 40 - 20) | 0},${base[2] + (Math.random() * 40 - 20) | 0})`;
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill();
      }
    } else if (name === 'monochrome') {
      // 흑백 명도 습작 — 노탄·명도 히스토그램 분석용
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#101014'); g.addColorStop(1, '#d8d8de');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const tones = ['#1b1b22', '#3a3a44', '#6a6a76', '#9a9aa6', '#cfcfd8'];
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = tones[i % tones.length];
        const x = Math.random() * w, y = Math.random() * h, s = 40 + Math.random() * 150;
        if (i % 2) { ctx.beginPath(); ctx.arc(x, y, s / 2, 0, 7); ctx.fill(); }
        else ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    } else {
      // 석양(기본): 따뜻한 방사형 그라데이션 + 해 + 수평선
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#2c1a4d'); g.addColorStop(0.45, '#c1346b');
      g.addColorStop(0.7, '#ff7e5f'); g.addColorStop(1, '#ffd194');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const sun = ctx.createRadialGradient(w * 0.5, h * 0.62, 10, w * 0.5, h * 0.62, 120);
      sun.addColorStop(0, '#fff3b0'); sun.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.62, 120, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(40,10,40,0.55)'; ctx.fillRect(0, h * 0.72, w, h * 0.28);
      ctx.fillStyle = 'rgba(20,5,30,0.8)';
      for (let i = 0; i < 6; i++) {
        const bw = w / 6, x = i * bw;
        ctx.fillRect(x + bw * 0.3, h * 0.72 - (10 + Math.random() * 40), bw * 0.4, 60);
      }
    }
    return cv;
  }

  global.ImageAnalysis = { analyze, generateDemo, rgb2lab, luminance };
})(window);
