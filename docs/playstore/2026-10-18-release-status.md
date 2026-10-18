# Play Console preparation — 2026-10-18

Application: `com.haptilog.watch`; developer: Keepory Studio.

Saved in Play Console:

- Productivity category, `support@keepory.app`, and HTTPS portal website.
- English short/full description, existing feature graphic, and three actual Wear OS screenshots. Existing Korean listing retained.
- Advertising ID: not used.
- Data safety: added anonymous user ID, other user-generated content, and diagnostics to existing audio/location/crash disclosures. Added types are optional collection, non-ephemeral, with functionality/account-management or troubleshooting purposes as applicable. Crash purposes narrowed to analytics.
- Reviewer access instructions explain account-free local recording and how reviewers can pair their own watch/browser.
- Existing Wear OS production draft 1.1.1 (version code 8) saved with English/Korean release notes.
- Wear OS distribution review opt-in completed.

Publishing overview now lists 13 pending changes, including Wear OS production 1.1.1 full rollout and Wear OS form-factor participation. Quick checks are running. **No review submission was sent.** Managed publishing is off, so approval would lead to automatic publication.

Release validation has no blocking bundle errors. One warning recommends native debug symbols.

## Remaining dependency

**Superseded by the expanded [policy audit](2026-10-18-policy-audit.md):** Cloudflare authentication is not the only remaining issue. Age eligibility, Gemini paid-service linkage, in-app privacy/cloud disclosure and deletion failure handling also need resolution before release. Financial/health declarations and optional audio/location collection were further corrected during that audit.

The live privacy page omits support text and cloud identity and incorrectly implies local deletion removes cloud data. `web/public/privacy.html` has been corrected locally; `npm run build` passes. This correction must be deployed before review submission. Local Wrangler is not authenticated, and the repository has no Cloudflare deployment secrets. User was asked whether they can log into Cloudflare through the shared remote browser.

After deployment, verify the live page, recheck all 13 pending changes and quick checks, then submit the requested production release for Google review. Do not describe the app as published until Console confirms it.
