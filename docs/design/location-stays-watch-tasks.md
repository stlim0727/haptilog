# Discussion #66 — 워치 체류 기록 작업 명세

작성: 2026-10-26. [Discussion #66](https://github.com/stlim0727/haptilog/discussions/66)의 실행 계획이며 구현 완료를 뜻하지 않는다. 이번 배치는 조사와 작업 분할만 수행한다. 터치 이벤트는 범위 밖이다.

## 현재 코드에서 출발할 지점

- `LocationEventDetector.kt`는 정확도·샘플 나이·순서·속도 필터, 원형 장소 경계, 100m 일반 체류를 처리한다. DWELL은 한 번 발생하며 이후 지속 구간을 갱신하지 않는다. `delta > 180_000`에서 추론 상태를 초기화한다.
- `LocationHistoryRepository.kt`는 `AtomicFile`로 `history.json` version 1을 저장한다. 동기화와 분리된 로컬 저장이며 7일/2,000 points/500 events 제한을 둔다. `stopSession()`은 detector만 제거하므로 체류 종료 기록은 없다.
- `LocationTrackingService.kt`는 명시적 시작, 위치 foreground service, 60초 요청/30초 최소 간격, 8시간 제한, `START_NOT_STICKY`, 직렬 write channel을 제공한다. 현재 `Write.Stop`에는 종료 이유가 없고 프로세스 강제 종료는 `onDestroy()` 실행을 보장하지 않는다.
- `setInitialFix()`는 초기 위치를 UI에만 제공한다. 체류 시작 증거는 현재 세션 이후 측정된 detector의 유효 관측만 사용해야 한다.
- 기존 detector/repository/service 단위 검증이 존재한다. 미등록 장소의 일반 체류와 벽시계 변경에도 단조 시계로 체류 시간을 계산하는 성질을 유지한다.

## 선행 계약 G0 — 구현 시작 전 합의

워치·클라우드·웹 담당자가 아래 필드 의미와 종료 상태를 먼저 확정한다. 이 계약과 fixture가 고정되면 W1, W2, W3, 웹의 fixture 기반 표시, 서버의 계약 기반 API를 병렬 진행할 수 있다. 기존 `LocationEvent` 전체를 전송하는 계약은 사용하지 않는다.

| 필드 제안 | 의미 |
| --- | --- |
| `id` | 워치가 생성한 UUID, 한 체류의 갱신·업로드에 재사용 |
| `sessionId` | 명시적 추적 시작마다 새 UUID. 다른 세션과 이어 붙이지 않음 |
| `revision` | 로컬 영속화 성공 시 증가하는 정수. 서버가 채택하는 동기화 버전과 대응 방식은 클라우드 계약에서 확정 |
| `startedAtMillis` | 현재 체류의 첫 유효 관측 UTC 시각. 물리적 도착 시각이 아님 |
| `qualifiedAtMillis` | N분 기준 충족 관측 시각 |
| `lastObservedAtMillis` | 체류 내부임을 마지막으로 확인한 관측 시각 |
| `endConfirmedAtMillis` | 종료를 알게 된 시각. 이동은 이동 확인 관측, 공백은 공백 만료 감지 시각. 복구 시 실제 종료 시각을 알 수 없으면 null |
| `observedDurationMillis` | 단조 시계로 계산한 지속 시간. 벽시계 차이를 대신 쓰지 않음 |
| `status` | `ACTIVE` 또는 `CLOSED`; 활성 표시에는 freshness 만료를 별도로 적용 |
| `endReason` | `MOVED`, `OBSERVATION_GAP`, `USER_STOP`, `SESSION_TIMEOUT`, `PERMISSION_LOST`, `LOCATION_DISABLED`, `NOTIFICATIONS_DISABLED`, `PROVIDER_ERROR`, `STORAGE_ERROR`, `SERVICE_DESTROYED`, `INTERRUPTED` 중 하나. 상세 이유를 외부 계약에서 단순화할지 합의 |
| `representativeLatitude/Longitude/AccuracyMeters` | 첫 버전에서는 체류 anchor 관측을 사용. 평균 좌표·경로 추정은 하지 않음 |
| `placeId`, `placeNameSnapshot` | 선택적 장소 연결과 당시 라벨. 일반 체류 시간 전체가 장소 안 체류라는 의미는 부여하지 않음 |

`lastObservedAtMillis`를 체류 구간의 끝으로 사용하며 `endConfirmedAtMillis`까지 관측되지 않은 시간을 합산하지 않는다. 단조 시각과 세션 내 후보 상태는 로컬 전용이며 부팅 간 복구·서버 시각 비교에 사용하지 않는다. 개인정보 동의, 삭제 tombstone/세대, 소급 업로드 선택과 서버 전송 필드는 클라우드 계약 소유다.

### 모호한 의미와 권고

1. **체류 경계:** 기존 100m anchor 정책을 유지하면 넓은 회사 안 이동이 여러 체류로 갈릴 수 있다. 첫 버전은 이 의미를 유지하고 실제 착용 결과로 조정한다. 장소 반경을 곧바로 체류 반경으로 치환하지 않는다.
2. **이동 종료:** 한 번의 경계 흔들림으로 끊지 않도록, accuracy circle을 고려한 확실한 외부 관측 두 개가 30초 이상 이어질 때 이동 확정을 권고한다. 불확실한 외부 후보 구간은 지속 시간에 더하지 않는다. 재진입 시 후보 처리와 구간 분할 정책을 G0 fixture로 고정한다.
3. **공백 만료:** 다음 GPS 샘플이 올 때까지 ACTIVE를 남기지 않는다. 서비스의 기존 30초 점검에서 마지막 유효 관측 이후 3분 초과를 detector/repository에 통지한다. 추가 wake lock이나 별도 고빈도 타이머는 만들지 않는다. 화면·서버는 늦은 만료 기록과 관계없이 freshness로 표시한다.
4. **프로세스 중단:** 복구 시 이전 ACTIVE를 `INTERRUPTED`로 닫되 실제 중단 시각을 알 수 있다고 주장하지 않는다. `recoveredAtMillis` 같은 진단 시각이 필요하면 종료 관측과 분리한다. 새 추적은 사용자 동작이 필요하다.
5. **기존 DWELL 이관:** v1 DWELL을 새로운 ACTIVE로 바꾸지 않는다. 기존 이벤트는 legacy 이력으로 보존하고 확정된 지속 방문이나 종료를 합성하지 않는다.
6. **벽시계 변경:** UTC 시작·끝이 역전될 수 있다. duration은 단조 시계 기준을 보존하고 이 경우 타임라인 연결에 사용할 수 없는 `clockDiscontinuity` 표식 도입을 권고한다. 웹에서 역전된 구간으로 음성을 연결하지 않는다.

## 구현 task와 파일 소유권

각 task는 해당 파일의 유일한 편집 소유자를 둔다. 같은 repository 파일을 여러 agent가 동시에 수정하지 않는다. 아래 신규 이름은 제안이며 G0 이후 고정한다.

| ID | 책임 / 소유 파일 | 의존성 | 완료 기준 |
| --- | --- | --- | --- |
| W1 | **순수 체류 모델·상태 기계.** 신규 `data/location/LocationStay.kt`, `LocationStayDetector.kt`, 대응 신규 unit tests | G0 | 미등록 장소에서도 기준 충족 후 단일 ID로 upsert한다. 기본 10분/5·10·20·30분, 갱신·이동·공백·명시적 종료를 단조 시계로 계산한다. 기존 point/ENTER/EXIT detector 정책은 건드리지 않는다. 기존 필터를 중복 구현하지 않도록 accepted sample을 입력으로 받는 API를 제공한다. |
| W2 | **저장·이관·복구.** `LocationHistory.kt`, `LocationHistoryRepository.kt`, `LocationHistoryRepositoryTest.kt` | G0; W1 API fixture로 착수, 최종 W1 결합 | snapshot에 stays를 추가하고 v1→v2를 원자적으로 이관한다. 갱신은 같은 ID를 대체한다. 디스크 성공 이후에만 UI 상태·revision을 공개한다. 이전 ACTIVE 복구 종료, retention, clear를 처리하고 장소·raw audio를 보존한다. stay 개수 상한은 기존 event 상한과 독립 설정으로 명시한다. |
| W3 | **서비스 수명·종료 이유.** `service/LocationTrackingService.kt`, `LocationTrackingServiceTest.kt`; 신규 별도 수명 어댑터 필요 시 해당 파일 | G0; repository 인터페이스 stub으로 착수, 최종 W2 결합 | `Write.Stop(reason)` 및 관측 공백 점검을 기존 직렬 channel로 전달한다. start/stop/late callbacks/timeout에서 마지막 관측을 뛰어넘어 시간을 만들지 않는다. provider 정리·write drain·8시간 제한·명시적 시작을 유지한다. |
| W4 | **워치 표시·문구.** `presentation/LocationJournalActivity.kt`, `res/values/location_journal.xml`, `res/values-ko/location_journal.xml`, 관련 UI tests | G0와 W2 snapshot | ACTIVE에 마지막 확인 시각을 함께 표시하고, 만료/중단은 체류 중이라고 표시하지 않는다. legacy ENTER/EXIT를 터치 기능으로 승격하지 않는다. 장소 편집은 stopped 상태 제한을 유지한다. |
| W5 | **동기화용 로컬 어댑터.** 신규 `data/location/LocationStaySyncSnapshot.kt` 및 tests만; 실제 worker/consent는 클라우드 담당과 소유권 조정 | G0와 클라우드 전송·삭제 계약, W2 | raw points/전체 `LocationEvent`가 아닌 허용 필드만 직렬화한다. revision·세대·삭제된 ID·동의 철회 상태와 일치하는 snapshot을 제공한다. 음성 파일·메타데이터·기존 enrichment 파일을 변경하지 않는다. |

W1/W2/W3는 G0 인터페이스와 fixture 합의 후 병렬로 작성할 수 있으나 병합·검증은 W1→W2→W3 순서다. W4는 fixture로 표시를 병렬 작성하고 W2와 연결한다. W5는 클라우드 계약이 확정되기 전 구현하지 않는다. repository 소유자는 W2뿐이며 동기화 큐에 필요한 변경은 해당 소유자에게 요청한다.

## 필수 검증

- W1: N분 직전/정확한 임계값/후속 갱신, 하나의 ID, 미등록 장소, 180초와 180초 초과 구분, jitter·외부 후보·재진입, 시간 역행, 새 세션, stop 전 아직 미충족 후보, 이동 후 새로운 체류.
- W2: v1 fixture의 labels/points/events 보존과 재로딩, migration write 실패 시 기존 파일 유지, ACTIVE 중 프로세스 재생성→INTERRUPTED, stop 후 재시작 시 다른 ID, update atomicity, 7일 만료와 개수 상한, clear와 원본 audio 불변, 활성 stay가 retention 중 만료되는 정책.
- W3: 마지막 accepted sample 후 무응답 공백 종료, late/batched callback이 stop을 추월하지 않음, 중복 stop, 사용자 stop/8시간/권한·GPS·notification 상실/provider failure, destroy 시 write drain, strong kill 후 로컬 복구. 실제 서비스가 남아 있는데 단순 repository 두 번째 인스턴스 생성만으로 interrupted 처리하지 않도록 프로세스 소유권을 확인한다.
- W4/W5: freshness 만료, 종료 이유, UTC 역전 구간을 duration으로만 안전 표시, 설정 적용 중 상태, whitelist 직렬화, 동의 없는 데이터가 export 대상이 아님.
- unit 검증 예: `cd watch` 후 `./gradlew :app:testDebugUnitTest --tests 'com.haptilog.watch.data.location.*' --tests 'com.haptilog.watch.service.LocationTrackingServiceTest'`. 변경 후 Android SDK/Gradle 환경에서 수행하며 이 계획 문서 작성에서는 실행하지 않았다.
- 실기/에뮬레이터 acceptance는 관련 android-emulator skill을 읽은 담당자가 수행한다. 실제 하루 착용에서 카페 내 이동/인접 상점/장시간 정지/화면 꺼짐/동시 녹음/배터리 소모를 기록한다. baseline과 같은 수집 주기로 비교하며 배터리 수치를 추정해 합격 처리하지 않는다.

## 안전한 통합 경계

`VoiceRecordingService`, `LocationSnapshotProvider`, recording repository, 음성 upload/enrichment 경로는 이 작업의 소유 대상이 아니다. 특히 현재 사용자 변경이 있는 `supabase/functions/voice-enrich/{handler,validation}.ts`와 `tests/voice-enrich.test.mjs`는 수정하지 않는다. 기능 공개 전 위치 기록 설계·제품 사양·아키텍처·프라이버시 안내 갱신은 통합 담당자가 별도 소유한다.
