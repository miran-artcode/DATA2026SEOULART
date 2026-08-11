# 학습지 꾸러미: 내용 패키지

> 학습지를 **내용(JSON)** 과 **표시(렌더러)** 로 나눠 둔 폴더입니다.
> 지금 하시는 다른 작업과 파일이 겹치지 않습니다. 이 폴더만 통째로 옮기면 어느 사이트에서든 그대로 씁니다.

## 이 폴더가 하는 일

| 하고 싶은 일 | 하는 방법 |
|---|---|
| 차시를 하나 더 넣기 | `unit-data-eye/09-이름.json` 파일을 넣고 `node build.mjs` |
| 단원을 하나 더 넣기 | 새 폴더 + `unit.json` + `NN-*.json` 넣고 `node build.mjs` |
| 학생마다 사본 만들기 | `roster/반이름.csv` 넣고 `node build.mjs --instances` |
| 종이로 인쇄하기 | `preview.html` → 학습지 고르고 [인쇄 / PDF] (A4 맞춤) |
| 화면에서 쓰게 하기 | `render/worksheet.js` 를 수업 사이트에 붙이기 → `INTEGRATION.md` |

**기존 파일을 고칠 일이 없습니다.** 파일을 넣고 스크립트를 한 번 돌리면 차례·색인·검사가 알아서 갱신됩니다.

## 폴더 구조

```
content/worksheets/
├─ manifest.json          ← 자동 생성. 실행 시점에는 이 파일 하나만 읽는다
├─ build.mjs              ← 폴더를 훑어 manifest 를 만들고 내용을 검사
├─ preview.html           ← 미리보기 · 인쇄 (작업용)
├─ render/
│  ├─ worksheet.js        ← 렌더러 (의존성 0 · 어느 사이트에나 붙음)
│  └─ worksheet.css       ← 화면 + A4 인쇄 한 벌
├─ roster/                ← (선택) 학급 명부 CSV(코드만, 이름 금지)
├─ instances/             ← (자동) 학생별 빈 사본. git 에 올리지 않음
└─ unit-data-eye/
   ├─ unit.json           ← 단원 메타: 개념·본질적 질문·일반화·루브릭·자기점검
   ├─ 00-cover.json       ← 표지 (차례는 자동)
   ├─ 01-seven-eyes.json  … 08-exhibit-critique.json
```

## 만드는 법 (터미널 한 줄)

```bash
node content/worksheets/build.mjs             # 검사 + manifest 갱신
node content/worksheets/build.mjs --check     # 검사만 (파일 안 씀)
node content/worksheets/build.mjs --instances # 명부로 학생 사본 만들기
node content/worksheets/smoke.mjs             # 렌더러가 전부 그려지는지 + 저장 경로 일치 확인
```

미리보기는 간이 서버가 필요합니다(브라우저가 `file://` 에서 JSON 을 못 읽습니다).

```bash
cd content/worksheets && npx serve .     # 또는 python -m http.server 8000
```

## 학습지 한 장의 구조

파일 이름은 `NN-영문이름.json`. `NN` 은 정렬용 두 자리 숫자입니다.

```jsonc
{
  "schemaVersion": 1,
  "id": "s3",                    // ★ 영구 식별자. 한 번 정하면 바꾸지 않는다
  "kind": "session",             // session | cover
  "order": 3,                    // 꾸러미 안 순서
  "session": 3,                  // 몇 차시인가 (표지는 null)
  "title": "규칙 두 개 만들기",
  "yield": "내 매핑 규칙 A·B 와 고른 이유",   // 차례의 '완성하면 남는 것'
  "todayQuestion": "…",
  "screens": [{ "label": "데이터 점 스튜디오", "page": "studio-data.html", "exists": true }],
  "eq": ["EQ1"],                 // unit.json 의 본질적 질문
  "generalizations": ["G2"],     // 이 차시가 향하는 일반화 (학생에겐 보이지 않음)
  "microConcepts": ["매핑", "선택과 배제"],
  "blocks": [ /* 아래 */ ],
  "carryOver": { "id": "next_line", "prompt": "…", "to": ["s4.choose_discard"] },
  "selfCheck": "standard"        // unit.json 의 selfCheckSets 키
}
```

### 블록(칸) 종류

| kind | 쓰임 | 저장 경로 |
|---|---|---|
| `fields` | 왼쪽 질문 / 오른쪽 답 | `s3.report.data_name` |
| `table` | 표. `rows` 가 숫자면 빈 줄 N개, 배열이면 줄 이름 고정 | `s3.rules_ab.size.plan_a` |
| `conceptTable` | 개념어 / 본 장면 / 내 말로 | `s1.my_words.summary.reworded` |
| `cloze` | 문장 완성. `template` 안 `{{slot}}` | `s1.one_sentence.visible` |
| `freewrite` | 큰 칸 한 개 (`maxChars` 가능) | `s7.artist_statement.text` |
| `static` | 입력 없음(표지의 개념·질문·차례) | — |

블록에 붙는 교육적 속성입니다. 이 값들 덕분에 나중에 자동 정리가 됩니다.

- `evidence`: `product` · `process` · `understanding` (증거 세 층)
- `rubric`: `true` 면 루브릭 4수준으로 채점하는 칸
- `scaffold`: `wordBank` → `blanks` → `starter` → `blank` → `topics` (비계 감소 사다리)
- `card`: 질문 카드 4종 중 하나
- `logAction`: 사이트 `js/log.js` 의 11개 action 중 하나 (화면 기록과 종이가 같은 사건을 가리키게 함)

### 절대 어기면 안 되는 규칙

1. **`id` 를 바꾸지 마세요.** 학생 답이 `sheetId.blockId.fieldId` 경로에 저장됩니다.
   문구·순서는 마음대로 고쳐도 되지만 `id` 를 바꾸면 저장된 답이 길을 잃습니다.
   꼭 바꿔야 하면 `"renamedFrom": "옛id"` 를 남기고 마이그레이션을 적어 두세요.
2. **이름을 넣지 마세요.** 학번 코드(익명)만 씁니다. `roster` CSV 에 이름 열이 있으면 빌드가 거부합니다.
3. **일반화(G1~G4) 원문을 학생 화면에 뿌리지 마세요.** 8차시 ④번 칸에서 학생이 스스로 씁니다.

## 검사가 잡아 주는 것

`build.mjs` 는 아래를 자동으로 확인합니다. 하나라도 걸리면 manifest 를 쓰지 않습니다.

- 없는 본질적 질문·일반화·증거층·비계·질문카드를 가리키는가
- `logAction` 이 `js/log.js` 의 11개 action 안에 있는가
- `cloze` 의 `{{slot}}` 과 `slots` 목록이 일치하는가
- `carryOver` 가 실제로 있는 학습지·블록을 가리키는가
- 저장 경로(`sheet.block.field`)가 겹치지 않는가
- 사이트에 아직 없는 화면(`exists:false`)을 쓰고 있는가 (경고)

## 현재 상태

- 단원 1개(`data-eye`) · 학습지 9장(표지 + 8차시) · 저장 칸 163개 · 루브릭 대상 68개
- 6차시 자료: `unit-data-eye/data/bodyfat.csv` (성인 남성 252명 · 15열) + `bodyfat.meta.json`(열 이름·단위·특이점).
  사이트에도 `data/bodyfat.csv` 로 등록되어 데이터 점 스튜디오 샘플 목록에서 바로 열립니다.
- 알려진 공백 없음. 7차시 ‘낱말 구름 스튜디오’는 `studio-word.html` 로 연결되었습니다.
- **이 사이트에 붙어 있습니다.** 어떻게 붙었는지·무엇이 원본과 다른지는 `INTEGRATION.md`.
  내용을 고친 뒤에는 반드시 `node worksheets/build.mjs` 를 돌려야 진행률·교사 화면에 반영됩니다.
