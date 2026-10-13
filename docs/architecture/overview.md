# HaptiLog Architecture Overview

## 1. Principles

1. **Local Durability First**: Audio records directly to local app storage (`context.filesDir/recordings/`). Recording will not terminate prematurely due to network anomalies.
2. **Haptic Clarity without Acoustic Noise**: The heartbeat vibration pattern is tuned to be felt on the wrist (mechanoreceptors) while minimizing chassis vibrations that could bleed into the MEMS microphone.
3. **Power Efficiency**: Uses `MediaRecorder` with AAC compression (low CPU) instead of raw `AudioRecord` (high CPU). GPS polling is limited to the active recording duration.
4. **Multimodal AI Enrichment**: Raw audio is passed directly to Gemini along with latitude/longitude and timestamp. Gemini's native audio understanding handles accents, background noise, and intent recognition without a separate fragile STT step.

## 2. Audio & Haptic Flow

```
[User Tap]
   │
   ├──> Haptic: Crisp Click (PRIMITIVE_CLICK)
   ├──> Location: Cache snapshot (lastLocation) & Request getCurrentLocation()
   ├──> Service: Start Foreground Service (Notification + WakeLock)
   ├──> Audio: Initialize MediaRecorder (Output: MPEG_4, 16kHz, 32kbps)
   └──> Haptic Loop: Every 2.4s -> 쿵(40ms) - 쉼(80ms) - 쾅(50ms)
```

## 3. Data Contract

Each recording session produces:
1. `recording_<uuid>.m4a`: Audio stream.
2. `meta_<uuid>.json`:
```json
{
  "id": "uuid-v4",
  "started_at": "2026-10-13T12:00:00Z",
  "duration_seconds": 18,
  "status": "COMPLETED",
  "latitude": 37.541,
  "longitude": 127.056,
  "altitude": 24.5,
  "speed": 1.2,
  "accuracy": 8.0,
  "location_timestamp": "2026-10-13T12:00:01Z",
  "sync_status": "PENDING_SYNC"
}
```

The audio filename is `rec_<uuid>.m4a`. Location fields are optional. A cached fix older than two minutes is ignored; a high-accuracy refinement is attempted with a 15-second bound and cancelled at stop. Metadata is written atomically and session updates are serialized on the main dispatcher. Failed capture uses `status: FAILED` and `sync_status: CAPTURE_FAILED`; its audio is retained for inspection.

The backend uses the caller's JWT and recording ownership to authorize enrichment before calling Gemini. Derived enrichments are inserted using a privileged server-only client. Sync, Storage provisioning, interruption recovery, and retry idempotency are not implemented yet.
