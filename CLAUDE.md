# Working rules for HaptiLog

HaptiLog is an eyes-free, haptic-assisted Wear OS voice logger with GPS context enrichment and Gemini AI processing.
Start with `AGENTS.md` for architecture and critical invariants.

- State assumptions and clarify material ambiguity before making large architectural shifts.
- Keep implementation simple and scoped to the request. No speculative features or unneeded libraries.
- Preserve local-first capture: audio files must be safely written and committed to local disk before sync.
- Prioritize battery and haptic performance: Wear OS has limited battery (~300–450mAh); avoid CPU-heavy background tasks.
- For Wear OS Android code, adhere to modern Jetpack Compose for Wear OS, Material 3 for Wear OS, and Android 14+ (API 34/35) foreground service permissions.
- For Supabase functions, use Deno / TypeScript edge functions with streaming / multimodal Gemini integration.
- Prefer configured MCP tools over ad-hoc scripts.
