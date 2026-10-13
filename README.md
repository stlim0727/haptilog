# HaptiLog (햅티로그)

> **Eyes-free, Haptic Voice Logger for Galaxy Watch & Wear OS**  
> *Record instantly with wrist heartbeat feedback, tag GPS location context, and let AI structure your day into expenses, travel logs, and workouts.*

---

## 🌟 Key Features

1. **Screenless / Eyes-Free Voice Recording**:
   - Single tap to start / stop via Wear OS Tile or Complication.
   - **Heartbeat Haptic Pulse**: Continuous, subtle haptic loop (`쿵-쾅 ... 쿵-쾅`) lets you know recording is active without looking down at the watch.
2. **Context-Enriched Logging**:
   - Immediate GPS location snapshot + altitude + speed metadata tagged to every audio snippet.
3. **Downstream Multimodal AI (Gemini 2.0 / Flash)**:
   - **간이 가계부**: *"아이스 아메리카노 4,500원 결제"* + 카페 위치 ➔ 지출 내역 자동 정리.
   - **여행 / 탐방 일지**: *"여기 골목 골동품 가게 감성 좋다"* + GPS 좌표 ➔ 여행 지도 타임라인 일기.
   - **운동 / 러닝 메모**: *"5km 지점 무릎 살짝 뻐근, 페이스 조절"* + 러닝 속도 ➔ 운동 로그 기록.
4. **Local-First & Battery Aware**:
   - Audio is saved locally (`.m4a` AAC 16kHz mono) with safe timeout protection before being synced to Supabase / Phone.

---

## 📐 System Architecture

```mermaid
flowchart LR
    subgraph GalaxyWatch ["Galaxy Watch (Wear OS 4/5)"]
        A[Tile / Complication / App] --> B[VoiceRecordingService\nForeground Service]
        B --> C[MediaRecorder\nAAC-LC, 16kHz]
        B --> D[HapticHeartbeatManager\nSubtle Waveform Pulse]
        B --> E[LocationSnapshotProvider\nFusedLocation GPS]
        C & E --> F[Local Storage\n.m4a + meta.json]
    end

    subgraph Cloud ["Supabase & Gemini AI"]
        F -->|Upload| G[Supabase Storage & DB]
        G --> H[Edge Function: voice-enrich]
        H --> I[Gemini Multimodal\n(Audio + Location)]
        I --> J[Structured Logs\nExpense / Travel / Workout]
    end
```

---

## 📂 Project Structure

- `watch/`: Standalone Wear OS Native Application (Kotlin + Jetpack Compose for Wear OS).
- `supabase/`: Database migrations, RLS policies, and `voice-enrich` Edge Function.
- `.github/workflows/`: CI/CD automation including Google Play Store Internal Testing release.
- `docs/`: Product specs and architecture guidelines.

---

## 🚀 Getting Started

### Wear OS App
1. Open the `watch/` directory in Android Studio.
2. Connect your Galaxy Watch via Wireless Debugging (`adb connect <watch_ip>:<port>`).
3. Run `app` target directly onto your watch.

### Supabase Backend
1. Configure a Supabase project and apply the migration in `supabase/migrations/`.
2. Set `GEMINI_API_KEY` and an available audio-capable `GEMINI_MODEL` as Edge Function secrets. There is deliberately no retired-model fallback.
3. Deploy: `supabase functions deploy voice-enrich`.
4. Call with a user bearer token, an owned `recording_id`, and `audio_base64` (`audio_mime` defaults to `audio/mp4`). Location context comes from the owned database row. Audio payloads are limited to 1.8 MB of base64.

## Implementation status

This repository is a prototype. Implemented: local recording, atomic session metadata, a three-minute timeout, haptic success/failure feedback, optional bounded location refinement, a recording Tile launch, and authenticated enrichment.

Still required for an end-to-end product: recording history/playback/export, authentication on the watch, durable upload/retry scheduling, private audio Storage setup, enrichment retrieval, retry idempotency, and recovery of interrupted recordings. There is no complication provider yet. Physical-watch validation is required for haptic audibility, microphone interference, and battery consumption.

## Validation

```bash
cd watch
./gradlew assembleDebug lintDebug
```

From the repository root:

```bash
node --experimental-strip-types tests/voice-enrich.test.mjs
deno check supabase/functions/voice-enrich/index.ts
```

The backend tests use mocked clients and provider responses; they do not replace deployed RLS or database integration tests.

## Release signing

Place the release keystore at `watch/app/release.keystore` and provide `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD`. Set a monotonically increasing `VERSION_CODE`. The Play workflow uses its run number; it must exceed any version previously published outside that workflow. `bundleRelease` rejects missing release credentials, and release builds never fall back to debug signing.
