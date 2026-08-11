#!/usr/bin/env node
/*
 * make-showcase.mjs: 우수 사례 학급 데이터 만들기
 * -----------------------------------------------------------------------------
 *   node tools/make-showcase.mjs            → data/showcase-class.json 을 다시 만든다
 *   node tools/make-showcase.mjs --stats    → 만들지 않고 크기·개수만 보여 준다
 *
 * 무엇을 만드는가
 *   Store.exportAll() 과 똑같은 모양의 파일 하나. 교사 대시보드의 「우수 사례 불러오기」가
 *   이 파일을 그대로 Store.importJSON() 에 넣는다. 새 저장 형식을 만들지 않으므로
 *   갤러리·키오스크·포트폴리오·학습지·지표가 손대지 않아도 이 데이터를 읽는다.
 *
 *   works      8명 × 6점(2·3·4·5·6·7차시) = 48점. 전부 전시 상태.
 *   notes      학습지 9장 × 8명 + 작업노트·성찰·진술문 등
 *   feedback   또래 비평(펠드먼 4단계 + 4영역 루브릭)
 *   logs       11개 action · 7단계로 남는 학습 로그
 *   versions   판단의 흔적(버전 스냅샷)
 *   quizzes    1차시 분석 퀴즈와 그 답
 *
 * 재현성
 *   Date.now()·Math.random() 을 쓰지 않는다. 시각은 BASE 에서 오프셋으로 계산하고
 *   난수는 학생마다 정해진 씨앗을 쓴다. 그래서 다시 실행해도 파일이 바이트까지 같다.
 *   (매번 달라지면 무엇이 바뀌었는지 볼 수 없고 git 이 통째로 더러워진다.)
 *
 * 개인정보
 *   실명·학교 이름은 만들지 않는다. 화면에 나가는 이름은 별명뿐이고 로그에는 그것도
 *   없다(반 + 가명 코드). 사이트의 원래 규칙과 같다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERSONAS } from './showcase/personas.mjs';
import { Img, rng, painting, dataThumb, colorThumb, wordThumb, societyThumb } from './showcase/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'showcase-class.json');
const UNIT = 'data-eye';

/* ───────────────────────── 사이트와 같은 규칙 ─────────────────────────
 * 아래 세 함수는 js/auth.js·js/log.js 에 있는 것과 같은 계산이어야 한다.
 * 다르면 같은 학생의 학습지·로그·작품이 교사 화면에서 서로 다른 사람이 된다.
 */
const pad2 = (v) => ('0' + String(+v)).slice(-2);
function normSid(sid) {
  const parts = String(sid == null ? '' : sid).split(/[^0-9]+/).filter(Boolean);
  if (parts.length === 3) return String(+parts[0]) + pad2(parts[1]) + pad2(parts[2]);
  const d = parts.join('');
  if (d.length === 4) return d[0] + '0' + d.slice(1);
  return d;
}
function klassOf(sid) {
  const d = normSid(sid);
  return d.length === 5 ? +d[0] + '-' + +d.slice(1, 3) : '';
}
function hash32(s) {                                   // FNV-1a 32bit (js/log.js 와 동일)
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36).slice(0, 4);
}

/* ───────────────────────── 시간 ─────────────────────────
 * 8차시를 주 1회로 잡는다. 2026-05-04(월) 3교시부터 8주.
 */
const BASE = Date.UTC(2026, 4, 4, 1, 40);              // 한국 시각 10:40
const DAY = 86400000, WEEK = 7 * DAY, MIN = 60000;
const at = (session, minutes) => BASE + (session - 1) * WEEK + minutes * MIN;

/* ───────────────────────── 학생 ───────────────────────── */
const STUDENTS = PERSONAS.map((p, i) => {
  const sid = normSid(p.sid), klass = klassOf(sid), userId = sid + '#' + p.nick;
  return { ...p, i, sid, klass, userId, code: (klass || '무반') + '·' + hash32(userId), R: rng(p.seed) };
});
const idOf = (s, tag) => 'sc_' + s.sid + '_' + tag;    // 결정적 id(다시 만들어도 같은 문서를 덮어쓴다)

/* 버전 스냅샷에는 자료 행을 담지 않는다.
   버전 비교(js/version.js 의 diff)가 보는 것은 매핑·움직임 값이고, 행은 작품과 같은 것이
   여덟 번 되풀이되어 파일만 몇 배로 키운다. 행의 원본은 언제나 work.settings 다. */
const lite = (settings) => { const o = { ...settings }; delete o.rows; delete o.fields; return o; };

/* ───────────────────────── 데이터셋 ─────────────────────────
 * 작품이 '살아 움직이게' 재생되려면(js/player.js) settings 안에 fields·rows 가 있어야 한다.
 * fields[].type 은 'num' 또는 'cat'. 범주열을 'num' 으로 적으면 색이 전부 회색이 된다.
 */
const F = (name, type) => ({ name, type: type || 'num' });
const ri = (R, a, b) => a + Math.round(R() * (b - a));
const rf = (R, a, b, d = 1) => +(a + R() * (b - a)).toFixed(d);
const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];

// 4차시 대표 자료: 아빠의 한 달 코골이(js/studio-sound.js 의 샘플과 같은 이야기 구조)
function snoringRows(R) {
  const ctxByDay = (n) => {
    if (n === 10 || n === 25) return '월급날';
    if (n === 18) return '아픈날';
    const dow = (n - 1) % 7;
    if (dow === 5 || dow === 6) return '주말';
    if (n % 9 === 0) return '야근';
    return '평일';
  };
  const story = {
    평일: { 음량: [48, 60], 깊이: [55, 68], 규칙성: [62, 74], 뒤척임: [12, 24] },
    야근: { 음량: [72, 88], 깊이: [80, 94], 규칙성: [34, 48], 뒤척임: [46, 62] },
    월급날: { 음량: [58, 70], 깊이: [64, 76], 규칙성: [56, 68], 뒤척임: [26, 38] },
    주말: { 음량: [66, 82], 깊이: [86, 98], 규칙성: [60, 72], 뒤척임: [16, 28] },
    아픈날: { 음량: [34, 50], 깊이: [40, 55], 규칙성: [28, 44], 뒤척임: [52, 68] }
  };
  const rows = [];
  for (let n = 1; n <= 30; n++) {
    const c = ctxByDay(n), s = story[c];
    rows.push({ 밤: n, 상황: c, 음량: ri(R, s.음량[0], s.음량[1]), 깊이: ri(R, s.깊이[0], s.깊이[1]),
      규칙성: ri(R, s.규칙성[0], s.규칙성[1]), 뒤척임: ri(R, s.뒤척임[0], s.뒤척임[1]) });
  }
  return { fields: [F('밤'), F('상황', 'cat'), F('음량'), F('깊이'), F('규칙성'), F('뒤척임')], rows };
}

// 신체측정 252명: 6차시 학습지가 쓰는 실제 파일에서 고르게 뽑는다(원본 열 이름 그대로).
function bodyfatRows(take = 48) {
  const csv = fs.readFileSync(path.join(ROOT, 'data', 'bodyfat.csv'), 'utf8').trim().split(/\r?\n/);
  const cols = csv[0].split(',');
  const all = csv.slice(1).map(l => {
    const v = l.split(','), o = {};
    cols.forEach((c, i) => { o[c] = +v[i]; });
    return o;
  });
  const step = all.length / take, idx = [];
  for (let i = 0; i < take; i++) idx.push(Math.floor(i * step));
  /* 6차시의 내용은 '있을 수 없는 값이 아무 말 없이 그려진다'는 것이다. 고르게 뽑기만 하면
     그 두 줄(체지방률 0% · 키 29.5인치)이 표본에서 빠져, 학생이 학습지에 적은 발견이
     정작 자기 작품에는 없게 된다. 두 줄은 반드시 넣고 가장 가까운 자리를 내준다. */
  const must = [all.findIndex(r => r.BodyFat === 0), all.findIndex(r => r.Height < 40)].filter(i => i >= 0);
  must.forEach(m => {
    if (idx.includes(m)) return;
    let near = 0;
    idx.forEach((v, k) => { if (Math.abs(v - m) < Math.abs(idx[near] - m)) near = k; });
    idx[near] = m;
  });
  idx.sort((a, b) => a - b);
  const rows = idx.map(i => all[i]);
  const outliers = rows.map((r, i) => (r.BodyFat === 0 || r.Height < 40) ? i : -1).filter(i => i >= 0);
  return { fields: cols.map(c => F(c)), rows, total: all.length, outliers };
}

// 나머지 자료는 학생이 쓴 이야기에 맞춰 씨앗에서 만든다(수치가 학습지의 서술과 어긋나지 않게).
const DATASET3 = {
  코끼리잠: (R) => {
    const rows = 'ABCDEFGHIJKL'.split('').map((s, i) => {
      const sns = ri(R, 1, 8), sleep = Math.max(4, 9 - Math.round(sns * 0.6) - (R() < 0.3 ? 1 : 0));
      return { 학생: s, 수면시간: sleep, 공부시간: ri(R, 1, 5), SNS시간: sns, 스트레스: Math.min(9, 10 - sleep + ri(R, -1, 1)) };
    });
    return { name: '잠과 화면의 줄다리기(우리 반 12명)', fields: [F('학생', 'cat'), F('수면시간'), F('공부시간'), F('SNS시간'), F('스트레스')], rows,
      mapping: { size: 'SNS시간', speed: '스트레스', colorMode: 'gradient', colorField: '수면시간', gradLow: '#ff5a3c', gradHigh: '#2740c8' } };
  },
  저울눈금: (R) => {
    const origins = ['에콰도르', '베네수엘라', '페루', '마다가스카르', '가나', '도미니카'];
    const rows = Array.from({ length: 26 }, (_, i) => {
      const cocoa = ri(R, 60, 90);
      return { 번호: i + 1, 원산지: pick(R, origins), '코코아%': cocoa, 평점: rf(R, 2.5, 4.0, 2), 연도: ri(R, 2010, 2021) };
    }).sort((a, b) => a['코코아%'] - b['코코아%']);
    return { name: '맛을 숫자로(초콜릿 2,530개 중 26개 표본)', fields: [F('번호'), F('원산지', 'cat'), F('코코아%'), F('평점'), F('연도')], rows,
      mapping: { size: '평점', colorMode: 'category', colorField: '원산지',
        catColors: { 에콰도르: '#4d9d6e', 베네수엘라: '#c9a227', 페루: '#c8482f', 마다가스카르: '#2f6ba8', 가나: '#8a5a2b', 도미니카: '#6b3f8c' } } };
  },
  빛의결: (R) => {
    const rows = Array.from({ length: 28 }, (_, i) => ({
      번호: i + 1, 긍정도: rf(R, 0.05, 0.95, 2), 에너지: rf(R, 0.1, 0.98, 2), 춤추기좋음: rf(R, 0.2, 0.95, 2), 템포: ri(R, 68, 176)
    }));
    return { name: '음악 감정 지도(Spotify 5,000곡 중 28곡 표본)', fields: [F('번호'), F('긍정도'), F('에너지'), F('춤추기좋음'), F('템포')], rows,
      mapping: { size: '에너지', speed: '템포', colorMode: 'gradient', colorField: '긍정도', gradLow: '#2740c8', gradHigh: '#ffd23c' } };
  },
  흔들리는땅: (R) => {
    const rows = Array.from({ length: 30 }, (_, i) => {
      const m = rf(R, 6.0, 7.4, 1);
      return { 연도: 1965 + i * 2, 규모: i === 21 ? 9.1 : (i === 9 ? 8.6 : m), 깊이km: ri(R, 8, 560), 에너지: 0 };
    });
    rows.forEach(r => { r.에너지 = +Math.pow(10, 1.5 * (r.규모 - 6)).toFixed(1); });
    return { name: '떨림의 데이터(지진 8,265건 중 30건 표본)', fields: [F('연도'), F('규모'), F('깊이km'), F('에너지')], rows,
      mapping: { size: '에너지', speed: '규모', colorMode: 'gradient', colorField: '깊이km', gradLow: '#ff5a3c', gradHigh: '#2740c8' } };
  },
  말없는대화: (R) => {
    const acts = ['수업', '발표', '토론', '점심', '휴식', '체육', '실습', '정리', '하교'];
    const temp = [3, 4, 3, 2, 2, 1, 2, 4, 5];
    const rows = acts.map((a, i) => ({ 시간: (9 + i) + '시', 감정온도: temp[i], 활동: a, 변화량: i ? Math.abs(temp[i] - temp[i - 1]) : 0 }));
    return { name: '우리 반 하루 감정(9칸 · 직접 입력)', fields: [F('시간', 'cat'), F('감정온도'), F('활동', 'cat'), F('변화량')], rows,
      mapping: { size: '변화량', colorMode: 'gradient', colorField: '감정온도', gradLow: '#2740c8', gradHigh: '#ffd23c' } };
  },
  창가의빛: (R) => {
    const types = ['불꽃', '물', '풀', '전기', '바위', '비행'];
    const rows = Array.from({ length: 26 }, (_, i) => {
      const total = ri(R, 280, 680);
      return { 번호: i + 1, 타입: pick(R, types), 총합: total, 공격: ri(R, 30, 150), 방어: ri(R, 25, 140), 속도: ri(R, 20, 145) };
    });
    return { name: '강함의 모양(Pokémon 1,215마리 중 26마리 표본)', fields: [F('번호'), F('타입', 'cat'), F('총합'), F('공격'), F('방어'), F('속도')], rows,
      mapping: { size: '총합', speed: '속도', colorMode: 'category', colorField: '타입',
        catColors: { 불꽃: '#c8482f', 물: '#2f6ba8', 풀: '#4d9d6e', 전기: '#e0a021', 바위: '#8a7a5a', 비행: '#8fa8c4' } } };
  },
  물의권리: (R) => {
    const names = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', '거', '너', '더', '러', '머', '버'];
    const rows = names.map((n, i) => {
      const rate = rf(R, 42, 99, 1), pop = ri(R, 3, 1400) / 10;      // 백만 명
      return { 국가: n + '국', '이용률%': rate, '인구백만': +pop.toFixed(1), '못쓰는사람백만': +(pop * (100 - rate) / 100).toFixed(2) };
    });
    return { name: '안전한 식수를 못 쓰는 사람(SDG 6 · 20개국 표본)', fields: [F('국가', 'cat'), F('이용률%'), F('인구백만'), F('못쓰는사람백만')], rows,
      mapping: { size: '못쓰는사람백만', colorMode: 'gradient', colorField: '이용률%', gradLow: '#c8482f', gradHigh: '#2f6ba8' } };
  },
  낱말수집가: (R) => {
    const shapes = ['원반', '빛', '삼각', '구', '불꽃'];
    const peak = (y) => 1 + 3.2 * Math.exp(-Math.pow((y - 1998) / 4, 2)) + 2.4 * Math.exp(-Math.pow((y - 2012) / 3.5, 2));
    const rows = Array.from({ length: 30 }, (_, i) => {
      const y = 1990 + i;
      return { 연도: y, 모양: pick(R, shapes), 지속초: ri(R, 5, 900), 건수: Math.round(peak(y) * ri(R, 30, 60)) };
    });
    return { name: '목격의 사회학(UFO 5,000건 · 연도별 30줄)', fields: [F('연도'), F('모양', 'cat'), F('지속초'), F('건수')], rows,
      mapping: { size: '건수', colorMode: 'category', colorField: '모양',
        catColors: { 원반: '#c9a227', 빛: '#e8cf6a', 삼각: '#2f6ba8', 구: '#4d9d6e', 불꽃: '#c8482f' } } };
  }
};

// 4차시(소리): 코끼리잠만 30밤 이야기, 나머지는 시간축 특징표
function dataset4(s) {
  const R = s.R;
  if (s.nick === '코끼리잠') {
    const d = snoringRows(R);
    return { name: '아빠의 한 달 코골이(30밤)', ...d,
      mapping: { size: '음량', speed: '뒤척임', colorMode: 'category', colorField: '상황',
        catColors: { 평일: '#6f8bb5', 야근: '#c8482f', 월급날: '#4d9d6e', 주말: '#e0a021', 아픈날: '#8a6ba8' } } };
  }
  const SPEC = {
    저울눈금: { name: '급식실의 5분', n: 24, cols: ['음량', '저음', '고음', '변화량'], spike: 10, note: '조용히' },
    빛의결: { name: '비 오는 날 창가 20분', n: 24, cols: ['음량', '저음', '고음', '변화량'], spike: 16, note: '고음' },
    흔들리는땅: { name: '지하철이 들어오는 40초', n: 20, cols: ['음량', '저음', '고음', '변화량'], spike: 12, note: '저음' },
    말없는대화: { name: '내 방에서 혼잣말한 3분', n: 18, cols: ['음량', '변화량', '침묵길이'], spike: 8, note: '침묵' },
    창가의빛: { name: '집 앞 골목 아침 7시 30분', n: 18, cols: ['음량', '저음', '고음', '변화량'], spike: 5, note: '고음' },
    물의권리: { name: '정수기 앞 2분', n: 24, cols: ['음량', '저음', '고음', '변화량'], spike: 7, note: '저음' },
    낱말수집가: { name: '소리 내어 읽은 4분', n: 24, cols: ['음량', '변화량', '고음', '쉼'], spike: 14, note: '변화량' }
  }[s.nick];
  const rows = [];
  for (let i = 0; i < SPEC.n; i++) {
    const o = { 시간: i + 1 };
    SPEC.cols.forEach(c => {
      let v = ri(R, 22, 58);
      if (c === '침묵길이') v = (i >= 8 && i <= 13) ? ri(R, 22, 30) : ri(R, 0, 4);
      if (c === '쉼') v = (i === SPEC.spike || i === SPEC.spike + 3) ? ri(R, 6, 9) : ri(R, 0, 2);
      if (c === SPEC.note && i === SPEC.spike) v = ri(R, 82, 96);
      if (c === '음량' && SPEC.note === '침묵' && i >= 8 && i <= 13) v = ri(R, 0, 3);
      o[c] = v;
    });
    rows.push(o);
  }
  const fields = [F('시간')].concat(SPEC.cols.map(c => F(c)));
  const primary = SPEC.cols.includes('변화량') ? '변화량' : SPEC.cols[0];
  return { name: SPEC.name, fields, rows,
    mapping: { size: primary, speed: SPEC.cols[0], colorMode: 'gradient', colorField: SPEC.cols[0], gradLow: '#182F49', gradHigh: '#E6F5A6' } };
}

// 5차시(내 삶): 사진 특징표 또는 대화 기록표
function dataset5(s) {
  const R = s.R;
  const PHOTO = ['코끼리잠', '빛의결', '흔들리는땅', '창가의빛', '물의권리'];
  if (PHOTO.includes(s.nick)) {
    const n = { 코끼리잠: 6, 빛의결: 6, 흔들리는땅: 8, 창가의빛: 6, 물의권리: 7 }[s.nick];
    const hues = ['주황', '파랑', '초록', '무채색', '노랑', '빨강'];
    const rows = Array.from({ length: n }, (_, i) => ({
      순간: i + 1, 밝기: ri(R, 12, 88), 대비: ri(R, 18, 76), 따뜻함: ri(R, 24, 82),
      생생함: ri(R, 8, 74), 다양함: ri(R, 22, 88), 북적임: ri(R, 6, 79), 주색: pick(R, hues)
    }));
    // 학습지에 적은 '가장 어두운 사진이 가장 즐거웠다'가 실제 수치에서도 읽히도록 한 줄을 못 박는다
    rows[rows.length - 1].밝기 = 14; rows[rows.length - 1].생생함 = 9; rows[rows.length - 1].주색 = '무채색';
    const NAME = { 코끼리잠: '아빠와 찍은 순간(사진)', 빛의결: '즐거운 순간(사진)', 흔들리는땅: '한 주의 등굣길(사진)',
      창가의빛: '즐거운 순간(사진)', 물의권리: '물을 쓰는 순간(사진)' };
    return { name: NAME[s.nick], fields: [F('순간'), F('밝기'), F('대비'), F('따뜻함'), F('생생함'), F('다양함'), F('북적임'), F('주색', 'cat')], rows,
      mapping: { size: '북적임', colorMode: 'gradient', colorField: '밝기', gradLow: '#182F49', gradHigh: '#E6F5A6' } };
  }
  if (s.nick === '낱말수집가') {
    const kinds = ['일기', '수행평가', '독서기록'];
    const rows = Array.from({ length: 12 }, (_, i) => ({ 순서: i + 1, 종류: pick(R, kinds), 글자수: ri(R, 120, 780), 물음표: R() < 0.3 ? 1 : 0, 그냥횟수: ri(R, 0, 7) }));
    return { name: '한 달 동안 쓴 글 14편', fields: [F('순서'), F('종류', 'cat'), F('글자수'), F('물음표'), F('그냥횟수')], rows,
      mapping: { size: '그냥횟수', colorMode: 'category', colorField: '종류', catColors: { 일기: '#c9a227', 수행평가: '#2f6ba8', 독서기록: '#4d9d6e' } } };
  }
  const n = s.nick === '말없는대화' ? 35 : 34;
  const rows = Array.from({ length: n }, (_, i) => {
    const me = i % 2 === 0;
    return { 순서: i + 1, 화자: me ? '나' : 'AI', 글자수: me ? ri(R, 4, 212) : ri(R, 60, 340), 물음표: me && R() < 0.55 ? 1 : 0, 다시물음: me && R() < 0.25 ? 1 : 0 };
  });
  return { name: s.nick === '말없는대화' ? 'AI 챗봇과 나눈 대화 46줄' : '메신저 대화 40줄', fields: [F('순서'), F('화자', 'cat'), F('글자수'), F('물음표'), F('다시물음')], rows,
    mapping: { size: s.nick === '말없는대화' ? '다시물음' : '글자수', colorMode: 'category', colorField: '화자',
      catColors: { 나: '#e0a021', AI: '#2f6ba8' } } };
}

/* ───────────────────────── 학습지 163칸 ─────────────────────────
 * 경로는 worksheets/manifest.json 의 fieldIndex 와 한 글자도 다르면 안 된다.
 * (다르면 그 칸은 '안 채운 칸'이 되어 차시가 잠기고 제출률이 어긋난다.)
 */
function answersOf(s) {
  const a = {};
  const put = (p, v) => { a[p] = String(v); };
  const self = (sheet, marks, keys) => keys.forEach((k, i) => put(`${sheet}.selfcheck.${k}`, marks[i]));
  const STD = ['why', 'concept', 'sentence'];

  put('cover.identity.student_code', s.code);
  put('cover.identity.work_title', s.workTitle);

  // 1차시
  const p1 = s.s1;
  put('s1.report.picked_painting', p1.picked);
  p1.analyses.forEach(([n, num, lost], i) => {
    put(`s1.report.r${i}.analysis_name`, n); put(`s1.report.r${i}.one_number`, num); put(`s1.report.r${i}.lost_in_recreation`, lost);
  });
  put('s1.choose_discard.first_impression', p1.impression);
  put('s1.choose_discard.three_elements', p1.elements);
  put('s1.choose_discard.k4_vs_k16', p1.k4vs16);
  put('s1.my_words.summary.seen', p1.summary[0]); put('s1.my_words.summary.reworded', p1.summary[1]);
  put('s1.my_words.loss.seen', p1.loss[0]); put('s1.my_words.loss.reworded', p1.loss[1]);
  ['k', 'visible', 'gone', 'act'].forEach((k, i) => put('s1.one_sentence.' + k, p1.one[i]));
  put('s1.next_line.text', p1.next);
  self('s1', p1.self, STD);

  // 2차시
  const p2 = s.s2;
  p2.tries.forEach(([set, chg, feel], i) => {
    put(`s2.report.r${i}.changed_setting`, set); put(`s2.report.r${i}.screen_change`, chg); put(`s2.report.r${i}.my_feeling`, feel);
  });
  put('s2.choose_discard.kept_three', p2.keptThree);
  put('s2.choose_discard.discarded_one', p2.discardedOne);
  put('s2.choose_discard.mic_help_harm', p2.micHelpHarm);
  put('s2.my_words.parameter.seen', p2.param[0]); put('s2.my_words.parameter.reworded', p2.param[1]);
  put('s2.my_words.expression.seen', p2.expr[0]); put('s2.my_words.expression.reworded', p2.expr[1]);
  ['what', 'result', 'meaning'].forEach((k, i) => put('s2.one_sentence.' + k, p2.one[i]));
  put('s2.next_line.text', p2.next);
  self('s2', p2.self, STD);

  // 3차시
  const p3 = s.s3;
  put('s3.report.data_name', p3.dataName);
  put('s3.report.columns_present', p3.cols);
  put('s3.report.columns_used_dropped', p3.usedDropped);
  ['size', 'color', 'speed', 'shape'].forEach(k => {
    put(`s3.rules_ab.${k}.plan_a`, p3.ab[k][0]); put(`s3.rules_ab.${k}.plan_b`, p3.ab[k][1]);
  });
  put('s3.choose_discard.chosen_plan_why', p3.chosenWhy);
  put('s3.choose_discard.missed_from_discarded', p3.missed);
  put('s3.my_words.mapping.seen', p3.mapping[0]); put('s3.my_words.mapping.reworded', p3.mapping[1]);
  put('s3.my_words.selection.seen', p3.selection[0]); put('s3.my_words.selection.reworded', p3.selection[1]);
  ['from', 'to', 'what'].forEach((k, i) => put('s3.one_sentence.' + k, p3.one[i]));
  put('s3.next_line.text', p3.next);
  self('s3', p3.self, STD);

  // 4차시
  const p4 = s.s4;
  put('s4.report.my_sound', p4.sound);
  put('s4.report.features_used', p4.features);
  put('s4.report.biggest_change', p4.biggest);
  put('s4.choose_discard.loudness_mapping', p4.loudMap);
  put('s4.choose_discard.unused_features', p4.unused);
  put('s4.my_words.feature_extraction.seen', p4.fe[0]); put('s4.my_words.feature_extraction.reworded', p4.fe[1]);
  put('s4.my_words.time_flow.seen', p4.tf[0]); put('s4.my_words.time_flow.reworded', p4.tf[1]);
  put('s4.one_sentence.counted', p4.one[0]); put('s4.one_sentence.uncounted', p4.one[1]);
  put('s4.next_line.text', p4.next);
  self('s4', p4.self, STD);

  // 5차시
  const p5 = s.s5;
  put('s5.report.collected', p5.collected);
  put('s5.report.extracted_values', p5.extracted);
  p5.hidden.forEach(([rm, why], i) => { put(`s5.hidden_choice.r${i}.removed`, rm); put(`s5.hidden_choice.r${i}.reason`, why); });
  put('s5.unmeasured.text', p5.unmeasured);
  put('s5.my_words.representation.seen', p5.rep[0]); put('s5.my_words.representation.reworded', p5.rep[1]);
  put('s5.my_words.left_and_lost.seen', p5.ll[0]); put('s5.my_words.left_and_lost.reworded', p5.ll[1]);
  put('s5.one_sentence.rest', p5.one);
  put('s5.next_line.text', p5.next);
  self('s5', p5.self, STD);

  // 6차시
  const p6 = s.s6;
  p6.reads.forEach(([m, nm], i) => { put(`s6.read_data.r${i}.measures`, m); put(`s6.read_data.r${i}.not_measures`, nm); });
  put('s6.apply_recommended.made_visible', p6.visible);
  put('s6.apply_recommended.made_invisible', p6.invisible);
  put('s6.question_defaults.auto_decided', p6.autoDecided);
  put('s6.question_defaults.outside_average', p6.outside);
  put('s6.question_defaults.whose_values', p6.whoseValues);
  p6.myRule.forEach(([chg, why], i) => { put(`s6.my_rule.r${i}.changed`, chg); put(`s6.my_rule.r${i}.why`, why); });
  put('s6.one_sentence.sentence', p6.one);
  put('s6.next_line.text', p6.next);
  self('s6', p6.self, STD);

  // 7차시
  const p7 = s.s7;
  put('s7.analyze_my_text.top_words', p7.topWords);
  put('s7.analyze_my_text.surprise', p7.surprise);
  put('s7.analyze_my_text.color_source', p7.colorSource);
  put('s7.artist_statement.text', p7.statement);
  p7.agency.forEach(([tool, me], i) => { put(`s7.agency_record.r${i}.tool_did`, tool); put(`s7.agency_record.r${i}.i_decided`, me); });
  put('s7.my_words.intent.seen', p7.intent[0]); put('s7.my_words.intent.reworded', p7.intent[1]);
  put('s7.my_words.warrant.seen', p7.warrant[0]); put('s7.my_words.warrant.reworded', p7.warrant[1]);
  put('s7.one_sentence.sentence', p7.one);
  put('s7.next_line.text', p7.next);
  self('s7', p7.self, STD);

  // 8차시
  const p8 = s.s8;
  ['describe', 'analyze', 'interpret', 'judge'].forEach(k => put(`s8.critique_friend.${k}.text`, p8.critique[k]));
  put('s8.critique_received.r0.sharpest', p8.sharpest);
  put('s8.critique_received.r0.what_to_fix', p8.whatToFix);
  put('s8.class_similarity.similarity_level', p8.similarity);
  put('s8.class_similarity.most_different', p8.mostDifferent);
  put('s8.class_similarity.is_different_good', p8.isDifferentGood);
  p8.g.forEach((t, i) => put(`s8.unit_generalizations.g${i + 1}.sentence`, t));
  put('s8.transfer_plan.first', p8.transfer[0]);
  put('s8.transfer_plan.next', p8.transfer[1]);
  put('s8.transfer_plan.last_check', p8.transfer[2]);
  self('s8', p8.self, ['explain_rule', 'rechose', 'unmeasured', 'critique', 'transfer']);

  return a;
}

/* ───────────────────────── 조립 ───────────────────────── */
const works = [], feedback = [], notes = [], logs = [], versions = [], quizzes = [], quizAnswers = [];
const SHEET_META = [
  { id: 'cover', session: 0, stage: 0, proc: 'sense', title: '표지' },
  { id: 's1', session: 1, stage: 1, proc: 'sense', title: '한 그림, 일곱 개의 눈' },
  { id: 's2', session: 2, stage: 1, proc: 'make', title: '그림이 분해되어 다시 연주되다' },
  { id: 's3', session: 3, stage: 1, proc: 'make', title: '규칙 두 개 만들기' },
  { id: 's4', session: 4, stage: 2, proc: 'make', title: '소리를 세어 보기' },
  { id: 's5', session: 5, stage: 3, proc: 'make', title: '내 삶을 데이터로' },
  { id: 's6', session: 6, stage: 4, proc: 'judge', title: '숫자가 사람을 말할 수 있을까' },
  { id: 's7', session: 7, stage: 4, proc: 'own', title: '내 말이 색을 입다' },
  { id: 's8', session: 8, stage: 4, proc: 'share', title: '전시·비평·되돌아보기' }
];

const bodyfat = bodyfatRows(48);
const sdgMeta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sdg-meta.json'), 'utf8'));

for (const s of STUDENTS) {
  const R = s.R;
  const who = { userId: s.userId, by: s.nick, klass: s.klass };
  const stamp = (sheet) => { const m = SHEET_META.find(x => x.id === sheet); return { unit: UNIT, sheet, session: m.session, procStage: m.proc }; };

  /* ---- 학습지 9장 ---- */
  const answers = answersOf(s);
  SHEET_META.forEach((m, k) => {
    const mine = {};
    Object.keys(answers).forEach(p => { if (p.split('.')[0] === m.id) mine[p] = answers[p]; });
    notes.push({
      id: 'ws_' + s.code.replace(/[^\w-]/g, '-') + '_' + UNIT + '_' + m.id,
      ...who, code: s.code, kind: 'worksheet', unit: UNIT, sheet: m.id,
      session: m.session, stage: m.stage, procStage: m.proc,
      title: (m.session ? m.session + '차시 · ' : '') + m.title,
      answers: mine, filled: Object.keys(mine).length, total: Object.keys(mine).length,
      createdAt: at(Math.max(1, m.session), 8), updatedAt: at(Math.max(1, m.session), 41 + s.i),
      demo: true
    });
  });

  /* ---- 작품 6점 ---- */
  const made = {};   // session → work

  // 2차시 · 색 군집
  {
    const draftId = 'd_' + s.sid + '_c2';
    const src = painting(s.paint, 176, 132, s.seed);
    const settings = {
      K: [8, 4, 8, 4, 8, 8, 8, 16][s.i], space: s.i % 3 === 0 ? 'lab' : 'rgb', sampling: 'uniform',
      N: [3000, 3200, 12000, 2600, 3000, 3400, 2000, 3000][s.i], seed: 12345,
      size: [2, 3, 1.5, 3, 3, 3, 5, 3][s.i], colorMode: 'cluster', mosaicCell: 0,
      lens: 'none', pointShape: ['circle', 'sq', 'circle', 'circle', 'circle', 'sq', 'circle', 'tri'][s.i],
      pointAlpha: [1, 1, 1, 0.45, 1, 0.7, 1, 1][s.i], bg: s.i === 5 ? 'black' : 'night',
      mode: 'points', motionMode: 'hold', returnForce: s.i === 4 ? 0.03 : 0.08,
      vibration: [1.2, 0, 0, 0, 0.6, 0, 0, 0][s.i], trail: [150, 255, 210, 255, 255, 255, 255, 255][s.i],
      additive: s.i === 5, rotateSpeed: 0, depth: 220, rotAxis: 'y',
      meta: { title: s.paintTitle, artist: '퍼블릭 도메인', source: 'Wikimedia Commons', student: s.nick, intent: s.s2.one[2] }
    };
    const w = {
      id: idOf(s, 'w2'), ...who, kind: 'color', stage: 1, draftId,
      title: s.signature === 2 ? s.workTitle : s.s2.one[1],
      intent: s.s2.one[2],
      evidence: `${s.paintTitle} · 대표색 K=${settings.K} · 점 ${settings.N.toLocaleString('ko-KR')}개 · ${s.s2.keptThree}`,
      settings, meta: settings.meta,
      thumb: colorThumb(s.paint, { size: settings.size, seed: s.seed, w: 208, h: 156 }).toDataURL(),
      srcSample: src.toDataURL(),
      exhibited: true, consent: true, demo: true,
      createdAt: at(2, 30), updatedAt: at(2, 44 + s.i)
    };
    if (s.signature === 2) w.statement = s.s7.statement;
    works.push(w); made[2] = w;
    // 판단의 흔적: 같은 작품의 세 버전
    [0, 1, 2].forEach(v => versions.push({
      id: idOf(s, 'v2_' + v), workId: draftId, uid: s.code, page: 'studio-color.html',
      settings: lite({ ...settings, N: Math.round(settings.N * (0.4 + v * 0.3)), size: +(settings.size * (0.6 + v * 0.2)).toFixed(1) }),
      thumb: colorThumb(s.paint, { size: settings.size * (0.6 + v * 0.2), seed: s.seed + v, w: 112, h: 84 }).toDataURL(),
      createdAt: at(2, 20 + v * 6), demo: true
    }));
  }

  // 3차시 · 데이터 점(규칙 A/B)
  {
    const d = DATASET3[s.nick](R);
    const draftId = 'd_' + s.sid + '_d3';
    const settings = {
      mapping: { size: null, speed: null, direction: null, density: null, alpha: null, shape: null,
        colorMode: 'gradient', colorField: null, gradLow: '#182F49', gradHigh: '#E6F5A6', solid: '#6E84B8',
        catColors: {}, catShapes: {}, ...d.mapping },
      baseSpeed: 1, vib: 1, trail: 200, layout: 'timeline', motionStyle: 'vibrate',
      pointScale: 1, cohesion: 1, bg: 'night', dataName: d.name,
      record: {
        sense: s.s1.impression + ' — ' + s.motto,
        count: s.s3.cols,
        omit: s.s3.usedDropped,
        scale: s.s3.chosenWhy,
        miss: s.s3.missed
      },
      fields: d.fields, rows: d.rows
    };
    const w = {
      id: idOf(s, 'w3'), ...who, kind: 'data', stage: 1, draftId, dataName: d.name,
      title: s.signature === 3 ? s.workTitle : ('규칙 두 개 · ' + d.name.split('(')[0].trim()),
      intent: s.s3.one[2],
      evidence: s.s3.chosenWhy,
      settings, thumb: dataThumb({ rows: d.rows, size: d.mapping.size, color: d.mapping.colorField,
        cat: d.mapping.colorMode === 'category' ? d.mapping.colorField : null,
        gradLow: d.mapping.gradLow || '#182F49', gradHigh: d.mapping.gradHigh || '#E6F5A6',
        catColors: d.mapping.catColors || {}, seed: s.seed + 3, w: 208, h: 156 }).toDataURL(),
      exhibited: true, consent: true, demo: true,
      createdAt: at(3, 26), updatedAt: at(3, 43 + s.i)
    };
    if (s.signature === 3) w.statement = s.s7.statement;
    works.push(w); made[3] = w;
    [0, 1].forEach(v => versions.push({
      id: idOf(s, 'v3_' + v), workId: draftId, uid: s.code, page: 'studio-data.html',
      settings: lite({ ...settings, mapping: { ...settings.mapping, size: v === 0 ? null : settings.mapping.size } }),
      thumb: dataThumb({ rows: d.rows, size: v === 0 ? null : d.mapping.size, color: d.mapping.colorField,
        cat: d.mapping.colorMode === 'category' ? d.mapping.colorField : null,
        gradLow: d.mapping.gradLow || '#182F49', gradHigh: d.mapping.gradHigh || '#E6F5A6',
        catColors: d.mapping.catColors || {}, seed: s.seed + v, w: 112, h: 84 }).toDataURL(),
      createdAt: at(3, 14 + v * 7), demo: true
    }));
  }

  // 4차시 · 내 소리 → 데이터 점
  {
    const d = dataset4(s);
    const draftId = 'd_' + s.sid + '_d4';
    const settings = {
      mapping: { size: null, speed: null, direction: null, density: null, alpha: null, shape: null,
        colorMode: 'gradient', colorField: null, gradLow: '#182F49', gradHigh: '#E6F5A6', solid: '#6E84B8',
        catColors: {}, catShapes: {}, ...d.mapping },
      baseSpeed: 1.1, vib: 1.3, trail: 180, layout: 'timeline', motionStyle: 'vibrate',
      pointScale: 1, cohesion: 1, bg: 'night', dataName: d.name,
      record: { sense: s.s4.sound, count: s.s4.features, omit: s.s4.unused, scale: s.s4.loudMap, miss: s.s4.one[1] },
      fields: d.fields, rows: d.rows
    };
    const w = {
      id: idOf(s, 'w4'), ...who, kind: 'data', stage: 2, draftId, dataName: d.name,
      title: s.signature === 4 ? s.workTitle : d.name,
      intent: '세어 본 것: ' + s.s4.one[0] + ' — ' + s.motto,
      evidence: s.s4.loudMap,
      settings, thumb: dataThumb({ rows: d.rows, size: d.mapping.size, color: d.mapping.colorField,
        cat: d.mapping.colorMode === 'category' ? d.mapping.colorField : null,
        gradLow: d.mapping.gradLow || '#182F49', gradHigh: d.mapping.gradHigh || '#E6F5A6',
        catColors: d.mapping.catColors || {}, vib: 1.3, seed: s.seed + 4, w: 208, h: 156 }).toDataURL(),
      exhibited: true, consent: true, demo: true,
      createdAt: at(4, 24), updatedAt: at(4, 42 + s.i)
    };
    if (s.signature === 4) w.statement = s.s7.statement;
    works.push(w); made[4] = w;
  }

  // 5차시 · 내 사진/대화 → 데이터 점
  {
    const d = dataset5(s);
    const draftId = 'd_' + s.sid + '_d5';
    const settings = {
      mapping: { size: null, speed: null, direction: null, density: null, alpha: null, shape: null,
        colorMode: 'gradient', colorField: null, gradLow: '#182F49', gradHigh: '#E6F5A6', solid: '#6E84B8',
        catColors: {}, catShapes: {}, ...d.mapping },
      baseSpeed: 0.9, vib: 0.8, trail: 200, layout: 'timeline', motionStyle: 'wave',
      pointScale: 1, cohesion: 1, bg: 'night', dataName: d.name,
      record: { sense: s.s5.collected, count: s.s5.extracted, omit: s.s5.hidden.map(h => h[0]).join(' · '), scale: s.s5.rep[1], miss: s.s5.unmeasured },
      fields: d.fields, rows: d.rows
    };
    const w = {
      id: idOf(s, 'w5'), ...who, kind: 'data', stage: 3, draftId, dataName: d.name,
      title: s.signature === 5 ? s.workTitle : ('내 삶의 데이터 · ' + d.name),
      intent: s.motto + ' — 화면 밖에 남긴 것: ' + s.s5.one,
      evidence: s.s5.extracted + ' / 뺀 것: ' + s.s5.hidden.map(h => h[0]).join(' · '),
      settings, thumb: dataThumb({ rows: d.rows, size: d.mapping.size, color: d.mapping.colorField,
        cat: d.mapping.colorMode === 'category' ? d.mapping.colorField : null,
        gradLow: d.mapping.gradLow || '#182F49', gradHigh: d.mapping.gradHigh || '#E6F5A6',
        catColors: d.mapping.catColors || {}, vib: 0.8, seed: s.seed + 5, w: 208, h: 156 }).toDataURL(),
      exhibited: true, consent: true, demo: true,
      createdAt: at(5, 25), updatedAt: at(5, 41 + s.i)
    };
    if (s.signature === 5) w.statement = s.s7.statement;
    works.push(w); made[5] = w;
    versions.push({
      id: idOf(s, 'v5_0'), workId: draftId, uid: s.code, page: 'studio-data.html',
      settings: lite({ ...settings, mapping: { ...settings.mapping, colorMode: 'solid' } }),
      thumb: dataThumb({ rows: d.rows, size: d.mapping.size, color: null, cat: null,
        gradLow: '#4a5570', gradHigh: '#6E84B8', catColors: {}, seed: s.seed, w: 112, h: 84 }).toDataURL(),
      createdAt: at(5, 16), demo: true
    });
  }

  // 6차시 · 사회로: 신체측정 252명(대부분) 또는 SDG 사회 분석(물의권리)
  if (s.nick === '물의권리') {
    const meta = sdgMeta.water;
    // 썸네일은 이 학생이 실제로 만든 화면을 따른다: 나라별 '못 쓰는 사람 수'를 점으로 쌓은 칸들.
    // (국제기구 순위표의 원값을 그대로 쓰면 상·하위가 수천 배 차이라 화면이 막대 몇 개로 끝난다.)
    const vals = DATASET3['물의권리'](R).rows.map(r => r['못쓰는사람백만']);
    const w = {
      id: idOf(s, 'w6'), ...who, kind: 'society', stage: 4, draftId: 'd_' + s.sid + '_d6',
      dataName: '사회 분석 · ' + meta.title,
      title: s.workTitle,
      intent: s.s6.one,
      evidence: meta.label + ' ' + meta.yearThen + '→' + meta.latestYear +
        (meta.changePct != null ? ' (' + (meta.changePct > 0 ? '+' : '') + meta.changePct + '%)' : '') +
        ' · 최고 ' + meta.top5[0][0] + ' / 최저 ' + meta.bottom5[0][0] + ' · 세계 ' + meta.rows + '개국 (출처 OWID·World Bank)',
      settings: { sdgKey: 'water', meta,
        record: { sense: s.s5.collected, count: s.s6.reads[0][0], omit: s.s6.invisible, scale: s.s6.myRule[0][1], miss: s.s6.one } },
      statement: s.signature === 6 ? s.s7.statement : undefined,
      thumb: societyThumb(vals.map(v => Math.max(1, v)), { seed: s.seed + 6, w: 208, h: 156 }).toDataURL(),
      exhibited: true, consent: true, demo: true,
      createdAt: at(6, 28), updatedAt: at(6, 44 + s.i)
    };
    works.push(w); made[6] = w;
  } else {
    const draftId = 'd_' + s.sid + '_d6';
    const settings = {
      mapping: { size: 'BodyFat', speed: null, direction: null, density: null, alpha: null, shape: null,
        colorMode: s.nick === '말없는대화' ? 'solid' : 'gradient', colorField: s.nick === '말없는대화' ? null : 'Age',
        gradLow: '#2740c8', gradHigh: '#ffd23c', solid: '#8d93a6', catColors: {}, catShapes: {} },
      baseSpeed: 0.8, vib: 0.6, trail: 210, layout: 'flowField', motionStyle: 'vibrate',
      pointScale: 1, cohesion: 1, bg: 'night', dataName: '숫자가 사람을 말할 수 있을까(신체측정 252명 중 48명 표본)',
      record: { sense: '몸을 자로 재 본다는 감각', count: s.s6.reads[0][0], omit: s.s6.invisible, scale: s.s6.myRule[0][1], miss: s.s6.one },
      fields: bodyfat.fields, rows: bodyfat.rows
    };
    const w = {
      id: idOf(s, 'w6'), ...who, kind: 'data', stage: 4, draftId,
      dataName: settings.dataName,
      title: s.signature === 6 ? s.workTitle : ('숫자가 사람을 말할 수 있을까 · ' + s.nick + '의 규칙'),
      intent: s.s6.one,
      evidence: s.s6.myRule.map(r => r[0]).join(' / ') + ' · 표본 252명 전원 남성 · 오류값(키 29.5in · 체지방률 0%) 포함',
      settings, thumb: dataThumb({ rows: bodyfat.rows, size: 'BodyFat',
        color: settings.mapping.colorField, cat: null,
        gradLow: settings.mapping.gradLow, gradHigh: settings.mapping.gradHigh,
        catColors: {}, vib: 0.6, seed: s.seed + 6, w: 208, h: 156,
        // 오류값을 지우지 않고 빨갛게 남기기로 한 학생의 화면만 그 판단을 그대로 보인다.
        // 나머지 학생의 화면에서는 같은 두 줄이 '아무 말 없이 작은 점'으로 남는다(그게 그들의 발견이다).
        flag: s.nick === '저울눈금' ? bodyfat.outliers : [] }).toDataURL(),
      exhibited: true, consent: true, demo: true,
      createdAt: at(6, 27), updatedAt: at(6, 43 + s.i)
    };
    if (s.signature === 6) w.statement = s.s7.statement;
    works.push(w); made[6] = w;
    [0, 1].forEach(v => versions.push({
      id: idOf(s, 'v6_' + v), workId: draftId, uid: s.code, page: 'studio-data.html',
      settings: lite({ ...settings, mapping: { ...settings.mapping, colorMode: v === 0 ? 'gradient' : settings.mapping.colorMode } }),
      thumb: dataThumb({ rows: bodyfat.rows, size: 'BodyFat', color: 'Age', cat: null,
        gradLow: '#2740c8', gradHigh: '#ffd23c', catColors: {}, seed: s.seed + v, w: 112, h: 84 }).toDataURL(),
      createdAt: at(6, 15 + v * 6), demo: true
    }));
  }

  // 7차시 · 낱말 구름
  {
    const tops = s.s7.topWords.split('·').map(x => x.trim());
    const words = tops.map((w, i) => ({ w, c: [34, 27, 21][i] }))
      .concat(['그래서', '보다', '고르다', '남다', '이유'].map((w, i) => ({ w, c: 17 - i * 2 })));
    const palette = ['#c9a227', '#2f6ba8', '#4d9d6e', '#c8482f', '#e8cf6a'];
    const settings = {
      text: '(전시용 표본 · 원문은 학생 기기에만 남습니다)', words,
      palette, K: 5, paintingTitle: s.paintTitle, srcImg: '',
      colorMode: 'palette', mono: false, bg: s.nick === '창가의빛' ? '#0b0d14' : '#0b0d14', contrast: 1,
      shape: 'cloud', letter: 'block', strokes: 3, brush: 1, ratio: 0.86, pad: 3, rotate: 0,
      font: 'sans', weight: 800, italic: false, threeD: false, depth: 0, light: 0.5,
      scale: 1, minFont: 12, maxFont: 64, maxWords: 60, minLen: 2, seed: s.seed,
      product: 'poster', name: s.workTitle, caption: s.motto,
      title: s.workTitle, intent: s.s7.one, evidence: s.s7.surprise
    };
    const w = {
      id: idOf(s, 'w7'), ...who, kind: 'word', stage: 4,
      title: s.signature === 7 ? s.workTitle : (s.workTitle + ' · 낱말'),
      intent: s.s7.one,
      evidence: '상위 낱말 ' + s.s7.topWords + ' · 색은 ' + s.s7.colorSource,
      statement: s.s7.statement,
      settings, thumb: wordThumb(words.map(x => [x.w, x.c]), palette, { seed: s.seed + 7, w: 208, h: 156,
        outlineTop: s.nick === '낱말수집가' ? 2 : 0 }).toDataURL(),
      exhibited: true, consent: true, demo: true,
      createdAt: at(7, 29), updatedAt: at(7, 45 + s.i)
    };
    works.push(w); made[7] = w;
  }

  /* ---- 작업노트·성찰 ---- */
  const N = (kind, session, title, body, extra) => notes.push({
    id: idOf(s, 'n_' + kind + '_' + session), ...who, kind, title, ...stamp('s' + session), ...body, ...(extra || {}),
    createdAt: at(session, 33), updatedAt: at(session, 36 + s.i), demo: true
  });
  N('lab', 1, '분석 메모 · ' + s.s1.picked, { line: s.s1.k4vs16, aiHelp: s.s1.analyses.map(x => x[0]).join(' · '), myDecision: s.s1.one[3] + ': ' + s.s1.one[1] + ' 얻고 ' + s.s1.one[2] + ' 잃음' });
  N('literacy', 1, '리터러시 1장 · 이미지가 숫자가 되는 원리', { line: s.s1.summary[1] });
  N('color', 2, '색 작업 · ' + s.paintTitle, { intent: s.s2.one[2], line: s.s2.discardedOne, aiHelp: s.s2.tries[0][0] + ' → ' + s.s2.tries[0][1], myDecision: s.s2.keptThree }, { settings: made[2].settings });
  N('data', 3, '데이터 작업 · ' + s.s3.dataName, { intent: s.s3.one[2], line: s.s3.chosenWhy, aiHelp: 'A안: ' + s.s3.ab.size[0] + ' / B안: ' + s.s3.ab.size[1], myDecision: s.s3.missed }, { settings: made[3].settings });
  N('card', 3, '질문 카드 · 무엇을 뺐나', { line: s.s3.usedDropped, cardKey: 'omit', workId: 'd_' + s.sid + '_d3' });
  N('revision', 3, '수정 근거 · 1차 → 2차', { line: s.s3.missed, myDecision: '크기: 없음→' + (s.s3.ab.size[0].split('(')[0].trim()) });
  N('reflection', 4, '데이터 비평 · 소리를 세어 보기', { aiHelp: '사실: ' + s.s4.biggest, myDecision: '해석: ' + s.s4.loudMap, line: '가치/응답: ' + s.s4.one[1] });
  N('literacy', 5, '리터러시 6장 · 저작권과 초상권', { line: s.s5.hidden[0][1] });
  N('project', 6, '사회문제 프로젝트 · ' + (s.nick === '물의권리' ? '깨끗한 물' : '몸과 기준'), {
    aiHelp: '주제: ' + s.s6.reads[0][0] + ' / 이유: ' + s.s6.whoseValues,
    myDecision: '정제·선택: ' + s.s6.myRule.map(r => r[0]).join(' · ') + ' / 점검 3/3',
    line: '사회적 발언: ' + s.s6.one
  });
  N('card', 6, '질문 카드 · 기본값을 의심하기', { line: s.s6.autoDecided, cardKey: 'default', workId: 'd_' + s.sid + '_d6' });
  N('statement', 7, '창작 진술문 · ' + s.workTitle, { line: s.s7.statement });
  N('reflection', 8, '되돌아보기 · 이 단원이 남긴 것', { aiHelp: '사실: ' + s.s8.similarity, myDecision: '해석: ' + s.s8.mostDifferent, line: '가치/응답: ' + s.s8.isDifferentGood });

  /* ---- 학습 로그 ---- */
  const L = (session, minute, stage, action, page, payload, workId) => logs.push({
    id: idOf(s, 'l' + session + '_' + minute + '_' + action), uid: s.code, klass: s.klass,
    ts: at(session, minute), page, stage, action, payload: payload || {}, workId: workId || null, demo: true
  });
  L(1, 2, 'sense', 'view', 'learn.html');
  L(1, 9, 'sense', 'analyze', 'lab.html', { algo: 'kmeans', K: 8 });
  L(1, 17, 'sense', 'analyze', 'lab.html', { algo: 'kmeans', K: 4 });
  L(1, 28, 'judge', 'coach_answer', 'literacy.html', { ch: 1, len: s.s1.summary[1].length });
  L(1, 34, 'own', 'note_save', 'lab.html', { hasIntent: true, hasEvidence: true });
  L(1, 40, 'judge', 'critique_write', 'quiz.html', { topic: 'quiz', layers: 3 });
  L(2, 3, 'make', 'view', 'studio-color.html');
  L(2, 12, 'make', 'map_apply', 'studio-color.html', { changed: s.s2.tries[0][0] }, 'd_' + s.sid + '_c2');
  L(2, 21, 'revise', 'revise', 'studio-color.html', { n: 1 }, 'd_' + s.sid + '_c2');
  L(2, 27, 'revise', 'revise', 'studio-color.html', { n: 2 }, 'd_' + s.sid + '_c2');
  L(2, 33, 'intent', 'coach_ask', 'studio-color.html', { kind: 'color' }, 'd_' + s.sid + '_c2');
  L(2, 39, 'share', 'exhibit', 'studio-color.html', { workRealId: made[2].id }, 'd_' + s.sid + '_c2');
  L(3, 4, 'make', 'view', 'studio-data.html');
  L(3, 11, 'make', 'map_apply', 'studio-data.html', { size: s.s3.ab.size[0] }, 'd_' + s.sid + '_d3');
  L(3, 18, 'judge', 'ab_switch', 'studio-data.html', { from: 'A', to: 'B' }, 'd_' + s.sid + '_d3');
  L(3, 22, 'judge', 'ab_switch', 'studio-data.html', { from: 'B', to: 'A' }, 'd_' + s.sid + '_d3');
  L(3, 29, 'revise', 'revise', 'studio-data.html', { n: 2 }, 'd_' + s.sid + '_d3');
  L(3, 33, 'intent', 'note_save', 'studio-data.html', { hasIntent: true, hasEvidence: true }, 'd_' + s.sid + '_d3');
  L(3, 38, 'share', 'exhibit', 'studio-data.html', { workRealId: made[3].id }, 'd_' + s.sid + '_d3');
  L(4, 5, 'sense', 'view', 'studio-sound.html');
  L(4, 13, 'make', 'analyze', 'studio-sound.html', { frames: made[4].settings.rows.length });
  L(4, 20, 'make', 'map_apply', 'studio-data.html', { size: made[4].settings.mapping.size }, 'd_' + s.sid + '_d4');
  L(4, 27, 'judge', 'ab_switch', 'studio-data.html', { from: 'A', to: 'B' }, 'd_' + s.sid + '_d4');
  L(4, 36, 'share', 'exhibit', 'studio-data.html', { workRealId: made[4].id }, 'd_' + s.sid + '_d4');
  L(5, 6, 'sense', 'view', 'studio-life.html');
  L(5, 14, 'judge', 'view', 'studio-object.html');
  L(5, 22, 'make', 'map_apply', 'studio-data.html', { size: made[5].settings.mapping.size }, 'd_' + s.sid + '_d5');
  L(5, 30, 'revise', 'revise', 'studio-data.html', { n: 1 }, 'd_' + s.sid + '_d5');
  L(5, 37, 'share', 'exhibit', 'studio-data.html', { workRealId: made[5].id }, 'd_' + s.sid + '_d5');
  L(6, 4, 'judge', 'view', 'society.html');
  L(6, 12, 'judge', 'analyze', 'studio-data.html', { dataset: 'bodyfat' }, 'd_' + s.sid + '_d6');
  L(6, 19, 'judge', 'ab_switch', 'studio-data.html', { from: '추천 매핑', to: '내 규칙' }, 'd_' + s.sid + '_d6');
  L(6, 25, 'revise', 'revise', 'studio-data.html', { n: 2 }, 'd_' + s.sid + '_d6');
  L(6, 31, 'intent', 'note_save', 'project.html', { hasIntent: true, hasEvidence: true });
  L(6, 40, 'share', 'exhibit', 'studio-data.html', { workRealId: made[6].id }, 'd_' + s.sid + '_d6');
  L(7, 5, 'own', 'view', 'studio-word.html');
  L(7, 16, 'own', 'map_apply', 'studio-word.html', { K: 5 });
  L(7, 24, 'intent', 'coach_ask', 'studio-word.html', { kind: 'word' });
  L(7, 32, 'own', 'reflect_submit', 'literacy.html', { ch: 7, len: s.s7.statement.length }, made[7].id);
  L(7, 38, 'share', 'exhibit', 'studio-word.html', { workRealId: made[7].id });
  L(8, 6, 'share', 'view', 'gallery.html');
  L(8, 15, 'share', 'critique_write', 'work.html', { rubric: true, steps: 4 });
  L(8, 23, 'share', 'critique_write', 'work.html', { rubric: true, steps: 2 });
  L(8, 31, 'own', 'reflect_submit', 'portfolio.html', { unit: UNIT, sheets: 9 });
  L(8, 38, 'own', 'note_save', 'notes.html', { hasIntent: true, hasEvidence: true });
}

/* ---- 또래 비평: 8차시에 학생마다 두 작품을 비평한다 ----
 * 학습지에 적은 펠드먼 4단계는 '내가 고른 한 작품'에 대한 것이므로 그 작품에 붙이고,
 * 두 번째 비평은 짧은 한마디로 남긴다(교실에서 실제로 그렇게 된다).
 */
const SHORT = [
  ['규칙을 하나만 예외로 둔 게 이 작품의 목소리 같다. 예외에 이유가 있어서 설득된다.', 5, { intent: 3, trace: 3, agency: 2, ret: 3 }],
  ['보기 좋게 만들 수 있었는데 안 만든 자리가 보인다. 그 선택을 설명한 노트가 있어서 믿음이 간다.', 5, { intent: 3, trace: 3, agency: 3, ret: 2 }],
  ['색이 무엇을 뜻하는지 화면 안에 단서가 있으면 더 빨리 읽힐 것 같다. 지금은 노트를 읽어야 안다.', 4, { intent: 3, trace: 2, agency: 2, ret: 2 }],
  ['뺀 것을 적어 둔 칸이 제일 좋았다. 화면에 없는 걸 말해 주는 작품은 처음 봤다.', 5, { intent: 3, trace: 3, agency: 3, ret: 3 }],
  ['움직임이 데이터랑 잘 붙어 있다. 떨림이 그냥 효과가 아니라 값이라는 게 보인다.', 4, { intent: 3, trace: 2, agency: 2, ret: 3 }],
  ['제목을 읽고 다시 보니 완전히 다르게 보였다. 제목이 작품의 일부인 작품.', 5, { intent: 3, trace: 2, agency: 3, ret: 3 }],
  ['한 점만 다르게 그린 게 눈에 걸린다. 그 한 점 때문에 나머지를 다시 세어 보게 된다.', 4, { intent: 2, trace: 3, agency: 2, ret: 3 }],
  ['표본이 작다는 걸 스스로 적어 둔 게 좋았다. 약점을 숨기지 않아서 오히려 세다.', 5, { intent: 3, trace: 3, agency: 3, ret: 2 }]
];
STUDENTS.forEach((s, i) => {
  const target = STUDENTS[s.s8.critiqueOf];
  const sig = works.find(w => w.userId === target.userId && w.title === target.workTitle);
  if (!sig) throw new Error(target.nick + ' 의 대표작(' + target.workTitle + ')을 찾지 못했다');
  feedback.push({
    id: idOf(s, 'fb_main'), workId: sig.id, userId: s.userId, by: s.nick, kind: 'critique',
    rating: 5, comment: s.s8.critique.judge.split('.')[0] + '.',
    describe: s.s8.critique.describe, analyze: s.s8.critique.analyze,
    interpret: s.s8.critique.interpret, judge: s.s8.critique.judge,
    rubric: { intent: 3, trace: 3, agency: 3, ret: 2 },
    createdAt: at(8, 14 + i), demo: true
  });
  const other = STUDENTS[(i + 3) % STUDENTS.length];
  const ow = works.find(w => w.userId === other.userId && w.title === other.workTitle);
  if (!ow) throw new Error(other.nick + ' 의 대표작을 찾지 못했다');
  const [c, r, rb] = SHORT[i];
  feedback.push({
    id: idOf(s, 'fb_short'), workId: ow.id, userId: s.userId, by: s.nick, kind: 'critique',
    rating: r, comment: c, describe: '', analyze: '', interpret: '', judge: '',
    rubric: rb, createdAt: at(8, 22 + i), demo: true
  });
});

/* ---- 1차시 분석 퀴즈: 학생 넷이 출제하고 나머지가 푼다 ---- */
const QUIZ = [
  { by: 0, qtype: 'dominant', title: '이 그림의 지배색은?', question: '분석 결과 이 그림에서 가장 넓은 면적을 차지한 색 계열은?',
    options: ['짙은 파랑', '노랑', '초록', '자주'], answer: 0, chartType: 'donut', tags: ['색', '대비'], difficulty: '보통',
    explanation: '대표색 8개 중 파랑 계열이 5개이고 합치면 화면의 61%였다. 다만 노랑은 면적이 9%뿐인데도 인상이 가장 강했다 — 면적 1등과 인상 1등은 다르다.' },
  { by: 2, qtype: 'temp', title: '이 그림은 난색인가 한색인가', question: '대표색의 색온도를 계산하면 이 그림은 어느 쪽에 가까운가?',
    options: ['한색', '난색', '중성', '판단 불가'], answer: 0, chartType: 'wheel', tags: ['색', '통일'], difficulty: '쉬움',
    explanation: '청회색이 대표색 8개 중 6개라 계산은 한색으로 나온다. 그런데 사람들이 이 그림에서 먼저 보는 건 주황 하나다. 계산과 인상이 갈리는 자리를 보여 주려고 냈다.' },
  { by: 3, qtype: 'composition', title: '무게중심은 어디에 있나', question: '밝기 가중 무게중심이 삼분할선의 어느 교차점에 가장 가까운가?',
    options: ['왼쪽 위', '오른쪽 위', '왼쪽 아래', '오른쪽 아래'], answer: 0, chartType: 'heatmap', tags: ['구도', '균형'], difficulty: '어려움',
    explanation: '파도의 흰 갈퀴가 밝기를 다 가져가서 무게중심이 왼쪽 위로 끌려간다. 사람 눈은 오른쪽 아래 배를 먼저 보는데 계산은 반대로 나온다.' },
  { by: 7, qtype: 'free', title: '1등이 없는 그림', question: '대표색 8개의 면적이 모두 19% 이하인 그림에서, 이 균형을 무엇이라 부를 수 있을까? (한 낱말)',
    options: [], answer: 0, answers: ['균형', '통일', '분산', '주인없음'], chartType: 'bars', tags: ['균형', '변화'], difficulty: '보통',
    explanation: '어느 색도 지배하지 않는 상태다. 순위표는 언제나 1등을 만들어 내지만, 1등이 의미 없는 데이터도 있다.' }
];
QUIZ.forEach((q, i) => {
  const s = STUDENTS[q.by];
  const src = painting(s.paint, 168, 126, s.seed);
  quizzes.push({
    id: 'sc_quiz_' + i, userId: s.userId, by: s.nick, klass: s.klass,
    title: q.title, qtype: q.qtype, question: q.question,
    options: q.options.map(l => ({ label: l })), answer: q.answer, answers: q.answers || null,
    explanation: q.explanation, hint: '면적이 큰 것과 눈에 먼저 띄는 것은 다를 수 있어요.',
    story: s.s1.picked, tags: q.tags, difficulty: q.difficulty,
    thumb: src.toDataURL(), chartImg: '', chartType: q.chartType,
    createdAt: at(1, 36 + i), demo: true
  });
  STUDENTS.forEach((t, k) => {
    if (t.userId === s.userId) return;
    quizAnswers.push({
      id: 'sc_qa_' + i + '_' + k, quizId: 'sc_quiz_' + i, userId: t.userId, by: t.nick,
      correct: !((i + k) % 5 === 0), createdAt: at(1, 42 + k), demo: true
    });
  });
});

/* ───────────────────────── 저장 ───────────────────────── */
const bundle = {
  app: 'DATA2026SEOULART',
  exportedAt: new Date(at(8, 50)).toISOString(),
  showcase: {
    label: '우수 사례 학급(가상)',
    note: '수업 설계를 보여 주기 위한 가상 데이터입니다. 실제 학생의 기록이 아니며 실명·학교 정보를 담지 않습니다.',
    unit: UNIT, students: STUDENTS.length, generator: 'tools/make-showcase.mjs'
  },
  works, feedback, notes, quizzes, quizAnswers, logs, versions
};

// 들여쓰기 없이 쓴다. 행 객체가 수천 개라 한 칸만 넣어도 파일이 배로 커지고,
// 이 파일은 사람이 읽는 문서가 아니라 불러오기용 자료다(읽을 것은 personas.mjs 다).
const json = JSON.stringify(bundle);
if (process.argv.includes('--stats')) {
  console.log('학생 %d · 작품 %d · 비평 %d · 노트 %d · 로그 %d · 버전 %d · 퀴즈 %d/%d',
    STUDENTS.length, works.length, feedback.length, notes.length, logs.length, versions.length, quizzes.length, quizAnswers.length);
  console.log('크기 %s MB', (Buffer.byteLength(json) / 1048576).toFixed(2));
} else {
  fs.writeFileSync(OUT, json);
  console.log('썼습니다: %s (%s MB)', path.relative(ROOT, OUT), (Buffer.byteLength(json) / 1048576).toFixed(2));
  console.log('학생 %d · 작품 %d · 비평 %d · 노트 %d · 로그 %d · 버전 %d · 퀴즈 %d(답 %d)',
    STUDENTS.length, works.length, feedback.length, notes.length, logs.length, versions.length, quizzes.length, quizAnswers.length);
}
