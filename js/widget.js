/*
 * widget.js — 스튜디오 공통 위젯의 최소 UI 토대(모달·토스트·스타일 주입)
 * -----------------------------------------------------------------------------
 * 왜 따로 두나?
 *   색 스튜디오(studio-color.html)는 컨셉상 site.css/ui.js 를 쓰지 않는다. 그래서
 *   판단 기록 위젯(cards.js·version.js)이 UI 에 의존하면 그 화면에서만 깨진다.
 *   이 파일은 UI 가 있으면 UI 를 쓰고, 없으면 스스로 그린다 — 어느 화면에서나 동작.
 */
(function (global) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function injectCSS(id, css) {
    if (document.getElementById(id)) return;
    const st = document.createElement('style'); st.id = id; st.textContent = css;
    document.head.appendChild(st);
  }

  // 위젯 공용 스타일(두 테마 모두에서 읽히도록 자체 색을 쓴다)
  injectCSS('dnw-style', `
.dnw-panel{border:1px solid rgba(127,140,180,.35);border-radius:14px;padding:14px 16px;margin-top:14px;background:rgba(127,140,180,.06)}
.dnw-panel h4{margin:0 0 4px;font-size:14.5px}
.dnw-sub{font-size:12px;opacity:.72;margin:0 0 10px;line-height:1.6}
.dnw-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
@media(max-width:560px){.dnw-cards{grid-template-columns:1fr}}
.dnw-card{text-align:left;cursor:pointer;font:inherit;font-size:12.5px;line-height:1.5;padding:10px 12px;border-radius:11px;
  border:1px solid rgba(127,140,180,.4);background:rgba(127,140,180,.08);color:inherit;transition:.15s}
.dnw-card:hover{border-color:#4EC3FF;background:rgba(78,195,255,.12)}
.dnw-card b{display:block;font-size:13px;margin-bottom:2px}
.dnw-card.done{border-color:rgba(81,216,138,.6);background:rgba(81,216,138,.1)}
.dnw-card .dnw-tick{float:right;color:#51D88A}
.dnw-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.dnw-btn{font:inherit;font-size:13px;padding:8px 14px;border-radius:9px;cursor:pointer;border:1px solid rgba(127,140,180,.45);
  background:rgba(127,140,180,.12);color:inherit}
.dnw-btn.primary{background:#2F6BE0;border-color:#2F6BE0;color:#fff}
.dnw-btn:disabled{opacity:.5;cursor:default}
.dnw-ta{width:100%;font:inherit;font-size:13.5px;line-height:1.6;padding:9px 11px;border-radius:9px;
  border:1px solid rgba(127,140,180,.45);background:rgba(127,140,180,.08);color:inherit;box-sizing:border-box}
.dnw-q{border-left:3px solid #4EC3FF;padding:6px 0 6px 11px;margin:0 0 12px;font-size:13.5px;line-height:1.75}
.dnw-vlist{display:flex;gap:8px;overflow-x:auto;padding:4px 0 2px}
.dnw-vitem{flex:0 0 auto;width:92px;cursor:pointer;border:2px solid transparent;border-radius:10px;padding:3px;text-align:center}
.dnw-vitem img{width:100%;height:62px;object-fit:cover;border-radius:7px;display:block;background:rgba(127,140,180,.2)}
.dnw-vitem span{font-size:10.5px;opacity:.75}
.dnw-vitem.sel{border-color:#2F6BE0}
.dnw-cmp{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:560px){.dnw-cmp{grid-template-columns:1fr}}
.dnw-cmp img{width:100%;border-radius:10px;border:1px solid rgba(127,140,180,.35);display:block}
.dnw-diff{font-size:12.5px;line-height:1.8;margin:10px 0 0}
.dnw-diff code{font-size:11.5px;opacity:.85}
.dnw-ab{display:flex;gap:6px;margin:8px 0}
.dnw-ab button{flex:1}
.dnw-ab button.on{background:#2F6BE0;border-color:#2F6BE0;color:#fff}
`);

  /* ----------------------------- 토스트 ----------------------------- */
  function toast(msg) {
    if (global.UI && UI.toast) return UI.toast(msg);
    let t = document.getElementById('dnw-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'dnw-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#11151f;border:1px solid #2F6BE0;' +
        'color:#E7ECF7;padding:11px 18px;border-radius:11px;font-size:13px;z-index:400;box-shadow:0 10px 30px rgba(0,0,0,.5);transition:.2s;opacity:0';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(toast._t); toast._t = setTimeout(() => t.style.opacity = '0', 2600);
  }

  /* ----------------------------- 모달 ----------------------------- */
  // UI 가 있어도 위젯은 자체 모달을 쓴다(모달 안의 입력에 이벤트를 붙여야 하므로 DOM 을 돌려준다).
  function modal(title, html) {
    let bg = document.getElementById('dnw-modal');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'dnw-modal';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(4,6,12,.66);display:flex;align-items:center;justify-content:center;z-index:380;padding:18px';
      bg.innerHTML = '<div id="dnw-mc" style="background:#141826;border:1px solid #2a3145;border-radius:16px;max-width:620px;width:100%;' +
        'max-height:88vh;overflow:auto;padding:22px 24px;position:relative;color:#e8ecf6">' +
        '<button id="dnw-x" style="position:absolute;right:12px;top:12px;background:#1b2030;border:1px solid #2a3145;color:#e8ecf6;' +
        'border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px">✕</button>' +
        '<h3 id="dnw-t" style="margin:0 0 12px;font-size:17px;padding-right:34px"></h3>' +
        '<div id="dnw-b" style="font-size:13.6px;line-height:1.7"></div></div>';
      document.body.appendChild(bg);
      bg.addEventListener('click', e => { if (e.target === bg) close(); });
      bg.querySelector('#dnw-x').addEventListener('click', close);
      document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    }
    bg.querySelector('#dnw-t').innerHTML = title;
    bg.querySelector('#dnw-b').innerHTML = html;
    bg.style.display = 'flex';
    return bg.querySelector('#dnw-b');
  }
  function close() { const bg = document.getElementById('dnw-modal'); if (bg) bg.style.display = 'none'; }

  // 마크다운 아주 일부(**굵게**·줄바꿈)만 — 코치 답변 표시용
  function md(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/\n/g, '<br>'); }

  // 캔버스를 아주 작은 썸네일 dataURL 로(버전 스냅샷용 · 용량 최소화)
  function thumb(canvas, maxDim) {
    if (!canvas) return '';
    try {
      if (global.ImgUtil) return ImgUtil.encode(canvas, { maxDim: maxDim || 200, budget: 16000, quality: 0.6, minQuality: 0.4, minDim: 120 });
      const w = maxDim || 200, h = Math.max(1, Math.round(w * canvas.height / canvas.width));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(canvas, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.6);
    } catch (e) { return ''; }
  }

  global.DNW = { esc, md, toast, modal, close, injectCSS, thumb };
})(window);
