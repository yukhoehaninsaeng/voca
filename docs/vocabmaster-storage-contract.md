# VocabMaster 저장 스키마 v2

> **상태:** 1차 구조 개편 이후 모든 후속 개발이 따라야 하는 저장 계약
>
> **적용 범위:** `localStorage` 구현과 향후 IndexedDB 구현
> **원칙:** UI나 학습 모드는 저장 키를 직접 읽지 않고 Repository API만 사용한다.

## 1. 목적

이 문서는 항목, 소스, 진도, 학습 이벤트, SRS 세션, AI 생성물과 회화 기록의 저장 형식을 고정한다. 배열 위치를 식별자로 사용하거나 화면마다 별도 오답 카운터를 만드는 것을 금지한다.

스키마 버전은 `2`이며, 저장 데이터에는 반드시 `schemaVersion`을 포함한다. 알 수 없는 상위 버전은 자동 변환하지 말고 읽기 전용 오류와 내보내기 방법을 안내한다.

## 2. 루트 문서

```ts
interface VocabMasterStoreV2 {
  schemaVersion: 2;
  migratedAt?: number;
  items: Record<ItemId, Item>;
  sources: Record<SourceId, Source>;
  memberships: SourceMembership[];
  enrollments: Record<ItemId, Enrollment>;
  progress: Record<ItemId, Progress>;
  events: StudyEvent[];
  selection: Selection;
  settings: Settings;
  activeSession: ActiveSession | null;
  mnemonics: Record<ItemId, MnemonicRecord>;
  chatSessions: ChatSession[];
}
```

정적 데이터의 본문은 중복 저장하지 않아도 된다. 다만 정적 데이터에서 만든 `itemId`와 사용자 진도는 버전이 바뀌어도 동일해야 한다.

## 3. 공통 식별자와 시간

- 모든 시간은 Unix epoch 밀리초 정수다.
- `itemId`는 `type + normalized(en) + normalized(ko)`로 결정적으로 생성한다.
- 같은 영어와 같은 뜻은 하나의 Item으로 합치고 여러 membership을 둔다.
- 같은 영어라도 뜻이 다르면 별도 Item이다.
- 정규화 알고리즘에는 버전을 부여한다. 기존 ID를 조용히 다시 생성하지 않는다.
- 이벤트와 세션 ID는 충돌하지 않는 UUID를 사용한다.

```ts
type ItemId = string;
type SourceId = string;

interface Item {
  id: ItemId;
  type: 'word' | 'sentence';
  en: string;
  ko: string;
  normalizedEn: string;
  normalizedKo: string;
  idVersion: 1;
  createdAt: number;
  updatedAt: number;
  origin: 'builtin' | 'user' | 'ai';
  exampleItemIds?: ItemId[];
}
```

## 4. Source와 membership

```ts
interface Source {
  id: SourceId;
  name: string;
  kind: 'mine' | 'toeic' | 'vocabulary' | 'virtual';
  itemTypes: Array<'word' | 'sentence'>;
  readonly: boolean;
  order: number;
}

interface SourceMembership {
  sourceId: SourceId;
  itemId: ItemId;
  order: number;
}
```

필수 Source ID는 `mine_words`, `mine_sents`, `toeic_p2`~`toeic_p5`, `vocab_core140`, `vocab_m1000_1`~`vocab_m1000_9`다. `mistakes`, `due_today`, `vocab_all_unique`는 저장 배열이 아니라 selector가 계산하는 가상 Source다.

## 5. Enrollment와 Progress

Enrollment는 “학습 목록에 넣었는가”, Progress는 “얼마나 학습했는가”를 뜻한다. 입력했다고 자동으로 오늘 신규에 넣을지는 Enrollment 설정으로 결정한다.

```ts
interface Enrollment {
  itemId: ItemId;
  enrolledAt: number;
  suspended: boolean;
  newEligible: boolean;
  preferredModes?: StudyMode[];
}

type StudyMode =
  | 'flash' | 'quiz' | 'type' | 'blank' | 'full'
  | 'speak' | 'chat';

interface Progress {
  itemId: ItemId;
  seen: number;
  ok: number;
  ng: number;
  streak: number;
  lapses: number;
  state: 'new' | 'learning' | 'review' | 'mastered';
  ease: number;
  intervalDays: number;
  dueAt: number | null;
  lastAt: number | null;
  lastMode: StudyMode | null;
  skills: {
    recognition: number;
    recall: number;
    context: number;
    speech: number;
  };
}
```

`errCount`, `sErrCount`, `toeicErrCount`를 새 코드에서 다시 만들지 않는다. 오답과 복습 여부는 Progress 및 StudyEvent에서만 파생한다.

## 6. StudyEvent

```ts
interface StudyEvent {
  id: string;
  ts: number;
  localDate: string; // 사용자 시간대 기준 YYYY-MM-DD
  sessionId: string;
  itemId: ItemId;
  sourceIds: SourceId[];
  mode: StudyMode;
  result: 'again' | 'hard' | 'good' | 'easy' | 'skip';
  correct: boolean | null;
  elapsedMs?: number;
  answer?: string;
  eventVersion: 1;
}
```

- `skip`은 정답·오답 합계에 포함하지 않는다.
- 네트워크/STT 실패는 StudyEvent 오답으로 기록하지 않는다.
- 동일한 `id`의 이벤트는 한 번만 반영한다.
- 오늘 통계는 세션 메모리 카운터가 아닌 `localDate`로 집계한다.

## 7. 선택, 설정, 활성 세션

```ts
interface Selection {
  sourceIds: SourceId[];
  mode: StudyMode | null;
  lastScreen: 'today' | 'input' | 'practice' | 'records' | 'settings';
}

interface Settings {
  timezone: string;
  dailyReviewLimit: number; // 기본 20
  dailyNewLimit: number;    // 기본 5
  speechProvider: 'browser' | 'whisper';
  theme: 'system' | 'light' | 'dark';
}

interface ActiveSession {
  id: string;
  localDate: string;
  createdAt: number;
  queue: SessionQueueEntry[];
  cursor: number;
  answeredEventIds: string[];
}

interface SessionQueueEntry {
  itemId: ItemId;
  mode: StudyMode;
  reason: 'due' | 'overdue' | 'new' | 'retry';
  retryCount: number;
}
```

활성 세션은 매 답변 뒤 원자적으로 저장한다. 날짜가 바뀌면 사용자에게 기존 세션을 이어갈지 오늘 큐를 새로 만들지 묻되, 기존 이벤트를 중복 생성하지 않는다.

## 8. AI 연상과 예문

```ts
interface MnemonicCandidate {
  id: string;
  type: 'sound' | 'scene' | 'etymology';
  sound: string | null;
  story: string;
  roots: string | null;
  example: { en: string; ko: string };
}

interface MnemonicRecord {
  itemId: ItemId;
  candidates: MnemonicCandidate[];
  selectedId: string | null;
  userEdited?: MnemonicCandidate;
  promptVersion: string;
  model: string;
  contextHash: string;
  generatedAt: number;
  rating?: -1 | 0 | 1;
}
```

캐시 키는 `itemId + promptVersion + model + contextHash`다. 재생성해도 사용자 수정본을 덮어쓰지 않는다. API 키는 백업 JSON, 이벤트, 채팅 기록에 절대 포함하지 않는다.

## 9. 회화 세션

```ts
interface ChatSession {
  id: string;
  scenario: string;
  startedAt: number;
  endedAt: number | null;
  targetItemIds: ItemId[];
  usedItemIds: ItemId[];
  transcript: Array<{ role: 'user' | 'assistant'; text: string; ts: number }>;
  corrections: Array<{ wrong: string; right: string; note: string }>;
  newExpressions: Array<{ en: string; ko: string; acceptedItemId?: ItemId }>;
  analysisStatus: 'pending' | 'complete' | 'failed';
}
```

새 표현은 사용자가 확인한 후에만 Item, Enrollment, Progress를 생성한다. 대화 응답과 종료 분석은 별도 AI 호출로 처리한다.

## 10. Repository 계약

```ts
interface Repository {
  load(): Promise<VocabMasterStoreV2>;
  transaction<T>(fn: (draft: VocabMasterStoreV2) => T): Promise<T>;
  exportBackup(): Promise<BackupV2>;
  importBackup(input: unknown, mode: 'replace' | 'merge'): Promise<ImportReport>;
  resetActiveSession(): Promise<void>;
}
```

구현은 처음에 localStorage여도 된다. 용량 또는 조회 문제가 측정되면 같은 계약으로 IndexedDB 구현을 추가한다. 기능 코드에서 `localStorage.getItem`을 직접 호출하는 것은 금지한다.

## 11. 백업 형식과 가져오기

```ts
interface BackupV2 {
  format: 'vocabmaster-backup';
  schemaVersion: 2;
  exportedAt: number;
  appVersion?: string;
  data: VocabMasterStoreV2;
  checksum?: string;
}
```

가져오기 전에 스키마와 필수 필드를 검증하고 미리보기로 추가·병합·충돌·건너뜀 수를 보여준다. `merge`는 ID 기준으로 합치되 이벤트 ID 중복을 제거하고, 사용자 수정 AI 연상은 자동 덮어쓰지 않는다. 실패 시 현재 저장 데이터를 변경하지 않는다.

## 12. v1 마이그레이션

1. 기존 `vm-*` 키 전체를 타임스탬프가 붙은 백업에 복사한다.
2. 사용자 단어·문장과 정적 콘텐츠를 Item/membership으로 변환한다.
3. 숫자형 `errCount`는 당시 사용자 배열의 항목을 찾아 Progress로 이관한다.
4. `__w__` 키는 `en + ko`가 확정되는 경우만 이관하고, 모호하면 보고서에 남긴다.
5. 저장된 적 없는 `toeicErrCount`는 추측해 만들지 않는다.
6. 변환 결과를 검증한 뒤에만 `schemaVersion: 2`를 활성화한다.
7. 실패하면 v1 데이터와 현재 앱을 그대로 유지하고 재시도/내보내기를 제공한다.

마이그레이션은 여러 번 실행해도 결과가 같아야 한다. 성공 직후에도 원본 백업을 자동 삭제하지 않는다.

## 13. 필수 불변 조건

- 모든 Progress와 StudyEvent의 `itemId`는 존재하는 Item을 가리킨다.
- membership의 `(sourceId, itemId)` 조합은 중복되지 않는다.
- 정답/오답 반영과 이벤트 저장은 하나의 transaction에서 수행한다.
- `seen === ok + ng`를 유지하되 `skip`은 세 값 모두 증가시키지 않는다.
- `dueAt`은 새 항목 또는 중지 항목에서만 `null`일 수 있다.
- 사용자 입력과 AI 출력은 렌더링 시 텍스트로 처리하며 저장값을 HTML로 신뢰하지 않는다.
- 삭제는 기본적으로 Item을 즉시 제거하지 않고 Enrollment를 중지한다. 완전 삭제 시 연결 관계와 이벤트 보존 정책을 사용자에게 알린다.

## 14. 스키마 수용 테스트

1. 같은 단어·같은 뜻을 두 Source에서 불러와도 Item은 하나이고 membership은 둘이다.
2. 같은 단어·다른 뜻은 서로 다른 ID를 가진다.
3. 정적 데이터 순서를 바꿔도 ID와 Progress가 유지된다.
4. 중간 사용자 단어를 삭제해도 다른 항목 진도가 바뀌지 않는다.
5. 중복 이벤트를 재처리해도 Progress가 두 번 증가하지 않는다.
6. STT 오류와 `skip`이 오답률을 올리지 않는다.
7. v1 마이그레이션을 두 번 실행해도 중복 Item/Event가 생기지 않는다.
8. 잘못된 백업 가져오기가 기존 데이터를 변경하지 않는다.
9. 백업에 API 키가 포함되지 않는다.
10. localStorage와 IndexedDB Repository가 동일한 계약 테스트를 통과한다.
