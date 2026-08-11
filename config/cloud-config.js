/*
 * cloud-config.js: 실시간 클라우드(Firebase) 연동 [활성]
 * =============================================================================
 * 프로젝트: data-art-canvas (Firestore)
 * 이 파일이 js/store.js "앞"에서 로드되면 학급 전체가 한 링크에서 실시간 공유됩니다.
 *
 *  • Firebase 웹 apiKey 는 '비밀'이 아니라 공개용 식별자입니다(클라이언트에 그대로 노출됨).
 *    실제 보안은 아래 Firestore 보안 규칙으로 합니다 → config/firestore.rules 참고.
 *  • 강제 로컬 전환: 주소 끝에 ?local=1 을 붙이거나(예: gallery.html?local=1),
 *    콘솔에서 localStorage.setItem('dn_cloud_off','1') 후 새로고침.
 *  • SDK·네트워크 실패 시 store.js 가 자동으로 로컬 저장으로 폴백합니다(수업 안 멈춤).
 */
(function (global) {
  'use strict';

  // 강제 로컬 모드(테스트/오프라인/점검용)
  if (location.search.indexOf('local=1') >= 0 || (global.localStorage && localStorage.getItem('dn_cloud_off') === '1')) {
    console.info('[cloud] 강제 로컬 모드: 클라우드 비활성'); return;
  }

  const firebaseConfig = {
    apiKey: 'AIzaSyCUvOvyteIFXzP95ssZt0VKLBovQ_p_cDQ',
    authDomain: 'data-art-canvas.firebaseapp.com',
    projectId: 'data-art-canvas',
    storageBucket: 'data-art-canvas.firebasestorage.app',
    messagingSenderId: '830442352274',
    appId: '1:830442352274:web:c4aa53df7763515bf7004b'
  };

  // Firebase v10 모듈 SDK 동적 import (추가 설치 불필요)
  const ready = (async () => {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const app = appMod.initializeApp(firebaseConfig);
    const db = fs.getFirestore(app);
    // Storage(사진 원본 보관)는 선택 기능: 모듈/버킷이 없어도 Firestore 는 그대로 동작.
    let st = null, storage = null;
    try { st = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js'); storage = st.getStorage(app); }
    catch (e) { console.warn('[cloud] Storage 미사용: 사진은 인라인 폴백', e && e.message); }
    console.info('[cloud] 실시간 공유 활성화됨 · project', firebaseConfig.projectId);
    return { fs, db, st, storage };
  })().catch(e => { console.warn('[cloud] 초기화 실패 → 로컬 폴백', e); return null; });

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  async function add(col, obj, id) {
    const r = await ready; if (!r) throw new Error('cloud-not-ready');
    id = id || obj.id || uid(); obj.id = id;
    await r.fs.setDoc(r.fs.doc(r.db, col, id), obj, { merge: true }); return id;
  }
  async function all(col) {
    const r = await ready; if (!r) throw new Error('cloud-not-ready');
    const snap = await r.fs.getDocs(r.fs.collection(r.db, col));
    return snap.docs.map(d => d.data());
  }

  global.DN_CLOUD = {
    _ready: ready,
    // 사진 원본을 Storage 에 올리고 다운로드 URL 반환(문서엔 URL만 저장 → 1MB 문서 한계 우회).
    async uploadImage(blob, path) {
      const r = await ready; if (!r || !r.storage || !r.st) throw new Error('storage-unavailable');
      const ref = r.st.ref(r.storage, path);
      await r.st.uploadBytes(ref, blob, { contentType: (blob && blob.type) || 'image/jpeg', cacheControl: 'public,max-age=31536000' });
      return await r.st.getDownloadURL(ref);
    },
    async saveWork(w) { w.updatedAt = Date.now(); if (!w.createdAt) w.createdAt = Date.now(); return add('works', w, w.id); },
    async listWorks(f) {
      let list = (await all('works')).sort((a, b) => b.updatedAt - a.updatedAt);
      if (f && f.userId) list = list.filter(w => w.userId === f.userId);
      if (f && f.exhibited) list = list.filter(w => w.exhibited);
      return list;
    },
    async getWork(id) { return (await all('works')).find(w => w.id === id) || null; },
    async deleteWork(id) { const r = await ready; if (r) await r.fs.deleteDoc(r.fs.doc(r.db, 'works', id)); },
    async addFeedback(fb) { fb.createdAt = Date.now(); return add('feedback', fb); },
    async listFeedback(workId) { return (await all('feedback')).filter(f => f.workId === workId).sort((a, b) => a.createdAt - b.createdAt); },
    async saveNote(n) { n.updatedAt = Date.now(); if (!n.createdAt) n.createdAt = Date.now(); return add('notes', n, n.id); },
    async listNotes(userId) { return (await all('notes')).filter(n => !userId || n.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt); },
    /* 한 건씩 지우기: 교사가 올린 '우수 사례'만 걷어 내기 위한 길.
       규칙(firestore.rules)이 notes·logs·versions 의 delete 를 열어 두었기에 가능하다.
       feedback·quizAnswers 는 기록 보존을 위해 규칙이 삭제를 막아 두었으므로 여기에도 없다. */
    async deleteNote(id) { const r = await ready; if (r) await r.fs.deleteDoc(r.fs.doc(r.db, 'notes', id)); },
    async deleteLog(id) { const r = await ready; if (r) await r.fs.deleteDoc(r.fs.doc(r.db, 'logs', id)); },
    async deleteVersion(id) { const r = await ready; if (r) await r.fs.deleteDoc(r.fs.doc(r.db, 'versions', id)); },
    async saveQuiz(q) { if (!q.createdAt) q.createdAt = Date.now(); return add('quizzes', q, q.id); },
    async listQuizzes() { return (await all('quizzes')).sort((a, b) => b.createdAt - a.createdAt); },
    async getQuiz(id) { return (await all('quizzes')).find(q => q.id === id) || null; },
    async deleteQuiz(id) { const r = await ready; if (r) await r.fs.deleteDoc(r.fs.doc(r.db, 'quizzes', id)); },
    async addQuizAnswer(a) { a.createdAt = Date.now(); return add('quizAnswers', a); },
    async listQuizAnswers(quizId) { return (await all('quizAnswers')).filter(a => !quizId || a.quizId === quizId); },

    /* ---- 학습 로그(log.js) ----
     * 이름은 올라가지 않는다. 반 + 익명 코드(uid)만 담긴다. 이 컬렉션이 없으면
     * store.js 가 로컬로 폴백해서, 작품은 클라우드·로그는 각자 브라우저에 흩어진다. */
    async addLog(l) { l.ts = l.ts || Date.now(); return add('logs', l, l.id); },
    async listLogs() { return (await all('logs')).sort((a, b) => a.ts - b.ts); },
    async clearLogs() {
      const r = await ready; if (!r) throw new Error('cloud-not-ready');
      const snap = await r.fs.getDocs(r.fs.collection(r.db, 'logs'));
      for (const d of snap.docs) await r.fs.deleteDoc(d.ref);
    },

    // ---- 버전 스냅샷(version.js) ----
    // 작품 하나당 최근 8개만 남긴다(로컬 저장과 같은 상한: 썸네일이 무한정 쌓이지 않도록).
    async saveVersion(v) {
      v.createdAt = v.createdAt || Date.now();
      const id = await add('versions', v, v.id);
      try {
        const r = await ready;
        const mine = (await all('versions')).filter(x => x.workId === v.workId).sort((a, b) => a.createdAt - b.createdAt);
        for (const old of mine.slice(0, Math.max(0, mine.length - 8))) {
          await r.fs.deleteDoc(r.fs.doc(r.db, 'versions', old.id));
        }
      } catch (e) { console.warn('[cloud] 버전 정리 실패', e && e.message); }
      return id;
    },
    async listVersions(workId) {
      return (await all('versions')).filter(v => !workId || v.workId === workId).sort((a, b) => a.createdAt - b.createdAt);
    }
  };
})(window);
