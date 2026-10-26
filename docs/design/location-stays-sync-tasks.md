# 체류 기록 동기화 작업 명세

Discussion: [#66](https://github.com/stlim0727/haptilog/discussions/66). 작성: 2026-10-26. **계획 및 계약 초안이며 구현·배포 상태가 아니다.** 터치 기록은 제외한다.

## 기존 코드에서 확인한 제약

- 워치는 `CloudClient`의 암호화된 익명 Auth 세션을 녹음 소유자로 사용한다. Google 연결은 원래 소유자를 변경하지 않는다.
- 웹의 접근권은 `portal_connections`의 브라우저 사용자·세션·만료·철회 상태로 결정된다. `private.can_read_owner`가 이 관계를 확인한다. 새 테이블을 단순 `auth.uid() = user_id` 정책으로만 만들면 연결된 웹에서 볼 수 없다.
- 기존 `cloud_consents`와 `CloudConsent`는 음성용이다. 이를 켜는 행위로 위치 동의가 켜져서는 안 된다.
- `RecordingSyncWorker`는 음성 동의가 없으면 실행되지 않으며 음성 파일을 스캔한다. 따라서 위치 작업을 그 루프 끝에 단순 추가하면 위치만 동의한 사용자는 동기화할 수 없다.
- `LocationHistoryRepository`는 세션 중 장소 변경을 금지하고 최대 20개를 유지한다. 다운로드한 설정은 별도 대기 저장소에 둔 뒤 세션 시작 전 적용해야 한다.
- 현재 위치 이벤트 전체에는 위치 샘플이 포함된다. 클라우드 DTO는 명시적 필드 허용 목록으로 새로 작성한다.

## 공통 계약 초안 — 구현 착수 전 C0에서 고정

소유권 단위는 **워치의 기존 owner user ID**다. 브라우저는 유효한 연결권으로 해당 소유자의 데이터를 읽고 장소를 수정한다. account ID로 행 소유권을 갈아끼우지 않는다. 모든 민감한 요청은 서버가 현재 연결·동의를 재검증한다.

| 객체 | 최소 필드 / 의미 |
| --- | --- |
| LocationSyncState | `owner_user_id`, `consent_enabled`, `policy_version`, `consent_revision`, `sync_epoch`, `places_revision`, `updated_at` |
| StaySummary | `id` UUID, `owner_user_id`, `source_revision` 증가 정수, `sync_epoch`, `session_id`, `started_at`, `last_observed_at`, `end_confirmed_at?`, `end_reason?`, `representative_latitude/longitude`, `accuracy_meters`, `observation_radius_meters`, `threshold_minutes`, `expires_at` |
| SavedPlace | `id`, `owner_user_id`, 서버 `revision`, `name`, `latitude/longitude`, `radius_meters`, `deleted_at?`, `updated_at` |
| StayPlaceLink | 체류 ID, 장소 ID/버전, 라벨 스냅샷, 연결 방식(manual/derived). 센서가 작성하는 체류 행과 별도여야 웹 수정이 워치 업데이트에 덮이지 않는다. |
| SyncEnvelope | 프로토콜 버전, 관측한 동의 revision·epoch, 페이지 커서, 변경 항목, ACK 결과. 사용자가 지정한 owner ID는 권한의 근거가 아니다. |

`started_at <= last_observed_at <= end_confirmed_at`(존재 시), 유한 좌표/정확도, 반경 범위, 설정값을 검증한다. 표시상 끝은 `last_observed_at`; 이탈이 나중에 확인돼도 그 사이를 체류 시간에 넣지 않는다. `end_reason` 권고값은 `moved`, `observation_gap`, `stopped`, `interrupted`. 열린 체류는 종료 이유가 없고 최신 관측이 충분히 신선할 때만 활성으로 표시한다. 시간은 UTC, 시간대별 날짜 분할은 표시 책임이다.

소유자·세션·시작 시각은 생성 후 불변이다. 센서 원천의 수정은 같은 ID의 높은 source revision만 수락한다. 같은 revision과 같은 내용은 멱등 ACK, 같은 revision과 다른 내용은 conflict, 낮은 revision은 stale ACK다. 서버 갱신 시각으로 정렬하거나 마지막 요청이 무조건 승리하는 규칙을 쓰지 않는다.

### 삭제·보존 계약

범위 삭제를 안전하게 구현하는 초기 권고는 **소유자별 epoch + 삭제 ID 집합**이다. 삭제·업로드는 동일 상태 행 잠금 아래 직렬화한다. 삭제 트랜잭션에서 epoch를 올리고 대상 ID를 기록하며 본문과 파생 링크를 제거한다. 이전 epoch의 업로드는 서버가 거절한다. 워치는 최신 epoch와 삭제 집합을 적용한 뒤 허용된 나머지 outbox만 새 epoch로 재발행한다. 오래된 요청은 절대 epoch만 바꿔 자동 재전송하지 않는다.

삭제 ID에는 좌표·장소 이름을 저장하지 않는다. ID 보존 종료는 업로드 허용 기간이 끝난 뒤로 잡는다. 클라우드가 시작 시각 기준 7일 밖 신규 체류를 거부하도록 하면 오래된 ID tombstone을 무한 보존할 필요가 없다. 장기 체류가 만료 경계를 넘는 경우의 표시/수락 규칙은 C0에서 확정한다(권고: 세션 최대 8시간 제약을 유지하고 만료된 체류는 재생성하지 않는다).

서버 `expires_at`은 시작 시각 + 7일을 기본으로 고정하며 재시도·체류 갱신으로 늘리지 않는다. 만료는 모든 공개 조회에서 즉시 제외하고 별도 정리 작업으로 본문을 삭제한다. 장소 정의는 자동 만료하지 않는다. 전체 삭제도 음성·장소 정의 삭제와 구분한다.

### 동의 계약

별도 위치 동의 상태·문구 버전을 둔다. 켤 때 기본 업로드 범위는 활성화 이후 새로 시작한 체류이며, 기존 7일 기록의 소급 업로드는 별도 선택이다. 과거 기록을 포함한 동의 범위를 서버도 검증할 수 있도록 활성화 cutoff와 backfill 범위를 기록한다.

끄면 로컬 pending 전송 차단과 실행 중 연결 취소를 먼저 수행한다. 서버 철회가 오프라인이면 재시도하되 로컬 전송은 재개하지 않는다. 웹 철회는 이후 모든 업로드에 즉시 적용한다. 취소 직전에 이미 커밋된 요청은 별도 데이터 삭제 대상이며 철회만으로 삭제를 약속하지 않는다. 재활성화 시 새 consent revision으로 재동의해야 하며 과거 pending이 조용히 부활하지 않는다. 실제 서버 상태와 다른 기기의 로컬 의도를 자동 덮어쓰는 reconcile은 금지한다.

## 실행 가능한 tasks와 병렬 경계

| ID | 책임과 소유 파일 | 선행 | 완료 기준 / 검증 |
| --- | --- | --- | --- |
| C0 | 공통 DTO·오류 코드·계약 fixture 고정. 조정자 소유: 새 `docs/architecture/location-stays-sync.md`, 새 공통 fixture 디렉터리 | 워치·웹 명세 검토 | 필드, 시간·종료 의미, 동의 범위, 삭제 프로토콜, stale/conflict 결과를 세 영역이 합의. 구현 병렬화의 첫 gate. |
| C1 | 클라우드 저장·RLS·트랜잭션 API. backend 소유: CLI가 생성하는 새 migration, 필요 시 새 `supabase/functions/location-sync/`, 새 `supabase/tests/location-stays.test.mjs` | C0 | 소유자와 연결된 현재 웹 세션만 허용. 동의 없는 업로드·원시 points·범위 밖 데이터 차단. max 20과 장소 CAS를 서버에서도 강제. 실제 격리된 DB에서 A/B 사용자, 만료/철회 세션, forged owner, 익명 Auth watch 검증. |
| C2 | 워치 전용 location 동의·outbox·다운로드 client/worker. watch-sync 소유: 새 `sync/LocationConsent.kt`, `LocationSyncWorker.kt`, `LocationSyncClient.kt`, 새 checkpoint/outbox 파일과 tests | C0; C1 API 준비 전 mock으로 병렬 | 음성 동의와 독립적인 scheduler, battery/network 제약·backoff, no recordings 상태에서도 동작. 요청 전/중 철회 차단, ACK 전 crash 재시도, 2→1 revision 도착, 삭제 후 재접속 검증. 음성 파일과 원본 위치 기록 손대지 않음. |
| C3 | 워치 설정 UI 및 대기 장소 적용 연결. watch integration 소유: `SettingsActivity.kt`, `LocationJournalActivity.kt`, location 리소스. repository/service 연결은 워치 모델 담당자와 순차 handoff | C0; C2, 워치 모델 API 이후 연결 | 별도 disclosure·소급 선택. active session에는 pending만 저장; 정지 후 다음 시작 직전 원자 적용. 앱 재시작에도 desired/applied revision 구분. |
| C4 | 서버 삭제·epoch·7일 정리. C1과 같은 backend 소유자가 순차 처리; 별도 backend 작업자라면 새 migration과 별도 테스트 파일만 | C1 | 삭제↔업로드 race의 두 순서 모두 삭제가 승리. 옛 epoch 409→재조회→삭제 적용, 선택 삭제 비대상은 보존. cleanup 실패 중에도 만료 데이터 조회 불가. 이름/좌표 없는 tombstone만 유지. |
| C5 | 웹 adapter·동의·장소 CAS·동기화 상태. web 소유: 새 `web/src/location/` 내부 모듈/테스트; 기존 앱 진입 파일 수정은 web integration 1명 소유 | C0; mock으로 C1/C2와 병렬 | 409는 최신 값 재조회 후 사용자 재적용; pending vs applied 표시; 마지막 sync/관측 시각 구분. Web API는 live 연결 상태 검증. 추천/음성 링크는 DTO만 소비. |
| C6 | 통합·정책 문서. 조정자 소유: 기존 `docs/design/location-journal.md`, `product-spec.md`, `docs/architecture/overview.md`, 공개 privacy 문서 | C1–C5 | 두 사용자·워치/웹·오프라인 재접속 시나리오, 음성만/위치만/둘다/둘다꺼짐 조합, 로그 좌표 유출 없음. 클라우드 기능 출시와 같은 변경으로 로컬 전용 설명 갱신. |

실제 구현 파일 이름은 C0에서 고정한다. 기존 `voice-enrich/handler.ts`, `voice-enrich/validation.ts`, `tests/voice-enrich.test.mjs`는 본 기능의 소유 범위에서 제외한다. 제품 분석 프롬프트나 AI 동작을 수정하지 않는다.

## 권고하는 병렬 실행

1. 워치 감지/저장 담당은 로컬 체류 모델을, backend 담당은 C0·C1을, web 담당은 C0 fixture 기반 목록·장소 폼을 병렬 진행한다.
2. C0 고정 후 워치 sync 담당이 C2를 진행한다. 초기 3명 구성에서는 워치 모델 완료 후 같은 작업자가 인계받는 편이 충돌을 줄인다.
3. backend C4, web C5, watch C3를 병렬 연결한 뒤 조정자가 C6을 수행한다. 상용 DB 적용·배포는 이 계획 작업의 범위가 아니다.

## 구현 시 필요한 Supabase 확인

이번 변경은 기존 소스 조사와 계획 문서만 작성했으며 원격 쿼리나 schema 변경을 하지 않았다. 구현 시작 시 Supabase 스킬에 따라 changelog의 관련 breaking change와 현재 RLS/Data API 문서를 확인해야 한다. 새 공개 테이블의 RLS와 명시적 grant, RPC 실행 권한, private helper의 고정 search_path를 검토하고 실제 두 사용자 DB 테스트 및 advisors로 검증한다. 클라이언트에는 service key를 포함하지 않는다.
