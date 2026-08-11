/*
 * metrics.js: 과정 지표 계산 (교사 대시보드 · 학생 포트폴리오 공용)
 * -----------------------------------------------------------------------------
 * 작품 목록이 아니라 '판단의 과정'을 숫자로 읽는다.
 *   D-1 학급 진행 현황(7단계 도달)   D-2 판단 활동 지표   D-3 학생별 타임라인
 *   D-4 학급 유사도 지수             D-5 내보내기(CSV)
 *
 * 유사도 지수는 이 사이트만의 기능이다. 학급 작품이 서로 얼마나 닮았는지를
 *   ① 색 분포 벡터(썸네일의 4×4×4=64구간 히스토그램)  ② 매핑 규칙(설정값)
 * 두 가지로 재서 합친다. 지수가 높다 = 자동 추천을 그대로 쓴 학생이 많다는 뜻이고,
 * 그것은 곧 "생성형 AI가 개인의 창의성은 올리되 집단의 참신성은 떨어뜨린다"는
 * 실험 결과(Doshi & Hauser, 2024)를 우리 반 데이터로 확인하는 수업 재료가 된다.
 */
(function (global) {
  'use strict';

  const STAGES = (global.Log && Log.STAGES) || [];
  const K_SIG = 'dn_sigcache';

  /* ============================ 신원 해석(가명 코드 → 별명) ============================
   * 로그에는 학번·별명이 없다. 교사 화면에서만, 별명(by)을 가진 works/notes 와 조인해 되찾는다.
   * (별명↔학생 대조는 학급 명단을 가진 교사의 몫: 화면·CSV 어디에도 실명은 없다.)
   */
  function nameMap(works, notes) {
    const m = {};
    const add = (userId, by, klass) => {
      if (!userId) return;
      const anon = Log.anonOf({ userId, klass: klass || '' });
      if (!anon) return;
      if (!m[anon]) m[anon] = { name: by || '', klass: klass || '', userId };
      else { if (by && !m[anon].name) m[anon].name = by; if (klass && !m[anon].klass) m[anon].klass = klass; }
    };
    (works || []).forEach(w => add(w.userId, w.by, w.klass));
    // 대부분의 노트에는 반이 없다 → 작품에서 알아낸 반으로 같은 코드가 만들어질 때만 이어진다.
    // (학습지 노트는 스스로 반을 갖고 있어, 작품이 아직 없는 학생도 이 단계에서 이어진다.)
    (notes || []).forEach(n => {
      if (!n.userId) return;
      const w = (works || []).find(x => x.userId === n.userId);
      add(n.userId, n.by, n.klass || (w ? w.klass : ''));
    });
    return m;
  }
  const who = (map, anon) => (map[anon] && map[anon].name) || anon;

  /* ============================ D-1 학급 진행 현황 ============================ */
  // 각 단계에 '도달한 학생 수'. 로그가 없는 단계는 작품/노트로도 보정한다.
  function stageProgress(logs, works, notes) {
    const perStage = {};
    STAGES.forEach(s => perStage[s.key] = new Set());
    (logs || []).forEach(l => { if (perStage[l.stage]) perStage[l.stage].add(l.uid); });
    // 로그 이전에 만들어진 자료도 반영(전시=share, 성찰=own)
    (works || []).forEach(w => {
      const a = Log.anonOf({ userId: w.userId, klass: w.klass }); if (!a) return;
      perStage.make.add(a); if (w.intent) perStage.intent.add(a); if (w.exhibited) perStage.share.add(a);
    });
    (notes || []).forEach(n => {
      // 노트에는 반이 없으므로 같은 학생의 작품에서 반을 찾아 익명 코드를 맞춘다(안 맞으면 다른 사람으로 셈해 버린다)
      const w = (works || []).find(x => x.userId === n.userId);
      const a = Log.anonOf({ userId: n.userId, klass: n.klass || (w ? w.klass : '') }); if (!a) return;
      if (n.kind === 'reflection' || n.kind === 'statement') perStage.own.add(a);
      if (n.kind === 'revision') perStage.revise.add(a);
      if (n.kind === 'literacy' || n.kind === 'card') perStage.judge.add(a);
      // 학습지: 어느 차시를 썼는지에 따라 단계가 다르다(차시마다 procStage 를 갖고 저장된다).
      if (n.kind === 'worksheet' && perStage[n.procStage]) perStage[n.procStage].add(a);
    });
    return STAGES.map(s => ({ key: s.key, label: s.label, desc: s.desc, n: perStage[s.key].size, uids: [...perStage[s.key]] }));
  }
  // 한 학생이 '어디까지 갔는가': 도달한 가장 높은 단계
  function furthestStage(uid, logs) {
    let best = -1;
    (logs || []).forEach(l => { if (l.uid !== uid) return; const i = Log.stageIndex(l.stage); if (i > best) best = i; });
    return best;
  }

  /* ============================ D-2 판단 활동 지표 ============================ */
  function judgementMetrics(data) {
    const { works = [], notes = [], logs = [], versions = [], feedback = [] } = data || {};
    const map = nameMap(works, notes);
    const rows = {};
    const get = (anon) => {
      if (!rows[anon]) rows[anon] = { uid: anon, name: who(map, anon), klass: (map[anon] && map[anon].klass) || '',
        compare: 0, revise: 0, works: 0, evidence: 0, ask: 0, answer: 0, critique: 0, reflect: 0, exhibit: 0, stage: -1, last: 0 };
      return rows[anon];
    };
    Object.keys(map).forEach(get);   // 작품만 있고 로그가 없는 학생도 표에 나오도록

    logs.forEach(l => {
      const r = get(l.uid);
      if (!r.klass && l.klass) r.klass = l.klass;   // 작품이 아직 없는 학생도 반은 보이도록
      if (l.ts > r.last) r.last = l.ts;
      const i = Log.stageIndex(l.stage); if (i > r.stage) r.stage = i;
      if (l.action === 'ab_switch') r.compare++;
      else if (l.action === 'coach_ask') r.ask++;
      else if (l.action === 'coach_answer') r.answer++;
      else if (l.action === 'critique_write') r.critique++;
      else if (l.action === 'reflect_submit') r.reflect++;
      else if (l.action === 'exhibit') r.exhibit++;
    });
    // 수정 횟수 = 버전 스냅샷 수 − 1 (작품별로 세어 학생 단위로 합산)
    const byWork = {};
    versions.forEach(v => { if (!v.uid) return; (byWork[v.uid] = byWork[v.uid] || {})[v.workId] = (byWork[v.uid][v.workId] || 0) + 1; });
    Object.keys(byWork).forEach(anon => {
      const r = get(anon);
      r.revise = Object.values(byWork[anon]).reduce((a, n) => a + Math.max(0, n - 1), 0);
    });
    works.forEach(w => {
      const a = Log.anonOf({ userId: w.userId, klass: w.klass }); if (!a) return;
      const r = get(a); r.works++; if ((w.evidence || '').trim()) r.evidence++;
      if (w.exhibited && !r.exhibit) r.exhibit = Math.max(r.exhibit, 1);
      if (w.updatedAt > r.last) r.last = w.updatedAt;
    });
    notes.forEach(n => {
      const w = works.find(x => x.userId === n.userId);
      const a = Log.anonOf({ userId: n.userId, klass: w ? w.klass : '' }); if (!a || !rows[a]) return;
      if (n.kind === 'reflection' && !rows[a].reflect) rows[a].reflect = 1;
    });

    const list = Object.values(rows).sort((a, b) => (b.stage - a.stage) || (b.revise - a.revise));
    const n = list.length || 1;
    const sum = (f) => list.reduce((s, r) => s + f(r), 0);
    const summary = {
      students: list.length,
      compare: +(sum(r => r.compare) / n).toFixed(1),                              // 학생당 비교 횟수
      revise: +(sum(r => r.revise) / n).toFixed(1),                                // 학생당 수정 횟수
      evidenceRate: works.length ? Math.round(sum(r => r.evidence) / works.length * 100) : 0,
      answerRate: sum(r => r.ask) ? Math.round(sum(r => r.answer) / sum(r => r.ask) * 100) : 0,
      critique: sum(r => r.critique) + (feedback || []).length,
      reflectRate: Math.round(list.filter(r => r.reflect).length / n * 100)
    };
    return { rows: list, summary, map };
  }

  /* ============================ D-3 학생별 타임라인 ============================ */
  function timeline(anon, data) {
    const { works = [], notes = [], logs = [], versions = [] } = data || {};
    const items = [];
    logs.filter(l => l.uid === anon).forEach(l => {
      // 버전 저장은 아래 versions 에서 한 줄로 나온다. 근거 한 줄이 없는 revise 로그는 중복이라 건너뛴다.
      if (l.action === 'revise' && !(l.payload && l.payload.reason)) return;
      items.push({
        t: l.ts, type: 'log', stage: l.stage, icon: '·',
        text: (Log.ACTIONS[l.action] || l.action) + (l.payload && l.payload.reason ? `: “${l.payload.reason}”` :
          l.payload && l.payload.card ? ` (${l.payload.card})` : '')
      });
    });
    works.forEach(w => {
      if (Log.anonOf({ userId: w.userId, klass: w.klass }) !== anon) return;
      items.push({ t: w.updatedAt, type: 'work', stage: w.exhibited ? 'share' : 'make', icon: '🎨',
        text: `${w.exhibited ? '전시' : '작품'} · ${w.title || ''}${w.intent ? ' · 의도: ' + w.intent : ''}`, thumb: w.thumb });
    });
    notes.forEach(n => {
      const w = works.find(x => x.userId === n.userId);
      if (Log.anonOf({ userId: n.userId, klass: n.klass || (w ? w.klass : '') }) !== anon) return;
      if (n.kind === 'worksheet') {                 // 학습지는 '몇 칸을 채웠나'가 곧 과정의 흔적이다
        const pct = n.total ? Math.round((n.filled || 0) * 100 / n.total) : 0;
        items.push({ t: n.updatedAt, type: 'note', stage: n.procStage || 'make', icon: '📄',
          text: `학습지 ${n.title || ''} · ${n.filled || 0} / ${n.total || 0}칸 (${pct}%)` });
        return;
      }
      items.push({ t: n.updatedAt, type: 'note', stage: n.kind === 'reflection' ? 'own' : 'judge', icon: '📝',
        text: `${n.title || '메모'}${n.line ? ': ' + n.line : ''}` });
    });
    versions.filter(v => v.uid === anon).forEach(v => items.push({
      t: v.createdAt, type: 'version', stage: 'revise', icon: '📸', text: '버전 저장', thumb: v.thumb }));
    return items.sort((a, b) => a.t - b.t);
  }

  /* ============================ D-4 학급 유사도 지수 ============================ */
  // --- ① 색 분포 벡터: 썸네일을 32×32 로 줄여 4×4×4 = 64구간 히스토그램 ---
  function sigCache() { try { return JSON.parse(localStorage.getItem(K_SIG) || '{}'); } catch (e) { return {}; } }
  function sigSave(c) { try { localStorage.setItem(K_SIG, JSON.stringify(c)); } catch (e) {} }

  // 그릴 수 있는 것(canvas/image)에서 곧바로 64구간 색 분포 벡터를 뽑는다.
  function signatureOf(drawable) {
    try {
      const S = 32, c = document.createElement('canvas'); c.width = S; c.height = S;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(drawable, 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data, v = new Array(64).fill(0);
      for (let i = 0; i < d.length; i += 4) {
        const bin = (d[i] >> 6) * 16 + (d[i + 1] >> 6) * 4 + (d[i + 2] >> 6);
        v[bin]++;
      }
      const total = S * S;
      // 제곱근을 취해 '큰 덩어리 하나'가 지표를 독식하지 않게 한다(작은 색도 목소리를 갖도록).
      // 소수 셋째 자리에서 끊어 캐시 용량을 아낀다(유사도 판단에는 넉넉한 정밀도).
      for (let i = 0; i < 64; i++) v[i] = Math.round(Math.sqrt(v[i] / total) * 1000) / 1000;
      return v;
    } catch (e) { return null; }   // 교차출처(CORS) 이미지 등은 건너뛴다
  }
  function colorSignature(url) {
    return new Promise((resolve) => {
      if (!url) { resolve(null); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(signatureOf(img));
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // --- ② 매핑 규칙 벡터: 설정에서 '선택'에 해당하는 값만 뽑아 집합으로 ---
  const RULE_KEYS = ['K', 'N', 'space', 'mouseMode', 'clickExplode', 'micTarget', 'freqOn',
    'mapping', 'layout', 'motionStyle', 'baseSpeed', 'vib', 'trail', 'pointScale', 'cohesion', 'bg'];
  function ruleSet(work) {
    const s = work.settings || {}, out = new Set();
    RULE_KEYS.forEach(k => {
      let v = s[k];
      if (v == null && s.mapping && typeof s.mapping === 'object') v = s.mapping[k];
      if (v == null) return;
      if (typeof v === 'object') v = JSON.stringify(v).slice(0, 40);
      if (typeof v === 'number') v = Math.round(v * 4) / 4;    // 미세한 숫자 차이는 같은 선택으로 본다
      out.add(k + '=' + v);
    });
    return out;
  }
  function jaccard(a, b) {
    if (!a.size && !b.size) return 0;
    let inter = 0; a.forEach(x => { if (b.has(x)) inter++; });
    return inter / (a.size + b.size - inter);
  }
  function cosine(a, b) {
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return (na && nb) ? d / Math.sqrt(na * nb) : 0;
  }

  // --- 2차원 산점도: 색 벡터의 주성분 2개(멱반복 · 난수 없이 항상 같은 결과) ---
  function pca2(vectors) {
    const n = vectors.length, dim = vectors[0].length;
    const mean = new Array(dim).fill(0);
    vectors.forEach(v => { for (let i = 0; i < dim; i++) mean[i] += v[i] / n; });
    const X = vectors.map(v => v.map((x, i) => x - mean[i]));
    function power(mat, exclude) {
      let w = new Array(dim).fill(0).map((_, i) => (i % 7 + 1) / 7);   // 고정 초기값 → 재현성
      for (let it = 0; it < 40; it++) {
        const next = new Array(dim).fill(0);
        mat.forEach(row => { const p = row.reduce((s, x, i) => s + x * w[i], 0); for (let i = 0; i < dim; i++) next[i] += p * row[i]; });
        if (exclude) { const p = exclude.reduce((s, x, i) => s + x * next[i], 0); for (let i = 0; i < dim; i++) next[i] -= p * exclude[i]; }
        const norm = Math.sqrt(next.reduce((s, x) => s + x * x, 0)) || 1;
        w = next.map(x => x / norm);
      }
      return w;
    }
    const pc1 = power(X), pc2 = power(X, pc1);
    return X.map(row => [row.reduce((s, x, i) => s + x * pc1[i], 0), row.reduce((s, x, i) => s + x * pc2[i], 0)]);
  }

  /*
   * similarity(works) → Promise<{ index, items, outliers, points, pairs, skipped }>
   *   index    학급 유사도 지수(0~100). 모든 작품 쌍의 평균 닮음 정도.
   *   items    작품별 { work, avg }  avg = 다른 작품들과의 평균 유사도
   *   outliers 가장 닮지 않은 3점(비전형 작품)
   */
  async function similarity(works, opts) {
    opts = opts || {};
    const wColor = opts.wColor != null ? opts.wColor : 0.65;   // 색 : 규칙 = 65 : 35
    const list = (works || []).filter(w => w.thumb || w.srcSample);
    const cache = sigCache();
    const sigs = [];
    let skipped = 0;
    for (const w of list) {
      const url = w.thumb || w.srcSample;
      const ck = w.id + '_' + (url ? url.length : 0);
      let v = cache[ck];
      if (!v) { v = await colorSignature(url); if (v) cache[ck] = v; }
      if (v) sigs.push({ work: w, v, rules: ruleSet(w) }); else skipped++;
    }
    sigSave(cache);
    if (sigs.length < 2) return { index: null, items: [], outliers: [], points: [], pairs: 0, skipped, n: sigs.length };

    const n = sigs.length, sim = [];
    for (let i = 0; i < n; i++) sim.push(new Array(n).fill(0));
    let total = 0, pairs = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const s = wColor * cosine(sigs[i].v, sigs[j].v) + (1 - wColor) * jaccard(sigs[i].rules, sigs[j].rules);
      sim[i][j] = sim[j][i] = s; total += s; pairs++;
    }
    const coords = pca2(sigs.map(s => s.v));
    const items = sigs.map((s, i) => ({
      work: s.work,
      avg: sim[i].reduce((a, b) => a + b, 0) / (n - 1),
      x: coords[i][0], y: coords[i][1]
    })).sort((a, b) => b.avg - a.avg);
    return {
      index: Math.round(total / pairs * 100),
      items,
      outliers: items.slice(-3).reverse(),
      points: items,
      pairs, skipped, n
    };
  }

  /* ============================ D-5 내보내기 ============================ */
  function toCSV(rows, cols) {
    const q = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = cols.map(c => q(c.label)).join(',');
    const body = rows.map(r => cols.map(c => q(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(',')).join('\n');
    return '﻿' + head + '\n' + body;      // BOM: 엑셀에서 한글이 깨지지 않도록
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(blob); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  global.Metrics = { nameMap, who, stageProgress, furthestStage, judgementMetrics, timeline,
    similarity, colorSignature, signatureOf, ruleSet, cosine, jaccard, pca2, toCSV, download };
})(window);
