# Location journal

Issue: [#45](https://github.com/stlim0727/haptilog/issues/45). Design date: 2026-10-25.

## Purpose and scope

Create a useful personal location history on the watch: arrival and departure at saved places, sustained stays anywhere, and a filtered movement trail. A "beacon" is a named circular GPS place. Place and stay synchronization adds portal exploration and place management as specified in the [synchronization contract](../architecture/location-stays-sync.md), whose backend is applied in production and follows the existing cloud sync switch; on-device validation remains a release gate. Bluetooth beacon discovery, remote child tracking, family access, touch-event recording and alerts to other people are outside this implementation.

The journal is separate from voice recording. Starting it never starts the microphone. Stopping it does not interrupt an audio recording. Voice-recording location snapshots and immutable source files retain their existing behavior.

## User journey

1. Open **Settings → Location journal**. The initial state is stopped. The screen is the Start/Stop control and the recent stays, with one line explaining that place names are set in the portal.
2. Press **Start**. The system asks for precise location (and notification posting on API 33+); that prompt is the only consent step. The location foreground service starts while the activity is visible and displays an ongoing notification with a stop action. Approximate-only access prevents a journal session; voice recording remains available. A blocked notification shade does not stop a session — the service still posts its ongoing notification.
3. Places are defined in the portal. Downloaded places and the common stay threshold apply between sessions; the watch does not offer radius, threshold, or place-name editing. The radius represents a GPS area, not a precise building boundary, and the portal offers radii of 150, 200, 500, 1,000, and 2,000 m.
4. Review the recent stays below the control: one line each for how the observation ended, which named place contains it, the minutes observed, and the time range. Position uncertainty and missing samples can delay or prevent a stay.
5. Press **Stop** in the journal or notification. Sampling ends, and history remains available offline. A new session requires another explicit start. Local history rolls off after seven days; there is no watch-side clear action, and system app storage controls remain available for an immediate wipe.

## Architecture and data ownership

- A location-only foreground service owns one sampling session. No microphone permission or wake lock is needed for this path.
- A pure Kotlin detector consumes validated observations and derives point, place-transition, and stay events. It uses great-circle distance, sample accuracy, and boundary hysteresis to suppress jitter.
- The repository stores the journal in private application storage, independently of `recordings/`. Writes are serialized and atomic; a failed write must not corrupt prior history.
- Filtered samples are source observations for this feature. Place transitions and dwell records are derived observations, not proof that a user crossed a boundary at an exact time.
- The recording uploader, audio export and Gemini pipeline do not consume journal data. Sharing journal summaries follows the existing cloud sync switch: enabling cloud sync also lets the location worker upload saved places and allowlisted stay summaries to Supabase. There is no separate location consent, and nothing from the journal goes to Gemini.

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

The service requests high-accuracy location updates every 60 seconds with a 30-second minimum interval (`PRIORITY_HIGH_ACCURACY`), and fetches the immediate latest fix (`lastLocation`) upon session start to eliminate initial fix latency. It does not hold a wake lock, allowing the watch to enter ambient sleep while duty-cycling the GNSS receiver. A session automatically stops after eight hours, measured using a monotonic clock; the provider request also has an eight-hour duration limit. The user must start another session explicitly.

These are observation filters, not a guarantee of physical accuracy. No route is interpolated through a gap, and timestamps describe accepted observations.

## Detection semantics

Invalid coordinates, non-finite values, poor accuracy, stale samples, and out-of-order observations are discarded. Decisions use each sample's measurement time rather than treating delayed delivery as fresh movement. Movement filtering reduces redundant persisted points; valid fixes still reach place and dwell detection even when no movement point is saved.

Entry requires a confidently inside observation. Exit requires a confidently outside observation beyond a hysteresis margin. Uncertain observations do not flip the last known state. Starting outside a place does not invent an exit. Repeated observations of the same state do not create duplicate transitions. Starting inside can establish an initial arrival observation; its timestamp is when presence was observed, not a reconstructed physical crossing.

A sustained stay can be detected without a saved place. The legacy detector emits one DWELL event per continuous stay; its label identifies the confirmed place state at event time, not proof that the whole duration was inside that named place. The new stay detector creates a stable ID after the common threshold and updates its last inside observation and monotonic duration. Two confident outside observations at least 30 seconds apart close a stay as moved. More than three minutes without inside evidence ends the stay even if uncertain fixes continue arriving; later inside observations must qualify a new stay. Short uncertainty is not credited to the duration. Stopping, restarting, or clearing history resets inference; a persisted active stay recovered after process death closes as interrupted without an invented exit time. UTC discontinuities retain monotonic duration but exclude cloud v1 upload and automatic chronological association.

## Failure and privacy behavior

Permission denial, unavailable location, and acquisition errors must leave voice recording usable. The journal shows stopped or unavailable state instead of claiming that tracking is active. The service stops on disabled device location, permission revocation, provider registration failure, or storage failure. Permission and location-setting availability are rechecked every 30 seconds; location-setting changes are also observed through a system broadcast. A blocked notification shade is not a stop reason: the ongoing notification is still posted, and the session continues. Service destruction removes update callbacks and drains already queued writes before publishing the stopped state. It uses `START_NOT_STICKY`: process death and reboot do not silently restart collection.

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
