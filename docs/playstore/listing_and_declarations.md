# Google Play Console Release Guide & Policy Declarations

Last updated: 2026-10-18
Application ID: `com.haptilog.watch`  
Target: Wear OS 3+ (API 30–35)

---

## 1. Store Listing (스토어 등록정보)

### App Name (앱 이름, 최대 30자)
- **한국어**: `HaptiLog - 햅틱 보이스 레코더` (20자)
- **English**: `HaptiLog - Haptic Voice Logger` (30자)

### Short Description (간단한 설명, 최대 80자)
- **한국어**: `화면을 보지 않고 햅틱 진동으로 기록하는 스마트워치 음성 메모` (34자)
- **English**: `Eyes-free, haptic-assisted Wear OS voice recorder with GPS context.` (66자)

### Full Description (전체 설명, 최대 4000자)

#### 한국어 (Korean)
```
달리거나 자전거를 탈 때, 혹은 양손에 짐을 들고 있을 때 화면을 켜서 녹음 버튼을 찾느라 멈추지 마세요.
HaptiLog는 화면을 보지 않고도 오직 손목에 전해지는 섬세한 햅틱 피드백만으로 녹음의 시작, 진행, 완료를 완벽하게 인지할 수 있는 Wear OS 전용 햅틱 보이스 레코더입니다.

■ 화면을 볼 필요 없는 직관적인 햅틱 시그니처 (Living Pulse Haptic)
- 녹음 시작: 손목을 감싸는 선명한 단일 클릭(Click)
- 녹음 진행 중: 1.2초 주기의 미세한 심장박동 펄스(Heartbeat Pulse)가 계속 작동하여 녹음 중임을 촉각으로 확인
- 녹음 종료: 데이터가 로컬 스토리지에 완전히 저장되었음을 알리는 명확한 2회 클릭
- 자동 종료 사전 알림: 최대 녹음 시간(3분) 도달 30초 전 3회의 미세 진동으로 알림

■ 원탭 즉시 녹음 (One-Tap Instant Launch)
- 타일(Wear OS Tile): 워치 화면을 넘겨 중앙의 시그니처 디스크를 터치하기만 하면 0.1초 만에 녹음이 시작됩니다.
- 컴플리케이션(Complication): 즐겨 쓰는 워치페이스에 HaptiLog 바로가기를 등록하여 언제 어디서나 손쉽게 실행하세요.

■ 위치 및 이동 맥락 자동 연동 (GPS Context)
- 음성 메모가 녹음된 순간의 GPS 좌표, 고도, 이동 속도가 함께 기록됩니다.
- 가계부 메모, 여행 일지, 야외 러닝/라이딩 중 남긴 음성 메모에 생생한 장소 정보가 결합됩니다.

■ 오프라인 로컬 우선 안전 저장 (Local-First Durability)
- 통신 음영 지역이나 비행기 탑승 중에도 안심하세요.
- 모든 녹음 파일은 네트워크 연결 여부와 상관없이 워치 내부 안전 스토리지에 최우선 저장됩니다.
- 배터리 및 마이크 간섭을 최소화한 초경량 AAC(MPEG-4) 인코딩 설계.

■ 지원 기기
- Wear OS 3.0 이상 (Galaxy Watch 4, 5, 6, 7, Ultra 및 Pixel Watch 시리즈)
```

#### English
```
Stop interrupting your run, commute, or workout just to check your watch screen.
HaptiLog is an eyes-free, haptic-first voice logger designed exclusively for Wear OS. Experience complete confidence in your recordings without looking at your wrist.

■ Living Pulse Haptic Feedback
- Start: Crisp mechanical tick confirming immediate capture.
- In-Progress: Subtle 1.2s physiological pulse confirms active recording silently without acoustic noise.
- Stop: Distinct two-stage confirmation tick once the audio file is securely written to storage.
- Auto-stop warning: Three soft pulses notify you 30 seconds before the 3-minute recording limit.

■ Instant Wrist Launch
- Wear OS Tile: One tap on the obsidian tile begins recording instantly.
- Watch Face Complication: Place HaptiLog directly on your favorite watch face for zero-latency access.

■ Contextual GPS Enrichment
- Coordinates, altitude, and velocity are snapped at the moment of recording.
- Perfect for voice expenses on the go, travel field notes, and interval workout logs.

■ Local-First Durability
- Captures safely to local watch flash storage first. Network anomalies will never drop your audio.
- Lightweight AAC audio compression optimized for Wear OS battery efficiency.

■ Supported Devices
- Wear OS 3.0 and above (Samsung Galaxy Watch 4/5/6/7/Ultra, Google Pixel Watch 1/2/3).
```

### 1.4 Graphic Assets & Privacy URL (그래픽 이미지 및 개인정보처리방침)

- **앱 아이콘 (App Icon)**: 512×512 PNG (`haptilog_icon_512.png`)
- **그래픽 이미지 (Feature Graphic, 필수)**: 1024×500 PNG / JPEG (스토어 상단 배너 이미지)
- **Wear OS 스크린샷 (Wear OS Screenshots, 최소 1개)**: `screenshots/` 디렉터리에 라운드 워치 스크린샷 5종 준비 완료
- **개인정보처리방침 URL (Privacy Policy URL, 필수)**:
  `https://haptilog.keepory.app/privacy.html`
  *(마이크 음성 녹음 및 위치 권한을 사용하는 앱은 공개 접근 가능한 유효한 URL 필수 입력)*

---

## 2. Policy Declarations (정책 선언)

### 2.1 금융 기능 선언 (Financial Features)
- **선택값**: **기타 (Other)** — 개인 지출 기록, 금액/통화/상호 추출, 통화별 합계 표시 기능을 설명합니다.
- **사유**: 금융 기능은 대출·결제에만 한정되지 않습니다. 현재 포털의 지출 기록과 합계 기능을 명시하되, 은행 연결·송금·대출·투자·보험·금융 조언은 제공하지 않는다고 구분합니다. 2026-10-18 콘솔 저장 완료.

### 2.2 건강 앱 선언 (Health Apps)
- **선택값**: **활동 및 피트니스 (Activity and fitness)**.
- **사유**: 현재 AI가 운동 메모를 `WORKOUT`으로 분류·저장하고 포털에서 운동 항목을 제공합니다. 센서나 의료 진단이 없다는 사실만으로 건강 기능 전체를 부인하면 안 됩니다. 의료 기기나 의료 조언으로는 선언하지 않습니다. 2026-10-18 콘솔 저장 완료.

### 2.3 데이터 보안 (Data Safety Form)
- **수집 및 공유 여부**: 수집함 (데이터가 암호화되어 전송됨, 사용자가 삭제 요청 가능)
- **수집 항목**:
  1. **오디오 녹음(Audio recordings)**:
     - 목적: 앱 기능(사용자가 시작한 음성 메모 캡처, 로컬 저장 및 선택적 동기화/AI 텍스트 변환)
     - 수집: 선택적 클라우드 동기화 시 전송, 익명 사용자 ID에 연결, 비임시 저장, 앱 기능 목적
  2. **정확한 위치 / 대략적인 위치(Location - Precise & Approximate)**:
     - 목적: 앱 기능(녹음 시점의 GPS 좌표, 고도, 속도를 메모 맥락으로 태깅)
     - 수집: 위치 권한 및 선택적 동기화에 따라 전송, 비임시 저장, 앱 기능 목적. 녹음 세션에서만 위치 취득, 지속적인 경로 추적 없음.
  3. **앱 정보 및 성능 (진단 / 비정상 종료 로그)**:
     - 목적: 분석 및 오류 수정. 크래시 동의와 사용자 제보는 녹음 동기화 스위치와 별개입니다.
     - 수집: 예외 클래스명·앱 코드 위치·앱 버전·기기 모델·Android API. 보고서는 익명 사용자 ID와 연결됩니다. 오디오·GPS·예외 메시지는 자동 첨부하지 않습니다.
  4. **사용자 ID**: 익명 클라우드 인증·소유권·브라우저 연결, 선택적 수집, 앱 기능·계정 관리 목적.
  5. **기타 사용자 제작 콘텐츠**: 전사·메모·수정 및 사용자가 입력한 제보 내용, 선택적 수집, 앱 기능·문제 분석 목적.
  6. **구매 내역 / 피트니스 정보**: 사용자가 기록하고 AI가 정리한 지출·운동 메모, 선택적 수집, 앱 기능 목적.
- **공유 주의**: Supabase 등 처리업체 예외를 적용하려면 실제 계약과 처리 방식을 확인해야 합니다. 특히 Gemini의 무료/유료 서비스 구분에 따라 Google의 데이터 이용 범위가 다릅니다. 현재 '공유 없음'은 Gemini 결제 연결 상태를 검증하기 전 확정 판정하지 않습니다.

### 2.3.1 출시 전 추가 확인
- Gemini API 약관은 18세 미만을 대상으로 하거나 접근 가능성이 있는 API 클라이언트를 제한합니다. 현재 13세 이상 타겟과 충돌하며, 18세 이상 타겟 및 접근 제한 또는 AI 제공 방식 변경 결정이 필요합니다.
- 워치에는 개인정보처리방침 링크/본문과 클라우드 전송 시 데이터·처리업체 안내가 빠져 있습니다. 콘솔 설문 수정만으로 해결되지 않습니다.
- 공개 개인정보처리방침 수정본의 배포와 Gemini 결제 상태 확인 전 심사 제출을 보류합니다.
- 상세 검토 결과: `2026-10-18-policy-audit.md`.

### 2.4 포그라운드 서비스 권한 선언 (Foreground Service Permissions)

HaptiLog 매니페스트에 등록된 포그라운드 서비스 타입:
- `android.permission.FOREGROUND_SERVICE_MICROPHONE`
- `android.permission.FOREGROUND_SERVICE_LOCATION`

#### (A) Microphone (`FOREGROUND_SERVICE_MICROPHONE`)
- **기능 목적 (Use case)**:
  `음성 녹음 (Audio recording / Voice memo)`
- **포그라운드 서비스가 필수적인 이유 (Justification text)**:
  ```
  HaptiLog is an eyes-free Wear OS voice recording app. Users initiate voice notes by tapping a Wear OS Tile, Complication, or the main button while actively engaged in tasks such as walking, cycling, or working out.

  Because Wear OS aggressively enters ambient mode (screen off) and limits background tasks to conserve battery, the recording process must run as an ongoing Foreground Service (type: microphone) with a visible user notification. This guarantees that audio capture continues uninterrupted without being killed by the Android low-memory killer until the user explicitly stops the recording or reaches the safeguard cutoff.
  ```
- **사용자 시작 조건 (User-initiated trigger)**:
  `User explicitly taps the record button on the Wear OS screen, Tile, or Complication.`
- **동영상 데모 (Video Demonstration link)**:
  워치에서 녹음 버튼을 눌러 상단/알림창에 진행 중인 마이크 녹음 알림이 뜨고, 녹음을 정지하는 시연 영상 URL(YouTube 미등록 링크 등).

#### (B) Location (`FOREGROUND_SERVICE_LOCATION`)
- **기능 목적 (Use case)**:
  `음성 메모 시점의 위치 맥락 기록 (Geotagging voice memo context)`
- **포그라운드 서비스가 필수적인 이유 (Justification text)**:
  ```
  HaptiLog captures the user's location (latitude, longitude, altitude, speed) strictly during active voice recording sessions to enrich voice memos with geographical context (such as travel field notes or transit memos).

  Location acquisition runs concurrently with audio recording inside the active foreground service window and terminates immediately when voice recording stops. Running within the foreground service ensures high-accuracy GPS fixes are retrieved reliably while the watch display is dimmed.
  ```
- **사용자 시작 조건 (User-initiated trigger)**:
  `Triggered concurrently with the user-initiated voice recording session.`

---

## 3. Production Release & Promotion Guide (프로덕션 출시 및 승격 가이드)

### 3.1 폼팩터 전용 트랙 선택 (Crucial: Wear OS Track Selection)
- **오류 증상**: `"This APK or bundle requires the Wear OS system feature android.hardware.type.watch. To publish this release on the current track, remove this artifact."`
- **원인**: Play Console의 기본 트랙("휴대전화, 태블릿 및 ChromeOS")에 Wear OS 전용 번들을 출시/승격하려 할 때 발생.
- **해결 방법**:
  1. Play Console 좌측 메뉴: **프로덕션(Production)** 이동
  2. 화면 우측 상단의 **기기 유형(Form factor) 드롭다운** 클릭
  3. **"Wear OS 전용(Wear OS only)"** 트랙을 선택한 후 **'새 버전 만들기(Create new release)'** 또는 **'출시 승격(Promote release)'** 진행
  4. CI/CD 워크플로(`.github/workflows/android-playstore.yml`)를 통해 배포할 때는 트랙 이름을 `wear:production`으로 지정 (워크플로에서 `production` 입력 시 `wear:production`으로 자동 보정됨)

### 3.2 국가/지역 추가 (Add Countries/Regions)
- **오류 증상**: Wear OS 전용 트랙에서 국가/지역 추가 버튼이 비활성화되어 출시를 진행할 수 없음.
- **해결 방법**:
  1. Play Console 왼쪽 메뉴: **프로덕션(Production)** 대시보드로 이동
  2. 상단 탭에서 **'국가/지역(Countries/regions)'** 클릭
  3. **'국가/지역 추가(Add countries/regions)'** 버튼 클릭
  4. **전체 선택** (또는 대한민국 포함 원하는 국가 체크) 후 **'저장'** 클릭
  5. 휴대전화 트랙에 국가를 추가하면 Wear OS 폼팩터 트랙의 국가 배포도 함께 잠금 해제됩니다.

### 3.3 개인 개발자 계정 필수 요건 (Personal Account Closed Testing Rule)
- 2023년 11월 13일 이후 생성된 개인 개발자 계정은 프로덕션(Production)에 바로 출시할 수 없습니다.
- **진행 절차**:
  1. Play Console 좌측: **테스트 > 비공개 테스트(Closed testing)** 트랙 생성
  2. 워치 AAB를 비공개 테스트 트랙에 출시
  3. 구글 그룹스 또는 이메일 목록으로 **최소 12명 이상의 실제 테스터** 초대 및 등록
  4. 테스터들이 **14일간 연속**으로 테스트에 참여(앱 설치 및 실행 유지)
  5. 14일 경과 후 대시보드의 **"프로덕션 신청(Apply for production)"** 버튼 활성화 -> 피드백 요약 및 질문 답변 제출 후 구글 심사 승인 대기
- 내부 테스트(Internal testing) 트랙은 심사 및 14일 요건 없이 즉시 테스터에게 배포 가능합니다.
