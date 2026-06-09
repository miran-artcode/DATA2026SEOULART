/*
 * particles.js — 점(입자) 시스템: 움직임 규칙 + 렌더링
 * -----------------------------------------------------------------------------
 * 분석 결과(점 리스트)를 받아 "살아 있는" 입자로 만든다.
 * 학생이 설계하는 규칙(수업 3.5)을 코드로 구현한 부분:
 *   - 마우스 근접 → 크기↑/밀어내기/끌어당기기/흩뿌리기
 *   - 마이크 볼륨 → 진동/확산/크기/폭발
 *   - 주파수 대역(저·중·고음) → 밝기에 따라 특정 색 군집만 반응
 *   - 복귀력(집중) ↔ 확산, 진동, 잔상, 발광, 3D 조각(밝기→깊이)
 *
 * 성능을 위해 값들을 Typed Array(SoA)로 보관하고, 색은 군집 단위로 묶어 그린다.
 */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;

  function System(analysis, rect, opts) {
    this.a = analysis;
    this.n = analysis.count;
    this.opts = opts || {};
    this.angle = 0;                  // 3D 회전 각
    this.K = analysis.K;
    this.visible = new Array(this.K).fill(true);

    const n = this.n;
    this.hx = new Float32Array(n);   // 제자리(home) 위치
    this.hy = new Float32Array(n);
    this.px = new Float32Array(n);   // 현재 위치
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);   // 속도
    this.vy = new Float32Array(n);
    this.ds = new Float32Array(n);   // 이번 프레임에 그릴 크기
    this.cluster = analysis.cluster;
    this.br = analysis.br;

    // 점 색(문자열) 미리 계산: 대표색 / 원본색
    this.colStr = new Array(n);
    this.setColorMode(this.opts.colorMode || 'cluster');

    // 렌더 순서: 군집별로 묶으면 fillStyle 변경이 줄어 빨라진다.
    this.order = Array.from({ length: n }, (_, i) => i)
      .sort((i, j) => this.cluster[i] - this.cluster[j]);

    this.remap(rect, true);
  }

  // 점 색 모드 전환 (분석을 다시 하지 않고 색만 바꿈)
  System.prototype.setColorMode = function (mode) {
    const a = this.a, n = this.n;
    for (let i = 0; i < n; i++) {
      let r, g, b;
      if (mode === 'original') { r = a.or[i]; g = a.og[i]; b = a.ob[i]; }
      else { const p = a.palette[a.cluster[i]]; r = p.r; g = p.g; b = p.b; }
      this.colStr[i] = 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    this.colorMode = mode;
  };

  System.prototype.setVisibility = function (clusterIndex, on) {
    this.visible[clusterIndex] = on;
  };

  // 캔버스 크기에 맞춰 home 좌표 재계산(정규화 좌표 → 화면 좌표)
  System.prototype.remap = function (rect, resetPos) {
    this.rect = rect;
    const a = this.a, n = this.n;
    for (let i = 0; i < n; i++) {
      const hx = rect.x + a.nx[i] * rect.w;
      const hy = rect.y + a.ny[i] * rect.h;
      this.hx[i] = hx; this.hy[i] = hy;
      if (resetPos) { this.px[i] = hx; this.py[i] = hy; }
    }
  };

  // 폭발: (cx,cy)에서 바깥으로 한 번 강하게 밀어냄
  System.prototype.explode = function (cx, cy, power, radius) {
    const n = this.n, r2 = radius ? radius * radius : Infinity;
    for (let i = 0; i < n; i++) {
      let dx = this.px[i] - cx, dy = this.py[i] - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) + 0.001;
      const f = power * (radius ? (1 - Math.sqrt(d2) / radius) : 1);
      this.vx[i] += (dx / d) * f * (3 + Math.random() * 2);
      this.vy[i] += (dy / d) * f * (3 + Math.random() * 2);
    }
  };

  // 밝기 b 가 대역(0=저,0.5=중,1=고)에 얼마나 가까운지 가중치(삼각형)
  function bandWeight(b, center) {
    return Math.max(0, 1 - Math.abs(b - center) * 2.2);
  }

  // 매 프레임 물리 갱신
  System.prototype.update = function (env) {
    const n = this.n;
    const m = env.motion, mo = env.mouse, mic = env.mic;
    const ret = m.returnForce, damp = m.damping, vib = m.vibration;
    const cx = this.rect.x + this.rect.w / 2, cy = this.rect.y + this.rect.h / 2;

    const mActive = mo.mode !== 'none';
    const mr = mo.radius, mr2 = mr * mr, mstr = mo.strength;
    const baseSize = this.opts.baseSize;

    // 마이크에서 오는 전역 효과
    const micOn = mic && mic.enabled;
    const vol = micOn ? mic.volume : 0;
    const volVib = (micOn && mic.target === 'vibration') ? vol * 8 : 0;
    const volSpread = (micOn && mic.target === 'spread') ? vol : 0;
    const volSize = (micOn && mic.target === 'size') ? vol : 0;
    const freqOn = micOn && mic.freqOn;

    if (this.angle !== undefined) this.angle += m.rotateSpeed;

    for (let i = 0; i < n; i++) {
      let ax = (this.hx[i] - this.px[i]) * ret;
      let ay = (this.hy[i] - this.py[i]) * ret;

      // 기본 진동 + 마이크 볼륨 진동
      const totalVib = vib + volVib;
      if (totalVib > 0) {
        ax += (Math.random() - 0.5) * totalVib;
        ay += (Math.random() - 0.5) * totalVib;
      }

      // 마우스 상호작용
      let swell = 0;
      if (mActive) {
        const dx = this.px[i] - mo.x, dy = this.py[i] - mo.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < mr2) {
          const d = Math.sqrt(d2) + 0.001;
          const f = (1 - d / mr) * mstr;
          if (mo.mode === 'repel') { ax += (dx / d) * f * 6; ay += (dy / d) * f * 6; }
          else if (mo.mode === 'attract') { ax -= (dx / d) * f * 5; ay -= (dy / d) * f * 5; }
          else if (mo.mode === 'scatter') {
            ax += (Math.random() - 0.5) * f * 14; ay += (Math.random() - 0.5) * f * 14;
          } else if (mo.mode === 'swell') { swell = f * 2.4; }
        }
      }

      // 마이크 볼륨 확산(중심에서 바깥으로)
      if (volSpread > 0) {
        const dx = this.px[i] - cx, dy = this.py[i] - cy;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
        ax += (dx / d) * volSpread * 2.2;
        ay += (dy / d) * volSpread * 2.2;
      }

      // 주파수 → 색 군집 반응 (밝기로 대역 가르기)
      let act = 0;
      if (freqOn) {
        const b = this.br[i];
        act = mic.low * bandWeight(b, 0.15) +
              mic.mid * bandWeight(b, 0.5) +
              mic.high * bandWeight(b, 0.9);
        if (act > 0) {
          ax += (Math.random() - 0.5) * act * 10;
          ay += (Math.random() - 0.5) * act * 10;
        }
      }

      // 적분(속도·위치 갱신)
      let nvx = (this.vx[i] + ax) * damp;
      let nvy = (this.vy[i] + ay) * damp;
      // 폭주 방지
      const sp2 = nvx * nvx + nvy * nvy, MAX = 900;
      if (sp2 > MAX) { const s = Math.sqrt(MAX / sp2); nvx *= s; nvy *= s; }
      this.vx[i] = nvx; this.vy[i] = nvy;
      this.px[i] += nvx; this.py[i] += nvy;

      // 이번 프레임 크기(기본 + 부풀리기 + 볼륨/주파수 펄스)
      let s = baseSize * (1 + swell + volSize * 1.6 + act * 1.8);
      this.ds[i] = s;
    }
  };

  // 렌더링: ctx 는 캔버스 2D 컨텍스트
  System.prototype.render = function (ctx, view) {
    const n = this.n;
    ctx.globalCompositeOperation = view.additive ? 'lighter' : 'source-over';

    // 선 모드: 제자리에서 얼마나 벗어났는지 가는 선으로 표시
    if (view.lines) {
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(180,200,255,0.5)';
      ctx.beginPath();
      for (let k = 0; k < n; k += 1) {
        const i = this.order[k];
        if (!this.visible[this.cluster[i]]) continue;
        ctx.moveTo(this.hx[i], this.hy[i]);
        ctx.lineTo(this.px[i], this.py[i]);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const is3D = view.mode === '3d';
    const focal = 900, depth = view.depth;
    const cx = this.rect.x + this.rect.w / 2, cy = this.rect.y + this.rect.h / 2;
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);

    let lastStyle = null;
    for (let k = 0; k < n; k++) {
      const i = this.order[k];
      if (!this.visible[this.cluster[i]]) continue;

      let sx = this.px[i], sy = this.py[i], size = this.ds[i];
      if (is3D) {
        // 밝기 → 깊이(z). Y축 회전 후 원근 투영 → "데이터가 3D 조각이 되다"
        const x = this.px[i] - cx, y = this.py[i] - cy;
        const z = (this.br[i] - 0.5) * depth;
        const xr = x * ca + z * sa;
        const zr = -x * sa + z * ca;
        const scale = focal / (focal + zr);
        sx = cx + xr * scale;
        sy = cy + y * scale;
        size = this.ds[i] * scale;
      }
      if (size < 0.4) continue;

      const style = this.colStr[i];
      if (style !== lastStyle) { ctx.fillStyle = style; lastStyle = style; }

      if (size <= 1.6) {
        ctx.fillRect(sx - size, sy - size, size * 2, size * 2); // 작은 점은 사각형(빠름)
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  };

  function create(analysis, rect, opts) { return new System(analysis, rect, opts); }

  global.Particles = { create, System };
})(window);
