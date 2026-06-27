/*
 * imgutil.js — 업로드 이미지 인코딩(화질 우선 · 용량 안전) 공용 모듈
 * -----------------------------------------------------------------------------
 * 왜 필요한가?
 *   작품/퀴즈는 이미지를 base64 dataURL 형태로 Firestore '문서 안'에 직접 저장한다.
 *   그런데 Firestore 문서 1개의 최대 크기는 약 1MB(1,048,576바이트)다. 예전 코드는
 *   이 한계를 넘지 않으려고 사진을 360~380px·품질 0.6 수준으로 과하게 줄였고,
 *   그래서 요즘 스마트폰(갤럭시/아이폰) 사진을 올려도 '옛날 화질'처럼 보였다.
 *
 * 이 모듈의 방식:
 *   "정해진 용량 예산 안에서 가능한 한 큰·선명한 이미지"를 만든다.
 *     1) 긴 변을 maxDim 이하로만 축소(원본보다 키우지 않음).
 *     2) 높은 JPEG 품질(기본 0.85)로 인코딩.
 *     3) 결과 dataURL 이 예산(budget, 글자 수≈바이트)을 넘으면 품질을 단계적으로 낮춘다.
 *     4) 품질 하한까지 낮춰도 크면 가로·세로를 줄여 다시 시도(하한 minDim 까지).
 *   → 어떤 사진이 들어와도 문서 1MB 한계 안에 '확실히' 들어가면서, 예전보다 훨씬 또렷하다.
 *
 * 오프라인 단일 파일 백업을 깨지 않도록, 각 호출부는 window.ImgUtil 이 없을 때를 대비해
 * 기존 toDataURL 폴백을 남겨 둔다.
 */
(function (global) {
  'use strict';

  // base64 1글자 ≈ 1바이트(ASCII)라서 dataURL 문자열 길이를 그대로 용량 근사치로 쓴다.
  function byteLen(dataURL) { return dataURL ? dataURL.length : 0; }

  function srcSize(src) {
    return {
      w: src.width || src.naturalWidth || src.videoWidth || 0,
      h: src.height || src.naturalHeight || src.videoHeight || 0
    };
  }

  // 긴 변을 maxDim 이하로 맞춘 캔버스에 그려서 그 캔버스를 돌려준다(원본보다 키우지 않음).
  function scaledCanvas(src, sw, sh, maxDim) {
    const longest = Math.max(sw, sh);
    const scale = Math.min(1, maxDim / longest);
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return c;
  }

  /*
   * encode(src, opts) → dataURL 문자열
   *   src         : 그릴 수 있는 소스(canvas/image/…)
   *   opts.maxDim     긴 변 상한(px). 기본 1600.
   *   opts.budget     dataURL 최대 길이(바이트 근사). 기본 700,000.
   *   opts.quality    시작 JPEG 품질. 기본 0.85.
   *   opts.minQuality 품질 하한. 기본 0.55.
   *   opts.minDim     축소 하한(px). 기본 640.
   *   opts.type       'image/jpeg'(기본) | 'image/png'
   */
  function encode(src, opts) {
    opts = opts || {};
    if (!src) return '';
    const { w: sw, h: sh } = srcSize(src);
    if (!sw || !sh) return '';

    const type = opts.type || 'image/jpeg';
    const isPng = type === 'image/png';            // PNG 는 품질 인자가 무의미 → 크기 축소로만 줄인다
    const budget = opts.budget || 700000;
    const startQ = opts.quality != null ? opts.quality : 0.85;
    const minQ = opts.minQuality != null ? opts.minQuality : 0.55;
    const minDim = opts.minDim || 640;
    let maxDim = opts.maxDim || 1600;

    let url = '';
    for (let guard = 0; guard < 12; guard++) {
      const c = scaledCanvas(src, sw, sh, maxDim);
      let q = startQ;
      url = c.toDataURL(type, q);
      // 1) 같은 크기에서 품질을 낮춰 예산 안에 들이기(JPEG 만 효과)
      while (!isPng && byteLen(url) > budget && q > minQ) {
        q = Math.max(minQ, +(q - 0.07).toFixed(2));
        url = c.toDataURL(type, q);
      }
      // 예산을 만족하거나, 더 줄일 수 없으면 종료
      if (byteLen(url) <= budget || maxDim <= minDim) break;
      // 2) 그래도 크면 한 변을 20% 줄여 다시 시도
      maxDim = Math.max(minDim, Math.round(maxDim * 0.8));
    }
    return url;
  }

  // 이미지 dataURL/URL 을 받아 인코딩(비동기). 분석실 핸드오프 등에서 사용 가능.
  function encodeURL(srcUrl, opts) {
    return new Promise((resolve) => {
      if (!srcUrl) { resolve(''); return; }
      const img = new Image();
      img.onload = () => resolve(encode(img, opts));
      img.onerror = () => resolve(srcUrl);   // 못 읽으면 원본 URL 그대로
      img.src = srcUrl;
    });
  }

  global.ImgUtil = { encode, encodeURL, byteLen };
})(window);
