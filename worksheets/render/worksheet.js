/*
 * worksheet.js — 학습지 렌더러 (의존성 없음 · 화면과 인쇄를 한 벌로)
 * ---------------------------------------------------------------------------
 * 내용(JSON)과 표시(이 파일)를 나눠 두었다. 이 파일은 어느 사이트에 붙여도
 * 그대로 동작한다 — 정적 사이트의 <script src>, 또는 번들러의 import 양쪽 다.
 *
 *   <link rel="stylesheet" href="render/worksheet.css">
 *   <script src="render/worksheet.js"></script>
 *   const pack = await Worksheet.load('content/worksheets', 'data-eye');
 *   Worksheet.renderSheet(el, {
 *     unit: pack.unit, sheet: pack.sheets[1],
 *     answers: saved,                       // { "s1.report.r0.analysis_name": "..." }
 *     onChange: (path, value, all) => {...} // 저장은 호출한 쪽이 한다(Store/localStorage)
 *   });
 *
 * 설계 약속
 *   · 저장 경로는 sheetId.blockId.fieldId — build.mjs 의 fieldIndex 와 같은 문자열.
 *   · 이름을 다루지 않는다. 학번 코드만 표지 칸으로 받는다.
 *   · 일반화(G1~G4) 원문은 학생 화면에 절대 그리지 않는다(8차시 ④에서 학생이 쓴다).
 */
(function (global) {
  'use strict';

  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach(c => { if (c != null) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  };

  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${url} — ${r.status}`);
    return r.json();
  }

  /* ------------------------------ 불러오기 ------------------------------ */
  async function load(base, unitId) {
    const manifest = await getJSON(`${base}/manifest.json`);
    const entry = unitId ? manifest.units.find(u => u.id === unitId) : manifest.units[0];
    if (!entry) throw new Error(`단원을 찾을 수 없음: ${unitId}`);
    const unit = await getJSON(`${base}/${entry.dir}/${entry.unitFile}`);
    const sheets = await Promise.all(entry.sheets.map(s => getJSON(`${base}/${entry.dir}/${s.file}`)));
    return { manifest, entry, unit, sheets };
  }

  /* ------------------------------ 입력 만들기 ---------------------------- */
  function makeInput(ctx, path, opt) {
    opt = opt || {};
    const el = h(opt.lines > 1 ? 'textarea' : 'input', {
      class: 'ws-in', 'data-path': path,
      rows: opt.lines > 1 ? opt.lines : null,
      // 인쇄용 — worksheet.css 의 @media print 가 이 값으로 칸 높이를 잡는다.
      // rows 속성만으로는 인쇄에서 줄 수가 반영되지 않아 손글씨 공간이 다 같아진다.
      style: opt.lines > 1 ? `--rows:${opt.lines}` : null,
      maxlength: opt.maxChars || null,
      placeholder: opt.hint || '',
      disabled: ctx.readOnly ? '' : null
    });
    const v = ctx.answers[path];
    if (v != null) el.value = v;
    el.addEventListener('input', () => {
      ctx.answers[path] = el.value;
      if (opt.maxChars && counter) counter.textContent = `${el.value.length} / ${opt.maxChars}자`;
      ctx.emit(path, el.value);
    });
    let counter = null;
    if (opt.maxChars) {
      counter = h('div', { class: 'ws-count', text: `${(v || '').length} / ${opt.maxChars}자` });
      return h('div', { class: 'ws-inwrap' }, el, counter);
    }
    return el;
  }

  /* ------------------------------ 블록 그리기 ---------------------------- */
  function blockHead(ctx, b) {
    const card = b.card && ctx.unit.questionCards.find(c => c.id === b.card);
    return h('div', { class: 'ws-bhead' },
      h('h3', { class: 'ws-btitle' },
        b.n != null ? h('span', { class: 'ws-n', text: circled(b.n) }) : null,
        b.label || '',
        card ? h('span', { class: 'ws-card', text: `[질문 카드 · ${card.label}]` }) : null
      ),
      b.note ? h('p', { class: 'ws-note', text: b.note }) : null
    );
  }
  const circled = (n) => '①②③④⑤⑥⑦⑧⑨⑩'[n - 1] || String(n);

  const RENDER = {
    static(ctx, b) {
      const src = b.source || '';
      if (src === 'unit.transferGoal') return h('p', { class: 'ws-quote', text: `"${ctx.unit.transferGoal}"` });
      if (src === 'unit.concept') return h('p', { class: 'ws-lead' },
        h('strong', { text: ctx.unit.concept.name }), ' — ', ctx.unit.concept.statement);
      if (src === 'unit.essentialQuestions') return h('ol', { class: 'ws-eq' },
        ctx.unit.essentialQuestions.map(q => h('li', { text: q.text })));
      if (src === 'auto.toc') {
        const rows = (ctx.toc || []).map(t => h('tr', {},
          h('td', { class: 'ws-c', text: t.session }), h('td', { text: t.title }), h('td', { text: t.yield || '' })));
        return h('table', { class: 'ws-t' },
          h('thead', {}, h('tr', {}, h('th', { text: '차시' }), h('th', { text: '학습지 제목' }), h('th', { text: '완성하면 남는 것' }))),
          h('tbody', {}, rows));
      }
      return h('p', { class: 'ws-note', text: `(알 수 없는 static source: ${src})` });
    },

    fields(ctx, b) {
      const rows = [];
      const one = (it) => h('tr', {},
        h('th', { class: 'ws-lab', text: it.label }),
        h('td', {}, makeInput(ctx, `${ctx.sheet.id}.${b.id}.${it.id}`, { lines: it.lines || 1 })));
      if (b.lead) rows.push(one(b.lead));
      (b.items || []).forEach(it => rows.push(one(it)));
      return h('table', { class: 'ws-t ws-t-fields' }, h('tbody', {}, rows));
    },

    table(ctx, b) {
      const cols = b.columns || [];
      const head = h('tr', {}, cols.map(c => h('th', { text: c.label || '' })));
      const body = [];
      const cell = (path, opt) => h('td', {}, makeInput(ctx, path, opt || { lines: 2 }));
      if (Array.isArray(b.rows)) {
        b.rows.forEach(r => body.push(h('tr', {}, cols.map(c =>
          c.fixed ? h('th', { class: 'ws-lab', text: r[c.id] ?? r.trait ?? r.step ?? r.topic ?? '' })
                  : cell(`${ctx.sheet.id}.${b.id}.${r.id}.${c.id}`)))));
      } else {
        for (let i = 0; i < (Number(b.rows) || 1); i++) {
          body.push(h('tr', {}, cols.map(c => cell(`${ctx.sheet.id}.${b.id}.r${i}.${c.id}`))));
        }
      }
      const lead = b.lead
        ? h('p', { class: 'ws-leadrow' }, h('span', { class: 'ws-lab', text: b.lead.label + ' ' }),
            makeInput(ctx, `${ctx.sheet.id}.${b.id}.${b.lead.id}`, { lines: 1 }))
        : null;
      return h('div', {}, lead,
        h('table', { class: 'ws-t' }, cols.some(c => c.label) ? h('thead', {}, head) : null, h('tbody', {}, body)));
    },

    conceptTable(ctx, b) {
      const cols = b.columns || [];
      return h('table', { class: 'ws-t' },
        h('thead', {}, h('tr', {}, cols.map(c => h('th', { text: c.label })))),
        h('tbody', {}, (b.terms || []).map(t => h('tr', {},
          cols.map(c => c.id === 'term'
            ? h('th', { class: 'ws-lab', text: t.term })
            : h('td', {}, makeInput(ctx, `${ctx.sheet.id}.${b.id}.${t.id}.${c.id}`, { lines: 2 })))))));
    },

    cloze(ctx, b) {
      const wrap = h('div', { class: 'ws-cloze' });
      if (b.wordBank) wrap.append(h('p', { class: 'ws-bank' },
        h('span', { class: 'ws-lab', text: '보기 ' }), b.wordBank.map(w => h('span', { class: 'ws-chip', text: w }))));
      if (b.starter) wrap.append(h('p', { class: 'ws-starter', text: b.starter }));
      if (b.template) {
        const line = h('p', { class: 'ws-sentence' });
        const parts = b.template.split(/({{\s*[\w.]+\s*}})/g);
        parts.forEach(p => {
          const m = p.match(/{{\s*([\w.]+)\s*}}/);
          if (m) {
            const slot = (b.slots || []).find(s => s.id === m[1]) || { id: m[1] };
            line.append(makeInput(ctx, `${ctx.sheet.id}.${b.id}.${slot.id}`, { lines: 1, hint: slot.hint }));
          } else if (p) line.append(document.createTextNode(p));
        });
        wrap.append(line);
      } else {
        (b.slots || []).forEach(s =>
          wrap.append(makeInput(ctx, `${ctx.sheet.id}.${b.id}.${s.id}`, { lines: b.lines || 3, hint: s.hint })));
      }
      return wrap;
    },

    freewrite(ctx, b) {
      return h('div', {},
        b.prompt ? h('p', { class: 'ws-prompt', text: b.prompt }) : null,
        makeInput(ctx, `${ctx.sheet.id}.${b.id}.text`, { lines: b.lines || 4, maxChars: b.maxChars }));
    }
  };

  /* --------------------------- 학습지 한 장 --------------------------- */
  function renderSheet(root, opts) {
    const ctx = {
      unit: opts.unit, sheet: opts.sheet, toc: opts.toc || null,
      answers: opts.answers || {}, readOnly: !!opts.readOnly,
      emit: (path, value) => opts.onChange && opts.onChange(path, value, ctx.answers)
    };
    const s = ctx.sheet;
    root.innerHTML = '';
    root.classList.add('ws');

    root.append(h('header', { class: 'ws-head' },
      h('div', { class: 'ws-badge', text: s.kind === 'session' ? `${s.session} 차시` : (s.title || '') }),
      h('div', {},
        h('h2', { class: 'ws-title', text: s.title }),
        (s.screens || []).length ? h('p', { class: 'ws-screens' },
          '사용 화면: ' + s.screens.map(x => x.label + (x.exists === false ? ' (준비 중)' : '')).join(' · ')) : null)));

    if (s.todayQuestion) root.append(h('section', { class: 'ws-today' },
      h('span', { class: 'ws-lab', text: '오늘의 질문' }), h('p', { text: s.todayQuestion })));

    let page = 1;
    (s.blocks || []).forEach(b => {
      if ((b.page || 1) > page) { page = b.page; root.append(h('div', { class: 'ws-pagebreak' })); }
      if (b.sectionLabel) root.append(h('h2', { class: 'ws-section', text: b.sectionLabel }));
      const fn = RENDER[b.kind];
      root.append(h('section', { class: `ws-block ws-k-${b.kind}`, 'data-block': b.id },
        b.label || b.n != null ? blockHead(ctx, b) : null,
        fn ? fn(ctx, b) : h('p', { class: 'ws-note', text: `(모르는 블록: ${b.kind})` })));
    });

    if (s.carryOver) {
      const co = s.carryOver;
      root.append(h('section', { class: 'ws-block ws-carry' },
        h('h3', { class: 'ws-btitle', text: '▶ ' + (co.label || '다음 시간으로 넘기는 한 줄') }),
        h('p', { class: 'ws-prompt', text: co.prompt }),
        makeInput(ctx, `${s.id}.${co.id}.text`, { lines: 2 })));
    }

    const set = s.selfCheck && ctx.unit.selfCheckSets[s.selfCheck];
    if (set) {
      const rows = set.items.map(it => {
        const tr = h('tr', {}, h('td', { class: 'ws-lab', text: it.text }));
        set.scale.forEach(sc => {
          const path = `${s.id}.selfcheck.${it.id}`;
          const id = `${path}.${sc.id}`;
          const input = h('input', {
            type: 'radio', name: path, value: sc.id, id,
            checked: ctx.answers[path] === sc.id ? '' : null,
            disabled: ctx.readOnly ? '' : null,
            onchange: () => { ctx.answers[path] = sc.id; ctx.emit(path, sc.id); }
          });
          tr.append(h('td', { class: 'ws-c' }, input, h('label', { for: id, text: sc.mark || sc.label })));
        });
        return tr;
      });
      root.append(h('section', { class: 'ws-block ws-selfcheck' },
        h('h3', { class: 'ws-btitle' }, set.label,
          h('span', { class: 'ws-note', text: ' ' + set.scale.map(x => `${x.mark} ${x.label}`.trim()).join(' · ') })),
        h('table', { class: 'ws-t' }, h('tbody', {}, rows))));
    }

    root.append(h('footer', { class: 'ws-foot' },
      `${ctx.unit.title} · 학습 꾸러미${s.kind === 'session' ? ` · ${s.session}차시` : ''}`));
    return ctx;
  }

  /* 표지: 학번 코드 · 작품 제목 + 차례(자동) */
  function renderCover(root, opts) {
    return renderSheet(root, opts);
  }

  const Worksheet = { load, renderSheet, renderCover, _h: h };
  if (typeof module === 'object' && module.exports) module.exports = Worksheet;
  global.Worksheet = Worksheet;
})(typeof window !== 'undefined' ? window : globalThis);
