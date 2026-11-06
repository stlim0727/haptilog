import type posthogJs from "posthog-js";

export const DEFAULT_POSTHOG_HOST = "https://eu.posthog.com";

export interface PostHogLike {
  init(apiKey: string, options: Record<string, unknown>): void;
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  reset(): void;
  get_session_id(): string | number | null;
}

type Loader = () => Promise<PostHogLike>;

const defaultLoader: Loader = async () => {
  const module = await import("posthog-js");
  const client = module.default as typeof posthogJs;
  return {
    init: (apiKey, options) => client.init(apiKey, options),
    capture: (event, properties) => client.capture(event, properties),
    identify: (distinctId, properties) => client.identify(distinctId, properties),
    reset: () => client.reset(),
    get_session_id: () => client.get_session_id(),
  };
};

let client: PostHogLike | null = null;
let pending: Array<{ event: string; properties?: Record<string, unknown> }> = [];

export async function initAnalytics(
  apiKey: string | undefined,
  apiHost: string | undefined,
  loader: Loader = defaultLoader,
): Promise<void> {
  if (!apiKey) return;
  client = await loader();
  client.init(apiKey, {
    api_host: apiHost || DEFAULT_POSTHOG_HOST,
    capture_pageview: "history_change",
    persistence: "localStorage+cookie",
  });
  for (const queued of pending.splice(0)) client.capture(queued.event, queued.properties);
}

export function identifyAnalytics(userId: string, isAnonymous: boolean): void {
  client?.identify(userId, { is_anonymous: isAnonymous });
}

export function resetAnalytics(): void {
  client?.reset();
}

export function captureAnalytics(event: string, properties?: Record<string, unknown>): void {
  if (client) client.capture(event, properties);
  else pending.push({ event, properties });
}

export function analyticsSessionId(): string {
  const id = client?.get_session_id();
  return id === null || id === undefined ? "" : String(id);
}
