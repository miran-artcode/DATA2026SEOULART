/*
 * docent.js — 작품 해설(도슨트) 자동 생성 (규칙 기반, 순수 함수)
 * 작품의 의도·데이터·알고리즘 설정을 읽어 한국어 해설 문단을 만든다.
 */
(function (global) {
  'use strict';
  const KIND = { color: '색 군집', data: '데이터 점', lab: '분석' };
  const COLORLBL = { value: '값 그라데이션(한↔난색)', warm: '난색', cool: '한색' };

  function commentary(w) {
    if (!w) return '';
    const s = w.settings || {}, lines = [];
    lines.push(`${w.by || '작가'}의 「${w.title || '무제'}」는 ${KIND[w.kind] || '데이터'} 방식으로 만든 데이터 기반 작품입니다.`);

    if (w.kind === 'data') {
      const mp = s.mapping || {}, m = [];
      if (mp.mSize) m.push('값이 클수록 점이 커지고');
      if (mp.mSpeed) m.push('변화가 클수록 빠르게 움직이며');
      if (mp.mDir) m.push('증가·감소에 따라 방향이 바뀌고');
      if (mp.mDensity) m.push('값에 따라 점이 모이거나 흩어지며');
      if (mp.mAlpha) m.push('값에 따라 투명도가 달라지고');
      if (mp.mShape) m.push('값 구간에 따라 형태(△○□)가 달라집니다');
      lines.push(`‘${w.dataName || '우리 데이터'}’를 점으로 번역해, ${m.length ? m.join(', ') : '여러 규칙으로 매핑'}했습니다.`);
      if (s.color) lines.push(`색은 ${COLORLBL[s.color] || s.color}으로 표현했습니다.`);
    } else if (w.kind === 'color') {
      lines.push(`명화를 K-means로 분석해 대표색 ${s.K || '여러'}개로 압축하고, ${s.N ? s.N + '개의 ' : ''}점으로 재구성했습니다${s.space ? ' (' + String(s.space).toUpperCase() + ' 색공간)' : ''}.`);
    }

    if (w.intent) lines.push(`작가는 “${w.intent}”라는 의도를 담았습니다.`);
    if (w.evidence) lines.push(`그 근거로 ‘${w.evidence}’라고 밝혔습니다.`);
    lines.push('관람 포인트 — 데이터의 선택과 규칙이 의도를 어떻게 받쳐 주는지, 그 과정에서 무엇이 강조되고 무엇이 사라졌는지 살펴보세요.');
    return lines.join(' ');
  }
  global.Docent = { commentary };
})(window);
