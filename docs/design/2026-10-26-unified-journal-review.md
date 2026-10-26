# Unified voice and stay journal: two-round review

Date: 2026-10-26. Status: approved implementation target; not a deployment or completed-validation claim.

## Request and evidence

The requested revision simplifies background location setup and uploads, removes the requirement to stop collection before enabling uploads, and integrates stays with existing recording items throughout watch and web presentation. The user requested UX and marketing specialists and two review rounds before implementation.

Both reviewers inspected the repository's current code and product documentation. The relevant baseline is `LocationJournalActivity`, `LocationSyncActivity`, Korean/English `location_journal.xml` and `location_sync.xml`, and web `LocationLauncher`, `LocationWorkspace`, `StayTimeline` and the main recording experience. This was an expert code review, not user research or a live-device usability study.

## Round 1: independent findings

### UX designer

The watch settings expose separate location-journal and location-sync entries. The sync activation condition requires `!tracking`, forcing the user to stop collection. The web modal puts settings, places, suggestions, a date selector and a separate expandable stay timeline ahead of integration with recordings. This fragments both setup and routine browsing.

The designer proposed a single stay-recording entry, collection control at the top and inline web sync. Voice and stay items should share cards, detail selection, search, dates, calendar and map through a journal union. Consent should be short with expandable details; backfill remains off by default and duration remains observation-based.

### Product marketing expert

The current labels require users to understand capture and synchronization architecture before receiving the benefit. “위치 기록”, “장소·체류 동기화” and “체류와 내 장소” describe one experience as three separate products. Long technical disclosures and revision diagnostics obscure the core value: remembering where the user stayed and for how long.

The proposed product language is **기록 / Journal**, with **음성 / Voice** and **체류 / Stay** item types. The watch entry is **체류 기록 / Stay recording**, with **웹에도 표시 / Show on the web** as the independent optional upload choice. Primary controls should describe outcomes; technical details belong in secondary explanations. Uncertain location, duration, retention and upload status must remain truthful.

## Consolidated decision

1. One watch settings entry contains start/stop, actual collection state and optional web sync. Enabling or disabling sync is possible during collection and does not restart the location service. Explicit location consent remains independent of audio consent. Prior-history upload remains off by default.
2. A web discriminated journal item represents either voice or stay, preserving the source ID and type. Both use the existing chronological card and detail hierarchy on desktop and mobile. No fake recording, silent audio asset or fabricated enrichment is created.
3. Shared discovery includes All/Voice/Stays, voice intent filters and date/search/calendar/map behavior. A stay intersecting multiple local dates retains one source identity. Its duration is confirmed observed time, never `now - start`.
4. Place names derived from current saved-place definitions are labelled as current candidates. They are not historical assignments. Stale or interrupted observations do not prove current presence or a precise departure time.
5. **장소 설정 / Place settings** contains sync, saved places, suggestions and data controls. It does not duplicate the journal with a second stay timeline.
6. Voice retains playback, transcript, audio trash and voice export. Stay retains observation details, save-place and permanently confirmed deletion. CSV and Notion controls identify their voice-only scope.
7. Owner/session guards prevent stale asynchronous results from exposing the prior session's location data. Location RPC failures leave voice browsing available.
8. The existing capture, retention, authorization, consent, deletion epoch and source-data contracts remain intact. Downloaded place/threshold settings still apply at the next explicit collection session.

## Round 2: critical review before implementation

The UX designer approved the consolidated proposal with four conditions: consent state updates immediately and reflects external withdrawal; sync failure remains local to sync; pending withdrawal blocks re-enabling sync only, not capture; the eight-hour limit and next-session settings application are visible without wording that forces collection to stop.

The marketing expert approved the proposal with copy corrections: enabling sync must not imply an upload completed; current-place candidates need a visible qualification; confirmed duration must be labelled; permanent deletion must explain that synchronization will not restore the item; empty states distinguish no matching results from no confirmed stays. The claim that short passages are “not recorded” should be removed because raw location points can still be saved.

Implementation began only after both round-two verdicts. This document records the design decision; actual checks and remaining limitations belong in the implementation report.

## Copy guidance

| Context | Korean | English |
| --- | --- | --- |
| Shared list | 기록 | Journal |
| Type filters | 전체 · 음성 · 체류 | All · Voice · Stays |
| Watch entry | 체류 기록 | Stay recording |
| Value explanation | 머문 장소와 시간을 기록해요 | Record where you stayed and for how long |
| Start / stop | 체류 기록 시작 / 기록 중지 | Start stay recording / Stop recording |
| Optional sync | 웹에도 표시 | Show on the web |
| Explicit consent | 동의하고 동기화 켜기 | Agree and enable sync |
| Backfill | 이전에 기록한 체류도 포함 | Include previous stays |
| Candidate qualification | 현재 장소 설정 기준 | Based on current place settings |
| Duration | 확인된 체류 32분 | 32 min observed |
| Settings | 장소 설정 | Place settings |
| Export scope | 음성 CSV / 음성 내보내기 | Voice CSV / Export voice recordings |

Before consent, explain that saved places and stay coordinates, times and accuracy go to the server; stays expire seven days after their start; saved places remain until deleted; raw movement trails remain on the watch; journal data is not sent to Gemini. Explain the eight-hour collection limit and battery use before starting. Backfill covers only retained preceding-seven-day stays. Expanded details can hold implementation context without hiding the facts needed for consent.

After disabling sync, say future uploads stop and existing cloud records remain. Do not imply collection stopped or data was deleted. Show upload success, pending connection and consent activation as distinct states where the implementation has evidence for them.

## Acceptance scenarios

- First use: start collection with the required permission/notification flow, without enabling sync. The UI accurately says records remain on the watch.
- While collecting: enable sync with explicit consent and backfill off; collection continues uninterrupted. Disable sync and confirm collection still continues.
- Sync unavailable or withdrawal pending: local start/stop remains usable. Pending withdrawal explains when sync can be enabled again.
- Downloaded settings during collection: show that new places/thresholds apply next session; do not ask the user to stop in order to enable uploads.
- Unified browsing: a voice and a stay appear in the same chronological list and selection/detail region. Type, dates, search, calendar and map retain appropriate semantics.
- Cross-midnight stay: display on intersecting local dates with its original ID and without creating duplicate source records or inflating observed duration.
- Stale or interrupted stay: show last observation and truthful state, without extending duration or claiming present location.
- Place changes: a current candidate is qualified; changing a place does not rewrite source observation history.
- Deletion: stay removal requires permanent-deletion confirmation and does not delete audio. Voice trash retains its existing behavior. Offline resynchronization cannot resurrect a deleted stay.
- Expiry and session changes: expired stays disappear; switching or disconnecting the authorized owner clears location state and ignores stale results.
- Location failure: recordings remain browsable. Empty and error states describe recovery without suggesting audio is unavailable.
- Small screens and accessibility: shared cards, details and settings remain usable without horizontal overflow; controls have readable labels and keyboard focus behavior.

## Implementation boundary

This revision changes presentation and orchestration, not the location detector, audio capture format, Gemini pipeline or backend protocol. Historical place-assignment writes, new retention policy, remote tracking, Bluetooth beacons and family accounts are outside scope. Code checks, browser evidence and Wear OS checks must establish what is actually validated; the expert review alone does not prove runtime behavior, battery impact or production deployment.
