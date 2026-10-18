# HaptiLog policy audit — 2026-10-18

Scope: all 11 existing Play Console declarations, current watch/web/backend source, merged release manifest, public portal/privacy page, and public foreground-service demo. Review submission has **not** been sent. Console completion is not a compliance certification.

## GitHub follow-up

At the user's request, decisions are tracked in issues because Discussions are disabled:

- [#12 — Age eligibility and target audience decision](https://github.com/stlim0727/haptilog/issues/12)
- [#13 — Gemini billing, provider data terms and sharing declaration](https://github.com/stlim0727/haptilog/issues/13)
- [#14 — Retention/deletion operations and privacy disclosure deployment](https://github.com/stlim0727/haptilog/issues/14)
- [#15 — Storage deletion failure handling bug](https://github.com/stlim0727/haptilog/issues/15)

Each issue includes evidence, unresolved decisions or reproduction conditions, and completion criteria. Creating them does not resolve the release blockers or authorize a particular age/provider decision.

Subsequent decision: the [owner's #12 comment](https://github.com/stlim0727/haptilog/issues/12#issuecomment-6246654756) records approval of an **18+ first production release**. Codex acknowledged it and now treats the target-age choice as decided; implementation, Console changes, provider eligibility and release validation remain unverified. Statements below describing the age choice as pending reflect the original audit, not the latest decision.

## Declaration results

| Declaration | Finding and action |
| --- | --- |
| Advertising | Saved “no ads” matches source and dependencies. Retained. |
| Advertising ID | No `AD_ID` permission in the merged release manifest and no ad SDK. Prior “not used” declaration retained. |
| Government app | “No” matches this personal voice logger. Retained. |
| Financial features | “None” understated actual expense extraction, editable amount/currency/merchant and currency totals. Changed to **Other**, explicitly describing expense logging and excluding banking, loans, payments, investments and advice. Reopened form confirms saved value. This classification follows the broad money-management definition, not a claim that the app offers regulated lending. |
| Health | “None because there are no biometric sensors” was insufficient: the pipeline explicitly creates `WORKOUT` notes and the portal has a Workout category. Changed to **Activity and fitness**. Reopened form confirms saved value. No medical-device category selected. |
| Data safety | Added **purchase history** and **fitness info**, optional, non-ephemeral collection for app functionality. Corrected audio, approximate location and precise location from required to **optional**: capture can remain local and cloud sync defaults off. Prior additions for anonymous IDs, support text and diagnostics retained. Saved. “No sharing” still needs provider/billing verification; see blockers below. |
| Target audience | **Unresolved:** 13–15, 16–17 and 18+ are currently selected. Gemini Developer API terms restrict API clients directed at or likely accessed by under-18s. Asked user whether to restrict to adults or retain younger users and change AI approach. No answer assumed. No target change saved. |
| Content rating | Existing IARC completed result is Everyone/PEGI 3/Google Play 3+, “all other app types.” This is distinct from target audience/provider eligibility. No reason found in app-supplied content to fabricate an adult-content rating. Detailed historic questionnaire answers were not exposed by the summary; this is not a full validation of every historic IARC answer. |
| Privacy policy | Live public URL works, but omits support details and IDs and has imprecise deletion language. Local revision now distinguishes local deletion, portal Trash/permanent deletion, browser revocation and full cloud deletion requests. Also discloses purchase/workout content and provider-bound context. Not deployed. Watch still lacks an in-app privacy link/text and a clear cloud-upload disclosure. |
| Reviewer access | Earlier correction saved step-by-step account-free watch access and self-service watch/browser pairing. No personal account, purchase or developer-provided PIN required. Reviewer access itself has not received Google approval. |
| Foreground services | Microphone background audio input and location contextual capture are consistent with active user-started recording. Manifest has no background-location permission. Location refinement is bounded and canceled on stop; microphone FGS has an ongoing notification. Existing Drive demo is accessible in a clean unsigned browser. Local 20.60-second demo visually contains idle (2s), recording (6s), ongoing HaptiLog notification (16s) and stopped (20.5s). No re-recording was needed. |

## Release blockers and uncertainties

1. **Age eligibility:** adult target alone must not be treated as proof of compliance. There is no age declaration/verification or underage cloud restriction in watch, portal or the provider call. Decide adult-only operation with appropriate access controls, or change the AI service arrangement. Current launch is held pending that decision.
2. **Gemini billing/data terms:** the backend sends original audio plus the selected recording row, including location, timestamp and recording/account identifiers, to `generativelanguage.googleapis.com`. Readiness probes confirm configuration only; they cannot establish billing status. Paid and unpaid Gemini services have materially different data-use terms; unpaid services can use inputs/outputs for product improvement, and the terms prohibit submitting sensitive/confidential/personal information to unpaid services. EEA/CH/UK clients require paid services. Do not approve “no sharing” on the assumption that any AI API is automatically a service provider. Billing project linkage and deployment regions remain unverified.
3. **In-app privacy/disclosure:** watch Settings has no privacy policy link/text. “Cloud sync” directly enables upload without explaining that stored and new audio/location are sent to Supabase/Google for AI. The public policy and store description do not replace an in-app disclosure where one is required. These are app changes, not just Console answers; they will require a new AAB if implemented.
4. **Publish corrected privacy page:** local Wrangler is unauthenticated and GitHub has no Cloudflare deployment secrets. Cloudflare authentication/deployment is still required. Local policy was updated and the web build passes.
5. **Deletion acceptance:** current portal implements Trash and permanent deletion, and migrations authorize paired-session deletion of trashed audio. The frontend ignores Storage removal errors before deleting the database row, so it may leave orphan audio after a partial failure. Source review does not establish that every requested deletion completes. Fix and test failure handling before making unconditional deletion-success promises. Full cloud identity/report deletion uses support requests; no automatic 90-day retention claim was made. Live database configuration was not inspected because the configured Supabase MCP returned Unauthorized.

## Other updates and verification

- Korean description expanded to explain optional cloud/Gemini processing, expense/workout categorization and fallible AI results. English description updated consistently.
- English short description changed to “Wear OS voice memos with haptic feedback and optional location context.” The previous “Eyes-free” wording triggered the Console promotional-keyword checker.
- Cloud sync/crash reporting default-off behavior, separate support upload, bounded location scope and the merged release permissions were inspected in source.
- Public health probes: anonymous sign-ins **READY**, watch pairing **READY**, AI configuration **READY**. No user created, recording uploaded, or paid Gemini inference invoked for these probes.
- `npm run build` passes. No runtime code was changed during this audit. Local privacy/declaration documents changed; Console edits are saved pending review submission.

## Primary sources checked

- [Play Data safety definitions, optional collection, service-provider exception and data types](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Financial Services policy](https://support.google.com/googleplay/android-developer/answer/9876821?hl=en)
- [Financial feature declaration guidance](https://support.google.com/googleplay/android-developer/answer/13849271?hl=en-GB)
- [Health declaration guidance](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en)
- [Gemini Developer API terms: ages, regions, paid/unpaid data use](https://ai.google.dev/gemini-api/terms)
- [Play prominent disclosure guidance](https://support.google.com/googleplay/android-developer/answer/11150561?hl=en)
- [AI content policy: limited-scope productivity enhancements](https://support.google.com/googleplay/android-developer/answer/14094294?hl=en)

The financial/fitness categorization is an implementation-based interpretation of these definitions, not a Google policy ruling. Generic user speech alone does not imply declaring every imaginable sensitive data category; purchase/fitness were added because this app explicitly extracts and organizes those types.
