# VocabMaster 통합 고도화 설계서 v3

> **기준 코드:** `yukhoehaninsaeng/voca` `main` @ `e48c616`
> **대상:** `index.html`, `css/style.css`, `js/app.js`, `js/data.js`
> **목표:** 입력한 콘텐츠와 선택한 콘텐츠가 같은 학습 큐·진도·복습으로 이어지는 일관된 영어 학습 앱
> **핵심 범위:** 입력/학습선택 재설계 → 데이터·진도 통합 → 오늘 학습/SRS → 적응형 AI 연상 → 말하기/회화

---

## 1. 결론과 제품 원칙

현재 문제는 학습 모드가 부족해서가 아니다. **무엇을 공부할지(Source)**, **무엇을 공부하는지(Item)**, **어떻게 공부할지(Mode)**, **얼마나 익혔는지(Progress)**가 서로 섞여 있기 때문이다.

> 사용자가 직접 등록했든 기본 어휘 팩에서 골랐든, 같은 항목은 같은 학습 큐에 들어가고 모든 모드의 결과가 같은 진도와 다음 복습일에 반영되어야 한다.

### 1.1 성공 원칙

1. **입력은 내 콘텐츠 관리만 담당한다.** 토익 파트와 어휘 팩 선택은 학습선택으로 옮긴다.
2. **소스와 모드를 분리한다.** 먼저 콘텐츠를 고르고, 그 타입과 호환되는 모드를 고른다.
3. **모든 진도는 `itemId`로 기록한다.** 배열 인덱스를 진도 키로 사용하지 않는다.
4. **숫자는 한 계산기에서만 만든다.** 카드, 배지, 대시보드가 같은 selector 결과를 쓴다.
5. **오늘 학습을 기본 경로로 둔다.** 사용자가 매번 모드 조합을 결정하지 않아도 된다.
6. **AI는 실패한 학습을 돕는다.** AI 생성 자체가 학습 과제가 되지 않게 한다.
7. **기존 기능은 단계별로 이전한다.** 저장소·모듈·UI를 한 번에 교체하지 않는다.

### 1.2 목표에서 제외하는 것

초기 구조 개편에서는 다음을 하지 않는다.

- 로그인 및 기기 간 동기화
- OpenAI Realtime 기반 실시간 회화
- 1,000개 단어 전체의 무검수 AI 일괄 생성
- 모든 파일의 동시 ES 모듈 전환
- 기존 모드의 전면 재작성

---

## 2. 기준 데이터와 정정 사항

### 2.1 실제 콘텐츠 수

| 콘텐츠 | 저장 형태 | 전체 | 영문 정규화 기준 고유 수 |
|---|---:|---:|---:|
| TOEIC Part 2 | 문장 | 73 | - |
| TOEIC Part 3 | 문장 | 42 | - |
| TOEIC Part 4 | 문장 | 29 | - |
| TOEIC Part 5 | 문장 | 50 | - |
| **TOEIC 합계** | 문장 | **194** | **193** |
| 핵심 단어 팩 | 단어 | 140 | - |
| 마스터 Part 1~8 | 단어 | 120 × 8 | - |
| 마스터 Part 9 | 단어 | 40 | - |
| 정적 어휘 팩 합계 | 단어 | **1,140** | **960** |
| 초기 철자 실수 목록 | 단어형 데이터 | 9 | 9 |
| **커스텀 카드 표시 합계** | 혼합 | **1,149** | **969** |

- `CUSTOM_CARDS` 11개에는 `sent` 타입이 0개다. 10개는 `word`, 1개는 `mistake`다.
- “커스텀 1,149개”는 고유 단어 수가 아니라 표시 엔트리 수다.
- 정적 단어 1,140개에서 정규화 영문 기준 180개 엔트리가 중복된다.
- TOEIC 194문장과 정적 어휘 팩은 별개 콘텐츠다.
- `PART_INFO.sub`의 Part 3 “50”, Part 5 “49”는 실제 42/50과 일치하지 않으므로 숫자를 하드코딩하면 안 된다.

### 2.2 이전 설계의 정정

| 이전 전제 | 실제 | v3 결정 |
|---|---|---|
| 콘텐츠 중심이 문장이다 | 대량 콘텐츠는 단어이며 문장은 194개다 | 데이터 기반은 단어 중심, 활용 단계에서 예문·회화 문장을 연결한다 |
| 1,000문장에서 핵심어를 추출한다 | 1,000개는 이미 단어다 | 학습 대상 단어에 예문·연상을 생성한다 |
| 모든 단어에 후보 3개를 먼저 만든다 | 선택 피로와 비용이 크다 | 기본 1개, 반복 실패 시 후보를 추가한다 |
| IndexedDB와 ES 모듈을 먼저 전환한다 | 회귀 원인이 한꺼번에 늘어난다 | 저장 인터페이스 도입 후 필요할 때 각각 교체한다 |

---

## 3. 현재 코드 문제와 원인

### 3.1 콘텐츠와 모드 불일치

현재 앱에는 세 개의 분리된 학습 세계가 있다.

- 사용자 단어 `words`: 플래시카드·객관식·단어 입력에서 사용
- 사용자 문장 `sents`: 빈칸·전체 받아쓰기에서 사용
- TOEIC/커스텀 카드: `getToeicSents()`를 통해 TOEIC 문장 모드에서 사용

정적 어휘 팩도 `{en: word, ko: meaning}`으로 바뀌어 문장처럼 처리된다. 따라서 어휘 팩을 선택해도 일반 플래시카드와 객관식에서는 공부할 수 없고, 대신 “N문장”이라고 표시되는 문장 전용 모드에 들어간다.

### 3.2 확인된 결함 목록

| ID | 결함 | 사용자 영향 | v3 해결 |
|---|---|---|---|
| P1 | `toeicErrCount[index]`가 현재 선택 세트에 종속 | P3의 5번째 오답이 P4의 5번째로 보임 | `progress[itemId]` |
| P2 | `toeicErrCount` 미저장 | 새로고침 후 토익 오답 소실 | 진도 저장 통합 |
| P3 | `errCount`에 숫자 키와 `__w__` 키 혼재 | 무관한 오답까지 단어 복습 수에 포함 | 진도와 오답 뷰 분리 |
| P4 | TOEIC 빈칸 오답이 `trackWrongWord`를 호출 | 문장 오답이 단어 탭 수를 오염 | 답한 문장의 진도만 갱신 |
| P5 | “매번 틀린 단어”를 정적 배열에 런타임 push | 새로고침 전후 항목 수 불일치 | 진도에서 파생한 가상 소스 |
| P6 | 학습선택 표시가 `inputMode`에 종속 | 입력 탭을 바꿔야 다른 학습이 보임 | 입력 상태와 학습 선택 분리 |
| P7 | `inputMode` 미저장 및 기본값 `word` | 새로고침 후 선택 맥락 소실 | `selection` 저장 |
| P8 | 커스텀 선택 시 `selectedPart=null` | `undefined 140문장` 표시 가능 | Source의 이름·타입 사용 |
| P9 | `ds-total` 의미가 전체 수에서 풀이 수로 바뀜 | 같은 라벨의 숫자 의미가 변함 | 지표 정의 고정 |
| P10 | 오늘 정확도에 `vOk/vNg` 제외 | 음성 결과가 통계와 불일치 | `StudyEvent` 날짜 집계 |
| P11 | 입력 화면에 콘텐츠 라이브러리 선택 존재 | 입력과 학습 선택의 역할 혼란 | 라이브러리를 학습선택으로 이동 |
| P12 | 선택 상태가 여러 전역에 분산 | 한 화면 선택이 다른 화면 숫자 변경 | 단일 `selection` 객체 |
| P13 | 사용자·AI 문자열을 `innerHTML`로 삽입 | 저장형 XSS 가능 | 기본 `textContent`, 허용 HTML만 정제 |
| P14 | API 키 안내와 저장·전송이 불일치 | 보안 동작에 대한 오해 | 정확한 안내와 공개 배포 프록시 |
| P15 | Whisper 저장 함수와 전사 구현 없음 | 활성화 버튼 오류·기능 오인 | 초기 비활성, 별도 음성 단계에서 구현 |

---

## 4. 목표 사용자 흐름

### 4.1 기본 경로: 오늘 학습

```text
앱 진입
  → 오늘 복습 12개 · 신규 5개 확인
  → [오늘 학습 시작]
  → 복습(실패 항목 우선)
  → 신규 단어(뜻·발음·예문·필요 시 연상)
  → 문맥 인출
  → 예문 말하기
  → 결과와 다음 복습일 확인
```

이 경로에서는 사용자가 소스나 모드를 매번 고르지 않는다. 스케줄러가 최근 선택 소스와 due 항목을 기준으로 큐를 만든다.

### 4.2 수동 경로: 소스 → 모드

```text
학습선택
  → 내 단어 / 내 문장 / TOEIC 파트 / 어휘 팩 / 오답 중 복수 선택
  → 선택 항목의 전체·신규·복습 수 확인
  → 호환되는 모드 선택
  → 연습 시작
```

수동 연습 결과도 `StudyEvent`에는 기록하지만, SRS 반영 여부는 모드별 정책을 따른다. 예를 들어 답을 먼저 본 플래시카드의 단순 넘김은 정답으로 간주하지 않는다.

### 4.3 입력 경로

```text
입력
  → 단어 또는 문장 탭
  → 한 개 추가 또는 여러 줄 붙여넣기
  → 중복·형식 검증
  → 내 보관함에 저장
  → [오늘 신규에 추가] 또는 [나중에 학습]
```

등록 직후 “저장됨”에서 끝내지 않고 학습 목록 포함 여부를 명시한다.

---

## 5. 도메인 모델

### 5.1 네 개의 핵심 개념

```text
Source     어디서 가져왔는가: 내 단어, TOEIC P3, 핵심 140, 오답
  └─ SourceMembership
       └─ Item  무엇을 공부하는가: word / sentence / phrase
            ├─ Enrollment  내가 학습할 것인가
            ├─ Progress    현재 기억 상태와 다음 복습일
            └─ StudyEvent  언제 어떤 모드에서 어떻게 답했는가
Mode       어떻게 공부하는가: flash / quiz / type / blank / full / speak
```

소스와 항목은 다대다로 본다. 같은 단어가 핵심 140과 마스터 팩 모두에 들어갈 수 있기 때문이다.

### 5.2 Item과 Source

```ts
interface Item {
  id: string;                    // 안정적인 canonical ID
  type: 'word' | 'sentence' | 'phrase';
  en: string;
  ko: string;
  normalizedEn: string;
  normalizedKo: string;
  exampleItemIds: string[];
  createdAt?: number;
}

interface Source {
  id: string;
  name: string;
  itemType: 'word' | 'sentence' | 'mixed';
  kind: 'user' | 'static' | 'virtual';
  description?: string;          // 개수를 문구에 하드코딩하지 않음
}

interface SourceMembership {
  sourceId: string;
  itemId: string;
  order: number;
}
```

### 5.3 ID와 중복 정책

`sourceId + index`는 삽입·정렬 시 깨지고, `sourceId + 영문 해시`는 같은 항목을 소스마다 다른 진도로 만든다. `영문만 해시`하면 다의어가 충돌한다. 따라서 다음 규칙을 쓴다.

```text
canonicalKey = type + "\n" + normalize(en) + "\n" + normalize(ko)
itemId       = typePrefix + ":" + stableHash(canonicalKey)
```

- 정규화는 Unicode NFKC, 소문자화, 연속 공백 축소를 적용한다.
- 문장 부호는 학습 정답에 영향을 줄 수 있어 무조건 삭제하지 않는다.
- 같은 영문·다른 뜻은 별도 Item으로 둔다.
- 같은 영문·같은 뜻이 여러 팩에 있으면 Item은 하나, membership은 여러 개다.
- 사용자 항목 수정으로 canonical key가 바뀔 때는 새 ID를 만들고 기존 Progress를 명시적으로 이전한다.
- 해시 충돌 검사를 위해 저장 시 canonical key도 비교한다.

정적 데이터의 “고유 969”는 영문만 기준으로 센 진단 수치다. 실제 통합 수는 위의 `en + ko + type` 정책으로 변환한 뒤 테스트에서 확정한다.

### 5.4 Enrollment, Progress, StudyEvent

```ts
interface Enrollment {
  itemId: string;
  addedAt: number;
  suspendedAt?: number;
  newOrder?: number;
}

interface Progress {
  itemId: string;
  state: 'new' | 'learning' | 'review' | 'mastered';
  reps: number;
  lapses: number;
  streak: number;
  ease: number;
  intervalDays: number;
  dueAt: number;
  lastReviewedAt?: number;
  abilities: {
    recognition: number;
    recall: number;
    context: number;
    speech: number;
  };
}

interface StudyEvent {
  id: string;
  ts: number;
  localDate: string;             // 사용자 시간대의 YYYY-MM-DD
  itemId: string;
  sourceIds: string[];
  mode: 'flash' | 'quiz' | 'type' | 'blank' | 'full' | 'speak' | 'chat';
  rating: 'again' | 'hard' | 'good' | 'easy' | 'skip';
  correct: boolean | null;
  elapsedMs?: number;
  answer?: string;
  sessionId: string;
}
```

숙련도 0~5를 원본 상태로 저장하지 않는다. 인식·회상·문맥·발화는 서로 다른 능력이므로 별도 점수로 기록하고, UI의 숙련 단계가 필요하면 Progress에서 파생한다.

### 5.5 선택 상태

```ts
interface Selection {
  sourceIds: string[];
  mode: StudyEvent['mode'] | null;
  updatedAt: number;
}
```

`selectedPart`, `selectedCustom`, `inputMode`를 학습 선택에 사용하지 않는다. 입력 화면의 단어/문장 탭은 UI 로컬 상태일 뿐 학습 콘텐츠를 바꾸지 않는다.

---

## 6. Source 카탈로그와 Item 변환

| Source ID | 표시 이름 | 타입 | 생성 방식 |
|---|---|---|---|
| `mine_words` | 내 단어 | word | 저장된 사용자 단어 |
| `mine_sentences` | 내 문장 | sentence | 저장된 사용자 문장 |
| `toeic_p2`~`toeic_p5` | TOEIC Part 2~5 | sentence | `TOEIC_PARTS` 변환 |
| `vocab_core140` | 핵심 단어 140 | word | 해당 `CUSTOM_CARDS` 변환 |
| `vocab_master_1`~`9` | 마스터 어휘 Part 1~9 | word | 해당 `CUSTOM_CARDS` 변환 |
| `vocab_master_all` | 마스터 통합 | word | membership union |
| `vocab_all_unique` | 전체 어휘 팩 | word | 핵심+마스터 union |
| `mistakes` | 자주 틀린 항목 | mixed | `Progress.lapses >= 2` 조회 |
| `due_today` | 오늘 복습 | mixed | `dueAt <= now` 조회 |

`mistakes`와 `due_today`는 저장된 배열이 아니라 항상 Progress에서 계산하는 가상 소스다. 정적 `CUSTOM_CARDS[0]`의 9개 철자 실수는 초기 seed로 한 번 가져오되, 런타임에 `data.js`를 수정하지 않는다.

---

## 7. 개수와 통계의 단일 정의

### 7.1 Selector

```js
function selectItems(sourceIds, catalog) {
  // membership을 합치고 itemId로 중복 제거한 Item[] 반환
}

function selectCounts(items, progressById, now = Date.now()) {
  const counts = { total: items.length, fresh: 0, due: 0, learning: 0, mastered: 0 };
  for (const item of items) {
    const p = progressById[item.id];
    if (!p || p.state === 'new') counts.fresh++;
    if (p?.dueAt <= now && p.state !== 'mastered') counts.due++;
    if (p?.state === 'learning' || p?.state === 'review') counts.learning++;
    if (p?.state === 'mastered') counts.mastered++;
  }
  return counts;
}

function selectTodayStats(events, localDate) {
  const today = events.filter(event => event.localDate === localDate);
  const answered = today.filter(event => event.correct !== null);
  const correct = answered.filter(event => event.correct).length;
  return {
    attempts: answered.length,
    correct,
    accuracy: answered.length ? Math.round(correct / answered.length * 100) : null,
    uniqueItems: new Set(today.map(event => event.itemId)).size,
  };
}
```

### 7.2 용어 계약

| 라벨 | 유일한 정의 |
|---|---|
| 선택 항목 | 선택 소스 union의 중복 제거 Item 수 |
| 신규 | Progress가 없거나 `state='new'`인 항목 |
| 오늘 복습 | 마스터가 아니며 `dueAt <= now`인 항목 |
| 학습 중 | `learning` 또는 `review` 상태인 항목 |
| 마스터 | 스케줄 규칙이 `mastered`로 판정한 항목 |
| 오늘 풀이 | 오늘 날짜 StudyEvent 중 채점된 시도 수 |
| 오늘 정확도 | 오늘 채점된 이벤트의 정답 비율 |

“복습”을 단순히 과거에 틀린 항목으로 정의하지 않는다. SRS에서는 맞힌 항목도 시간이 지나면 due가 된다. 모든 화면은 위 selector를 호출하며 독자적으로 `Object.values(errCount)`를 세지 않는다.

---

## 8. 모드 호환성과 결과 기록

| 모드 | word | sentence | Progress 능력 | 비고 |
|---|---:|---:|---|---|
| 플래시카드 | ✅ | ✅ | recognition | 답을 보기 전 자기평가 필수 |
| 객관식 | ✅ | 추후 | recognition | 문장은 보기 품질 검증 후 지원 |
| 뜻→영 입력 | ✅ | ✅ | recall | 문장은 전체 받아쓰기와 동일 UI 가능 |
| 빈칸 | 비활성 | ✅ | context | 단어 하나에는 의미 중복 |
| 전체 받아쓰기 | 비활성 | ✅ | recall/context | 구두점 허용 규칙 필요 |
| 음성 말하기 | 예문 있을 때 | ✅ | speech/context | STT 실패는 오답 아님 |
| AI 회화 | 타깃으로 사용 | 타깃 표현으로 사용 | speech/context | 별도 종료 분석 호출 |

- 선택 소스가 혼합 타입이면 모드별로 호환 Item 수를 표시한다.
- 호환 항목이 0개면 모드를 숨기지 않고 비활성화하며 이유를 표시한다.
- 일부만 호환되면 “선택 182개 중 문장 42개로 학습”처럼 실제 큐 수를 미리 보여준다.
- 모든 채점은 `recordStudyEvent()`를 거쳐 이벤트와 Progress를 함께 갱신한다.

---

## 9. 화면 설계

### 9.1 하단 정보 구조

초기 릴리스는 네 영역으로 구성한다.

1. **오늘:** 자동 구성된 학습 세션
2. **보관함:** 내 콘텐츠와 기본 콘텐츠 탐색·선택
3. **연습:** 소스와 모드를 직접 조합
4. **기록/설정:** 통계, 백업, API, 음성 설정

기존 두 탭을 바로 네 탭으로 늘리기 어렵다면, 1차에서는 `입력`과 `학습선택`을 유지하되 학습선택 상단에 “오늘 학습”을 넣는다. 데이터 구조가 안정된 뒤 네 영역으로 전환한다.

### 9.2 입력 화면

```text
┌──────────────────────────────────────────┐
│ [단어] [문장]                            │
├──────────────────────────────────────────┤
│ 영어 [________] 뜻 [________] [추가]     │
│ ▸ 여러 개 붙여넣기: 단어[TAB/쉼표]뜻     │
├──────────────────────────────────────────┤
│ 내 단어 23개  [검색] [가져오기] [내보내기]│
│ apple · 사과             복습 10/4 [수정][×]│
├──────────────────────────────────────────┤
│ [선택 항목 오늘 신규에 추가] [학습으로 →] │
└──────────────────────────────────────────┘
```

- TOEIC/커스텀 선택 탭을 제거한다.
- 단일 추가, 다중 붙여넣기, 검색, 수정, 삭제를 제공한다.
- 대량 입력은 탭 또는 마지막 쉼표를 구분자로 지원하고 파싱 미리보기를 거친다.
- 중복은 무조건 거부하지 않고 기존 항목, 다른 뜻, 완전 중복을 구분한다.
- 삭제는 membership/enrollment를 제거하고 Progress는 복구 유예 기간 뒤 정리한다.

### 9.3 학습선택/연습 화면

```text
┌───────────────────────────────────────────┐
│ 오늘 풀이 34 · 정확도 82% · 연속 6일      │
│ [⚡ 오늘 학습 시작] 복습 12 + 신규 5       │
├───────────────────────────────────────────┤
│ 1. 무엇을 공부할까요?                     │
│ [내 단어 23] [내 문장 8]                  │
│ TOEIC [P2 73][P3 42][P4 29][P5 50]       │
│ 어휘 [핵심140][마스터 통합960*][파트 ▾]   │
│ [자주 틀린 항목 9]                        │
│ 선택: 42문장 · 신규30 · 오늘복습5          │
├───────────────────────────────────────────┤
│ 2. 어떻게 공부할까요?                     │
│ [빈칸 42] [받아쓰기 42] [말하기 42]        │
│ [플래시 42] [객관식: 준비 중]              │
└───────────────────────────────────────────┘
* 실제 수는 canonical 중복 정책 적용 후 계산
```

- 복수 소스를 선택할 수 있다.
- 각 칩의 숫자는 `selectCounts()`가 계산한다.
- 소스 설명에는 하드코딩 숫자를 넣지 않는다.
- 모드 카드에는 실제 큐에 들어갈 호환 Item 수를 표시한다.
- 선택은 저장하고 새로고침 후 복원한다.

### 9.4 오늘 화면

```text
오늘 15분
[복습 12] [신규 5] [문장 3] [말하기 1]
진행 ━━━━━━━ 8/21
[계속 학습]

급한 복습만 10개 | 신규 제외 | 5분 빠른 학습
```

하루 상한은 due 항목을 삭제하지 않고 오늘 노출량만 제한한다. 남은 due는 다음 날로 숨기지 말고 “대기 N개”로 알린다.

### 9.5 접근성과 피드백

- 비활성 모드에는 `disabled`, `aria-disabled`, 사유 문구를 함께 제공한다.
- 색상만으로 정답·오답을 전달하지 않는다.
- 녹음·AI 생성에는 진행, 취소, 재시도 상태를 제공한다.
- 사용자·AI 문자열은 `textContent`로 출력한다.

---

## 10. SRS와 오늘 큐

### 10.1 최소 스케줄 규칙

| 평가 | 같은 세션 | 다음 interval | 상태 변화 |
|---|---|---|---|
| Again | 10분 뒤 재출제 | 1일 | `lapses + 1`, streak 0 |
| Hard | 세션 끝부분 선택 재출제 | `max(1, interval × 1.2)` | streak 유지 |
| Good | 재출제 없음 | 신규 1일→3일, 이후 `interval × ease` | streak +1 |
| Easy | 재출제 없음 | 신규 4일, 이후 `interval × (ease + 0.3)` | streak +1 |
| Skip | 없음 | 변경 없음 | 통계 정답률에서 제외 |

- `ease` 기본값 2.3, 최소 1.3으로 시작한다.
- 반응 시간은 모드마다 의미가 달라 자동 평가의 보조 신호로만 쓴다.
- 서버 시간이 없으므로 사용자 로컬 시간대와 `localDate`를 함께 저장한다.
- 초기에는 이해 가능한 단순 규칙을 사용하고 충분한 이벤트가 쌓인 뒤 고급 알고리즘을 검토한다.

### 10.2 오늘 큐 구성

1. overdue 중 오래 밀린 항목
2. 최근 Again 항목
3. 오늘 due 항목
4. 사용자 일일 신규 한도 내 신규 항목
5. 신규 단어에 연결된 문장·말하기 항목

기본 상한은 복습 20개, 신규 5개다. “급한 것 10개”는 overdue와 Again 우선으로 구성한다.

### 10.3 모드 전환

같은 문제를 그대로 반복하지 않는다.

```text
객관식 오답 → 짧은 피드백/연상 → 뜻→영 입력
입력 오답   → 예문 속 빈칸 또는 비교 카드
문장 오답   → 청크 표시 → 전체 입력
말하기 실패 → 전사 확인 → 섀도잉 → 재시도
```

---

## 11. AI 연상과 예문

### 11.1 생성 시점

- 신규 단어 첫 학습: 회화형 예문 1개와 대표 연상 1개를 지연 생성
- 2회 이상 실패: 추가 연상 후보 최대 2개
- 4회 이상 실패: 비교 단어, 어원, 사용자 직접 수정 제안
- 사용자가 고른/수정한 결과만 기본 카드에 고정

1,140개를 처음부터 모두 생성하지 않는다. 50개 표본을 사람 검수한 뒤, 반복 사용되는 정적 어휘 팩에 한해서 버전이 고정된 배치 생성을 고려한다.

### 11.2 구조화 결과

```ts
interface MnemonicRecord {
  itemId: string;
  promptVersion: string;
  model: string;
  contextHash?: string;
  candidates: MnemonicCandidate[];
  selectedId?: string;
  userEdited?: MnemonicCandidate;
  generatedAt: number;
}

interface MnemonicCandidate {
  id: string;
  type: 'sound' | 'scene' | 'etymology';
  sound?: string | null;
  story: string;
  roots?: string | null;
  example: { en: string; ko: string };
}
```

캐시는 `word+meaning` 문자열 하나가 아니라 `itemId + contextHash + promptVersion + model`로 식별한다. 사용자 수정본은 재생성으로 덮어쓰지 않는다.

### 11.3 품질 규칙

- 소리 연상이 억지스러우면 `null`을 허용한다.
- 검증할 수 없는 어원은 생성하지 않는다.
- 예문은 실제 회화에서 쓸 수 있고 목표 의미가 드러나야 한다.
- 연상이 발음을 왜곡하면 장면형으로 대체한다.
- AI 실패 시 빈 화면이 아니라 “예문 없이 계속 학습”을 제공한다.

---

## 12. 말하기와 회화

### 12.1 Whisper 단계

현재 Whisper 버튼은 실제 전사 기능이 없으므로 초기 안정화에서 숨기거나 “준비 중”으로 표시한다. 구현 시 흐름은 다음과 같다.

```text
MediaRecorder 녹음
  → MIME/브라우저 지원 확인
  → OpenAI 전사 요청
  → 전사문 사용자 확인·수정
  → 기존 checkVoiceAnswer 채점
  → StudyEvent 기록
```

- 브라우저 STT 성공 시 우선 사용하고 실패/미지원 시 Whisper를 제안한다.
- STT 네트워크 오류나 무음은 학습 오답으로 기록하지 않는다.
- Safari/Chrome 실제 기기 테스트 매트릭스를 둔다.
- 공개 배포에서는 키를 브라우저에 저장하지 않고 서버 프록시와 사용량 제한을 사용한다.

### 12.2 회화 단계

처음에는 텍스트 회화로 타깃 유도와 리포트 품질을 검증한 뒤 음성을 연결한다.

1. 오늘 학습 단어 3~5개와 시나리오로 대화 호출
2. 자연스러운 재진술로 흐름을 유지
3. 종료 시 별도 분석 호출
4. 사용 단어·교정·새 표현을 사용자 확인 후 카드화

대화 응답과 종료 JSON을 한 호출에 섞지 않는다. 타깃 단어 문자열이 등장했다는 이유만으로 마스터 처리하지 않으며, AI가 먼저 사용한 경우와 잘못된 문맥 사용을 구분한다.

---

## 13. 저장, 마이그레이션, 보안

### 13.1 저장 전략

먼저 저장소 인터페이스를 만들고 현재 `localStorage` 구현을 유지한다.

```ts
interface Repository {
  loadSnapshot(): Promise<AppSnapshot>;
  saveSnapshot(snapshot: AppSnapshot): Promise<void>;
  appendEvent(event: StudyEvent): Promise<void>;
  exportJson(): Promise<string>;
  importJson(json: string): Promise<ImportReport>;
}
```

StudyEvent가 커져 용량·조회 문제가 확인될 때 IndexedDB 구현으로 교체한다. UI와 엔진은 저장 구현을 직접 알지 않는다.

### 13.2 마이그레이션

1. 현재 `vm-*` 전체를 `vm-backup-v1-*`로 **복사**한다. 이름 변경은 중간 실패 시 원본을 잃을 수 있으므로 복사 후 검증한다.
2. 사용자 단어/문장을 Item, SourceMembership, Enrollment로 변환한다.
3. `errCount[숫자]`와 `sErrCount[숫자]`를 당시 배열 항목의 `itemId` Progress로 변환한다.
4. `__w__단어`는 동일 영문 후보가 하나일 때만 이관하고, 여러 개면 import report에 충돌로 남긴다.
5. `toeicErrCount`는 저장되지 않았으므로 이관하지 못한다는 사실을 보고한다.
6. 변환 전후 사용자 항목 수와 진도 수를 검증한다.
7. 성공 플래그를 저장한 뒤에만 새 스키마를 기본으로 사용한다.

### 13.3 백업 JSON

```ts
interface ExportEnvelope {
  app: 'vocabmaster';
  schemaVersion: 2;
  exportedAt: number;
  items: Item[];
  memberships: SourceMembership[];
  enrollments: Enrollment[];
  progress: Progress[];
  events: StudyEvent[];
  mnemonics: MnemonicRecord[];
  settings: object;
}
```

가져오기는 교체/병합을 선택하게 하고, 적용 전에 신규·중복·충돌·무효 항목 수를 보여준다.

### 13.4 API 키와 렌더링

- 안내: “이 브라우저에 저장되며 AI 요청 시 해당 제공자에게 전송됩니다.”
- 공용 기기 경고와 키 삭제 버튼을 제공한다.
- 공개 서비스는 서버 프록시 이전에 AI 기능을 공개하지 않는다.
- 사용자 입력, AI 출력, 가져오기 데이터는 기본적으로 `textContent`로 렌더링한다.
- 꼭 필요한 강조 마크업만 allowlist sanitizer를 거친다.

---

## 14. 구현 로드맵

### Phase 0 — 즉시 안정화

- 잘못된 `PART_INFO.sub` 숫자 제거
- 커스텀 선택 라벨 `undefined` 수정
- `repeatCount()`에서 `__w__` 제외
- TOEIC 오답의 `trackWrongWord` 호출 제거
- 대시보드 지표 라벨 의미 고정 및 음성 결과 포함
- Whisper 버튼 비활성화와 API 안내 정정
- JSON 내보내기 우선 제공

**완료 기준:** 눈에 보이는 숫자·라벨 오류와 클릭 오류가 없고 사용자 데이터를 백업할 수 있다.

> `toeicErrCount`에 `selectionKey:index`를 붙이는 것은 임시 완화일 뿐이다. 핫픽스를 한다면 저장까지 추가하되, 곧 `itemId` Progress로 폐기한다.

### Phase 1 — Item/Source 변환 계층

- `items.js`에 정규화·안정 해시·충돌 검사 구현
- 네 기존 데이터 소스를 Item/Source/Membership으로 변환
- union과 canonical 중복 제거 구현
- 데이터 계약 테스트 작성

**완료 기준:** P2/P3/P4/P5가 각각 73/42/29/50이고 합계 194이며, 같은 selector를 반복 호출해도 ID가 동일하다.

### Phase 2 — Progress와 이벤트

- `recordStudyEvent()` 단일 진입점
- 기존 세 오답 객체 마이그레이션
- Progress·StudyEvent 저장
- 날짜 기준 오늘 통계

**완료 기준:** 모드나 소스를 바꾸고 새로고침해도 같은 Item의 진도와 통계가 유지된다.

### Phase 3 — 입력/학습선택 UI

- 입력에서 TOEIC/커스텀 선택 제거
- 보관함 검색·수정·대량 붙여넣기
- 학습선택에서 복수 Source 선택
- 모드 호환 매트릭스와 비활성 사유
- selection 저장·복원

**완료 기준:** 직접 입력 단어와 정적 어휘 팩 단어가 같은 플래시·객관식·입력 모드에서 학습된다.

### Phase 4 — 오늘 학습과 SRS

- 단일 count selector와 모든 배지 교체
- Again/Hard/Good/Easy
- due/new 상한과 원탭 세션
- 오답 후 다른 모드 재출제

**완료 기준:** 모든 화면의 선택 수·신규 수·due 수가 같고 답변 후 다음 복습 시간이 일관되게 바뀐다.

### Phase 5 — 적응형 연상과 예문

- 신규 항목 기본 1개 지연 생성
- 캐시 버전·사용자 선택/수정
- 반복 실패 시 추가 후보
- 예문 Item 연결

**완료 기준:** 새로고침 후 수정 연상이 유지되고 동일 요청을 중복 호출하지 않는다.

### Phase 6 — 말하기와 회화

- 브라우저 STT 상태 안정화
- MediaRecorder/Whisper 폴백
- 텍스트 회화 실험과 별도 종료 리포트
- 검증 후 음성 회화 연결

**완료 기준:** STT 실패는 오답이 아니며, 회화 리포트가 사용자 확인 후에만 카드와 진도를 만든다.

---

## 15. 테스트 전략과 수용 기준

### 15.1 자동 테스트

- 데이터 수: TOEIC `73/42/29/50`, 합계 `194`
- 타입: 정적 카드 `word=10`, `mistake=1`, `sent=0`
- ID 안정성: 순서를 바꾸거나 앞에 항목을 삽입해도 기존 ID 동일
- 중복: 같은 Item이 여러 Source에 있어도 union은 한 번만 반환
- 다의어: 같은 영문·다른 뜻은 서로 다른 ID
- 선택: 복수 Source 저장·복원
- 진도: P3 오답이 P4 Item에 나타나지 않음
- 통계: 음성 포함 오늘 StudyEvent만 정확도에 포함
- 마이그레이션: 중간 단어 삭제 뒤에도 다른 항목 진도 유지
- 보안: 사용자 `<img onerror=...>` 문자열이 실행되지 않고 텍스트로 표시

### 15.2 사용자 수용 기준

- [ ] 입력 화면에는 내 단어·내 문장 관리만 보인다.
- [ ] 학습선택에서 모든 Source를 항상 찾을 수 있다.
- [ ] 선택 Source의 타입·개수·실제 학습 큐가 일치한다.
- [ ] TOEIC 숫자는 73/42/29/50, 합계 194로 일치한다.
- [ ] 정적 단어를 문장이라고 표시하지 않는다.
- [ ] 단어 Source에서 문장 전용 모드는 비활성이고 이유가 보인다.
- [ ] 커스텀 선택에서 `undefined` 라벨이 나오지 않는다.
- [ ] P3 오답이 P4 복습에 섞이지 않는다.
- [ ] 새로고침 후 Source 선택, 진도, due 수가 유지된다.
- [ ] 중간 항목을 삭제해도 다른 항목 진도가 바뀌지 않는다.
- [ ] 모든 화면에서 같은 Source의 전체·신규·due 수가 같다.
- [ ] 오늘 정확도에 객관식·입력·문장·음성 결과가 같은 규칙으로 반영된다.
- [ ] STT 실패와 AI 장애가 오답으로 기록되지 않는다.
- [ ] 백업→초기화→복원 후 사용자 Item과 Progress 수가 동일하다.

---

## 16. 성과 지표

초기에는 회화 시간보다 학습 루프의 연결성을 측정한다.

| 지표 | 초기 목표 |
|---|---:|
| 등록 후 24시간 내 첫 학습 완료율 | 70% 이상 |
| 오늘 due 완료율 | 70% 이상 |
| 시작한 오늘 세션 완료율 | 60% 이상 |
| 7일 후 recall 유지율 | 70% 이상 |
| 숫자/선택 불일치 오류 | 0건 |
| AI 연상 재생성률 | 추세 관찰 |
| STT 결과 사용자 수정률 | 추세 관찰 |

주간 회화 시간은 회화 기능이 안정된 뒤 추가한다. 하루 5분 회화를 기본 루틴으로 두면 주간 기본 목표는 최대 35분이므로 60분 목표와 혼용하지 않는다.

---

## 17. 최종 구현 우선순위

```text
사실·보안 핫픽스
  → 안정적인 Item/Source ID
  → Progress/StudyEvent 통합
  → 입력과 학습선택 역할 분리
  → 단일 count selector
  → 오늘 큐와 SRS
  → 적응형 연상·예문
  → STT/Whisper
  → AI 회화
```

이 순서의 핵심은 **AI 기능을 늘리기 전에 입력한 것, 선택한 것, 화면에 표시된 수, 실제로 출제된 것, 다음 복습 대상이 모두 같은 Item을 가리키게 만드는 것**이다.
