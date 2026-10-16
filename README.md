# HaptiLog (햅티로그)

> **Eyes-free, Haptic Voice Logger for Galaxy Watch & Wear OS**  
> *Record instantly with wrist heartbeat feedback, tag GPS location context, and let AI structure your day into expenses, travel logs, and workouts.*

---

## 📱 Screenshots

| Idle Ready | Active Recording Pulse | Wear OS Watch Face |
| :---: | :---: | :---: |
| <img src="screenshots/01_idle_record_state.png" width="180"/> | <img src="screenshots/02_recording_active_state.png" width="180"/> | <img src="screenshots/04_wearos_watchface.png" width="180"/> |

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
   - Audio is saved locally (`.m4a` AAC 16kHz mono) with safe timeout protection before being synced directly to Supabase.

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
- `supabase/`: Database migrations, RLS policies, enrichment and watch pairing Edge Functions.
- `web/`: React/Vite review portal, with Cloudflare Workers deployment configuration.
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
4. Call with a user bearer token and an accessible `recording_id`. Original audio is loaded from private Storage; location context comes from the database row. Legacy base64 fields are accepted but never replace the stored source.

## Web review portal

The portal in `web/` pairs directly with the watch using an expiring code. Review original audio and transcripts, retry failed analysis, correct expenses, complete extracted tasks, and export CSV. Browser access is revocable independently from the watch session.

The proposed production address is **`haptilog.keepory.app`**, served by a separate Cloudflare Worker. Supabase remains the backend. Deployment needs the new migration, both updated functions, a server-only pairing secret, and Cloudflare account access; the domain is not activated by a local build.

See [portal architecture and deployment](docs/architecture/web-portal.md) for the session model, recovery limits, commands, and deployment order.

## Implementation status

Implemented: local recording and playback, atomic session metadata, a three-minute timeout, haptic success/failure feedback, optional bounded location refinement, Tile/complication launch, ZIP export, anonymous watch authentication with encrypted session storage, opt-in durable upload/retry scheduling, private audio Storage, and authenticated idempotent enrichment.

Interrupted recordings are preserved and shown for inspection/export, rather than automatically uploading potentially invalid audio. Physical-watch validation is still required for haptic audibility, microphone interference, battery use, and the availability of a system export picker.

## Cloud sync setup

The public defaults in `watch/cloud.properties` target the `haptilog` project (`pejblunajspvgxavvieu`). Override them at build time with `HAPTILOG_SUPABASE_URL` and `HAPTILOG_SUPABASE_PUBLISHABLE_KEY` for another environment. Service-role/secret keys must never be built into the watch.

Apply the migrations, enable Anonymous Sign-Ins in Supabase Auth, and configure `GEMINI_API_KEY` and `GEMINI_MODEL` in Edge Function secrets. The function verifies the caller and recording ownership itself; `verify_jwt=false` allows publishable-key/asymmetric-JWT projects without depending on legacy gateway verification.

Tap **Enable cloud sync** on the watch to opt in; tap **Pause cloud sync** to stop future work. Uploads require connectivity and sufficient battery, preserve the local source files, and use exponential retries. After six failed attempts or a permanent error, use **Retry sync** on the recording once the underlying problem is fixed. Uploaded audio uses the private path `<user-id>/<recording-id>.m4a`. Enrichment and sync state are separate files. Local deletion only removes the watch copy; it does not delete uploaded cloud data.

Anonymous sessions belong to this installation. Clearing app storage or losing the encrypted session requires account recovery work before previously uploaded recordings can be accessed again. The app does not silently create a different owner after a session error.

Export produces a ZIP containing audio, source metadata, and available enrichment. It requires a compatible system document picker; an unsupported watch reports that no export app is available and retains the original.

Migration filenames match the migration history applied to the named project, so subsequent CLI deployments do not reapply the initial schema.

## Validation

```bash
cd watch
./gradlew assembleDebug lintDebug testDebugUnitTest
```

From the repository root:

```bash
node --experimental-strip-types --test tests/voice-enrich.test.mjs tests/watch-access.test.mjs
deno check --lock=supabase/functions/deno.lock supabase/functions/voice-enrich/index.ts supabase/functions/watch-access/index.ts
npm ci --prefix supabase/tests --ignore-scripts
npm test --prefix supabase/tests
```

Backend handler tests use mocked clients/provider responses. Embedded PostgreSQL tests execute the migrations and verify ownership/storage policies and retry leases against test Auth/Storage schemas. Android tests verify recovery, export contents, upload checkpoints, source retention, and stable recording ownership. These complement the rollback-only live ownership checks; they do not prove a successful live Gemini request.

## Release signing

Place the release keystore at `watch/app/release.keystore` and provide `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD`. Set a monotonically increasing `VERSION_CODE`. The Play workflow uses its run number; it must exceed any version previously published outside that workflow. `bundleRelease` rejects missing release credentials, and release builds never fall back to debug signing.
