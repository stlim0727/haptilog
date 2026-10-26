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

Users can explicitly start a location journal from watch settings and review sustained-stay records on the watch; one Start/Stop control and the stay list are the whole screen. This session continues independently of voice recording and displays an ongoing notification with a stop action. Location accuracy and sampling frequency limit event precision; this is a personal history feature, not a safety or emergency monitoring service.

The journal is off until the user starts it, and the system location permission is the only consent step for collecting it. Uploading follows the cloud sync switch: with cloud sync on, saved places and stay summaries go to Supabase beside the recordings, while the raw movement trail stays on the watch. There is no separate location consent screen. The portal owns place names, radii and the shared stay threshold, and provides stay exploration with provisional frequent-place recommendations. Turning on cloud sync never starts collection and never sends journal data to Gemini. It does not provide remote child tracking, family accounts or Bluetooth beacon scanning. The [location journal design](location-journal.md) and [synchronization contract](../architecture/location-stays-sync.md) define the supported scope, the current production state of the synchronization backend, and the acceptance criteria that still require device evidence.
