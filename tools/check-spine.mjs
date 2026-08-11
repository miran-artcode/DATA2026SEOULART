/*
 * check-spine.mjs: 학습 척추(COURSE)와 화면이 어긋나지 않았는지 검사한다.
 * -----------------------------------------------------------------------------
 * 왜 필요한가: WS.mountLauncher()·WS.mountContext() 는 그 화면이 COURSE 에 없으면
 * 조용히 아무 일도 하지 않는다. 그래서 스크립트를 빠뜨려도 화면은 멀쩡해 보이고,
 * 학생만 '내가 몇 차시인지 알려 주지 않는 화면'을 만난다. 눈으로는 못 잡는 종류의 결함이라
 * 표를 읽어 기계로 확인한다.
 *
 *   node tools/check-spine.mjs
 *
 * 검사 항목
 *   1) COURSE 가 가리키는 화면 파일이 실제로 있는가
 *   2) 그 화면들이 js/worksheet.js 를 불러오고 위치 스트립·학습지 단추를 붙이는가
 *   3) 링크에 붙은 앵커(#ch5 같은)가 대상 화면에 실제로 있는가
 *   4) 학습지 JSON 의 screens 와 COURSE 의 그 차시 묶음이 같은 화면을 가리키는가
 *   5) 차시 번호와 단계 번호가 나란히 올라가는가(단계가 뒤로 가지 않는가)
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

const problems = [];
const warnings = [];
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

/* ---- COURSE 읽기: worksheet.js 를 가짜 window 위에서 한 번 실행한다 ---- */
function loadCourse() {
  const src = rd('js/worksheet.js');
  const win = {};
  // worksheet.js 는 불러오는 시점에 DOM 을 건드리지 않는다(모두 함수 안에 있다).
  // 그래도 혹시 모를 접근에 대비해 최소한의 껍데기를 준다.
  const shim = {
    document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
    location: { pathname: '/hub.html', search: '' },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: () => Promise.reject(new Error('no fetch in check')),
  };
  Object.assign(win, shim);
  const fn = new Function('window', 'document', 'location', 'localStorage', 'fetch', src + '\nreturn window.WS;');
  return fn(win, shim.document, shim.location, shim.localStorage, shim.fetch);
}

let WS;
try {
  WS = loadCourse();
} catch (e) {
  console.error('✕ js/worksheet.js 를 읽지 못했습니다:', e.message);
  process.exit(1);
}
if (!WS || !Array.isArray(WS.COURSE)) {
  console.error('✕ COURSE 표를 찾지 못했습니다.');
  process.exit(1);
}

const COURSE = WS.COURSE;
const sessions = COURSE.filter((c) => c.sheet !== 'cover');

/* ---- 0) page 는 화면의 '신원'이다: 조각(#)·쿼리(?)가 섞이면 forPage() 가 통째로 실패한다 ---- */
COURSE.forEach((c) => {
  (c.pages || []).forEach((p) => {
    if (/[#?]/.test(p)) fail(`${c.sheet}: pages 에 조각·쿼리가 섞였습니다: ${p} (18개 화면에서 스트립이 사라집니다)`);
  });
  ['learn', 'make', 'share'].forEach((slot) => {
    (c[slot] || []).forEach((x) => {
      if (/[#?]/.test(x.page))
        fail(`[${c.sheet}·${slot}] page 에 # 나 ? 를 넣지 마세요: ${x.page} (앵커는 hash 인자로)`);
    });
  });
});

/* ---- 1) 화면 파일이 실제로 있는가 + 3) 앵커가 약속대로 닿는가 ---- */
const allLinks = [];
COURSE.forEach((c) => {
  ['learn', 'make', 'share'].forEach((slot) => {
    (c[slot] || []).forEach((x) => allLinks.push({ ...x, sheet: c.sheet, slot }));
  });
});

allLinks.forEach((l) => {
  const file = l.page;
  if (!existsSync(join(ROOT, file))) {
    fail(`[${l.sheet}·${l.slot}] 없는 화면을 가리킵니다: ${file} ("${l.label}")`);
    return;
  }
  const hash = l.hash;
  if (!hash) return;
  // 앵커는 HTML 에 직접 있거나, 그 화면의 JS 가 그 id 를 만들어야 한다.
  const html = rd(file);
  const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
  if (html.includes(`id="${hash}"`)) return;
  const madeByJs = scripts.some((s) => {
    if (!existsSync(join(ROOT, s))) return false;
    const js = rd(s);
    // id: 'ch5' 처럼 정의하고 그 값을 id 속성으로 쓰는 경우까지 본다
    return js.includes(`'${hash}'`) || js.includes(`"${hash}"`);
  });
  if (!madeByJs) {
    fail(`[${l.sheet}·${l.slot}] 앵커 #${hash} 가 ${file} 에 없습니다 ("${l.label}")`);
    return;
  }
  // JS 가 나중에 그리는 앵커라면, 주소의 해시로 이동하는 보정 코드가 있어야 한다
  const hasScroll = scripts.some((s) => {
    if (!existsSync(join(ROOT, s))) return false;
    const js = rd(s);
    return js.includes('location.hash') && js.includes('scrollIntoView');
  });
  if (!hasScroll)
    fail(`[${l.sheet}·${l.slot}] ${file} 은 앵커를 JS 로 그리는데 해시 스크롤 보정이 없습니다 (#${hash} 로 이동 못 함)`);
});

/* ---- 2) 척추 화면이 worksheet.js 를 붙이고 위치 스트립을 부르는가 ---- */
const spinePages = [...new Set(allLinks.map((l) => l.page))].sort();
spinePages.forEach((p) => {
  if (!existsSync(join(ROOT, p))) return; // 위에서 이미 보고했다
  const html = rd(p);
  if (!html.includes('js/worksheet.js'))
    fail(`${p} 는 척추 화면인데 js/worksheet.js 를 불러오지 않습니다 (위치 스트립·학습지 단추가 안 뜹니다)`);
  else if (!html.includes('WS.mountContext('))
    fail(`${p} 는 js/worksheet.js 를 불러오지만 WS.mountContext() 를 부르지 않습니다 (학생이 몇 차시인지 모릅니다)`);
  // forPage() 가 이 화면을 실제로 찾아내는가: 신원 키가 어긋나면 여기서 걸린다
  if (!WS.forPage(p).length)
    fail(`${p} 는 COURSE 에 있는데 forPage() 가 빈 배열입니다 (신원 키가 어긋났습니다)`);
});

/* ---- 2-b) 척추 안의 링크는 어느 차시로 들어가는지(?s=)를 실어야 한다 ---- */
allLinks.forEach((l) => {
  const href = WS.hrefOf(l, l.sheet);
  if (!href.includes('?s=' + l.sheet))
    fail(`[${l.sheet}·${l.slot}] 링크가 차시를 싣지 않습니다: ${href} ("${l.label}")`);
  if (l.hash && !href.endsWith('#' + l.hash))
    fail(`[${l.sheet}·${l.slot}] 앵커가 주소 끝에 오지 않습니다: ${href}`);
});

/* ---- 2-c) 여러 차시가 쓰는 공용 화면은 '고르게 하는' 분기가 있어야 한다 ---- */
const multi = spinePages.filter((p) => WS.forPage(p).length > 1);
if (multi.length && !rd('js/worksheet.js').includes('resolveSession'))
  fail(`공용 화면 ${multi.length}개(${multi.join(', ')})의 차시 판별 분기가 없습니다`);

/* ---- 2-d) 고아 화면: 사이트 어디에서도 들어갈 수 없는 척추 화면 ---- */
const htmlFiles = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const inbound = new Set();
htmlFiles.forEach((f) => {
  [...rd(f).matchAll(/href="([^"#?]+\.html)/g)].forEach((m) => {
    if (m[1] !== f) inbound.add(m[1]);        // 자기 자신으로 가는 링크는 세지 않는다
  });
});
// 상단 메뉴가 만드는 링크도 도달 경로다(ui.js 의 손수 적은 두 묶음 + COURSE 가 만드는 차시 줄)
[...rd('js/ui.js').matchAll(/href: '([^']+\.html)'/g)].forEach((m) => inbound.add(m[1]));
COURSE.forEach((c) => ['learn', 'make', 'share'].forEach((k) => {
  if ((c[k] || []).length) inbound.add(c[k][0].page);   // 메뉴는 각 자리의 첫 화면을 건다
}));
spinePages.forEach((p) => {
  if (!inbound.has(p))
    fail(`${p} 로 들어가는 링크가 사이트 어디에도 없습니다(고아 화면)`);
});

/* ---- 4) 학습지 JSON 의 screens 와 COURSE 대조 ---- */
const unitDir = 'worksheets/unit-data-eye';
if (existsSync(join(ROOT, unitDir))) {
  readdirSync(join(ROOT, unitDir))
    .filter((f) => /^\d\d-.*\.json$/.test(f))
    .forEach((f) => {
      let sheet;
      try {
        sheet = JSON.parse(rd(join(unitDir, f)));
      } catch (e) {
        fail(`${unitDir}/${f} 를 읽지 못했습니다: ${e.message}`);
        return;
      }
      const entry = COURSE.find((c) => c.sheet === sheet.id);
      if (!entry) {
        if (sheet.kind !== 'cover') fail(`${f} (${sheet.id}) 가 COURSE 표에 없습니다`);
        return;
      }
      const mine = new Set(entry.pages || []);
      // JSON → COURSE
      (sheet.screens || []).forEach((s) => {
        if (!s.page || s.exists === false || s.teacherOnly) return;
        if (!mine.has(s.page))
          fail(`${f}: 학습지는 ${s.page} 를 쓴다는데 COURSE 의 ${sheet.id} 묶음에는 없습니다 ("${s.label}")`);
      });
      // COURSE → JSON (역방향). 한쪽만 보면 학습지 종이의 화면 목록이 반쪽이 된 걸 못 잡는다.
      const listed = new Set((sheet.screens || []).filter((s) => s.page).map((s) => s.page));
      (entry.pages || []).forEach((p) => {
        if (!listed.has(p))
          warn(`${f}: COURSE 의 ${sheet.id} 는 ${p} 를 쓰는데 학습지 screens 에는 없습니다(종이 지도가 반쪽)`);
      });
      // 교사 전용 화면이 학생 단추로 새지 않는가
      (sheet.screens || []).forEach((s) => {
        if (s.page === 'admin.html' && s.exists !== false && !s.teacherOnly)
          fail(`${f}: 교사 전용 admin.html 이 학생 단추로 나갑니다 (exists:false 나 teacherOnly 를 다세요)`);
      });
    });
}

/* ---- 5) 차시와 단계가 나란히 올라가는가 ---- */
let prevStage = 0;
sessions.forEach((c) => {
  if (c.stage < prevStage)
    fail(`차시 순서와 단계 순서가 어긋납니다: ${c.sheet} 의 단계 ${c.stage} 가 앞 차시의 단계 ${prevStage} 보다 낮습니다`);
  prevStage = Math.max(prevStage, c.stage);
});

/* ---- 6) 모든 차시가 세 면을 갖췄는가(비어 있으면 알림) ---- */
sessions.forEach((c) => {
  ['learn', 'make', 'share'].forEach((slot) => {
    if (!(c[slot] || []).length)
      warn(`${c.sheet}: '${{ learn: '배우기', make: '만들기', share: '나누기' }[slot]}' 칸이 비어 있습니다`);
  });
});

/* ---- 보고 ---- */
const label = (n) => `${n}개`;
console.log(`\n학습 척추 검사 · 차시 ${label(sessions.length)} · 척추 화면 ${label(spinePages.length)}\n`);
if (warnings.length) {
  console.log('알림 (막지는 않습니다)');
  warnings.forEach((w) => console.log('  · ' + w));
  console.log('');
}
if (problems.length) {
  console.log('✕ 어긋난 곳');
  problems.forEach((p) => console.log('  ✕ ' + p));
  console.log(`\n${problems.length}건을 고쳐야 합니다.\n`);
  process.exit(1);
}
console.log('✓ 척추와 화면이 모두 맞습니다.\n');
