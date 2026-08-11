/*
 * png.mjs: 의존성 없는 팔레트 PNG 인코더 + 절차적 그림 생성기
 * -----------------------------------------------------------------------------
 * 왜 직접 만드는가
 *   전시용 예시 데이터에는 썸네일이 있어야 갤러리·키오스크·포트폴리오가 '빈 칸'이 되지
 *   않는다. 브라우저 없이(Node 에서) 그림을 만들어야 하므로 캔버스를 쓸 수 없다.
 *   그래서 픽셀 버퍼에 직접 그리고 PNG 로 굽는다.
 *
 * 왜 트루컬러가 아니라 팔레트(색인) PNG 인가
 *   점묘 그림은 화소마다 색이 흩어져 트루컬러로 저장하면 압축이 거의 되지 않는다
 *   (썸네일 하나가 20KB 를 넘고, 작품 50점이면 저장소 용량 한계에 닿는다).
 *   색을 32~64개로 묶어 색인으로 저장하면 화소당 1바이트라 서너 배 작아진다.
 *   그림의 성격(제한된 팔레트의 점묘)과도 맞는다.
 *
 * 색 재생(js/player.js 의 buildColor)은 이 PNG 를 캔버스에 그린 뒤 픽셀을 읽는다.
 * data: URI 이므로 같은 출처로 취급되어 getImageData 가 막히지 않는다.
 */
import zlib from 'node:zlib';

/* ----------------------------- PNG 인코딩 ----------------------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/*
 * 팔레트 이미지 하나. 픽셀은 팔레트 색인(0~255)만 담는다.
 * 알파가 없으므로 반투명 대신 '어두운 변주색'을 팔레트에 함께 넣어 겹침을 표현한다.
 */
export class Img {
  constructor(w, h, palette, bg = 0) {
    this.w = w; this.h = h;
    this.hex = palette.slice();             // 만들 때 받은 색(다른 그림이 이어받아 쓸 수 있게)
    this.pal = palette.map(hexToRgb);       // [[r,g,b], ...] 최대 256
    this.px = new Uint8Array(w * h).fill(bg);
  }
  set(x, y, ci) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = ci;
  }
  rect(x0, y0, x1, y1, ci) {
    for (let y = Math.max(0, y0 | 0); y < Math.min(this.h, y1 | 0); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(this.w, x1 | 0); x++) this.px[y * this.w + x] = ci;
  }
  disc(cx, cy, r, ci) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, ci);
      }
  }
  // 세로 그라데이션 배경: 팔레트의 [a..b] 구간을 위에서 아래로 훑는다
  vgrad(a, b) {
    const n = b - a;
    for (let y = 0; y < this.h; y++) {
      const ci = a + Math.min(n, Math.floor(y / this.h * (n + 1)));
      for (let x = 0; x < this.w; x++) this.px[y * this.w + x] = ci;
    }
  }
  toPNG() {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 3;    // color type 3 = 팔레트
    const plte = Buffer.alloc(this.pal.length * 3);
    this.pal.forEach((c, i) => { plte[i * 3] = c[0]; plte[i * 3 + 1] = c[1]; plte[i * 3 + 2] = c[2]; });
    // 스캔라인마다 필터 바이트 0(None). 색인 이미지는 up/sub 필터가 오히려 압축을 해친다.
    const raw = Buffer.alloc((this.w + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w + 1)] = 0;
      Buffer.from(this.px.buffer, y * this.w, this.w).copy(raw, y * (this.w + 1) + 1);
    }
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  }
  toDataURL() { return 'data:image/png;base64,' + this.toPNG().toString('base64'); }
}

function hexToRgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const v = i => Math.round(A[i] + (B[i] - A[i]) * t);
  return '#' + [v(0), v(1), v(2)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// 기준색들 사이를 채워 넣어 그라데이션 팔레트를 만든다(색인 그림의 '농담'을 위해)
export function ramp(stops, steps) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
    const lt = t * (stops.length - 1) - seg;
    out.push(mixHex(stops[seg], stops[seg + 1], lt));
  }
  return out;
}

/* 재현 가능한 난수(mulberry32): 같은 씨앗이면 언제나 같은 그림 */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------- 절차적 '원본 그림' -----------------------------
 * 색 군집 스튜디오가 분석했다고 가정하는 그림. 학생이 고른 명화의 인상(색·구도)만
 * 절차적으로 재현한다(원본 이미지를 저장소에 담지 않기 위해서다).
 */
const PAINT_STYLE = {
  starrynight: { pal: ['#0b1b3a', '#12306b', '#1f5aa8', '#3f86c9', '#8fc0e8', '#f2e07a', '#f6c445', '#0a1024'], style: 'swirl' },
  monet: { pal: ['#1d2b3a', '#33556e', '#6f93a8', '#b8c9cf', '#e8d7b4', '#e2894a', '#c85a34', '#101a24'], style: 'haze' },
  seurat: { pal: ['#2b4a2f', '#4c7a3f', '#87a84c', '#c8c96a', '#e6dfa8', '#3c5f86', '#8aa7c4', '#1a2a1c'], style: 'dots' },
  mondrian: { pal: ['#f4f2ea', '#d81e2c', '#1a49a8', '#f2c40e', '#111111', '#8d8d8d', '#ffffff', '#222222'], style: 'blocks' },
  hokusai: { pal: ['#0d2b4a', '#17527f', '#3d8ab5', '#8dc3d9', '#dfe9ee', '#c9b382', '#7d6440', '#08182b'], style: 'wave' },
  kandinsky: { pal: ['#e9e2cf', '#c8482f', '#e0a021', '#2f6ba8', '#4d9d6e', '#6b3f8c', '#20201e', '#f2ede0'], style: 'shards' },
  scream: { pal: ['#2a1a3a', '#7a3b2e', '#c96a2b', '#e8a83c', '#f2d98a', '#3a5a86', '#1a1226', '#8a4a6a'], style: 'swirl' },
  klimt: { pal: ['#171307', '#4a3a12', '#8a6c1c', '#c9a227', '#e8cf6a', '#b0402f', '#3a5a4a', '#f0e3b0'], style: 'shards' }
};

export function painting(key, w = 220, h = 165, seed = 7) {
  const st = PAINT_STYLE[key] || PAINT_STYLE.monet;
  // 기준색 8개 → 64단계 램프. 점묘가 '농담'을 갖도록.
  const pal = [];
  st.pal.forEach(c => { for (let i = 0; i < 8; i++) pal.push(mixHex('#05060a', c, 0.35 + i * 0.09)); });
  const img = new Img(w, h, pal, 0);
  const R = rng(seed);
  const band = (i) => i * 8;                       // i 번째 기준색 램프의 시작
  const tone = (i, t) => band(i) + Math.min(7, Math.floor(t * 8));

  if (st.style === 'blocks') {
    img.rect(0, 0, w, h, tone(0, 0.9));
    const xs = [0, Math.round(w * 0.28), Math.round(w * 0.62), w];
    const ys = [0, Math.round(h * 0.34), Math.round(h * 0.72), h];
    const fills = [1, 2, 3, 0, 5, 0, 3, 1, 0];
    let k = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      img.rect(xs[i], ys[j], xs[i + 1], ys[j + 1], tone(fills[k++ % fills.length], 0.6 + R() * 0.35));
    }
    for (const x of xs.slice(1, -1)) img.rect(x - 2, 0, x + 2, h, tone(4, 0.2));
    for (const y of ys.slice(1, -1)) img.rect(0, y - 2, w, y + 2, tone(4, 0.2));
    return img;
  }

  // 바탕: 위(하늘/배경) → 아래(땅/물)
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const base = st.style === 'wave' ? (t < 0.55 ? 4 : 1) : (t < 0.5 ? 0 : 1);
    for (let x = 0; x < w; x++) img.set(x, y, tone(base, 0.35 + t * 0.4));
  }
  const N = Math.round(w * h * 0.9);
  for (let i = 0; i < N; i++) {
    const x = R() * w, y = R() * h;
    let ci;
    if (st.style === 'swirl') {
      // 소용돌이: 중심에서의 각도·거리로 색을 고른다(별이 빛나는 밤·절규의 물결)
      const dx = (x - w * 0.42) / w, dy = (y - h * 0.4) / h;
      const a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
      const s = 0.5 + 0.5 * Math.sin(a * 3 + r * 22);
      ci = r < 0.12 ? tone(5, 0.6 + R() * 0.4) : tone(s > 0.72 ? 4 : s > 0.45 ? 2 : 1, 0.3 + s * 0.6);
      if (R() < 0.02) ci = tone(6, 0.7 + R() * 0.3);   // 별
    } else if (st.style === 'haze') {
      const t = y / h, sun = Math.hypot((x - w * 0.62) / w, (y - h * 0.34) / h);
      ci = sun < 0.09 ? tone(5, 0.8) : tone(t < 0.42 ? (R() < 0.3 ? 4 : 2) : (R() < 0.25 ? 6 : 1), 0.25 + R() * 0.7);
    } else if (st.style === 'dots') {
      const t = y / h;
      ci = tone(t > 0.62 ? (R() < 0.4 ? 1 : 2) : (R() < 0.3 ? 5 : 3), 0.3 + R() * 0.65);
      if (R() < 0.05) ci = tone(4, 0.7 + R() * 0.3);
    } else if (st.style === 'wave') {
      const crest = Math.sin(x / w * 5.2) * 0.16 + 0.5;
      const t = y / h;
      ci = t < crest - 0.06 ? tone(4, 0.5 + R() * 0.4)
        : t < crest + 0.05 ? tone(3, 0.5 + R() * 0.5)
          : tone(R() < 0.3 ? 2 : 1, 0.25 + R() * 0.6);
    } else {  // shards
      const cell = Math.floor(x / (w / 5)) + Math.floor(y / (h / 4)) * 5;
      ci = tone((cell * 3 + Math.floor(R() * 3)) % 7, 0.3 + R() * 0.65);
    }
    img.disc(x, y, 1 + R() * 1.6, ci);
  }
  return img;
}

/* ----------------------------- 작품 썸네일 -----------------------------
 * 작품 종류별로 갤러리에 걸리는 정지 이미지. '어떤 규칙으로 만든 작품인지'가
 * 한눈에 읽히도록, 저장된 매핑을 실제로 따라 그린다(장식용 그림이 아니다).
 */
const NIGHT = '#07080d';

// 데이터 점 작품: 행 하나 = 화면 가로 한 자리. 크기·색·흔들림이 매핑을 따른다.
export function dataThumb({ rows, size, color, cat, gradLow, gradHigh, catColors, vib = 1, seed = 3, w = 240, h = 180, flag = [] }) {
  const stops = [NIGHT, '#0d1220'];
  const pal = [...ramp(stops, 4)];
  const flagged = new Set(flag);            // 이 행은 다른 색으로 표시한다(있을 수 없는 값 등)
  const catKeys = cat ? Object.keys(catColors) : [];
  const colorRamps = {};
  if (cat) catKeys.forEach(k => { colorRamps[k] = pal.length; ramp([mixHex(NIGHT, catColors[k], 0.45), catColors[k], mixHex(catColors[k], '#ffffff', 0.35)], 8).forEach(c => pal.push(c)); });
  else { colorRamps.grad = pal.length; ramp([mixHex(NIGHT, gradLow, 0.5), gradLow, gradHigh, mixHex(gradHigh, '#ffffff', 0.3)], 24).forEach(c => pal.push(c)); }
  const FLAG = pal.length; ramp(['#7a1a12', '#e0402c', '#ff8a72'], 6).forEach(c => pal.push(c));

  const img = new Img(w, h, pal, 0);
  img.vgrad(0, 3);
  const R = rng(seed);
  const num = (key) => {
    const vs = rows.map(r => +r[key]).filter(v => !isNaN(v));
    const mn = Math.min(...vs), mx = Math.max(...vs), rg = (mx - mn) || 1;
    return (r) => Math.max(0, Math.min(1, ((+r[key] || 0) - mn) / rg));
  };
  const sizeAt = size ? num(size) : () => 0.5;
  const colAt = (!cat && color) ? num(color) : null;
  const n = rows.length, marg = w * 0.07;
  const gap = n > 1 ? (w - marg * 2) / (n - 1) : w;   // 행 사이 간격만큼만 흩뜨려 화면이 고르게 차도록
  rows.forEach((row, i) => {
    const hx = marg + (n === 1 ? 0.5 : i / (n - 1)) * (w - marg * 2);
    // 표시한 행은 값이 0이라도 보이게 한다(표시했다는 것 자체가 작품의 내용일 때가 있다)
    const sv = flagged.has(i) ? Math.max(0.4, sizeAt(row)) : sizeAt(row);
    const spread = h * (0.18 + sv * 0.62);
    const cnt = 26 + Math.round(sv * 40);
    for (let k = 0; k < cnt; k++) {
      const x = hx + (R() - 0.5) * Math.max(6, gap * 1.25) * vib;
      const y = h / 2 + (R() - 0.5) * spread;
      let ci;
      if (flagged.has(i)) ci = FLAG + Math.floor(R() * 6);
      else if (cat) {
        const key = String(row[cat]);
        const base = colorRamps[key] != null ? colorRamps[key] : colorRamps[catKeys[0]];
        ci = base + Math.floor(R() * 8);
      } else {
        ci = colorRamps.grad + Math.min(23, Math.floor((colAt ? colAt(row) : 0.5) * 20 + R() * 4));
      }
      img.disc(x, y, 0.7 + sv * 2.2 * (0.5 + R() * 0.9), ci);
    }
  });
  return img;
}

// 색 군집 작품: 원본 그림을 점으로 흩뿌린 상태(전시에서 '숨쉬는' 그 화면의 한 순간)
export function colorThumb(paintKey, { size = 3, seed = 5, w = 240, h = 180 }) {
  const src = painting(paintKey, 120, 90, seed);
  const pal = [NIGHT, ...src.hex];      // hex 그대로 넘긴다(pal 은 이미 [r,g,b] 라 다시 파싱하면 깨진다)
  const img = new Img(w, h, pal, 0);
  const R = rng(seed + 11);
  const ar = src.w / src.h, pad = 10;
  let bw = w - pad * 2, bh = bw / ar;
  if (bh > h - pad * 2) { bh = h - pad * 2; bw = bh * ar; }
  const ox = (w - bw) / 2, oy = (h - bh) / 2;
  // 점이 성기면 검은 바탕이 비쳐 작품이 통째로 어두워진다(갤러리 카드에서 무엇인지 안 보인다).
  // 화폭을 덮을 만큼 뿌리되, 점 크기 설정이 클수록 점묘가 굵어지는 성질은 그대로 둔다.
  const N = Math.round(bw * bh * 2.2);
  for (let i = 0; i < N; i++) {
    const sx = Math.floor(R() * src.w), sy = Math.floor(R() * src.h);
    const jx = (R() - 0.5) * 3.5, jy = (R() - 0.5) * 3.5;
    img.disc(ox + (sx + 0.5) / src.w * bw + jx, oy + (sy + 0.5) / src.h * bh + jy,
      0.9 + R() * (0.5 + size * 0.42), 1 + src.px[sy * src.w + sx]);
  }
  return img;
}

// 낱말 구름 작품: 낱말의 자리와 크기가 빈도를, 색이 그림에서 뽑은 색을 따른다.
export function wordThumb(words, paletteHex, { seed = 9, w = 240, h = 180, bg = '#0b0d14', outlineTop = 0 }) {
  const pal = [bg];
  const bands = paletteHex.map(c => { const at = pal.length; ramp([mixHex(bg, c, 0.5), c, mixHex(c, '#ffffff', 0.3)], 6).forEach(x => pal.push(x)); return at; });
  const img = new Img(w, h, pal, 0);
  const R = rng(seed);
  const list = words.slice(0, 6);
  const maxC = Math.max(...list.map(x => x[1])) || 1;
  // 글자 높이는 '전체 중 몫'이 아니라 '1위 대비 비율'로 잡는다. 몫으로 잡으면 낱말이
  // 늘어날수록 전부 고만고만해져 낱말 구름이 아니라 표처럼 보인다.
  const sized = list.map(x => ({ w: String(x[0]), c: x[1], gh: Math.max(11, Math.round(h * 0.30 * Math.pow(x[1] / maxC, 0.75))) }));
  const totalH = sized.reduce((s, x) => s + x.gh + 6, 0);
  let y = Math.max(4, (h - totalH) / 2);
  sized.forEach((wd, i) => {
    const gh = wd.gh, chars = [...wd.w].length, gw = Math.round(gh * 0.84), adv = gw + Math.max(2, Math.round(gh * 0.12));
    let x = Math.max(4, (w - chars * adv) / 2 + (R() - 0.5) * Math.min(24, w * 0.12));
    const band = bands[i % bands.length];
    for (let c = 0; c < chars; c++) {
      /* 한 글자를 몇 개의 획 덩어리로 암시한다. 이 크기에서 글꼴은 어차피 읽히지 않고,
         읽히는 척하면 오히려 '가짜 글자'로 보인다. 획 조합을 글자마다 흔들어
         한 가지 모양이 되풀이되지 않게 하고, 크기와 색만 정확히 전한다. */
      const ci = band + Math.floor(R() * 6);
      const th = Math.max(2, Math.round(gh * 0.19)), vw = Math.max(2, Math.round(gw * 0.19));
      /* 앞의 몇 낱말은 '테두리만 있는 빈 글자'로 그린다. 빈도로는 1위지만 뜻이 비어 있는 말을
         일부러 비워 놓은 학생이 있고, 그 판단이 썸네일에서도 보여야 진술문과 화면이 맞는다. */
      if (i < outlineTop) {
        const t = Math.max(1, Math.round(th * 0.45));
        img.rect(x, y, x + gw, y + t, ci); img.rect(x, y + gh - t, x + gw, y + gh, ci);
        img.rect(x, y, x + t, y + gh, ci); img.rect(x + gw - t, y, x + gw, y + gh, ci);
        x += adv; continue;
      }
      const bar = (ty) => img.rect(x, y + ty, x + gw, y + ty + th, ci);
      const col = (tx, from, to) => img.rect(x + tx, y + Math.round(gh * from), x + tx + vw, y + Math.round(gh * to), ci);
      bar(0);                                                 // 윗획은 언제나
      if (R() < 0.75) bar(Math.round(gh * 0.4));              // 가운데획
      if (R() < 0.85) bar(gh - th);                           // 밑획
      const v = R();
      if (v < 0.34) col(Math.round(gw * 0.4), 0, 1);          // 가운데 세로
      else if (v < 0.67) { col(0, 0, 1); col(gw - vw, 0, 1); } // 양쪽 세로
      else col(gw - vw, 0.35, 1);                              // 오른쪽 아래
      x += adv;
    }
    y += gh + 6;
  });
  return img;
}

/* 사회 분석 작품: 나라마다 한 칸씩, 그 칸을 '한 덩어리 막대'가 아니라 낱낱의 점으로 쌓는다.
 * 이 학생의 작품이 실제로 그렇게 만들어졌다(막대 하나 = 나라 하나로 보이는 것을 깨려고
 * 100만 명씩 점으로 쪼갰다). 썸네일이 그 판단을 그대로 보여야 갤러리에서 작품이 읽힌다.
 */
export function societyThumb(values, { seed = 13, w = 240, h = 180, low = '#2740c8', high = '#ffd23c' }) {
  const pal = [NIGHT, ...ramp(['#0d1220', '#141c2f'], 3), ...ramp([mixHex(NIGHT, low, 0.6), low, high, mixHex(high, '#ffffff', 0.3)], 24), '#e8edf7', '#6a7794'];
  const G = 4, INK = pal.length - 2, MUT = pal.length - 1;
  const img = new Img(w, h, pal, 0);
  img.vgrad(1, 3);
  const R = rng(seed);
  const mx = Math.max(...values) || 1;
  const n = values.length, padX = 8, padY = 12;
  const cw = (w - padX * 2) / n, maxDots = 26;
  const base = h - padY;
  let sum = 0;
  values.forEach((v, i) => {
    const t = Math.max(0, Math.min(1, v / mx));
    const dots = Math.max(1, Math.round(t * maxDots));
    sum += t;
    const cx = padX + cw * (i + 0.5);
    for (let d = 0; d < dots; d++) {
      const y = base - 4 - d * ((h - padY * 2 - 6) / maxDots);
      const ci = G + Math.min(23, Math.floor((d / maxDots * 0.55 + t * 0.45) * 23));
      img.disc(cx + (R() - 0.5) * Math.min(cw * 0.5, 5), y, Math.max(1.2, Math.min(2.6, cw * 0.22)), ci);
    }
  });
  img.rect(padX - 2, base, w - padX + 2, base + 2, MUT);                                  // 기준선
  const meanY = Math.round(base - 4 - (sum / n) * maxDots * ((h - padY * 2 - 6) / maxDots));
  img.rect(padX - 2, meanY, w - padX + 2, meanY + 1, INK);                                 // 평균선
  return img;
}
