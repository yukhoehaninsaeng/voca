# VocabMaster 저장 스키마 v2

브라우저 `localStorage`를 유지하면서 배열 인덱스 대신 안정적인 `itemId`를 사용한다.

- `vm-migrated-v2`: v1 마이그레이션 완료 플래그
- `vm-progress-v2`: `itemId`를 키로 하는 Progress 객체
- `vm-events-v2`: 모든 모드의 채점 결과인 StudyEvent 배열
- `vm-selection-v2`: 복수 `sourceIds`, `mode`, `updatedAt`
- `vm-backup-v1-*`: 마이그레이션 직전 기존 `vm-*` 값의 복사본

Item ID는 `type + NFKC/소문자/공백 정규화(en) + 정규화(ko)`의 FNV-1a 해시다. 같은 ID에 다른 canonical key가 발견되면 접미사를 붙여 충돌을 분리한다. 정적 Source membership은 실행 시 `data.js`에서 재구성하며, `mistakes`는 `Progress.lapses >= 2`인 Item을 계산하는 가상 Source다.

JSON 내보내기는 `schemaVersion: 2`인 envelope에 Item, membership, Progress, StudyEvent, selection을 담는다. 가져오기는 적용 전에 신규·중복·충돌·무효 수를 보여주며 충돌이나 무효 데이터가 있으면 적용하지 않는다.

`LocalStorageRepository`가 v2 스냅샷의 읽기·원자적 저장·이벤트 추가·내보내기·가져오기를 담당한다. 저장 도중 오류가 발생하면 쓰기 전 값을 복원한다. Progress는 런타임에서 `itemId` 키 객체로 사용하지만 JSON envelope에서는 각 레코드에 `itemId`를 명시하여 백업→초기화→복원 과정에서도 연결을 잃지 않는다.

## 알려진 제한

- 고급 SRS 최적화와 IndexedDB 전환은 후속 범위다.
- Whisper 전사는 연결되지 않아 버튼을 비활성화했다. 음성 학습은 지원 브라우저의 Web Speech API를 사용한다.
- 기존 플래시카드 UI의 AI 보조 출력은 신뢰할 수 없는 HTML로 직접 삽입하지 않는 추가 정리가 후속으로 필요하다.
