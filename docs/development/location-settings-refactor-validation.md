# Location settings refactor validation

Discussion: https://github.com/stlim0727/haptilog/discussions/93
Base: `ebbdab28aa3c8289df5131ea17bc00e7a7b745aa`.

## Behavior

- Collection scope: Off, Only when recording (default), or Also when not recording.
- Recording location requests, callbacks, foreground type and initial permission requests honor the scope. Switching Off cancels an outstanding snapshot without stopping audio or rewriting captured metadata.
- Only the third scope starts the location-only service. Reducing scope stops it; notification Stop returns scope to recording only.
- Location sessions/provider requests have no duration limit. Voice recording retains its separate safety timeout.
- One combined cloud policy covers recordings, attached location, places and retained seven-day stays. Raw movement points stay local. Existing independent consents never automatically authorize this expanded scope.
- Initial place import and server consent flags commit atomically. Legacy clients may revoke combined consent but cannot downgrade/re-enable it. Stale remote withdrawal responses cannot undo a newer explicit choice.

## Automated evidence

- Watch full unit suite and targeted scope/service/consent/sync regressions; debug APK build and lint.
- Supabase PGlite migration/RLS, Notion, account-recovery and location suites. Combined cases cover import rollback, recording/storage RLS and withdrawal, owner isolation, legacy regrant denial and a two-day stay.
- Web unit suite (51 tests), TypeScript/Vite build and 15 E2E scenarios covering combined withdrawal, drafts, conflicts, deletion, authorization, locales and narrow themes.
- Voice-enrich tests for legacy, combined and unknown policy versions; Deno check of the Edge entry point.

## Emulator evidence

Wear OS / Android 14, x86_64, 454×454 round display; APK includes matching native libraries.

- Off persisted after a force-stop/relaunch with `Active default network: none`.
- Korean settings checked at normal and 1.5× font scale. Options and short explanations scroll on the round screen.
- Also when not recording started only `LocationTrackingService`, foreground type `0x8` (location), with no microphone service.
- Process/reinstall interruption preserved the scope while showing actual collection as stopped. Explicit restart returned to active collection.
- Local screenshot/hierarchy evidence: `/tmp/haptilog-settings-evidence/`. Font/network settings were restored; the emulator started for this task was stopped.

## Rollout boundary

No production DB, Edge Function, website or Play Store deployment is included. Deploy the migration and compatible voice-enrich handler before the new watch build. The portal accepts legacy and combined server state. Real-device multi-hour battery/GPS validation remains separate from simulated elapsed-time tests.

## Follow-up: Always scope and auto-resume

The sentences above record the state that was validated at that time. Two parts were superseded after owner use, and the emulator evidence for them no longer describes the current build:

- The third scope is labelled **Always** / **항상** instead of "Also when not recording", because selecting it is now meant to be the only action.
- "Explicit restart returned to active collection" no longer applies. While the scope is Always, opening a HaptiLog screen resumes collection through `LocationTrackingService.ensureAlwaysSession`; the redundant start control was removed. The scope choice, `START_NOT_STICKY` and the notification Stop downgrade to Only when recording are unchanged, and no boot receiver was added, so collection after a reboot resumes on the next app open.

See the decision request and its follow-up in [discussion #93](https://github.com/stlim0727/haptilog/discussions/93).
