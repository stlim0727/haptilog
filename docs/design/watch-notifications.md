# Watch notification policy

HaptiLog reports events that explain an unexpected stop or require a user decision.
Notifications contain no transcript, location, or extracted personal data.

| Event | Delivery | Next action |
| --- | --- | --- |
| Recording active | Ongoing foreground notification | Open capture or **Stop and save** |
| Three-minute safety cutoff, audio and metadata saved | Recording update | Open recordings |
| Capture start/stop or metadata save failed | Recording update | Check recordings, microphone permission and storage |
| Sync enters `ACTION_REQUIRED` after a permanent error or six failed attempts | One update per recording | Open recordings, inspect status and retry |

Normal manual saves use the existing two haptic ticks. Network constraints and
retryable failures do not post notifications. AI completion does not post a
notification for every recording.

Recording updates are silent by default, with no extra vibration, to preserve
haptic meaning and avoid microphone interference during another capture. Users
can change notification delivery in **Settings → Notifications**, which opens
Android notification settings. The existing first-record permission request
includes notification permission on Android 13+. Denial never blocks capture or
sync; the ongoing foreground service still follows Android platform requirements.
See [Android notification guidance](https://developer.android.com/design/ui/mobile/guides/home-screen/notifications).

Repeating the same capture event replaces the previous capture notice. Sync
notices replace themselves per recording and clear on manual retry, successful
local deletion, or disabling sync. Tapping a notice opens the recording list and
never starts a recording. English and Korean text are provided.

Notification publication and cancellation are best effort. They cannot change
capture/save/sync results or remove source files. Auto-save notices are posted
only after audio finalization and metadata persistence both succeed.
