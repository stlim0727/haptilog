# Google Play Console Release Guide & Policy Declarations

Last updated: 2026-10-15  
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

---

## 2. Policy Declarations (정책 선언)

### 2.1 금융 기능 선언 (Financial Features)
- **선택값**: **"내 앱은 어떠한 금융 기능도 제공하지 않습니다"** (My app does not provide any financial features)
- **사유**: HaptiLog는 음성 메모 및 개인 생산성 도구이며, 모바일 뱅킹, 가상화폐, 주식 거래, 대출, 결제 처리 등 금융 규제 대상 서비스를 제공하지 않습니다.

### 2.2 건강 앱 선언 (Health Apps)
- **선택값**: **"내 앱은 건강 관련 기능을 제공하지 않습니다"** (My app does not provide health-related features)
- **사유**: HaptiLog는 생체 측정 센서(ECG, 심박수, 혈압, 체성분)나 의료 기기를 사용하지 않으며, 임상적/의학적 진단이나 건강 관리를 목적으로 하지 않습니다.

### 2.3 포그라운드 서비스 권한 선언 (Foreground Service Permissions)

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

## 3. Country & Track Release Settings (국가 및 트랙 설정)

### 국가/지역 추가 (Add Countries/Regions)
1. Play Console 왼쪽 메뉴: **프로덕션(Production)** [또는 해당 트랙] 이동
2. 상단 탭에서 **'국가/지역(Countries/regions)'** 클릭
3. **'국가/지역 추가(Add countries/regions)'** 버튼 클릭
4. **전체 선택** (또는 대한민국 포함 원하는 국가 체크) 후 **'저장'** 클릭

### 개인 개발자 계정 대시보드 요건 (Personal Account Requirements)
- 2023년 11월 이후 생성된 개인 개발자 계정은 프로덕션(Production)에 바로 출시할 수 없습니다.
- 대시보드의 **"비공개 테스트(Closed testing)"**에서 20명 이상의 테스터를 등록하고 14일간 연속 테스트를 완료한 후 "프로덕션 신청"을 진행해야 합니다.
- 내부 테스트(Internal testing) 트랙은 심사 및 14일 요건 없이 즉시 테스터에게 배포 가능합니다.
