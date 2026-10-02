# VocabMaster 1차 개발 요청문

> 이 문서는 `docs/voca-design-v3.md`를 실제 구현 작업에 전달하기 위한 **실행용 개발 브리프**다.
> v3 설계서 전체를 한 번에 구현하지 말고, 이번 요청에서는 입력·학습선택·진도·개수 불일치의 구조적 해결까지만 완료한다.

## 요청 목적

현재 VocabMaster는 사용자 단어, 사용자 문장, TOEIC 문장, 정적 어휘 팩이 서로 다른 배열과 학습 경로를 사용한다. 그 결과 다음 문제가 발생한다.

- 정적 어휘 팩의 단어가 문장처럼 처리된다.
- 입력 화면에서 선택한 탭이 학습 화면의 노출 모드를 바꾼다.
- TOEIC 파트를 바꾸면 같은 배열 인덱스의 다른 문장에 오답이 붙는다.
- 화면마다 전체·복습·정답 숫자의 의미와 값이 다르다.
- 단어를 삭제하면 뒤 항목의 인덱스 기반 오답 기록이 어긋난다.

이번 개발의 목표는 모든 콘텐츠를 `Source → Item → Mode → Progress` 구조로 연결하여, **선택한 항목 수, 실제 출제 항목, 기록된 진도, 다음 복습 대상이 항상 같은 `itemId`를 가리키게 만드는 것**이다.

## 기준 자료

- 기준 커밋: `e48c616`
- 상세 설계: `docs/voca-design-v3.md`
- 현재 주요 파일: `index.html`, `css/style.css`, `js/app.js`, `js/data.js`
- 현재 배포 방식: 빌드 도구 없는 정적 사이트

상세 설계와 이 요청문이 충돌하면 **이 요청문의 범위와 수용 기준을 우선**하고, 데이터 계약과 ID 정책은 v3 설계서를 따른다.

## 이번 작업 범위

### 1. 안전성 핫픽스

- `PART_INFO.sub`에 하드코딩된 잘못된 숫자를 제거한다.
- 커스텀 카드 선택 시 `undefined N문장`이 표시되지 않게 한다.
- TOEIC 빈칸 오답이 `trackWrongWord()`를 통해 사용자 단어 오답을 오염시키지 않게 한다.
- 대시보드의 “전체 항목”과 “오늘 풀이”를 서로 다른 지표로 표시한다.
- 오늘 정확도에는 음성 학습 결과도 같은 기준으로 포함한다.
- 실제 전사 기능이 없는 Whisper 버튼은 비활성화하고 “준비 중”임을 표시한다.
- API 키 안내를 실제 동작에 맞게 수정한다. 브라우저 저장 여부와 API 제공자 전송 사실을 명시한다.
- 사용자 입력과 AI 응답은 기본적으로 `textContent`로 출력하고, 동적 문자열을 검증 없이 `innerHTML`에 삽입하지 않는다.

### 2. Item/Source 변환 계층

다음 기존 데이터를 공통 Item과 Source로 변환한다.

- 사용자 단어 `words`
- 사용자 문장 `sents`
- `TOEIC_PARTS`
- `CUSTOM_CARDS`

최소 데이터 계약은 다음과 같다.

```js
// Item
{
  id,
  type: 'word' | 'sentence' | 'phrase',
  en,
  ko,
  normalizedEn,
  normalizedKo,
  exampleItemIds: [],
}

// Source
{
  id,
  name,
  itemType: 'word' | 'sentence' | 'mixed',
  kind: 'user' | 'static' | 'virtual',
}

// SourceMembership
{
  sourceId,
  itemId,
  order,
}
```

필수 Source ID는 다음과 같다.

- `mine_words`
- `mine_sentences`
- `toeic_p2`, `toeic_p3`, `toeic_p4`, `toeic_p5`
- `vocab_core140`
- `vocab_master_1`~`vocab_master_9`
- `vocab_master_all`
- `vocab_all_unique`
- `mistakes` — Progress에서 계산하는 가상 Source

### 3. 안정적인 ID와 중복 처리

배열 인덱스를 ID로 사용하지 않는다.

```text
canonicalKey = type + "\n" + normalize(en) + "\n" + normalize(ko)
itemId       = typePrefix + ":" + stableHash(canonicalKey)
```

- 정규화는 Unicode NFKC, 소문자화, 앞뒤 공백 제거, 연속 공백 축소를 포함한다.
- 같은 영문·다른 뜻은 서로 다른 Item으로 유지한다.
- 같은 영문·같은 뜻이 여러 Source에 존재하면 Item은 하나만 만들고 membership을 여러 개 둔다.
- 해시가 같더라도 canonical key가 다르면 충돌로 감지해야 한다.
- 데이터 순서를 바꾸거나 앞에 항목을 삽입해도 기존 Item ID가 달라지면 안 된다.

### 4. Progress와 StudyEvent 통합

`errCount`, `sErrCount`, `toeicErrCount`를 신규 코드에서 직접 갱신하지 않고 `itemId` 기반 공통 기록 함수를 사용한다.

```js
progress[itemId] = {
  state: 'new' | 'learning' | 'review' | 'mastered',
  reps,
  lapses,
  streak,
  intervalDays,
  dueAt,
  lastReviewedAt,
};
```

모든 학습 결과는 하나의 `recordStudyEvent()`를 통해 기록한다.

```js
{
  id,
  ts,
  localDate,
  itemId,
  sourceIds,
  mode,
  rating,
  correct,
  elapsedMs,
  sessionId,
}
```

이번 단계에서는 고급 SRS를 완성할 필요가 없다. 다만 `dueAt`, `intervalDays`, `rating`을 저장할 수 있어야 하며, 기존 오답 반복 동작은 이 공통 기록 위에서 유지한다.

### 5. 기존 데이터 마이그레이션과 백업

- 마이그레이션 전에 기존 `vm-*` 값을 `vm-backup-v1-*`로 **복사**한다.
- 사용자 단어와 문장을 Item/SourceMembership으로 변환한다.
- 숫자형 `errCount`와 `sErrCount`는 당시 배열의 Item ID로 이관한다.
- `__w__단어`는 동일 영문 후보가 하나일 때만 이관한다. 후보가 없거나 여러 개면 충돌 보고에 남긴다.
- 저장되지 않았던 `toeicErrCount`는 복구할 수 없으므로 조용히 다른 항목에 연결하지 않는다.
- 마이그레이션 도중 실패하면 기존 데이터로 다시 실행할 수 있어야 한다.
- JSON 내보내기/가져오기를 제공하고, 가져오기 적용 전에 신규·중복·충돌·무효 개수를 보여준다.

### 6. 숫자 계산 단일화

모든 카드, 배지, 대시보드는 공통 selector 결과만 사용한다.

```js
selectItems(sourceIds)
selectCounts(items, progressById, now)
selectTodayStats(events, localDate)
```

화면 용어는 다음 정의를 사용한다.

- 선택 항목: 선택 Source union의 중복 제거 Item 수
- 신규: Progress가 없거나 `state === 'new'`
- 오늘 복습: 마스터가 아니고 `dueAt <= now`
- 오늘 풀이: 오늘 날짜의 채점된 StudyEvent 수
- 오늘 정확도: 오늘 채점된 StudyEvent 중 정답 비율

“복습”을 단순히 과거 오답 수로 세지 않는다.

### 7. 입력 화면 역할 정리

- 입력 화면에서는 내 단어와 내 문장만 추가·수정·삭제한다.
- TOEIC 파트와 정적 어휘 팩 선택 UI를 입력 화면에서 제거한다.
- 단어/문장 단일 추가를 유지한다.
- 여러 줄 붙여넣기와 파싱 미리보기를 제공한다.
- 검색과 JSON 가져오기/내보내기를 제공한다.
- 등록 후 해당 항목을 학습 목록에 넣을지 명확하게 표시한다.
- 중간 항목을 삭제해도 다른 항목의 Progress가 변하지 않아야 한다.

### 8. 학습선택 화면 재설계

학습선택 화면은 다음 순서를 갖는다.

1. 오늘 풀이·정확도·복습 대기 표시
2. “오늘 학습 시작” 기본 버튼
3. Source 복수 선택
4. 선택 결과의 전체·신규·오늘 복습 수 표시
5. Item 타입과 호환되는 Mode 선택

지원 모드는 다음 호환 규칙을 적용한다.

| Mode | word | sentence |
|---|---:|---:|
| 플래시카드 | 활성 | 활성 |
| 객관식 | 활성 | 이번 범위에서는 비활성 가능 |
| 뜻→영 입력 | 활성 | 활성 |
| 빈칸 | 비활성 | 활성 |
| 전체 받아쓰기 | 비활성 | 활성 |
| 음성 말하기 | 예문이 있을 때만 활성 | 활성 |

- 사용할 수 없는 모드는 숨기지 말고 비활성화하며 이유를 표시한다.
- 일부 Item만 호환되면 실제 학습 큐 수를 표시한다.
- Source 선택과 Mode 선택은 하나의 `selection` 객체로 저장하고 새로고침 후 복원한다.
- `selectedPart`, `selectedCustom`, `inputMode`를 학습 선택 상태로 사용하지 않는다.

## 이번 작업에서 제외

다음은 후속 작업으로 남긴다.

- AI 연상 후보 생성·수정 UI
- 1,140개 정적 단어의 AI 예문 일괄 생성
- 고급 SRS 스케줄 최적화
- Whisper 실제 전사 API 연결
- AI 회화 모드
- IndexedDB 전환
- 전체 코드의 ES 모듈 전환
- 로그인과 기기 간 동기화

제외 항목을 위한 빈 버튼이나 동작하지 않는 UI를 만들지 않는다.

## 구현 제약

- 현재 정적 배포 방식을 유지한다.
- 빌드 도구나 프레임워크를 새로 도입하지 않는다.
- 기존 사용자 데이터를 초기화하지 않는다.
- 기존 플래시카드·객관식·입력·문장·음성 모드가 계속 동작해야 한다.
- 코드 분리는 가능하지만 각 단계에서 앱이 실행 가능한 상태를 유지한다.
- 사용자에게 보이는 수치는 하드코딩하지 않는다.
- 오류를 빈 `catch`로 숨기지 말고 사용자 복구가 필요한 오류는 화면에 알린다.

## 필수 테스트

최소한 다음을 자동 검증한다.

1. TOEIC 수가 P2/P3/P4/P5 각각 `73/42/29/50`, 합계 `194`다.
2. 정적 카드 타입 수가 `word=10`, `mistake=1`, `sent=0`이다.
3. Item 순서를 변경해도 ID가 유지된다.
4. 같은 Item이 여러 Source에 있어도 Source union에는 한 번만 나온다.
5. 같은 영문·다른 뜻은 서로 다른 ID다.
6. P3에서 틀린 문장이 P4 복습에 나타나지 않는다.
7. Source 선택과 Progress가 새로고침 후 유지된다.
8. 중간 사용자 단어를 삭제해도 다른 단어의 Progress가 유지된다.
9. 오늘 정확도에 음성 모드 결과가 포함된다.
10. 사용자 입력 `<img onerror=...>`가 HTML로 실행되지 않는다.
11. 백업→초기화→복원 후 사용자 Item과 Progress 수가 같다.

## 최종 수용 기준

- [ ] 입력 화면은 내 단어·내 문장 관리만 담당한다.
- [ ] 학습선택에서 내 콘텐츠, TOEIC, 어휘 팩을 항상 찾을 수 있다.
- [ ] 정적 어휘 팩의 단어를 “문장”이라고 표시하지 않는다.
- [ ] 선택 Source의 표시 개수와 실제 학습 큐 개수가 일치한다.
- [ ] 모든 화면에서 같은 Source의 전체·신규·복습 수가 일치한다.
- [ ] 커스텀 선택 시 `undefined`가 표시되지 않는다.
- [ ] 파트를 변경해도 다른 파트의 오답이 섞이지 않는다.
- [ ] 새로고침 후 선택, 진도, 통계가 유지된다.
- [ ] 단어 Source에서 문장 전용 모드는 비활성이고 사유가 보인다.
- [ ] STT 실패나 네트워크 오류는 오답으로 기록되지 않는다.
- [ ] 기존 데이터를 JSON으로 내보내고 다시 복원할 수 있다.
- [ ] 기존 학습 모드에 치명적인 회귀가 없다.

## 납품물

1. 구현 코드
2. 기존 데이터 마이그레이션 코드
3. 자동 테스트 또는 재현 가능한 검증 스크립트
4. 변경된 저장 스키마 설명
5. 수동 테스트 결과
6. 알려진 제한 사항과 후속 작업 목록

## 작업 방식

- 먼저 현재 동작과 데이터 수를 테스트로 고정한다.
- 데이터 계층 → 마이그레이션 → selector → UI 순서로 구현한다.
- 각 단계에서 기존 학습 모드의 회귀 테스트를 수행한다.
- 완료 보고에는 변경 파일, 마이그레이션 결과, 실행한 테스트 명령, 남은 제한을 명시한다.
- 수용 기준을 충족하지 못한 항목은 완료로 표시하지 않는다.
