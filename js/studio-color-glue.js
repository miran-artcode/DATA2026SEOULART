/*
 * studio-color-glue.js — 색 군집 스튜디오를 사이트(코치·전시·허브)와 연결
 * -----------------------------------------------------------------------------
 * 단일 파일(오프라인 백업) 동작을 해치지 않도록, 자체 토스트/모달을 쓰고
 * 공용 site.css/ui.js 에 의존하지 않는다. window.ColorStudio 훅을 통해 맥락을 읽는다.
 */
(function () {
  'use strict';
  if (!window.ColorStudio) return;

  // --- 미니 토스트 ---
  function toast(msg) {
    let t = document.getElementById('glue-toast');
    if (!t) { t = document.createElement('div'); t.id = 'glue-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#11151f;border:1px solid #2F6BE0;color:#E7ECF7;padding:11px 18px;border-radius:11px;font-size:13px;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.5);transition:.2s;opacity:0';
      document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(toast._t); toast._t = setTimeout(() => t.style.opacity = '0', 2400);
  }
  // --- 미니 모달 ---
  function modal(title, html) {
    let bg = document.getElementById('glue-modal');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'glue-modal';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(4,6,12,.72);display:flex;align-items:center;justify-content:center;z-index:210;padding:18px';
      bg.innerHTML = '<div style="background:#141826;border:1px solid #2a3145;border-radius:16px;max-width:560px;width:100%;max-height:86vh;overflow:auto;padding:22px 24px;position:relative"><button id="glue-x" style="position:absolute;right:12px;top:12px;background:#1b2030;border:1px solid #2a3145;color:#e8ecf6;border-radius:8px;width:30px;height:30px;cursor:pointer">✕</button><h2 id="glue-t" style="margin:0 0 12px;font-size:18px;color:#e8ecf6"></h2><div id="glue-b" style="font-size:13.6px;line-height:1.7;color:#e8ecf6"></div></div>';
      document.body.appendChild(bg);
      bg.addEventListener('click', e => { if (e.target === bg) bg.style.display = 'none'; });
      bg.querySelector('#glue-x').addEventListener('click', () => bg.style.display = 'none');
    }
    bg.querySelector('#glue-t').innerHTML = title;
    bg.querySelector('#glue-b').innerHTML = html;
    bg.style.display = 'flex';
    return bg.querySelector('#glue-b');
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/\n/g, '<br>');

  // --- 상단 버튼 주입 ---
  function injectButtons() {
    const bar = document.querySelector('.top-actions');
    if (!bar) return;
    const mk = (txt, title) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = txt; if (title) b.title = title; return b; };
    const home = document.createElement('a'); home.href = 'hub.html'; home.className = 'btn ghost'; home.textContent = '← 허브'; home.style.textDecoration = 'none';
    const bCoach = mk('🧭 코치', '감상 코치에게 질문받기');
    const bExhibit = mk('🖼 전시', '갤러리에 전시하기');
    bar.insertBefore(home, bar.firstChild);
    bar.appendChild(bCoach); bar.appendChild(bExhibit);
    bCoach.addEventListener('click', coach);
    bExhibit.addEventListener('click', exhibitForm);

    /* 작업실(색 스튜디오)은 항상 다크 — 테마 토글 제거(HANDOFF 컨셉 분리) */
  }

  async function coach() {
    if (!window.Coach) { toast('코치 모듈이 없습니다.'); return; }
    if (window.Log) Log.push({ stage: 'judge', action: 'coach_ask', workId: Log.workId(), payload: { where: 'studio-color' } });
    const b = modal('🧭 감상 코치', '<span style="opacity:.7">질문을 준비하는 중…</span>');
    const res = await Coach.ask(window.ColorStudio.context());
    const tag = res.source.indexOf('api') === 0 ? '실제 모델' : '오프라인 코치';
    modal('🧭 감상 코치 <span style="font-size:12px;color:#9aa3bd">(' + tag + ')</span>', md(res.text));
  }

  function exhibitForm() {
    if (!window.Store || !window.Auth) { toast('저장 모듈이 없습니다.'); return; }
    const u = Auth.current();
    if (!u) { toast('전시하려면 로그인하세요.'); setTimeout(() => location.href = 'index.html?next=studio-color.html', 900); return; }
    if (!window.ColorStudio.hasAnalysis()) { toast('먼저 이미지를 분석하세요.'); return; }
    const meta = window.ColorStudio.meta();
    const recURL = (window.ColorStudio.lastVideoURL && window.ColorStudio.lastVideoURL()) || '';
    const recKB = recURL ? Math.round(recURL.length / 1024 / 1.37) : 0;   // dataURL → 대략 KB
    const inp = 'width:100%;font:inherit;font-size:14px;background:#0a0c12;color:#e8ecf6;border:1px solid #2a3145;border-radius:8px;padding:9px 11px;margin-top:4px';
    const b = modal('🖼 갤러리에 전시', `
      <p style="color:#9aa3bd;font-size:12.5px;margin:0 0 10px">‘의도 한 문장 + 조형 근거 1개’를 채워야 전시할 수 있어요(근거가 먼저!).</p>
      <label style="font-size:12px;color:#9aa3bd">제목</label>
      <input id="g-title" style="${inp}" value="${esc(meta.title || '')}" placeholder="작품 제목">
      <label style="font-size:12px;color:#9aa3bd;display:block;margin-top:10px">의도(한 문장)</label>
      <input id="g-intent" style="${inp}" value="${esc(meta.intent || '')}" placeholder="예: 소리로 그림을 연주하는 경험">
      <label style="font-size:12px;color:#9aa3bd;display:block;margin-top:10px">조형 요소 근거(최소 1개)</label>
      <textarea id="g-evi" rows="2" style="${inp}" placeholder="예: 대표색을 8개로 줄여 분위기를 단순화"></textarea>
      ${recURL ? `<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:13px;color:#e8ecf6;cursor:pointer">
        <input type="checkbox" id="g-vid" checked style="margin-top:3px">
        <span>🎬 방금 <b>녹화한 인터랙티브 영상</b>으로 전시 <span style="color:#9aa3bd">(움직이는 그대로 갤러리에서 재생 · 약 ${recKB.toLocaleString()}KB)</span></span>
      </label>`
      : `<p style="color:#9aa3bd;font-size:11.5px;margin:12px 0 0">💡 ‘● 영상 녹화’로 움직이는 작품을 먼저 녹화하면, 갤러리에서 영상 그대로 재생되도록 전시할 수 있어요.</p>`}
      <button id="g-go" class="btn primary" style="margin-top:12px">전시하기</button>`);
    b.querySelector('#g-go').addEventListener('click', async () => {
      const go = b.querySelector('#g-go');
      if (go.disabled) return;                       // 업로드 중 중복 제출 방지
      const title = b.querySelector('#g-title').value.trim() || '색 군집 작품';
      const intent = b.querySelector('#g-intent').value.trim();
      const evidence = b.querySelector('#g-evi').value.trim();
      if (!intent || !evidence) { toast('의도와 근거를 모두 채워 주세요.'); return; }
      const goText = go.textContent; go.disabled = true; go.textContent = '전시하는 중…';
      try {
        const useVideo = !!(recURL && b.querySelector('#g-vid') && b.querySelector('#g-vid').checked);
        const cv = window.ColorStudio.canvas();
        let thumb = '';
        if (cv) {
          thumb = window.ImgUtil
            ? ImgUtil.encode(cv, { maxDim: 900, budget: 300000 })
            : (function () { const w = 360, h = Math.round(w * cv.height / cv.width); const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').drawImage(cv, 0, 0, w, h); return t.toDataURL('image/jpeg', 0.6); })();
        }
        // 원본 사진: 가능하면 Storage 에 고화질(최대 ~5MB)로 보관하고 문서엔 URL만 저장.
        // srcSample(작은 인라인)은 전시 재생(점 애니메이션)이 교차출처 CORS 없이 색을 읽도록 같은 출처로 남긴다.
        const rawSrc = window.ColorStudio.sourceCanvasRaw ? window.ColorStudio.sourceCanvasRaw() : null;
        let srcImg = '', srcSample = '';
        if (rawSrc && window.ImgUtil && ImgUtil.storePhoto) {
          srcImg = await ImgUtil.storePhoto(rawSrc, { dir: 'works', maxDim: 2560, quality: 0.92, maxBytes: 5 * 1024 * 1024, fallbackMaxDim: 1600, fallbackBudget: 560000 });
          srcSample = ImgUtil.encode(rawSrc, { maxDim: 220, budget: 60000 });
        } else {
          srcImg = window.ColorStudio.sourceURL();
        }
        // draftId: 전시 전에 쌓인 로그·버전을 이 작품과 이어 주는 자리표
        const draftId = window.Log ? Log.workId() : null;
        const work = { userId: u.userId, by: u.display, klass: u.klass, kind: 'color', title, intent, evidence,
          settings: window.ColorStudio.settings(), meta, thumb, srcImg, srcSample, exhibited: true, consent: true, draftId };
        if (useVideo) work.video = recURL;   // 갤러리/뷰어가 <video> 로 재생(멈춤 없이 움직임 그대로)
        try {
          const wid = await Store.saveWork(work);
          if (window.Log) {
            await Log.push({ stage: 'share', action: 'exhibit', workId: draftId, payload: { workRealId: wid } });
            Log.newWork();   // 다음 작품은 새 자리표로 — 이전 작품의 버전·로그와 섞이지 않게
            mountTrace.remount && mountTrace.remount();
          }
          document.getElementById('glue-modal').style.display = 'none';
          toast(useVideo ? '🎉 인터랙티브 영상으로 전시했습니다!' : '🎉 갤러리에 전시했습니다!');
        } catch (e) {
          // 영상이 너무 커 저장 용량을 초과한 경우 등 — 영상 없이 다시 시도
          if (useVideo) {
            delete work.video;
            try { await Store.saveWork(work); document.getElementById('glue-modal').style.display = 'none'; toast('영상이 너무 커서 영상 없이 전시했어요(짧게 녹화하면 영상으로 전시돼요).'); return; } catch (e2) {}
          }
          toast('전시 저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
        }
      } catch (e) {
        toast('전시 중 오류가 발생했어요. 다시 시도해 주세요.');
      } finally {
        go.disabled = false; go.textContent = goText;
      }
    });
  }

  // 분석실에서 보낸 이미지(dataURL)가 있으면 스튜디오에 불러오기
  function checkIncomingImage() {
    const url = localStorage.getItem('dn_studio_image');
    if (!url) return;
    const title = localStorage.getItem('dn_studio_image_title') || '분석실에서 받은 이미지';
    localStorage.removeItem('dn_studio_image'); localStorage.removeItem('dn_studio_image_title');
    // 스튜디오 자체 데모 로드(약 120ms) 이후에 적용되도록 약간 지연
    setTimeout(() => {
      if (window.ColorStudio && ColorStudio.loadImageURL) {
        ColorStudio.loadImageURL(url, title);
        toast('분석실에서 보낸 ‘' + title + '’ 이미지를 불러왔어요.');
      }
    }, 700);
  }

  /* ----------------------------- 판단의 흔적 위젯 ----------------------------- */
  // 이 화면은 site.css/ui.js 를 쓰지 않으므로 위젯이 스스로 스타일을 넣는다(widget.js).
  function mountTrace() {
    if (window.Log) Log.view('make');
    const ctx = () => (window.ColorStudio ? window.ColorStudio.context() : { kind: 'color' });
    // 전시 뒤 새 작품으로 넘어가면 다시 부른다(비어 있는 버전 목록으로 갱신)
    mountTrace.remount = function () {
      if (window.Cards) Cards.mount(document.getElementById('dn-cards'), { ctx, workId: () => Log.workId() });
      if (window.Versions) Versions.mount(document.getElementById('dn-versions'), {
        workId: () => Log.workId(),
        canvas: () => (window.ColorStudio && window.ColorStudio.canvas()) || null,
        settings: () => (window.ColorStudio ? window.ColorStudio.settings() : {})
      });
    };
    mountTrace.remount();
    // 분석 실행도 판단의 출발점 — 버튼 클릭을 한 번만 기록한다.
    const ba = document.getElementById('btn-analyze');
    if (ba && window.Log) ba.addEventListener('click', () => {
      const c = window.ColorStudio ? window.ColorStudio.context() : {};
      Log.push({ stage: 'sense', action: 'analyze', workId: Log.workId(), payload: { K: c.K, N: c.N, space: c.space } });
    });
  }

  document.addEventListener('DOMContentLoaded', () => { injectButtons(); checkIncomingImage(); mountTrace(); });
})();
