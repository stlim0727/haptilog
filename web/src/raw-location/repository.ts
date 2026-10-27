import { parseRawSample, type RawSample } from './domain.ts';
export type RawRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{data: unknown; error: unknown; status?: number}>;
export function rawRepository(owner: string, rpc: RawRpc) {
  async function call(action: string, payload: Record<string, unknown>) {
    const { data, error, status } = await rpc('raw_locations', { p_owner: owner, p_action: action, p_payload: payload });
    if (error) {
      const code = (error as {code?: string}).code;
      throw new Error(status === 401 || status === 403 || code === '42501' ? 'FORBIDDEN' : code === 'PGRST202' || code === '42883' ? 'UNAVAILABLE' : 'NETWORK');
    }
    if (!data || typeof data !== 'object') throw new Error('INVALID_RESPONSE');
    const result = data as Record<string, unknown>;
    if (typeof result.error === 'string') throw new Error(result.error);
    return result;
  }
  return {
    async read(range: { from: string; to: string }) {
      const samples: RawSample[] = [], seen = new Set<string>();
      let after: Record<string, unknown> = {}, enabled = false, epoch: number | undefined;
      // Bound total memory and reject looping/broken cursors instead of silently truncating.
      for (let page = 0; page < 30; page++) {
        const response = await call('read', { ...range, ...after });
        if (response.protocol_version !== 1 || !Array.isArray(response.samples) ||
          !Number.isSafeInteger(response.sync_epoch) || typeof response.has_more !== 'boolean' || typeof response.consent_enabled !== 'boolean') throw new Error('INVALID_RESPONSE');
        if (epoch !== undefined && epoch !== response.sync_epoch) throw new Error('EPOCH_CONFLICT');
        epoch = response.sync_epoch as number;
        const batch = response.samples.map(parseRawSample);
        for (const sample of batch) {
          if (seen.has(sample.id)) throw new Error('INVALID_RESPONSE');
          seen.add(sample.id); samples.push(sample);
        }
        enabled = response.consent_enabled;
        if (!response.has_more) return { samples, enabled, epoch };
        const last = batch.at(-1);
        if (!last) throw new Error('INVALID_RESPONSE');
        after = { after_time: last.observed_at, after_id: last.id };
      }
      throw new Error('TOO_MANY_SAMPLES');
    },
    async deleteAll() {
      const state = await call('status', {});
      if (!Number.isSafeInteger(state.sync_epoch)) throw new Error('INVALID_RESPONSE');
      return call('delete_all', { expected_epoch: state.sync_epoch });
    },
  };
}
