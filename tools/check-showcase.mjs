#!/usr/bin/env node
/*
 * check-showcase.mjs: 우수 사례 데이터가 사이트의 규칙과 맞는지 검사
 * -----------------------------------------------------------------------------
 *   node tools/check-showcase.mjs
 *
 * JSON 이 열리는지가 아니라 '화면에서 제대로 보이는지'를 본다. 조용히 망가지는 자리가
 * 많기 때문이다: 학습지 칸 경로가 한 글자 틀리면 그 차시는 잠기고, 매핑이 없는 열
 * 이름을 가리키면 점이 전부 같은 크기로 그려지는데 스크린샷으로는 알아챌 수 없다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const data = read('data/showcase-class.json');
const unit = read('worksheets/manifest.json').units.find(u => u.id === 'data-eye');

const fail = [], warn = [];
const bad = (m) => fail.push(m);
const soso = (m) => warn.push(m);

/* ── js/log.js 가 받아 주는 값(정의된 것 말고는 기록되지 않는다) ── */
const ACTIONS = ['view', 'analyze', 'map_apply', 'ab_switch', 'coach_ask', 'coach_answer',
  'note_save', 'revise', 'exhibit', 'critique_write', 'reflect_submit'];
const STAGES = ['sense', 'intent', 'make', 'judge', 'revise', 'share', 'own'];
const KINDS = ['color', 'data', 'word', 'society'];
const DONE_PCT = 60;                    // js/worksheet.js 의 '완료' 기준

/* ── 1. 학습지: 차시마다 완료 기준을 넘는가 ──
 * 넘지 못하면 그 다음 차시가 '잠김'으로 그려져 여정 지도가 중간에서 끊긴다.
 */
const pathsBySheet = {};
unit.fieldIndex.forEach(f => { (pathsBySheet[f.sheet] = pathsBySheet[f.sheet] || []).push(f.path); });
const wsNotes = data.notes.filter(n => n.kind === 'worksheet');
const byUser = {};
wsNotes.forEach(n => { (byUser[n.userId] = byUser[n.userId] || {})[n.sheet] = n; });

Object.entries(byUser).forEach(([userId, sheets]) => {
  Object.entries(pathsBySheet).forEach(([sheet, paths]) => {
    const n = sheets[sheet];
    if (!n) { bad(`${userId}: ${sheet} 학습지 노트가 없다`); return; }
    const filled = paths.filter(p => String(n.answers[p] == null ? '' : n.answers[p]).trim()).length;
    const pct = Math.round(filled * 100 / paths.length);
    if (pct < DONE_PCT) bad(`${userId}/${sheet}: ${pct}% (${filled}/${paths.length}) — 완료 기준 ${DONE_PCT}% 미만이라 다음 차시가 잠긴다`);
    const unknown = Object.keys(n.answers).filter(p => !paths.includes(p));
    if (unknown.length) bad(`${userId}/${sheet}: 학습지에 없는 경로 ${unknown.slice(0, 3).join(', ')}`);
  });
  // 노트 id 는 js/worksheet.js 의 noteIdOf 와 같은 모양이어야 같은 학생의 같은 장으로 이어진다
  Object.entries(sheets).forEach(([sheet, n]) => {
    const want = 'ws_' + String(n.code).replace(/[^\w-]/g, '-') + '_data-eye_' + sheet;
    if (n.id !== want) bad(`${userId}/${sheet}: 노트 id 가 ${n.id} 인데 ${want} 여야 한다`);
  });
});

/* ── 2. 자기 점검 값이 척도 안에 있는가(라디오라 값이 다르면 아무것도 안 골라진다) ── */
const SCALE = { standard: ['good', 'mid', 'need'], final: ['full', 'some', 'notyet'] };
wsNotes.forEach(n => {
  const set = n.sheet === 's8' ? SCALE.final : SCALE.standard;
  Object.entries(n.answers).forEach(([p, v]) => {
    if (p.includes('.selfcheck.') && !set.includes(v)) bad(`${n.userId}/${p}: 자기 점검 값 '${v}' 은 척도에 없다`);
  });
});

/* ── 3. 작품: 재생과 갤러리가 성립하는가 ── */
const draftIds = new Set();
data.works.forEach(w => {
  if (!w.id) bad('id 없는 작품(불러오기에서 조용히 버려진다)');
  if (!KINDS.includes(w.kind)) bad(`${w.id}: 모르는 kind '${w.kind}'`);
  if (!w.thumb || !/^data:image\/png;base64,/.test(w.thumb)) bad(`${w.id}: 썸네일이 없거나 PNG data URI 가 아니다`);
  if (!w.intent || !w.evidence) bad(`${w.id}: 전시 조건(의도 한 문장 + 근거)이 비었다`);
  if (w.draftId) draftIds.add(w.draftId);

  if (w.kind === 'data') {
    const s = w.settings || {}, fields = s.fields || [], rows = s.rows || [], m = s.mapping || {};
    const names = new Set(fields.map(f => f.name));
    if (!rows.length) bad(`${w.id}: rows 가 비어 재생하면 빈 화면이 된다`);
    if (!fields.length) bad(`${w.id}: fields 가 없어 수치/범주를 구분할 수 없다`);
    ['size', 'speed', 'direction', 'density', 'alpha', 'shape', 'colorField'].forEach(k => {
      if (m[k] && !names.has(m[k])) bad(`${w.id}: mapping.${k} = '${m[k]}' 인데 그런 열이 없다(점이 전부 같은 값으로 그려진다)`);
    });
    fields.forEach(f => {
      if (!['num', 'cat'].includes(f.type)) bad(`${w.id}: 열 '${f.name}' 의 type 이 '${f.type}'`);
      if (f.type === 'num') {
        const nonNum = rows.filter(r => r[f.name] !== undefined && isNaN(+r[f.name])).length;
        if (nonNum) bad(`${w.id}: 수치 열 '${f.name}' 에 숫자가 아닌 값 ${nonNum}개`);
      }
    });
    fields.forEach(f => { if (rows.some(r => r[f.name] === undefined)) bad(`${w.id}: 열 '${f.name}' 이 비어 있는 행이 있다`); });
    if (m.colorMode === 'category') {
      if (!m.colorField) bad(`${w.id}: colorMode 가 category 인데 colorField 가 없다`);
      else {
        const vals = new Set(rows.map(r => String(r[m.colorField])));
        const missing = [...vals].filter(v => !(m.catColors || {})[v]);
        if (missing.length) bad(`${w.id}: 범주 색이 없는 값 ${missing.join(', ')} (전부 회색으로 그려진다)`);
      }
    }
  }
  if (w.kind === 'color') {
    if (!w.srcSample || !/^data:image\/png;base64,/.test(w.srcSample))
      bad(`${w.id}: 색 작품인데 srcSample 이 없다(점묘 재생이 정지 이미지로 떨어진다)`);
  }
  if (w.kind === 'society' && !(w.settings && w.settings.meta)) bad(`${w.id}: 사회 분석인데 settings.meta 가 없다`);
});

/* ── 4. 로그·버전·비평이 서로 이어지는가 ── */
data.logs.forEach(l => {
  if (!ACTIONS.includes(l.action)) bad(`로그 ${l.id}: 모르는 action '${l.action}'`);
  if (!STAGES.includes(l.stage)) bad(`로그 ${l.id}: 모르는 stage '${l.stage}'`);
  if (!l.uid) bad(`로그 ${l.id}: 가명 코드가 없다`);
  if (/[가-힣]{2,4}#/.test(String(l.uid))) bad(`로그 ${l.id}: uid 에 별명이 그대로 들어갔다`);
});
const workIds = new Set(data.works.map(w => w.id));
data.feedback.forEach(f => { if (!workIds.has(f.workId)) bad(`비평 ${f.id}: 없는 작품 ${f.workId} 을 가리킨다`); });
data.versions.forEach(v => {
  if (!draftIds.has(v.workId)) bad(`버전 ${v.id}: 어느 작품의 draftId 와도 이어지지 않는다`);
  if (v.settings && v.settings.rows) soso(`버전 ${v.id}: 자료 행이 들어 있다(파일만 커진다)`);
});
const logWorkIds = new Set(data.logs.map(l => l.workId).filter(Boolean));
[...logWorkIds].forEach(id => {
  if (!draftIds.has(id) && !workIds.has(id)) bad(`로그가 가리키는 ${id} 가 작품에도 draftId 에도 없다`);
});

/* ── 5. 심사용 블라인드: 실명·학교가 새어 들어가지 않았는가 ── */
const flat = JSON.stringify(data);
[/[가-힣]{2,3}(초등|중|고등)학교/, /\d학년\s*\d반\s*[가-힣]{2,3}\b/].forEach(re => {
  const m = flat.match(re);
  if (m) bad(`실명/학교로 읽힐 문구가 있다: ${m[0]}`);
});
const nicks = new Set(data.works.map(w => w.by));
data.works.forEach(w => { if (!w.userId || w.userId.split('#')[1] !== w.by) bad(`${w.id}: userId 와 표시 이름이 다르다`); });

/* ── 6. 중복 id(불러오기가 나중 것으로 덮어써 조용히 사라진다) ── */
['works', 'feedback', 'notes', 'quizzes', 'quizAnswers', 'logs', 'versions'].forEach(k => {
  const seen = new Set();
  (data[k] || []).forEach(x => {
    if (!x.id) bad(`${k}: id 없는 항목`);
    else if (seen.has(x.id)) bad(`${k}: id 중복 ${x.id}`);
    else seen.add(x.id);
  });
});

/* ── 결과 ── */
const bytes = fs.statSync(path.join(ROOT, 'data/showcase-class.json')).size;
console.log('작품 %d · 비평 %d · 노트 %d(학습지 %d) · 로그 %d · 버전 %d · 퀴즈 %d · 별명 %d명',
  data.works.length, data.feedback.length, data.notes.length, wsNotes.length,
  data.logs.length, data.versions.length, data.quizzes.length, nicks.size);
console.log('크기 %s MB (브라우저 저장 한계 약 5MB)', (bytes / 1048576).toFixed(2));
if (bytes > 3 * 1048576) soso('3MB 를 넘었다. 실제 학급 데이터와 함께 두면 저장 한계에 닿을 수 있다.');

warn.forEach(m => console.log('△ ' + m));
if (fail.length) {
  console.log('\n✕ 문제 %d개', fail.length);
  fail.slice(0, 40).forEach(m => console.log('  · ' + m));
  if (fail.length > 40) console.log('  … 외 %d개', fail.length - 40);
  process.exit(1);
}
console.log('✓ 모두 통과');
