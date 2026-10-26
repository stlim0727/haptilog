import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../client.ts';
import { clearDismissals } from './dismissals.ts';
import { createLocationRepository, LocationError } from './repository.ts';
import type { Snapshot } from './repository.ts';

/** A single owner/session-scoped source for the feed, inspector and settings. */
export function useLocationJournal(owner: string | undefined, sessionId: string | undefined, isDemo: boolean) {
  const key = owner && sessionId && !isDemo ? `${owner}:${sessionId}` : '';
  const repository = useMemo(() => key && supabase && owner ? createLocationRepository(owner, (name, args) => supabase!.rpc(name, args)) : null, [key, owner]);
  const [value, setValue] = useState<{ key: string; snapshot: Snapshot | null; error: string; checkedAt: number | null }>({ key: '', snapshot: null, error: '', checkedAt: null });
  const [now, setNow] = useState(Date.now());
  const sequence = useRef(0), liveKey = useRef(key), blocked = useRef(false), operationId = useRef(0);
  liveKey.current = key;
  const load = useCallback(async () => {
    if (!repository || !key || blocked.current || liveKey.current !== key) return;
    const request = ++sequence.current;
    try {
      const snapshot = await repository.snapshot();
      if (liveKey.current !== key || request !== sequence.current) return;
      setValue({ key, snapshot, error: '', checkedAt: Date.now() });
      if (!snapshot.state.consent_enabled && owner) clearDismissals(localStorage, owner);
      return snapshot;
    } catch (e) {
      if (liveKey.current !== key || request !== sequence.current) return;
      const error = e instanceof LocationError ? e.code : 'NETWORK';
      if (error === 'FORBIDDEN' && owner) clearDismissals(localStorage, owner);
      setValue(previous => ({ key, snapshot: error === 'FORBIDDEN' ? null : previous.key === key ? previous.snapshot : null, error, checkedAt: previous.key === key ? previous.checkedAt : null }));
    }
  }, [repository, key, owner]);
  useEffect(() => {
    sequence.current++; operationId.current++; blocked.current = false;
    setValue({ key, snapshot: null, error: '', checkedAt: null }); void load();
    const refresh = () => { setNow(Date.now()); if (document.visibilityState === 'visible') void load(); };
    const timer = setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { sequence.current++; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [key, load]);
  const replace = useCallback((snapshot: Snapshot | null) => {
    if (liveKey.current !== key) return;
    sequence.current++;
    setValue(previous => ({ ...previous, key, snapshot }));
  }, [key]);
  const mutate = useCallback(async (operation: () => Promise<unknown>) => {
    if (liveKey.current !== key) throw new LocationError('FORBIDDEN');
    if (blocked.current) throw new LocationError('BUSY');
    const operationToken = ++operationId.current;
    blocked.current = true; sequence.current++;
    try { await operation(); }
    catch (e) {
      if (liveKey.current === key && e instanceof LocationError && e.code === 'FORBIDDEN') { replace(null); if (owner) clearDismissals(localStorage, owner); }
      throw e;
    } finally { if (operationToken === operationId.current) blocked.current = false; }
    if (liveKey.current !== key || operationToken !== operationId.current) return;
    return load();
  }, [load, replace, owner, key]);
  return { owner, repository, snapshot: value.key === key ? value.snapshot : null, error: value.key === key ? value.error : '', checkedAt: value.key === key ? value.checkedAt : null, now, load, replace, mutate };
}
export type LocationJournal = ReturnType<typeof useLocationJournal>;
