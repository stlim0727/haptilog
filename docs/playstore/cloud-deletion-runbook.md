# Cloud deletion operations

Applies to the current Supabase project. Public retention is until user deletion or a verified request; no automatic purge interval or response-time SLA is promised. Do not post customer identifiers or recordings in public issues.

For one recording, the portal claims a trashed row, removes audio using the Storage API, then calls `finalize_recording_purges`. The server checks current access, the claim, and authoritative Storage metadata absence. Failed or partial removal keeps metadata/authorization available for retry. A claim cannot be cleared/restored by normal clients. Never delete `storage.objects` with SQL: that only removes metadata, not the underlying file.

For a support request covering all data:

1. Record scope and an internal request reference. An emailed UUID, device serial or hash alone is not proof of control. Ask the requester to submit a fresh random challenge through the watch's authenticated **Report an issue** feature. Verify the challenge in `app_reports` and use that report's server-associated `user_id` as the scope. Never ask for pairing codes, passwords or bearer tokens.
2. Revoke portal connections and cloud consent, stop new processing, and explain that requests already sent to a provider may finish. Confirm the scope, including whether the anonymous identity is to be deleted. Verify access to the support inbox before treating this process as operational.
3. Use trusted administration to inventory recording audio and reports for exactly the verified owner. Claim recording purges, remove audio through the Storage API, verify absence and remove recording rows with associated derived data. Keep retry state until all files are accounted for. Recheck for concurrent/new records before finishing. Never remove identity first and strand files.
4. Remove the requested support/crash reports and consent records, revoke Auth sessions and then delete the anonymous Auth identity if requested. Retained access tokens are not invalidated merely by deleting a user; verify that current API access is rejected. Retain only the minimum internal completion evidence; do not copy recordings into tickets.
5. Record counts/results and tell the requester what was removed and any specific legal/provider retention limits. Local watch files and downloaded copies require deletion on those devices. Provider safety/abuse retention follows the applicable Google terms; do not promise immediate provider-log deletion.

The operator must confirm actual completion. This runbook is not evidence that the support inbox is monitored or that an individual request has been processed. No 30-day cleanup or seven-business-day guarantee has been introduced.
