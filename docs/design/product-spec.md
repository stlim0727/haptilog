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

## 3. Interaction Design
- **Single-Tap Recording**: Wear OS Tile has a single, full-screen circular button. Tap to start, tap to stop.
- **Heartbeat Haptic**: Periodic dual pulse informs the user that their voice is being captured without needing an active display.
- **Auto-Stop Timeout**: Caps recordings at 180 seconds (3 minutes) to prevent accidental battery drain in case user forgets to stop.
