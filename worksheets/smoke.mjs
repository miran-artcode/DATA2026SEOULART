#!/usr/bin/env node
/*
 * smoke.mjs — 렌더러 연기 시험 (브라우저 없이)
 * ---------------------------------------------------------------------------
 *   node content/worksheets/smoke.mjs
 *
 * 최소한의 DOM 흉내로 학습지를 전부 그려 보고 두 가지를 확인한다.
 *   ① 어느 한 장도 그리다 터지지 않는가
 *   ② 화면이 만드는 저장 경로가 manifest.json 의 fieldIndex 와 정확히 같은가
 * 학습지를 고친 뒤 build.mjs 다음에 한 번 돌리면 경로가 어긋나는 사고를 막는다.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const J = async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8'));

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.text = ''; this.value = ''; }
  set className(v) { this.attrs.class = v; }
  get className() { return this.attrs.class || ''; }
  set textContent(v) { this.text = v; }
  get textContent() { return this.text; }
  set innerHTML(v) { this.children = []; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  append(...k) { k.forEach(x => this.children.push(x)); }
  get classList() { return { add: () => {} }; }
  get nodeType() { return 1; }
}
globalThis.document = {
  createElement: (t) => new El(t),
  createTextNode: (t) => Object.assign(new El('#text'), { text: t })
};
globalThis.window = globalThis;
new Function(await readFile(join(ROOT, 'render/worksheet.js'), 'utf8'))();

const manifest = await J('manifest.json');
const walk = (n, out = []) => {
  if (n.attrs && n.attrs['data-path']) out.push(n.attrs['data-path']);
  (n.children || []).forEach(c => walk(c, out));
  return out;
};

let failed = 0;
for (const entry of manifest.units) {
  const unit = await J(`${entry.dir}/${entry.unitFile}`);
  const seen = [];
  console.log(`\n[${entry.id}] ${entry.title}`);
  for (const s of entry.sheets) {
    const sheet = await J(`${entry.dir}/${s.file}`);
    const root = new El('main');
    try {
      Worksheet.renderSheet(root, { unit, sheet, toc: entry.toc, answers: {}, onChange: () => {} });
      const paths = walk(root);
      seen.push(...paths);
      console.log(`  ✓ ${s.file.padEnd(28)} 입력칸 ${String(paths.length).padStart(3)}개`);
    } catch (e) {
      console.error(`  ✕ ${s.file} — ${e.message}`);
      failed++;
    }
  }
  /* 자기점검은 라디오라 data-path 대신 name 을 쓴다 — 비교에서 뺀다 */
  const idx = entry.fieldIndex.filter(f => f.block !== 'selfcheck').map(f => f.path).sort();
  const dom = [...new Set(seen)].sort();
  const missing = idx.filter(p => !dom.includes(p));
  const extra = dom.filter(p => !idx.includes(p));
  console.log(`  manifest 칸 ${idx.length} · 화면 입력칸 ${dom.length}`);
  if (missing.length) { console.error('  화면에 없는 칸:', missing.slice(0, 10)); failed++; }
  if (extra.length) { console.error('  manifest 에 없는 칸:', extra.slice(0, 10)); failed++; }
}

console.log(failed ? '\n실패' : '\n통과 — 모두 그려지고 저장 경로가 일치한다');
process.exit(failed ? 1 : 0);
