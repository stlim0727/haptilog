# HaptiLog Product Specification

## 1. Problem Statement
Smartwatch voice recorders require the user to look at the screen to verify recording status, which interrupts activities like running, cycling, hiking, or paying at a store. Furthermore, existing voice memos do not capture contextual data (location, altitude, speed) and lack intelligent classification.

## 2. Target Use Cases

### 1) Quick Expense Logging (간편 가계부)
- **Scenario**: Stepping out of a cafe with a coffee cup in hand.
- **Action**: Tap watch without looking. Feel the start click. Say *"아이스 라떼 5,000원"*. Tap again. Feel two stop clicks.
- **AI Output**: Category: Cafe/Food, Amount: 5,000 KRW, Merchant: Estimated based on GPS location.

### 2) Travel & Field Notes (여행 및 탐방)
- **Scenario**: Walking down an unfamiliar alley in Kyoto.
- **Action**: Record impressions of the scenery without stopping or taking out a smartphone.
- **AI Output**: Integrated with reverse geocoded place name, added to chronological travel timeline.

### 3) Running & Workout Memos (러닝 및 운동)
- **Scenario**: Mid-run pacing and body condition checks.
- **Action**: Quick voice memo during interval pauses.
- **AI Output**: Tagged with current running speed and altitude.

## 3. Interaction Design & Tactile Architecture
- **Single-Tap Recording (The Silent Disc)**: Wear OS Tile features a monolithic obsidian disc with a centered ruby dot. Tapping anywhere initiates recording instantly.
- **Living Pulse Haptic**: 1.2-second interval (~50 bpm resting physiological pulse) utilizing `PRIMITIVE_LOW_TICK` to stimulate wrist Pacinian corpuscles without microphone noise leakage.
- **Stop & Seal Confirmation**: Two-stage mechanical closure (`PRIMITIVE_CLICK` 0.7f followed 80ms later by 1.0f click) confirming audio is safely committed to disk.
- **Tactile Auto-Stop Warning**: At 150 seconds (30s before the 180s cutoff), 3 subtle consecutive taps warn the user to conclude their thought.
- **Visual Restraint (The Inevitable Form)**:
  - AMOLED True Black canvas (`#000000`) with no decorative emojis.
  - 1px Edge Luminance subtle breathing ring replacing disruptive expanding blob animations.
  - Clean typographic hierarchy and micro-index dots for semantic categorization.

## 4. Optional Location Journal

Users can explicitly start stay recording from watch settings, save named GPS places, and review filtered movement, arrival/departure, and sustained-stay records on the watch. This session continues independently of voice recording and displays an ongoing notification with a stop action. Location accuracy and sampling frequency limit event precision; this is a personal history feature, not a safety or emergency monitoring service.

The journal is off until the user starts it. Its data remains on the watch unless the user enables the combined cloud synchronization policy. Legacy audio-only consent does not authorize location synchronization. That optional path uploads saved places and stay summaries, not the raw movement trail, to Supabase. The portal provides place management, stay exploration and provisional frequent-place recommendations. Location synchronization does not start collection or send journal data to Gemini. It does not provide remote child tracking, family accounts or Bluetooth beacon scanning. The [location journal design](location-journal.md) and [synchronization contract](../architecture/location-stays-sync.md) define the supported scope, the current production state of the synchronization backend, and the acceptance criteria that still require device evidence.


## 5. Unified journal UX revision (2026-10-26)

The agreed implementation target combines voice recordings and observed stays in one **기록 / Journal** experience. This is a UI integration, not a conversion of stays into audio recordings. Voice and stay items share chronological cards, selection, date/search filters, calendar/map discovery and a detail region; each keeps its own source identity and applicable actions. A stay shows its observed place area, time range and confirmed observed duration. Missing observations never extend duration or prove current presence. Current saved-place matches are labelled as candidates, not historical assignments. Cross-midnight stays remain one source record while appearing on intersecting dates.

The revised watch settings expose **Location recording** with Off, Only when recording (default), and Also when not recording. A separate **Cloud sync** switch covers recordings, their attached locations, saved places and retained stay summaries. New combined consent explicitly includes completed local recordings and retained stays from the past seven days. Raw movement points stay local. Existing independent consents never automatically authorize this expanded scope. Collection and sync remain independent; downloaded place/threshold changes apply between sessions.

Location collection has no app-imposed time limit. Choosing Also when not recording explicitly starts the visible location service. Reducing scope or using the notification stop action stops it; notification stop returns the scope to Only when recording. The selected scope persists, but actual collection may stop after process death/reboot or permission, device-location, notification, storage or provider failures. Show the stopped state and offer explicit restart; do not restart automatically. Voice recording keeps its separate safety timeout.

The web target places sync, saved-place management, suggestions and cloud-data deletion in **장소 설정 / Place settings**, rather than a second stay timeline. Voice export controls identify their voice-only scope. Stay deletion is a separately confirmed permanent operation; audio trash behavior remains distinct. Location failures must leave voice records usable.

These decisions were reviewed twice by UX and product marketing before implementation. They describe the intended revision, not a deployment claim. See [the review and acceptance scenarios](2026-10-26-unified-journal-review.md) for scope and validation boundaries.
