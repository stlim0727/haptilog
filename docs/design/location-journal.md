# Location journal

Issue: [#45](https://github.com/stlim0727/haptilog/issues/45). Design date: 2026-10-25.

## Purpose and scope

Capture personal location history on the watch and review places and stays in the web portal. The watch no longer exposes a coordinate list, stay browser or place editor. A "beacon" is a named circular GPS place. Separate optional place/stay synchronization adds portal exploration and place management as specified in the [synchronization contract](../architecture/location-stays-sync.md), whose backend is applied in production; on-device validation remains a release gate. Bluetooth beacon discovery, remote child tracking, family access, touch-event recording and alerts to other people are outside this implementation.

The journal is separate from voice recording. Starting it never starts the microphone. Stopping it does not interrupt an audio recording. Voice-recording location snapshots and immutable source files retain their existing behavior.

## User journey

1. Open **Settings → Location recording**. Choose Off, Only when recording (default), or Always. The last choice starts a visible location session with no time limit and is the only action it asks for. Cloud sync is a separate common setting for recordings, attached location, places and retained stay summaries; raw movement points remain local.
2. Choose **Always** and grant precise location permission and enable notifications. The location foreground service starts while the activity is visible and displays an ongoing notification with a stop action. Approximate-only access or blocked journal notifications prevent a journal session; voice recording remains available. The location settings screen links to app settings for permission and notification changes. Tapping the ongoing notification opens that same location settings screen.
3. Open **Settings → Web access** to connect a browser. When cloud sync is enabled, review stays and manage places and the common stay threshold in the portal; downloaded changes apply between sessions. The watch has no separate stay-history entry or duplicate cloud/collection links. With cloud sync off, capture remains local; there is no on-watch coordinate browser or place editor. Existing saved places remain in local storage and continue to participate in the v1 detector.
4. Choose **Only when recording** or **Off** in location settings, or press **Stop** in the notification. Sampling ends without deleting audio or existing location data. Choosing **Always** again starts a new session; an involuntary stop resumes on the next supported screen entry while Always remains selected. The web retains its separate cloud-deletion controls and local location history remains subject to automatic bounded retention.

## Cloud processing transition (#98)

The [v2 plan](../architecture/location-capture-v2.md) moves raw upload and stay computation to the cloud in later increments. This first increment only retires watch browsing/editing and simplifies navigation. The existing local detector and v1 summary uploader remain active. Raw points still stay on the watch; neither the new consent nor remote collection/upload cadence is implemented here. Do not describe the new pipeline as shipped or widen existing consent.

## Architecture and data ownership

- A location-only foreground service owns one sampling session. No microphone permission or wake lock is needed for this path.
- A pure Kotlin detector consumes validated observations and derives point, place-transition, and stay events. It uses great-circle distance, sample accuracy, and boundary hysteresis to suppress jitter.
- The repository stores the journal in private application storage, independently of `recordings/`. Writes are serialized and atomic; a failed write must not corrupt prior history.
- Filtered samples are source observations for this feature. Place transitions and dwell records are derived observations, not proof that a user crossed a boundary at an exact time.
- The recording uploader, audio export and Gemini pipeline do not consume journal data. A separately scheduled location worker follows the same explicit combined cloud consent as recordings and uploads only saved places and allowlisted stay summaries to Supabase. Legacy audio-only consent is not expanded automatically.

The repository uses `location_history/history.json` with Android `AtomicFile`. Version 2 stores named places, filtered points, legacy events and sustained-stay records. Version 1 is migrated without inventing visits from legacy DWELL events. Event records preserve the place label as observed, so deleting or changing a place does not rewrite the meaning of an older event. At most 20 places can be saved. Place changes require a stopped session.

## Detector defaults

| Setting | Value |
| --- | --- |
| Saved-place radius | 200 m default; 150–2,000 m allowed |
| Maximum accepted horizontal accuracy | 100 m |
| Maximum accepted sample age | 120 seconds |
| Boundary confirmation | Two confident observations at least 30 seconds apart |
| Entry test | Distance plus accuracy is within the radius |
| Exit test | Distance minus accuracy is beyond radius plus 25 m |
| Generic stay area | 100 m |
| Dwell duration | 10 minutes default; 5, 10, 20, or 30 minutes |
| Observation gap resetting inference | More than 180 seconds |
| Movement-point threshold | At least max(50 m, previous accuracy, current accuracy), after at least 30 seconds |
| Stationary point interval | Five minutes; an event can also retain its point |
| Implausible jump filter | Reject lower-bound travel speed above 80 m/s |
| Retention | Seven days, at most 2,000 points and 500 events |

The service requests high-accuracy location updates every 60 seconds with a 30-second minimum interval (`PRIORITY_HIGH_ACCURACY`), and fetches the immediate latest fix (`lastLocation`) upon session start to eliminate initial fix latency. It does not hold a wake lock, allowing the watch to enter ambient sleep while duty-cycling the GNSS receiver. Sessions have no app or provider duration limit. System termination, permission changes or reboot may stop collection; while the scope is **Always** the next opened HaptiLog screen resumes it. The former on-watch place editor and its separate current-location request have been retired.

These are observation filters, not a guarantee of physical accuracy. No route is interpolated through a gap, and timestamps describe accepted observations.

## Detection semantics

Invalid coordinates, non-finite values, poor accuracy, stale samples, and out-of-order observations are discarded. Decisions use each sample's measurement time rather than treating delayed delivery as fresh movement. Movement filtering reduces redundant persisted points; valid fixes still reach place and dwell detection even when no movement point is saved.

Entry requires a confidently inside observation. Exit requires a confidently outside observation beyond a hysteresis margin. Uncertain observations do not flip the last known state. Starting outside a place does not invent an exit. Repeated observations of the same state do not create duplicate transitions. Starting inside can establish an initial arrival observation; its timestamp is when presence was observed, not a reconstructed physical crossing.

A sustained stay can be detected without a saved place. The legacy detector emits one DWELL event per continuous stay; its label identifies the confirmed place state at event time, not proof that the whole duration was inside that named place. The new stay detector creates a stable ID after the common threshold and updates its last inside observation and monotonic duration. Two confident outside observations at least 30 seconds apart close a stay as moved. More than three minutes without inside evidence ends the stay even if uncertain fixes continue arriving; later inside observations must qualify a new stay. Short uncertainty is not credited to the duration. Stopping, restarting, or clearing history resets inference; a persisted active stay recovered after process death closes as interrupted without an invented exit time. UTC discontinuities retain monotonic duration but exclude cloud v1 upload and automatic chronological association.

## Failure and privacy behavior

Permission denial, unavailable location, and acquisition errors must leave voice recording usable. The location settings screen shows stopped or unavailable state instead of claiming that tracking is active. The service stops on disabled device location, permission revocation, blocked notifications, provider registration failure, or storage failure. Permission and notification availability are rechecked every 30 seconds; location-setting changes are also observed through a system broadcast. Service destruction removes update callbacks and drains already queued writes before publishing the stopped state. It uses `START_NOT_STICKY`: the platform never resumes collection on its own after process death or reboot. The app re-opens a session only from a visible screen, and only while the saved scope is **Always**, so a reboot resumes collection on the next app open rather than silently in the background.

Local storage retains up to seven days, 2,000 points, 500 legacy events and 500 stays with oldest-first eviction when limits are reached. Pruning runs on journal access, session start, and accepted observation writes; there is no scheduled local job promising deletion at the exact expiration time. Saved places persist separately until removed. Cloud stays expire at start + seven days and are hidden from reads immediately on expiry; a scheduled server job removes expired rows every day, so removal from storage can trail the expiry moment by up to a day. Cloud place definitions persist until deleted. Place definitions, local history, cloud stays and audio have distinct deletion controls. Cloud deletion uses epochs, deleted IDs and a full-purge cutoff to prevent offline re-upload; it does not erase local source history. No coordinates are added to diagnostics or crash reports.

## Acceptance and validation

Automated checks must cover:

- Accurate entry/exit, uncertain-boundary jitter, repeated observations, initial outside state, and multiple places.
- Generic dwell at the threshold, movement reset, gap reset, and no duplicate dwell.
- Stale, inaccurate, non-finite, out-of-order, and unrealistic observations where applicable.
- Movement-point filtering without starving transition/dwell detection.
- History persistence, bounded retention, atomic writes, and separate history/place deletion.
- Start/stop and denied-permission behavior, cleanup, and journal isolation from audio capture.

Device validation covers permission acceptance/denial, approximate-only permission, device location off, the screen off (ambient mode) during a session, notification stop, process death, and concurrent voice recording. In Issue #54, field emulation on Wear OS 5 verified that `PRIORITY_HIGH_ACCURACY` powers on the hardware GNSS receiver in ambient mode, while immediate `lastLocation` capture eliminates the 2-minute lag of batched fixes. Boundary enter/exit transitions and timeline rendering were verified across simulated walking paths. Real-world field notes and battery drain profiles are tracked in Issue #54.

## Platform references

- [Foreground location access](https://developer.android.com/develop/sensors-and-location/location/permissions): a location foreground service can keep access when the activity is no longer visible.
- [Foreground service start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start): start from the visible activity when using while-in-use permissions.
- [Geofence radius and accuracy guidance](https://developer.android.com/develop/sensors-and-location/location/geofencing): GPS area boundaries need a practical radius and accuracy tolerance. This feature evaluates circles from its session samples rather than registering background geofences.
