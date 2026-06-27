/*
 * xlsx.js — 엑셀(.xlsx) 파일을 외부 라이브러리 없이 읽는 최소 리더
 * -----------------------------------------------------------------------------
 * .xlsx = ZIP(여러 XML) 묶음. 브라우저 내장 기능만 사용한다:
 *   - 압축 해제: DecompressionStream('deflate-raw')  (별도 라이브러리 불필요)
 *   - XML 파싱:  DOMParser
 * 첫 번째 시트를 2차원 셀 배열(grid: 행→[셀 문자열…])로 돌려준다.
 * 작은 교육용 파일 대상(ZIP64·암호화·매크로는 비대상).
 */
(function (global) {
  'use strict';

  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  // ZIP 끝의 EOCD(End Of Central Directory) 레코드 찾기(주석 최대 65535B 뒤에서부터 스캔)
  function findEOCD(b) {
    const min = Math.max(0, b.length - 65557);
    for (let i = b.length - 22; i >= min; i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) return i;
    }
    return -1;
  }

  // deflate-raw 압축 해제(내장 스트림)
  async function inflateRaw(data) {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(data); writer.close();
    const reader = ds.readable.getReader();
    const chunks = []; let total = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); total += value.length; }
    const out = new Uint8Array(total); let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  // 중앙 디렉터리를 읽어 {이름: {method, comp(압축데이터)}} 맵을 만든다(크기·오프셋이 신뢰 가능).
  function readDirectory(b) {
    const eocd = findEOCD(b);
    if (eocd < 0) throw new Error('ZIP 형식이 아니에요 (.xlsx 파일이 맞나요?)');
    const count = u16(b, eocd + 10);
    let p = u32(b, eocd + 16);                 // 중앙 디렉터리 시작 오프셋
    const files = {};
    const td = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (u32(b, p) !== 0x02014b50) break;     // 중앙 디렉터리 헤더 시그니처
      const method = u16(b, p + 10);
      const compSize = u32(b, p + 20);
      const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commLen = u16(b, p + 32);
      const localOff = u32(b, p + 42);
      const name = td.decode(b.subarray(p + 46, p + 46 + nameLen));
      // 로컬 헤더(localOff): nameLen@26, extraLen@28 → 데이터 시작 위치 계산
      const lNameLen = u16(b, localOff + 26), lExtraLen = u16(b, localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      files[name] = { method, comp: b.subarray(dataStart, dataStart + compSize) };
      p += 46 + nameLen + extraLen + commLen;
    }
    return files;
  }

  async function fileBytes(files, name) {
    const f = files[name]; if (!f) return null;
    if (f.method === 0) return f.comp;          // 무압축(stored)
    if (f.method === 8) return await inflateRaw(f.comp);
    throw new Error('지원하지 않는 압축 방식: ' + f.method);
  }

  function xml(text) { return new DOMParser().parseFromString(text, 'application/xml'); }

  // 공유 문자열 테이블(셀이 t="s"면 여기 인덱스를 가리킴)
  function parseSharedStrings(text) {
    const doc = xml(text), out = [];
    doc.querySelectorAll('si').forEach(si => {
      let s = ''; si.querySelectorAll('t').forEach(t => { s += t.textContent; });
      out.push(s);
    });
    return out;
  }

  // 셀 참조('B12')에서 0-based 열 인덱스(예: B → 1)
  function colIndex(ref) {
    let c = 0;
    for (let i = 0; i < ref.length; i++) {
      const ch = ref.charCodeAt(i);
      if (ch >= 65 && ch <= 90) c = c * 26 + (ch - 64); else break;
    }
    return c - 1;
  }

  function parseSheet(text, shared) {
    const doc = xml(text), rows = [];
    doc.querySelectorAll('sheetData > row').forEach(row => {
      const cells = [];
      row.querySelectorAll('c').forEach(c => {
        const ref = c.getAttribute('r') || '';
        const ci = ref ? colIndex(ref) : cells.length;
        const t = c.getAttribute('t');
        let v = '';
        if (t === 'inlineStr') {
          const is = c.querySelector('is');
          v = is ? Array.from(is.querySelectorAll('t')).map(x => x.textContent).join('') : '';
        } else {
          const vEl = c.querySelector('v');
          const raw = vEl ? vEl.textContent : '';
          v = (t === 's') ? (shared[+raw] != null ? shared[+raw] : '') : raw;
        }
        cells[ci >= 0 ? ci : cells.length] = v;
      });
      for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = '';
      rows.push(cells);
    });
    const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    rows.forEach(r => { for (let i = 0; i < w; i++) if (r[i] == null) r[i] = ''; });
    return rows;
  }

  // 메인: ArrayBuffer(.xlsx) → { grid: 행[][], sheet: 시트경로 }
  async function read(buffer) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('이 브라우저는 엑셀 자동 해제를 지원하지 않아요. CSV로 저장해 올려 주세요.');
    }
    const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const files = readDirectory(b);
    const td = new TextDecoder();
    const ssBytes = await fileBytes(files, 'xl/sharedStrings.xml');
    const shared = ssBytes ? parseSharedStrings(td.decode(ssBytes)) : [];
    const names = Object.keys(files);
    const sheetPath = names.find(n => /^xl\/worksheets\/sheet1\.xml$/.test(n))
      || names.find(n => /^xl\/worksheets\/.*\.xml$/.test(n));
    if (!sheetPath) throw new Error('엑셀에서 시트를 찾지 못했어요.');
    const sheetBytes = await fileBytes(files, sheetPath);
    const grid = parseSheet(td.decode(sheetBytes), shared);
    return { grid, sheet: sheetPath };
  }

  global.XlsxReader = { read };
})(typeof window !== 'undefined' ? window : this);
