# Location journal

Issue: [#45](https://github.com/stlim0727/haptilog/issues/45). Design date: 2026-10-25.

## Purpose and scope

Create a useful personal location history on the watch: arrival and departure at saved places, sustained stays anywhere, and a filtered movement trail. A "beacon" in this version is a named circular GPS place. Bluetooth beacon discovery, remote child tracking, family access, cloud synchronization, and alerts to other people are outside this implementation.

The journal is separate from voice recording. Starting it never starts the microphone. Stopping it does not interrupt an audio recording. Voice-recording location snapshots and immutable source files retain their existing behavior.

## User journey

1. Open **Settings → Location journal**. The initial state is stopped. Read the explanation that a session periodically collects location with the screen off, uses battery, and stores history only on this watch.
2. Press **Start** and grant precise location permission and enable notifications. The location foreground service starts while the activity is visible and displays an ongoing notification with a stop action. Approximate-only access or blocked journal notifications prevent a journal session; voice recording remains available. The journal links to app settings for permission and notification changes.
3. Save a named place from a fresh location or manually entered coordinates. Edit its name, center, or radius while stopped, or remove it. The radius represents a GPS area, not a precise building boundary. The watch offers radii of 150, 200, 500, 1,000, and 2,000 m.
4. Review the recent timeline: filtered location points, entry/exit for named places, and a dwell event when continuous reliable observations establish a sustained stay. Position uncertainty and missing samples can delay or prevent an event.
5. Press **Stop** in the journal or notification. Sampling ends, and history remains available offline. A new session requires another explicit start. Clear history and delete place definitions from the watch when no longer needed.

## Architecture and data ownership

- A location-only foreground service owns one sampling session. No microphone permission or wake lock is needed for this path.
- A pure Kotlin detector consumes validated observations and derives point, place-transition, and stay events. It uses great-circle distance, sample accuracy, and boundary hysteresis to suppress jitter.
- The repository stores the journal in private application storage, independently of `recordings/`. Writes are serialized and atomic; a failed write must not corrupt prior history.
- Filtered samples are source observations for this feature. Place transitions and dwell records are derived observations, not proof that a user crossed a boundary at an exact time.
- The recording uploader, audio export, Supabase schema, and Gemini pipeline do not consume journal data. Enabling cloud sync does not change this.

The repository uses `location_history/history.json` with Android `AtomicFile`. It stores named places, filtered points, and events. Event records preserve the place label as observed, so deleting or changing a place does not rewrite the meaning of an older event. At most 20 places can be saved. Place changes require a stopped session.

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

The service requests balanced-power location updates every 60 seconds, with a 30-second minimum interval and up to 120 seconds of batching. These are requests to the provider, not a delivery guarantee. It does not continuously request high-accuracy GPS or hold a wake lock. A session automatically stops after eight hours, measured using a monotonic clock; the provider request also has an eight-hour duration limit. The user must start another session explicitly. The separate **Use current location** place-editor action makes a bounded high-accuracy request to fill the center fields.

These are observation filters, not a guarantee of physical accuracy. No route is interpolated through a gap, and timestamps describe accepted observations.

## Detection semantics

Invalid coordinates, non-finite values, poor accuracy, stale samples, and out-of-order observations are discarded. Decisions use each sample's measurement time rather than treating delayed delivery as fresh movement. Movement filtering reduces redundant persisted points; valid fixes still reach place and dwell detection even when no movement point is saved.

Entry requires a confidently inside observation. Exit requires a confidently outside observation beyond a hysteresis margin. Uncertain observations do not flip the last known state. Starting outside a place does not invent an exit. Repeated observations of the same state do not create duplicate transitions. Starting inside can establish an initial arrival observation; its timestamp is when presence was observed, not a reconstructed physical crossing.

A sustained stay can be detected without a saved place. One dwell event is emitted per continuous stay. A saved-place label identifies the detector's confirmed place state at event time; the duration describes the generic stay area, not a separately measured duration entirely inside that named place. Leaving the stay area or a sufficiently long observation gap resets the candidate. Stopping, restarting, or clearing journal history resets inference state; unobserved time is never credited as dwell duration. Stopping the session does not manufacture place exits.

## Failure and privacy behavior

Permission denial, unavailable location, and acquisition errors must leave voice recording usable. The journal shows stopped or unavailable state instead of claiming that tracking is active. The service stops on disabled device location, permission revocation, blocked notifications, provider registration failure, or storage failure. Permission and notification availability are rechecked every 30 seconds; location-setting changes are also observed through a system broadcast. Service destruction removes update callbacks and drains already queued writes before publishing the stopped state. It uses `START_NOT_STICKY`: process death and reboot do not silently restart collection.

Storage retains up to seven days, 2,000 points, and 500 events with oldest-first eviction when limits are reached. Pruning runs on journal access, session start, and accepted observation writes; there is no scheduled background job promising deletion at the exact expiration time. Saved places persist separately until removed. Place definitions and history have distinct deletion controls. The user-facing disclosure and public privacy policy explain local retention and deletion. No coordinates are added to diagnostics or crash reports.

## Acceptance and validation

Automated checks must cover:

- Accurate entry/exit, uncertain-boundary jitter, repeated observations, initial outside state, and multiple places.
- Generic dwell at the threshold, movement reset, gap reset, and no duplicate dwell.
- Stale, inaccurate, non-finite, out-of-order, and unrealistic observations where applicable.
- Movement-point filtering without starving transition/dwell detection.
- History persistence, bounded retention, atomic writes, and separate history/place deletion.
- Start/stop and denied-permission behavior, cleanup, and journal isolation from audio capture.

Device validation must cover permission acceptance/denial, approximate-only permission, device location off, the screen off during a session, notification stop, process death, and concurrent voice recording. Walk across a saved place boundary and remain in one area to verify observed accuracy and latency. Measure battery use on a real watch; emulator tests cannot establish battery impact or GPS reliability.

## Platform references

- [Foreground location access](https://developer.android.com/develop/sensors-and-location/location/permissions): a location foreground service can keep access when the activity is no longer visible.
- [Foreground service start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start): start from the visible activity when using while-in-use permissions.
- [Geofence radius and accuracy guidance](https://developer.android.com/develop/sensors-and-location/location/geofencing): GPS area boundaries need a practical radius and accuracy tolerance. This feature evaluates circles from its session samples rather than registering background geofences.
