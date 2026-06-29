# 데이터로 만드는 미디어아트 — 캐글 데이터셋 큐레이션 & 레시피

> 「데이터의 눈」 데이터 점 스튜디오(`studio-data.html`)용 교사·학생 가이드
> 뻔하지 않지만 교육적인 캐글 데이터셋 7종 + 미디어아트로 만드는 법.

---

## 1. 대표 미디어아트를 만드는 4단계

데이터 시각화는 ‘예쁜 효과’가 아니라 **해석**이에요. 무엇을 셀지·무엇을 강조할지가 곧 작가의 선택입니다.

1. **주제·감각 먼저** — 이 데이터에서 *어떤 문제·감정·이야기*를 보여주고 싶은가? (숫자가 되기 전의 느낌)
2. **무엇을 셀지/뺄지** — 어떤 열을 쓰고 어떤 열을 일부러 뺄지. (생략도 선택)
3. **매핑 = 번역** — 데이터의 열을 점의 *크기·색·속도·떨림·형태·배치*로 옮긴다. (아래 ‘매핑 사전’)
4. **문제를 드러내기** — 스튜디오의 **⚠ 문제 강조** 버튼이 가장 강한 ‘문제 신호’(불평등·추세·이상치)를 자동으로 찾아 작품으로 만들어 줘요. 그 위에 내 의도를 더하고 **작가노트**(왜 이 매핑인가)를 남긴다.

### 매핑 사전 — 데이터 → 점의 무엇으로

| 점의 특성 | 어떤 데이터에 어울리나 | 의미 |
|---|---|---|
| **크기** | 양·세기·중요도 (소득, 질량, 사망자, 총합) | 클수록 크게 — 압도/쏠림이 보임 |
| **색(그라데이션)** | 정도·온도 (긍정도, 깊이, 수면) | 차가움↔뜨거움으로 양극 |
| **색(범주)** | 종류·집단 (타입, 원산지, 모양) | 무리를 색으로 구분 |
| **형태** | 범주 (전설 여부, 목격 모양) | ●▲■◆로 분류 |
| **속도·떨림** | 변화량·강도 (규모, 스트레스, 변화) | 들썩일수록 불안·격렬 |
| **배치(값 산포)** | 무엇이든 — 세로=값 | 간극·격차가 ‘공간’으로 벌어짐 |
| **투명도·밀도** | 빈도·불확실성 | 옅을수록 약하게/드물게 |

---

## 2. 큐레이션 데이터셋 7종 (캐글)

각 데이터셋은 스튜디오 **샘플 드롭다운**에 축약본이 들어 있어요(추천 매핑 자동 적용). **전체 데이터**는 아래 캐글에서 받아 `📂 CSV·엑셀 열기`로 올리면 같은 매핑이 수백~수천 점으로 훨씬 풍성해집니다.

### ⚡ 강함의 모양 — Pokémon
- **캐글**: Pokemon with stats → https://www.kaggle.com/datasets/abcsds/pokemon
- **컬럼**: Name, Type 1/2, Total, HP, Attack, Defense, Sp.Atk, Sp.Def, Speed, Generation, Legendary
- **왜 흥미로운가(비뻔함+교육)**: 다변량 데이터·정규화·범주(타입)를 게임으로 배운다. “전설은 정말 압도적인가? 타입은 공평한가?”
- **레시피**: 색=Type(범주) · 크기=Total · 형태=Legendary · 배치=값 산포
- **드러낼 문제**: 전설/일부 타입에 쏠린 ‘파워 인플레이션’, 밸런스 불평등
- **난이도**: ★☆☆

### 👽 목격의 사회학 — UFO Sightings (NUFORC)
- **캐글**: UFO Sightings → https://www.kaggle.com/datasets/mysarahmadbhat/ufo-sightings (또는 검색 “NUFORC UFO sightings”)
- **컬럼**: datetime, city, state, country, **shape**, **duration (seconds)**, comments, latitude, longitude
- **왜 흥미로운가**: **미디어 리터러시**의 보석. 목격은 영화·인터넷·뉴스와 함께 급증·급감해요 — 데이터는 ‘외계인’이 아니라 ‘사회’를 말한다.
- **레시피**: 형태=shape(원반·삼각·빛…) · 크기/밀도=건수 · 배치=시간축(연도) · 투명도=duration
- **드러낼 문제**: 보고 편향, 집단 심리, “데이터 ≠ 진실”
- **난이도**: ★★☆

### 🌑 하늘에서 온 것들 — Meteorite Landings (NASA)
- **캐글**: Meteorite Landings → https://www.kaggle.com/datasets/nasa/meteorite-landings
- **컬럼**: name, **mass (g)**, **fall**(Fell/Found), **year**, recclass, reclat, reclong
- **왜 흥미로운가**: 질량이 몇 g~수십 톤(호바 6천만 g). 한 줌의 거대 운석이 화면을 지배 → **왜 로그 스케일이 필요한가**를 몸으로. ‘목격 vs 발견’의 관측 편향.
- **레시피**: 크기=mass(로그 문제 체감) · 색=fall(범주) · 배치=시간축(year)
- **드러낼 문제**: 거듭제곱 분포, 관측·생존 편향, 시간이 갈수록 ‘발견’이 느는 이유
- **난이도**: ★★☆

### 🎵 음악 감정 지도 — Spotify Tracks
- **캐글**: Spotify Tracks Dataset → https://www.kaggle.com/datasets/maharshipandya/-spotify-tracks-dataset
- **컬럼**: track_genre, **valence**(긍정도), **energy**, **danceability**, **tempo**, loudness, popularity …
- **왜 흥미로운가**: ‘감정’을 숫자로? valence와 energy는 *함께 가지 않는다* — 분노한 곡(에너지↑·긍정↓), 명상(둘 다↓). 감정의 두 축.
- **레시피**: 색=valence(파랑=슬픔↔노랑=기쁨) · 크기=energy · 배치=값 산포(또는 tempo) · 움직임=파동
- **드러낼 문제**: “왜 우리는 슬픈 노래를 들을까”, 장르별 감정 군집, 인기와 감정의 관계
- **난이도**: ★★☆

### 🌋 떨림의 데이터 — Significant Earthquakes (USGS)
- **캐글**: Significant Earthquakes 1965-2016 → https://www.kaggle.com/datasets/usgs/earthquake-database
- **컬럼**: Date, Latitude, Longitude, **Depth**, **Magnitude**, Type …  (+ 직접 사망자/지역을 합쳐 쓰면 강력)
- **왜 흥미로운가**: 규모(Magnitude)를 **떨림**으로 매핑하면 데이터가 *문자 그대로* 진동한다. 재난 ‘불평등’: 칠레 8.8→520명 vs 아이티 7.0→16만 명.
- **레시피**: 떨림/속도=Magnitude · 크기=사망자 · 색=Depth(그라데이션) · 배치=값 산포
- **드러낼 문제**: 같은 자연재해, 다른 죽음 — 지반·건물·빈곤이 만드는 ‘인재(人災)’. 리히터=로그.
- **난이도**: ★★★

### 🍫 맛을 숫자로 — Chocolate Bar Ratings
- **캐글**: Chocolate Bar Ratings → https://www.kaggle.com/datasets/rtatman/chocolate-bar-ratings
- **컬럼**: Company, **Bean Origin**, **Cocoa Percent**, Company Location, **Rating**(1–5), Bean Type
- **왜 흥미로운가**: **데이터 휴머니즘**. 코코아%가 높다고 평점이 높지 않다 — 맛은 선형이 아니다. ‘맛을 숫자로’ 옮길 때 무엇을 잃는가?
- **레시피**: 색=원산지(범주) · 크기=Rating · 배치=Cocoa% (가로) · 움직임=궤도
- **드러낼 문제**: 정량화의 한계, 산지에 대한 편견 vs 실제 평가, 주관의 수치화
- **난이도**: ★☆☆

### 😴 잠과 화면의 줄다리기 — Student Habits
- **캐글**: Student Habits vs Academic Performance → https://www.kaggle.com/datasets/jayaantanaath/student-habits-vs-academic-performance
- **컬럼**: study_hours, **sleep_hours**, **social_media_hours**, mental_health, exam_score …
- **왜 흥미로운가**: **내 데이터**로 만드는 자화상. SNS↑일수록 수면↓·스트레스↑. (학생들이 직접 자기 하루를 입력해도 좋아요.)
- **레시피**: 크기=SNS시간 · 색=수면(빨강=부족) · 떨림=스트레스 · 배치=값 산포
- **드러낼 문제**: 화면과 잠의 교환, 보이지 않는 피로. ⚠ 익명·집계로 다룰 것.
- **난이도**: ★☆☆

---

## 3. 수업 팁

- **로그 스케일 주의**: 운석 질량·지진 에너지·소득처럼 *몇 자릿수*를 넘나드는 값은 거대값 하나가 화면을 지배해요. “왜 그런가? 어떻게 공평하게 보여줄까?”가 좋은 토론거리.
- **표본·편향을 밝히기**: ‘몇 명/몇 건을, 어떤 기준으로 셌나’를 작품 설명 한 줄에. UFO·운석은 *보고/관측 편향*이 핵심 주제예요.
- **개인정보는 익명·집계로**: 학생 데이터(수면·감정)는 이름 대신 A·B…, 낙인찍지 않게 상황·맥락 중심으로.
- **작가노트가 작품의 절반**: ① 무엇을 셌나 ② 무엇을 뺐나 ③ 왜 이 색·크기·움직임인가 ④ 이 데이터가 놓친 진실은? (스튜디오 ‘제작 문서’ 섹션에 그대로 적게 되어 있어요.)
- **A/B 비교**: 같은 데이터를 다른 매핑(규칙 A·B)으로 만들어 “해석이 어떻게 달라지나”를 보여 주세요.

## 4. 빠른 시작

1. `만들기 ▸ 데이터 점 스튜디오` 열기 → 위 샘플 중 하나 고르기(추천 매핑이 바로 적용돼요).
2. 더 풍성하게: 캐글에서 전체 CSV(또는 엑셀)를 받아 **📂 CSV·엑셀 열기**로 올리기.
3. 오른쪽 **🔎 데이터 분석**에서 열별 분포를 보고, **⚠ 문제 강조**로 문제점을 작품으로.
4. 매핑을 내 의도대로 다듬고 → 작가노트 → **전시하기**.

---
*출처(캐글): Pokemon(abcsds) · UFO(mysarahmadbhat/NUFORC) · Meteorite Landings(NASA) · Spotify Tracks(maharshipandya) · Earthquakes(USGS) · Chocolate Bar Ratings(rtatman) · Student Habits(jayaantanaath).*
