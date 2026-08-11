# 이 사이트에 붙은 방식

> **붙이는 계획서가 아니라, 붙어 있는 상태의 설명서입니다.**
> (원본 계획서는 `art-ai-education-lab/content/worksheets/INTEGRATION.md` 에 그대로 있습니다.)
> `firestore.rules` 와 `cloud-config.js` 는 손대지 않았습니다. 아래 A 참고.

---

## A. 저장: 학습지 한 장 = 작업노트 한 건

`config/firestore.rules` 의 마지막 줄이 **모르는 컬렉션을 전부 막습니다.**

```
match /{document=**} { allow read, write: if false; }
```

새 컬렉션(`worksheets`)을 만들면 규칙 재게시 + `cloud-config.js` 수정 + 교사 대시보드 수정까지 번집니다.
그래서 학습지 한 장을 **작업노트 한 건**으로 저장합니다. 규칙이 요구하는 `userId` · `kind` 를 갖추고
`answers` 를 중첩 객체 하나로 넣으므로 `data.size() < 60` 조건도 통과합니다(최상위 필드 16개).

```js
{
  id: 'ws_2-3-k7f2_data-eye_s3',   // ★ 미리 정해진 id: 자동 저장이 겹쳐도 한 장에 한 건
  userId, by,                      // 별명(실명 아님): 교사 화면이 이것으로 조인한다
  klass: '2-3', code: '2-3·k7f2',  // 반 + 가명 코드
  kind: 'worksheet', unit: 'data-eye', sheet: 's3', session: 3,
  stage: 1,                        // 4단계 여정에서의 자리(숫자)
  procStage: 'make',               // 창작 7단계에서의 자리(키): metrics.js 의 D-1 이 쓴다
  title: '3차시 · 규칙 두 개 만들기',
  answers: { 's3.report.data_name': '…', 's3.selfcheck.why': 'good' },
  filled: 12, total: 24,           // 진행률을 매번 세지 않아도 되도록 저장 시점에 함께 적는다
  updatedAt
}
```

**id 를 미리 정하는 이유**: 자동 저장은 디바운스로 겹칠 수 있는데 id 없이 저장하면 그때마다 새 노트가
생겨, 교사 화면에서 같은 학생의 같은 차시가 여러 줄로 보이고 제출률이 어긋납니다.
로컬(`store.js`)도 클라우드(`setDoc … {merge:true}`)도 같은 id 면 덮어씁니다.

**공짜로 따라온 것**: `admin.html`·`portfolio.html`·`Store.exportAll()` 이 이미 notes 를 읽으므로,
저장이 시작되는 순간부터 취합·인쇄·내보내기가 동작합니다.

### ⚠ 저장소를 읽는 자리는 두 곳뿐이어야 합니다

클라우드 모드의 `listNotes` 는 **notes 컬렉션을 통째로 읽습니다**(`where` 절이 없습니다).
학습지 단추가 14개 화면에 뜨므로, 단추가 저장소를 읽으면 한 시간 수업에 학급 전체 노트를 수백 번 읽게 됩니다.

- **읽어도 되는 곳**: `worksheet.html`(답이 필요하다) · `admin.html`(교사가 한 번 본다)
- **읽으면 안 되는 곳**: 스튜디오 단추(`mountLauncher`) · 허브 묶음(`mountHub`)

두 곳은 대신 **이 기기의 진행률 요약**(`localStorage['dn_ws_prog']`, `{userId, sheets:{s1:{filled,total,pct}}}`)만
읽습니다. 요약은 학습지를 저장할 때마다 갱신되고, 학습지 화면을 열면 저장소 원본으로 다시 맞춰집니다.
다른 기기에서 쓴 진행률은 그 기기에서 학습지를 한 번 열기 전까지 표시되지 않습니다(표시만 그렇고, 답은 언제나 안전합니다).

### 이동 직전 입력

`beforeunload` 안에서는 클라우드 저장이 끝날 시간이 없습니다. 그래서 학습지 화면은 **저장 대기 중일 때 링크 클릭을
가로채** 저장을 마친 뒤 이동합니다(`mountPage` 의 캡처 단계 click 처리기). `beforeunload` 는 뒤로가기·탭 닫기용
마지막 방책으로만 남겨 두었습니다.

---

## B. 붙어 있는 자리

| 파일 | 하는 일 |
|---|---|
| `worksheet.html` | 학습지 화면. 왼쪽 단원 차례 · 오른쪽 학습지 한 장 · 머리에 그 차시의 배우기·만들기·나누기 · 인쇄는 학습지만 |
| `js/worksheet.js` | `COURSE`(차시↔단계↔배우기·만들기·나누기 화면) · 자동 저장 · 순차 진행 · 이월 한 줄 · 스튜디오 단추 · 통합 여정 |
| `js/ui.js` | 상단 **배우기 → 학습지** 한 줄 + 내비 부제의 차시 표기 |
| `hub.html` · `journey.html` | `WS.mountJourney()` 통합 여정(한 줄 = 한 차시: 배우기·만들기·나누기 + 학습지), 4단계 노드에 `WS.tagStageNodes()` 꼬리표. `journey.html` 은 `WS.loadUnit()` 으로 unit.json 의 목표·증거도 그린다 |
| 스튜디오·도구 화면(각 차시의 배우기·만들기·나누기 화면 전부) | 끝에 `js/worksheet.js`(defer) + `WS.mountLauncher()`. 오른쪽 아래 `📄 N차시 학습지` |
| `admin.html` | **D-6 학습지 탭**: 차시별 제출률 · 학생×차시 격자 · 칸별 답 · CSV 2종 |
| `js/metrics.js` | 학습지 노트를 D-1(7단계 진행)·D-3(타임라인)에 반영. 노트가 가진 `klass` 로 가명 코드를 맞춘다 |
| `js/portfolio.js` | A4 포트폴리오에 차시별 완성도 + **차시마다 넘긴 한 줄** |
| `js/studio-data.js` · `data/bodyfat.csv` | 6차시 자료를 샘플 목록에 등록(‘숫자가 사람을 말할 수 있을까’) |

`COURSE` 는 **배치를 바꾸는 단 한 곳**입니다. 차시를 다른 단계·다른 화면에 걸고 싶으면 그 표만 고칩니다.

### 차시 순서 = 단계 순서 (하나의 척추)

학습지끼리 **‘다음 시간으로 넘기는 한 줄’**이 `s1→s2→s3→s4→s5→s6→s8`, `s7→s8` 로 이어져 있고,
4단계 여정의 번호도 그 순서를 따릅니다: 그림(1단계·1~3차시) → 내 소리(2단계·4차시) →
내 사진(3단계·5차시) → 사회(4단계·6차시~). 순차 진행의 척추는 차시 번호 하나이고,
각 차시의 단계 배지·배우기·만들기·나누기 화면은 모두 `COURSE` 표에서 나옵니다.
(과거에는 지도가 사진(2단계) → 소리(3단계)로 학습지와 어긋나 있었는데, 학습지의 이월 사다리
— 소리에서 ‘세기’를 익힘 → 내 삶에 적용 → 타인의 데이터로 확장 — 에 맞춰 정렬했습니다.)

---

## C. 원본 꾸러미와 달라진 곳

이 폴더는 `art-ai-education-lab/content/worksheets` 의 사본입니다. 붙이면서 **내용 한 곳**을 고쳤습니다.

- `unit-data-eye/07-words-in-color.json`: 7차시 ‘낱말 구름 스튜디오’ 화면이 **생겼습니다**
  (`studio-word.html`). `screens[0]` 을 `page: 'studio-word.html', exists: true` 로 바꾸고 `gap`·`gaps` 를 지웠습니다.
  → **원본 꾸러미에도 같은 수정을 넣어 두면** 두 곳이 어긋나지 않습니다.
- `preview.html` · `roster/` · `instances/` 는 가져오지 않았습니다(작업용·학생 자료).
  종이 인쇄가 필요하면 원본 폴더에서 `node build.mjs --instances` 로 만들어 인쇄하세요.

---

## D. 고치고 나서 하는 일

```bash
node worksheets/build.mjs        # 내용 검사 + manifest 갱신 (경고 0 이 목표)
node worksheets/smoke.mjs        # 9장이 모두 그려지고 저장 경로가 맞는지
```

`build.mjs` 를 돌리지 않으면 새 칸이 **진행률·교사 화면·CSV 에 잡히지 않습니다**(색인이 옛것이므로).

### 확인 순서(수업 전 1분)

- 학생: `worksheet.html?s=s1` → 몇 칸 쓰고 새로고침 → 그대로 남아 있는가
- 교사: `admin.html` → 📄 학습지 탭 → 차시 표·격자에 보이는가 → 답안 CSV 가 받아지는가
- 인쇄: 학습지 화면에서 🖨 → A4 에 학습지만(내비·차례 없이) 나오는가
- 오프라인: 인터넷 없이도 열리는가(`Store` 로컬 폴백 · 주소 끝에 `?local=1` 로 강제 가능)
