# VocabMaster 저장 스키마 v2

브라우저 `localStorage`를 유지하면서 배열 인덱스 대신 안정적인 `itemId`를 사용한다.

- `vm-migrated-v2`: v1 마이그레이션 완료 플래그
- `vm-progress-v2`: `itemId`를 키로 하는 Progress 객체
- `vm-events-v2`: 모든 모드의 채점 결과인 StudyEvent 배열
- `vm-selection-v2`: 복수 `sourceIds`, `mode`, `updatedAt`
- `vm-backup-v1-*`: 마이그레이션 직전 기존 `vm-*` 값의 복사본

Item ID는 `type + NFKC/소문자/공백 정규화(en) + 정규화(ko)`의 FNV-1a 해시다. 같은 ID에 다른 canonical key가 발견되면 조용히 합치지 않고 충돌 오류로 보고한다. 정적 Source membership은 실행 시 `data.js`에서 재구성하며, `mistakes`는 `Progress.lapses >= 2`인 Item을 계산하는 가상 Source다.

JSON 내보내기는 `schemaVersion: 2`인 envelope에 Item, membership, Progress, StudyEvent, selection을 담는다. 가져오기는 적용 전에 신규·중복·충돌·무효 수를 보여주며 충돌이나 무효 데이터가 있으면 적용하지 않는다.

`LocalStorageRepository`가 v2 스냅샷의 읽기·원자적 저장·이벤트 추가·내보내기·가져오기를 담당한다. 저장 도중 오류가 발생하면 쓰기 전 값을 복원한다. Progress는 런타임에서 `itemId` 키 객체로 사용하지만 JSON envelope에서는 각 레코드에 `itemId`를 명시하여 백업→초기화→복원 과정에서도 연결을 잃지 않는다.

## 알려진 제한

- 고급 SRS 최적화와 IndexedDB 전환은 후속 범위다.
- Whisper 전사는 연결되지 않아 버튼을 비활성화했다. 음성 학습은 지원 브라우저의 Web Speech API를 사용한다.
- 브라우저 저장 용량 한계가 확인되면 IndexedDB Repository로 교체한다.

## Gate 1 확장

- `vm-profile-v2`: 목표, 일일 시간(기본 15분), 수준, 관심사, IANA 시간대
- `vm-plan-v2`: 로컬 날짜·시간대·seed·규칙 버전·taskId가 포함된 결정적 오늘 계획
- `vm-session-v2`: 큐, 커서, 완료 상태, `attemptId`별 제출 결과
- 능력별 Progress 키는 `itemId::recognition|recall|production|legacy` 형식이다. 기존 `itemId` 키는 읽기 호환용 legacy 상태로 남기며 성공 능력을 추정하지 않는다.

일정 간격은 일 단위 반올림 후 최대 365일이다. Again은 0일, Hard는 신규 1일/기존 1.2배, Good은 1일→3일→2배, Easy는 신규 4일/기존 2.5배로 계산한다. Skip, 취소, 인식 실패, 채점 실패는 이벤트만 중립 결과로 남기고 Progress와 정확도를 변경하지 않는다. `mastered`도 `dueDate`가 지나면 복습 후보에 포함된다.

백업 envelope에는 profile, plan, session을 포함한다. API 키는 내보내지 않으며 Gate 1부터 브라우저 API 키 저장과 제공자 직접 호출을 제거했다.
