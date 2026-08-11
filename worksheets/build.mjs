#!/usr/bin/env node
/*
 * build.mjs — 학습지 폴더를 훑어 manifest.json 을 다시 만든다.
 * ---------------------------------------------------------------------------
 * 쓰는 법
 *   node content/worksheets/build.mjs            검사 + manifest.json 다시 쓰기
 *   node content/worksheets/build.mjs --check     검사만 (파일 안 씀 · CI용)
 *   node content/worksheets/build.mjs --instances roster 로 학생별 빈 사본 만들기
 *
 * 왜 미리 만드는가
 *   목표 사이트는 서버 없는 정적 파일이라 브라우저가 폴더 목록을 읽을 수 없다.
 *   그래서 '폴더를 훑는 일'은 여기서(작업 시점) 하고, 실행 시점에는
 *   manifest.json 한 개만 읽는다. 정적 사이트와 Next.js 양쪽에서 똑같이 동작한다.
 *
 * 파일을 넣는 규칙 — 이것만 지키면 알아서 정리된다
 *   content/worksheets/<단원폴더>/unit.json        단원 메타 (필수, 폴더당 1개)
 *   content/worksheets/<단원폴더>/NN-이름.json     학습지 한 장 (NN = 정렬용 두 자리)
 *   content/worksheets/roster/*.csv               (선택) 학급 명부 — 코드만, 이름 금지
 *   → 파일을 넣고 이 스크립트를 한 번 돌리면 끝. 기존 파일은 고치지 않는다.
 */

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ARGV = process.argv.slice(2);
const CHECK_ONLY = ARGV.includes('--check');
const MAKE_INSTANCES = ARGV.includes('--instances');

/* js/log.js 가 기록하는 11개 action — 이 밖의 값은 오류로 잡는다 */
const LOG_ACTIONS = [
  'view', 'analyze', 'map_apply', 'ab_switch', 'coach_ask', 'coach_answer',
  'note_save', 'revise', 'exhibit', 'critique_write', 'reflect_submit'
];
const BLOCK_KINDS = ['fields', 'table', 'conceptTable', 'cloze', 'freewrite', 'static'];

const errors = [];
const warns = [];
const err = (where, msg) => errors.push(`${where} — ${msg}`);
const warn = (where, msg) => warns.push(`${where} — ${msg}`);

const isDir = async (p) => { try { return (await stat(p)).isDirectory(); } catch { return false; } };
const readJSON = async (p) => {
  try { return JSON.parse(await readFile(p, 'utf8')); }
  catch (e) { err(basename(p), `JSON 을 읽을 수 없음: ${e.message}`); return null; }
};

/* --------------------------------------------------------------------------
 * 칸(=답이 저장되는 자리) 열거 — 저장 경로는 sheetId.blockId.fieldId
 * 이 경로가 학생 답의 영구 주소다. 순서·문구가 바뀌어도 id 는 바꾸지 않는다.
 * -------------------------------------------------------------------------- */
function fieldsOfBlock(sheet, b) {
  const out = [];
  const at = `${sheet.id}.${b.id}`;
  const push = (fid, extra = {}) => out.push({
    path: `${at}.${fid}`,
    sheet: sheet.id, block: b.id, field: fid,
    evidence: b.evidence || null,
    rubric: !!b.rubric,
    scaffold: b.scaffold || null,
    logAction: b.logAction || null,
    ...extra
  });

  switch (b.kind) {
    case 'fields':
      if (b.lead) push(b.lead.id, { label: b.lead.label });
      (b.items || []).forEach(it => push(it.id, { label: it.label }));
      break;
    case 'table': {
      if (b.lead) push(b.lead.id, { label: b.lead.label });
      const cols = (b.columns || []).filter(c => !c.fixed);
      if (Array.isArray(b.rows)) {
        b.rows.forEach(r => cols.forEach(c => push(`${r.id}.${c.id}`, { label: `${r.trait || r.step || r.topic || r.id} / ${c.label}` })));
      } else {
        const n = Number(b.rows) || 1;
        for (let i = 0; i < n; i++) cols.forEach(c => push(`r${i}.${c.id}`, { label: c.label, repeatable: true }));
      }
      break;
    }
    case 'conceptTable': {
      const cols = (b.columns || []).filter(c => c.id !== 'term');
      (b.terms || []).forEach(t => cols.forEach(c => push(`${t.id}.${c.id}`, { label: `${t.term} / ${c.label}` })));
      break;
    }
    case 'cloze':
      (b.slots || []).forEach(s => push(s.id, { label: s.hint || '' }));
      break;
    case 'freewrite':
      push('text', { label: b.prompt || b.label, maxChars: b.maxChars || null });
      break;
    case 'static':
      break;
    default:
      err(`${at}`, `모르는 kind: ${b.kind} (허용: ${BLOCK_KINDS.join(', ')})`);
  }
  return out;
}

function validateSheet(unit, sheet, file) {
  const where = `${file}`;
  if (!sheet.id) err(where, 'id 가 없다');
  if (sheet.schemaVersion !== 1) warn(where, `schemaVersion=${sheet.schemaVersion} (이 스크립트는 1을 안다)`);
  if (typeof sheet.order !== 'number') err(where, 'order(정렬 번호)가 없다');

  (sheet.eq || []).forEach(id => {
    if (!unit.essentialQuestions.some(q => q.id === id)) err(where, `없는 본질적 질문: ${id}`);
  });
  (sheet.generalizations || []).forEach(id => {
    if (!unit.generalizations.some(g => g.id === id)) err(where, `없는 일반화: ${id}`);
  });
  if (sheet.selfCheck && !unit.selfCheckSets[sheet.selfCheck]) {
    err(where, `없는 자기점검 묶음: ${sheet.selfCheck}`);
  }

  const seen = new Set();
  (sheet.blocks || []).forEach(b => {
    const at = `${where} · ${sheet.id}.${b.id}`;
    if (!b.id) err(at, 'block id 가 없다');
    if (seen.has(b.id)) err(at, `block id 중복: ${b.id}`);
    seen.add(b.id);
    if (!BLOCK_KINDS.includes(b.kind)) err(at, `모르는 kind: ${b.kind}`);
    if (b.logAction && !LOG_ACTIONS.includes(b.logAction)) {
      err(at, `log.js 에 없는 action: ${b.logAction}`);
    }
    if (b.evidence && !unit.evidenceLayers.some(l => l.id === b.evidence)) {
      err(at, `없는 증거 층: ${b.evidence}`);
    }
    if (b.scaffold && !Object.keys(unit.scaffoldLadder).includes(b.scaffold)) {
      err(at, `없는 비계 단계: ${b.scaffold}`);
    }
    if (b.card && !unit.questionCards.some(c => c.id === b.card)) {
      err(at, `없는 질문 카드: ${b.card}`);
    }
    /* cloze: 본문 {{slot}} 과 slots 가 일치하는가 */
    if (b.kind === 'cloze' && b.template) {
      const inTpl = [...b.template.matchAll(/{{\s*([\w.]+)\s*}}/g)].map(m => m[1]);
      const declared = (b.slots || []).map(s => s.id);
      inTpl.filter(x => !declared.includes(x)).forEach(x => err(at, `template 의 {{${x}}} 가 slots 에 없다`));
      declared.filter(x => !inTpl.includes(x)).forEach(x => err(at, `slots 의 ${x} 가 template 에 없다`));
    }
  });
}

async function buildUnit(unitDir) {
  const files = (await readdir(unitDir)).filter(f => f.endsWith('.json')).sort();
  const unit = await readJSON(join(unitDir, 'unit.json'));
  if (!unit) { err(unitDir, 'unit.json 이 없다'); return null; }

  const sheetFiles = files.filter(f => f !== 'unit.json' && /^\d\d-/.test(f));
  const skipped = files.filter(f => f !== 'unit.json' && !/^\d\d-/.test(f));
  skipped.forEach(f => warn(f, '이름이 NN-이름.json 꼴이 아니라 건너뜀'));

  const sheets = [];
  for (const f of sheetFiles) {
    const s = await readJSON(join(unitDir, f));
    if (!s) continue;
    validateSheet(unit, s, f);
    sheets.push({ file: f, sheet: s });
  }
  sheets.sort((a, b) => (a.sheet.order ?? 99) - (b.sheet.order ?? 99));

  /* id 중복 */
  const ids = sheets.map(s => s.sheet.id);
  ids.forEach((id, i) => { if (ids.indexOf(id) !== i) err(unit.id, `학습지 id 중복: ${id}`); });

  /* 이어지기(carryOver) 목표가 실제로 있는가 */
  const blockPaths = new Set();
  sheets.forEach(({ sheet }) => (sheet.blocks || []).forEach(b => blockPaths.add(`${sheet.id}.${b.id}`)));
  sheets.forEach(({ sheet, file }) => {
    const co = sheet.carryOver;
    if (!co) return;
    (Array.isArray(co.to) ? co.to : [co.to]).filter(Boolean).forEach(t => {
      const target = t.includes('.') ? t : null;
      if (!target || !blockPaths.has(target)) err(file, `carryOver 목표를 찾을 수 없음: ${t}`);
    });
  });

  /* 화면·자료 공백 — 통합 전에 결정해야 할 것들을 매번 눈에 띄게 */
  sheets.forEach(({ sheet, file }) => {
    (sheet.screens || []).forEach(sc => {
      if (sc.exists === false) warn(file, `화면 공백: '${sc.label}' 는 아직 사이트에 없다`);
    });
    if (sheet.dataset && sheet.dataset.exists === false) {
      warn(file, `자료 공백: '${sheet.dataset.label}' 파일이 아직 없다`);
    }
    /* exists:true 라고 적어 놨는데 파일이 없으면 통합 때 404 가 난다 — 지금 잡는다 */
    if (sheet.dataset && sheet.dataset.exists === true) {
      [sheet.dataset.file, sheet.dataset.meta].filter(Boolean).forEach(p => {
        if (!existsSync(join(unitDir, p))) err(file, `dataset 파일을 찾을 수 없음: ${p}`);
      });
    }
    (sheet.gaps || []).forEach(g => warn(file, `할 일: ${g}`));
  });

  /* 자동 차례 + 칸 색인 */
  const toc = sheets.filter(s => s.sheet.kind === 'session').map(({ sheet }) => ({
    session: sheet.session, id: sheet.id, title: sheet.title, yield: sheet.yield
  }));

  const fieldIndex = [];
  sheets.forEach(({ sheet }) => {
    (sheet.blocks || []).forEach(b => fieldIndex.push(...fieldsOfBlock(sheet, b)));
    if (sheet.carryOver) fieldIndex.push({
      path: `${sheet.id}.${sheet.carryOver.id}.text`, sheet: sheet.id, block: sheet.carryOver.id,
      field: 'text', label: sheet.carryOver.prompt, evidence: 'process', rubric: false,
      scaffold: null, logAction: null, carryOverTo: sheet.carryOver.to
    });
    const set = sheet.selfCheck && unit.selfCheckSets[sheet.selfCheck];
    if (set) set.items.forEach(it => fieldIndex.push({
      path: `${sheet.id}.selfcheck.${it.id}`, sheet: sheet.id, block: 'selfcheck', field: it.id,
      label: it.text, evidence: 'process', rubric: false, scaffold: null, logAction: null,
      choices: set.scale.map(s => s.id)
    }));
  });

  const dupPaths = fieldIndex.map(f => f.path).filter((p, i, a) => a.indexOf(p) !== i);
  [...new Set(dupPaths)].forEach(p => err(unit.id, `저장 경로 중복: ${p}`));

  return {
    id: unit.id,
    dir: basename(unitDir),
    title: unit.title,
    subtitle: unit.subtitle,
    sessions: unit.sessions,
    unitFile: 'unit.json',
    sheets: sheets.map(({ file, sheet }) => ({
      id: sheet.id, file, order: sheet.order, session: sheet.session,
      kind: sheet.kind, title: sheet.title, yield: sheet.yield,
      pages: sheet.pages || 1,
      screens: (sheet.screens || []).map(s => s.page).filter(Boolean),
      dataset: sheet.dataset ? { file: sheet.dataset.file, meta: sheet.dataset.meta, rows: sheet.dataset.n } : null,
      eq: sheet.eq || [], generalizations: sheet.generalizations || [],
      scaffold: (sheet.blocks || []).map(b => b.scaffold).find(Boolean) || null,
      selfCheck: sheet.selfCheck || null,
      carryOverTo: sheet.carryOver ? (Array.isArray(sheet.carryOver.to) ? sheet.carryOver.to : [sheet.carryOver.to]) : []
    })),
    toc,
    fieldIndex,
    counts: {
      sheets: sheets.length,
      fields: fieldIndex.length,
      rubricFields: fieldIndex.filter(f => f.rubric).length
    }
  };
}

/* --------------------------- 학급 명부 (선택) --------------------------- */
async function readRoster() {
  const dir = join(ROOT, 'roster');
  if (!await isDir(dir)) return [];
  const out = [];
  for (const f of (await readdir(dir)).filter(f => f.toLowerCase().endsWith('.csv'))) {
    const text = await readFile(join(dir, f), 'utf8');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const head = lines[0].split(',').map(h => h.trim());
    const iK = head.findIndex(h => /반|klass|class/i.test(h));
    const iC = head.findIndex(h => /코드|code/i.test(h));
    if (iC < 0) { err(f, "roster CSV 에 '코드'(code) 열이 필요하다"); continue; }
    if (head.some(h => /이름|name/i.test(h))) {
      err(f, "roster 에 이름 열이 있다 — 개인정보를 저장하지 않는 설계다. 코드만 남겨 주세요.");
      continue;
    }
    lines.slice(1).forEach(l => {
      const c = l.split(',').map(x => x.trim());
      if (c[iC]) out.push({ klass: iK >= 0 ? c[iK] : '', code: c[iC], source: f });
    });
  }
  return out;
}

async function writeInstances(units, roster) {
  if (!roster.length) { console.log('· roster/*.csv 가 없어 학생 사본은 건너뜀'); return; }
  let n = 0;
  for (const u of units) {
    const dir = join(ROOT, 'instances', u.id);
    await mkdir(dir, { recursive: true });
    for (const st of roster) {
      const name = `${(st.klass || 'x').replace(/[^\w가-힣-]/g, '')}-${st.code}.json`;
      const p = join(dir, name);
      try { await stat(p); continue; } catch { /* 없으면 만든다 — 있으면 절대 덮지 않는다 */ }
      await writeFile(p, JSON.stringify({
        schemaVersion: 1, unit: u.id, code: st.code, klass: st.klass,
        createdAt: null, updatedAt: null, answers: {}, selfCheck: {}, submitted: {}
      }, null, 2) + '\n', 'utf8');
      n++;
    }
  }
  console.log(`· 학생 사본 ${n}개 새로 만듦 (이미 있는 파일은 건드리지 않음)`);
}

/* --------------------------------- 실행 --------------------------------- */
const entries = await readdir(ROOT, { withFileTypes: true });
const unitDirs = [];
for (const e of entries) {
  if (!e.isDirectory() || ['instances', 'roster', 'render', 'node_modules'].includes(e.name)) continue;
  if (await isDir(join(ROOT, e.name))) {
    try { await stat(join(ROOT, e.name, 'unit.json')); unitDirs.push(join(ROOT, e.name)); } catch { /* 단원 폴더 아님 */ }
  }
}

const units = [];
for (const d of unitDirs.sort()) {
  const u = await buildUnit(d);
  if (u) units.push(u);
}
const roster = await readRoster();

const manifest = {
  schemaVersion: 1,
  generatedBy: 'content/worksheets/build.mjs',
  units,
  roster: roster.map(r => ({ klass: r.klass, code: r.code })),
  logActions: LOG_ACTIONS
};

warns.forEach(w => console.log(`⚠ ${w}`));
if (errors.length) {
  errors.forEach(e => console.error(`✕ ${e}`));
  console.error(`\n오류 ${errors.length}개 — manifest 를 쓰지 않았다.`);
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log(`✓ 검사 통과 — 단원 ${units.length}, 학습지 ${units.reduce((a, u) => a + u.counts.sheets, 0)}, 칸 ${units.reduce((a, u) => a + u.counts.fields, 0)}`);
} else {
  await writeFile(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`✓ manifest.json 갱신 — 단원 ${units.length}, 학습지 ${units.reduce((a, u) => a + u.counts.sheets, 0)}, 칸 ${units.reduce((a, u) => a + u.counts.fields, 0)}`);
  units.forEach(u => console.log(`  · ${u.id}: 학습지 ${u.counts.sheets}장 · 저장 칸 ${u.counts.fields}개 · 루브릭 대상 ${u.counts.rubricFields}개`));
  if (MAKE_INSTANCES) await writeInstances(units, roster);
}
