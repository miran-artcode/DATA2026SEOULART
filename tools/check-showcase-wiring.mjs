#!/usr/bin/env node
/*
 * check-showcase-wiring.mjs: 화면이 실제로 그 자료를 조회하는지 검사
 * -----------------------------------------------------------------------------
 *   node tools/check-showcase-wiring.mjs
 *
 * check-showcase.mjs 가 '자료가 옳은가'를 본다면, 이 검사는 '자료가 화면까지 닿는가'를 본다.
 * 여기서 어긋나면 증상이 조용하다: 갤러리는 그냥 비어 보이고, 아무도 오류를 못 본다.
 *
 *   ① 저장소를 쓰는 화면은 모두 js/showcase.js 를 부르는가 (그리고 store.js 뒤에서)
 *   ② 그것이 조회하는 페이지 스크립트보다 먼저 '실행'되는가 (뒤면 감싸기 전에 조회가 일어난다)
 *   ③ 감싸는 읽기 메서드 목록이 Store 의 읽기 메서드를 다 덮는가
 *   ④ 지우기가 만지는 저장소 키가 js/store.js 의 키와 같은가
 *   ⑤ 자료 파일이 그 자리에 있는가
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fail = [];
const bad = (m) => fail.push(m);

const showcase = rd('js/showcase.js');
const store = rd('js/store.js');

/* ── ①② 화면마다 부르는 순서 ──
 * '소스에서 먼저 쓰였는가'가 아니라 '먼저 실행되는가'를 본다. defer(와 type=module)가 붙은
 * 스크립트는 문서를 다 읽은 뒤에 돌기 때문에, 소스에서 한참 뒤에 있는 인라인 스크립트가
 * 실제로는 먼저 실행된다. 자리만 비교하면 그런 화면이 ✓ 로 통과한다(studio-color.html 처럼
 * defer 로 부르는 화면이 여기 해당한다).
 *   실행 차례 = (defer 인가) 다음 (문서에서의 자리) — 브라우저의 규칙 그대로.
 */
function scriptsOf(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attr = m[1], src = (/\bsrc\s*=\s*["']([^"']+)["']/i.exec(attr) || [])[1] || '';
    // defer·async 는 외부 스크립트에만 듣는다(인라인에 적으면 브라우저가 무시한다).
    const deferred = !!src && (/\bdefer\b/i.test(attr) || /\btype\s*=\s*["']module["']/i.test(attr));
    out.push({
      src, body: src ? '' : m[2], at: m.index, deferred,
      isAsync: !!src && /\basync\b/i.test(attr),
      line: html.slice(0, m.index).split('\n').length
    });
  }
  out.slice().sort((a, b) => (a.deferred - b.deferred) || (a.at - b.at)).forEach((s, i) => { s.rank = i; });
  return out;
}
/*
 * 조회를 하는 페이지 스크립트. 인라인은 본문에서 Store 의 읽기 호출을 직접 찾고, 외부 파일은
 * 아래 목록으로 본다 — 파일을 정적으로 훑어 '읽기를 쓴다'까지는 알아도 '화면을 열 때 쓴다'는
 * 알 수 없어서다(js/log.js·js/version.js 처럼 나중에야 부르는 모듈이 헛되이 걸린다).
 */
const PAGE_SCRIPTS = ['js/gallery', 'js/exhibit.js', 'js/work.js', 'js/portfolio.js',
  'js/worksheet.js', 'js/quiz.js', 'js/literacy.js', 'js/society.js'];
const READER_RE = /\bStore\s*\.\s*(list[A-Z]\w*|get[A-Z]\w*)/;
const readsStore = (s) => s.src ? PAGE_SCRIPTS.some(p => s.src.includes(p)) : READER_RE.test(s.body);
const nameOf = (s) => s.src || `인라인 스크립트(${s.line}행)`;

const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
let wired = 0;
pages.forEach(f => {
  const all = scriptsOf(rd(f));
  const st = all.find(s => s.src.includes('js/store.js'));
  if (!st) return;                              // 저장소를 안 쓰는 화면은 검사 대상이 아니다
  const sc = all.find(s => s.src.includes('js/showcase.js'));
  if (!sc) { bad(`${f}: js/store.js 는 부르는데 js/showcase.js 를 안 부른다(이 화면만 빈 화면이 된다)`); return; }
  if (st.isAsync || sc.isAsync) bad(`${f}: js/store.js·js/showcase.js 에 async 가 붙어 실행 차례가 정해지지 않는다`);
  if (sc.rank < st.rank) bad(`${f}: js/showcase.js 가 js/store.js 보다 먼저 실행된다(감쌀 Store 가 아직 없다)`);
  const early = all.filter(s => s.rank < sc.rank && readsStore(s));
  if (early.length) bad(`${f}: ${early.map(nameOf).join(', ')} 가 js/showcase.js 보다 먼저 실행된다(감싸기 전에 조회가 일어난다)`);
  wired++;
});

/* ── ③ 감싸는 읽기 메서드가 Store 의 읽기를 다 덮는가 ── */
// js/store.js 의 공개 API 에서 조회로 읽히는 이름(list*/get*)을 뽑는다.
const api = store.slice(store.indexOf('const Store = {'));
const readers = new Set();
for (const m of api.matchAll(/^\s*(list[A-Z]\w*|get[A-Z]\w*)\s*:/gm)) readers.add(m[1]);
const wrapped = new Set();
const mList = /const READERS = \[([\s\S]*?)\];/.exec(showcase);
if (!mList) bad('js/showcase.js 에서 READERS 목록을 찾지 못했다');
else for (const m of mList[1].matchAll(/'([^']+)'/g)) wrapped.add(m[1]);
[...readers].sort().forEach(r => {
  if (!wrapped.has(r)) bad(`Store.${r} 이 감싸지지 않았다 — 이 조회는 자료가 실리기 전에 돌아온다`);
});
[...wrapped].sort().forEach(w => {
  if (!readers.has(w)) bad(`READERS 의 '${w}' 는 Store 에 없다(이름이 바뀌었거나 오타)`);
});

/* ── ④ 지우기가 만지는 키 ── */
const keysInStore = new Set();
for (const m of store.matchAll(/K_\w+\s*=\s*'([^']+)'/g)) keysInStore.add(m[1]);
const mKeys = /const KEYS = \[([\s\S]*?)\];/.exec(showcase);
if (!mKeys) bad('js/showcase.js 에서 KEYS 목록을 찾지 못했다');
else {
  const keys = new Set([...mKeys[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  [...keysInStore].sort().forEach(k => {
    if (!keys.has(k)) bad(`저장소 키 '${k}' 가 지우기 목록에 없다 — 지워도 그 자료가 남는다`);
  });
  [...keys].sort().forEach(k => {
    if (!keysInStore.has(k)) bad(`지우기 목록의 '${k}' 는 js/store.js 에 없는 키다`);
  });
}

/* ── ⑤ 자료 파일 ── */
const mUrl = /const URL_ = '([^']+)'/.exec(showcase);
if (!mUrl) bad('js/showcase.js 에서 자료 경로(URL_)를 찾지 못했다');
else if (!fs.existsSync(path.join(ROOT, mUrl[1]))) bad(`자료 파일이 없다: ${mUrl[1]} — node tools/make-showcase.mjs 로 만드세요`);

/* ── 결과 ── */
console.log('저장소를 쓰는 화면 %d개 · 감싸는 읽기 %d개 · 지우는 키 %d개',
  wired, wrapped.size, (mKeys ? [...mKeys[1].matchAll(/'([^']+)'/g)].length : 0));
if (fail.length) {
  console.log('\n✕ 문제 %d개', fail.length);
  fail.forEach(m => console.log('  · ' + m));
  process.exit(1);
}
console.log('✓ 모든 화면이 우수 사례 자료를 조회합니다.');
