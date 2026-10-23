# HaptiLog Agent Orientation

Last updated: 2026-10-23 (user shorthand for review and merge workflows).

HaptiLog is an eyes-free, haptic-first voice logger for Galaxy Watch (Wear OS 4/5) with GPS-context enrichment and downstream AI processing (Gemini Multimodal via Supabase Edge Functions). Source wins over dated prose.

## User shorthand

Treat these acronyms as instructions when used as commands in a task or PR context:

- **`arc` — address review comments:** read the PR's current review comments,
  validate feedback, implement actionable fixes, run relevant checks, push updates,
  and reply to comments and resolve threads when addressed. Explain any feedback
  that does not warrant a change. Follow the repository's review workflow.
- **`mac` — merge (PR) and clean up (worktree and directory):** verify required
  CI, reviews, and merge gates, merge the intended PR, then remove its completed
  task worktree and directory and delete the merged local task branch. Preserve
  uncommitted or unrelated work and shared checkouts. If merging is blocked, report
  the blocker and keep the task worktree intact.

Apply these commands to the current task/PR; ask which target only when ambiguous.
These shorthands retain the repository's existing checks and approval requirements.

## Start here

- Read `CLAUDE.md` for daily working rules and testing guidelines.
- System Architecture lives in `docs/architecture/overview.md`.
- Product Specification lives in `docs/design/product-spec.md`.
- Prioritize configured MCP tools over skills or ad-hoc scripts.

## Architecture entry points

| Area | Location | Description |
| --- | --- | --- |
| Wear OS App | `watch/app/src/main` | Kotlin / Compose for Wear OS application |
| Recording Service | `watch/app/.../service/VoiceRecordingService.kt` | Foreground service managing MediaRecorder & WakeLock |
| Haptic Feedback | `watch/app/.../service/HapticHeartbeatManager.kt` | Periodic heartbeat pulsing waveform generator |
| GPS Snapshot | `watch/app/.../data/LocationSnapshotProvider.kt` | Immediate cached snapshot + high accuracy refinement |
| Wear OS UI | `watch/app/.../presentation/MainActivity.kt` | Single-tap circular recording interface |
| Quick Tile | `watch/app/.../presentation/tile/VoiceRecordTileService.kt` | Wear OS Tile for instant wrist launch |
| Cloud AI Pipeline | `supabase/functions/voice-enrich/` | Gemini Multimodal parsing (Audio + GPS -> Expense/Travel/Workout/Note) |
| DB & Security | `supabase/migrations/` | Postgres schema, RLS policies, Anonymous auth |
| Play Store CI/CD | `.github/workflows/android-playstore.yml` | Wear OS AAB build & Internal Testing auto-publish |

## Critical Invariants

1. **Recording is sacred**:
   - Save the raw audio file (`.m4a`) to local persistent storage *before* any network or upload attempt.
   - Network drop, battery saver, or AI API failures must NEVER discard an un-synced audio capture.
2. **Eyes-free / Screenless feedback is guaranteed**:
   - The user must never need to look at the watch screen to know if recording is active.
   - Recording start = 1 crisp haptic tick (`PRIMITIVE_CLICK`).
   - Recording in progress = subtle, low-frequency heartbeat pulse loop (쿵-쾅 ... 쿵-쾅).
   - Recording stop = 2 confirmative ticks.
   - Vibration amplitude must be calibrated low enough to prevent acoustic microphone interference.
3. **Battery & WakeLock Hygiene**:
   - Recording MUST use `FOREGROUND_SERVICE_TYPE_MICROPHONE` with an ongoing notification.
   - `PARTIAL_WAKE_LOCK` must be held during recording and released IMMEDIATELY upon stop.
   - Safeguard limit: Enforce a strict maximum recording timeout (e.g. 5 minutes default) to prevent runaway battery drain.
4. **GPS Snapshot Policy**:
   - Always snapshot `fusedLocationClient.lastLocation` immediately at the instant the user taps record (< 50ms).
   - Concurrently request `getCurrentLocation(PRIORITY_HIGH_ACCURACY)` during the recording window without blocking audio capture.
   - Store GPS coordinates, altitude, and speed alongside the audio recording metadata.
5. **Separation of Raw Capture vs Derived AI Enrichment**:
   - The local audio file, timestamp, and GPS coordinates are immutable primary sources.
   - Structured extractions (Expense amount, Travel journal, Workout log) are derived enrichments and can be regenerated or updated without touching the source recording.
