import { signInGoogle, watchAccount, type AccountWatch } from "./account";
import React, { Fragment, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock,
  FileText,
  Headphones,
  LayoutList,
  Link2,
  LoaderCircle,
  LogOut,
  Luggage,
  MapPin,
  Mic,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash,
  Trash2,
  Watch,
} from "lucide-react";
import { supabase, authCallbackFailed } from "./client";
import {
  DEMO_MODE_STORAGE_KEY,
  DEMO_SESSION_ID,
  DEMO_WATCH_ID,
  DEMO_OWNER_ID,
  isPreviewEnvironment,
  isDemoSessionActive,
  getStoredDemoRecords,
  saveStoredDemoRecords,
  clearDemoState,
  generateSampleRecordings,
  createDemoAudioBlob,
} from "./demo";
import { MobileWorkspace } from "./MobileWorkspace";
import { NotionExport } from "./NotionExport";
import { TranscriptEditor } from "./TranscriptEditor";
import { purgeRecordings } from "./purge";
import TimelineView, { CategoryBadge } from "./TimelineView";
import CalendarView from "./CalendarView";
import TimeSliderStrip from "./TimeSliderStrip";
import {
  csv,
  analysisFailure,
  expense,
  hasLocation,
  latest,
  localDate,
  money,
  processingState,
  taskItems,
  transcript,
  totals,
  toLocalDateString,
} from "./domain";
import type { Correction, Recording } from "./domain";
import { translations, getInitialLanguage } from "./i18n";
import type { Language, TranslationKeys } from "./i18n";
import "./style.css";
import "./mobile.css";

const RecordingMap = lazy(() => import("./RecordingMap"));
class MapBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p role="alert">Map unavailable. Your recordings are still in the list. Reload the page to try again.</p>
      : this.props.children;
  }
}

type Connection = {
  session_id: string;
  watch_id: string;
  owner_user_id: string;
  expires_at: string;
};
function Brand() {
  return (
    <a className="brand" href="/" aria-label="HaptiLog home">
      <span className="brand-symbol">
        <AudioLines size={23} />
      </span>
      haptilog<span className="brand-dot">.</span>
    </a>
  );
}
function App() {
  const [draftInProgress, setDraftInProgress] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 700px)").matches);
  useEffect(() => {
    // Rotating/resizing must not unmount an editor with unsaved changes.
    if (draftInProgress || mobileDetailOpen) return;
    const query = window.matchMedia("(max-width: 700px)");
    setMobile(query.matches);
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [draftInProgress, mobileDetailOpen]);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountWatches, setAccountWatches] = useState<AccountWatch[]>([]);
  const [addingWatch, setAddingWatch] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(authCallbackFailed
    ? translations[getInitialLanguage()].google_error : "");
  const [records, setRecords] = useState<Recording[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("all");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<string | null>(() => new URL(window.location.href).searchParams.get("recording"));
  const [search, setSearch] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "spatiotemporal" | "calendar">("list");
  const [stripDateKey, setStripDateKey] = useState<string>("ALL");
  const [lang, setLang] = useState<Language>(getInitialLanguage);
  const [isDemo, setIsDemo] = useState(isDemoSessionActive);
  const showTestLogin = isPreviewEnvironment();
  const t = translations[lang];
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  function toggleLang() {
    const next = lang === "en" ? "ko" : "en";
    setLang(next);
    localStorage.setItem("haptilog_language", next);
  }
  const generation = useRef(0);
  const authenticatedUser = useRef<string | null>(null);
  const refreshConnection = useCallback(async () => {
    if (isDemoSessionActive()) {
      setIsDemo(true);
      setConnection({
        session_id: DEMO_SESSION_ID,
        watch_id: DEMO_WATCH_ID,
        owner_user_id: DEMO_OWNER_ID,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
      const stored = getStoredDemoRecords() ?? generateSampleRecordings();
      saveStoredDemoRecords(stored);
      setRecords(stored);
      setLoaded(true);
      setChecking(false);
      setLastChecked(new Date());
      return;
    }
    if (!supabase) {
      setChecking(false);
      return;
    }
    const epoch = generation.current;
    const {
      data: { session }, error: sessionError,
    } = await supabase.auth.getSession();
    if (epoch !== generation.current) return;
    if (sessionError) setError("Could not complete sign-in. Try Google sign-in again.");
    const google = session && !session.user.is_anonymous && session.user.identities?.some(i => i.provider === "google");
    setAccountEmail(google ? session.user.email ?? "Google" : null);
    if (!session) {
      setChecking(false);
      return;
    }
    let watches: AccountWatch[] = [];
    if (google) {
      try {
        watches = await watchAccount("list");
        if (epoch !== generation.current) return;
        setAccountWatches(watches);
      }
      catch { setError("Could not load account connections. Try again."); }
    }
    let { data, error } = await supabase
      .from("portal_connections")
      .select("session_id,watch_id,owner_user_id,expires_at")
      .eq("browser_user_id", session.user.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (epoch !== generation.current) return;
    if (!error && !data && watches.length) {
      try {
        await watchAccount("restore", watches[0].owner_user_id);
        const result = await supabase.from("portal_connections")
          .select("session_id,watch_id,owner_user_id,expires_at")
          .eq("browser_user_id", session.user.id).is("revoked_at", null)
          .gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
        data = result.data; error = result.error;
      } catch { setError("Could not restore your watch. Open Account to try again."); }
    }
    if (epoch !== generation.current) return;
    if (error) setError("Could not check your connection. Try again.");
    setConnection(data);
    setChecking(false);
  }, []);
  useEffect(() => {
    void refreshConnection();
  }, [refreshConnection]);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const userId = session?.user.id ?? null;
      const identityChanged = authenticatedUser.current !== userId;
      authenticatedUser.current = userId;
      if (event === "SIGNED_OUT" || identityChanged) {
        generation.current++;
        setConnection(null);
        setRecords([]);
        setLoaded(false);
        setAccountEmail(null);
        setAccountWatches([]);
        setAccountOpen(false);
        setAddingWatch(false);
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        // Defer Supabase calls until outside the Auth callback lock.
        setTimeout(() => { void refreshConnection(); }, 0);
      }
    });
    return () => subscription.unsubscribe();
  }, [refreshConnection]);
  const load = useCallback(async () => {
    if (isDemoSessionActive()) {
      const stored = getStoredDemoRecords();
      if (stored) setRecords(stored);
      setLoaded(true);
      setLastChecked(new Date());
      return;
    }
    if (!supabase || !connection) return;
    const epoch = generation.current;
    const { data: grants, error: grantError } = await supabase
      .from("portal_connections")
      .select("session_id")
      .eq("session_id", connection.session_id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (epoch !== generation.current) return;
    if (grantError) {
      setError("Could not refresh. Your last loaded recordings are shown.");
      return;
    }
    if (!grants) {
      generation.current++;
      setRecords([]);
      setConnection(null);
      setError(
        "Browser access expired or was revoked. Pair again from your watch.",
      );
      return;
    }
    const { data, error } = await supabase
      .from("recordings")
      .select(
        "*,voice_enrichments(*),enrichment_status(state,lease_until,error_code),recording_corrections(*)",
      )
      .eq("user_id", connection.owner_user_id)
      .order("recorded_at", { ascending: false })
      .limit(500);
    if (epoch !== generation.current) return;
    if (error) {
      setError("Could not refresh recordings. Try again when connected.");
      return;
    }
    setRecords((data ?? []) as Recording[]);
    setLoaded(true);
    setLastChecked(new Date());
    setTruncated(data?.length === 500);
  }, [connection]);
  useEffect(() => {
    if (!connection) return;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [connection, load]);
  async function pair(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }
      const { error } = await supabase.functions.invoke("watch-access", {
        body: { action: "redeem", code },
      });
      if (error) throw error;
      setCode("");
      generation.current++;
      setRecords([]); setLoaded(false); setSelected(null);
      setAddingWatch(false);
      await refreshConnection();
    } catch {
      setError(
        "Could not connect. Check the code on your watch. If you tried several times, wait before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  function loginWithSampleData() {
    setBusy(true);
    setError("");
    try {
      const samples = generateSampleRecordings();
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, "true");
      saveStoredDemoRecords(samples);
      setIsDemo(true);
      setConnection({
        session_id: DEMO_SESSION_ID,
        watch_id: DEMO_WATCH_ID,
        owner_user_id: DEMO_OWNER_ID,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
      setRecords(samples);
      setLoaded(true);
      setChecking(false);
      setLastChecked(new Date());
      setSelected(null);
    } catch {
      setError(
        lang === "ko"
          ? "샘플 데이터를 생성하지 못했습니다."
          : "Could not initialize sample recordings.",
      );
    } finally {
      setBusy(false);
    }
  }

  function resetSampleData() {
    const samples = generateSampleRecordings();
    saveStoredDemoRecords(samples);
    setRecords(samples);
    setSelected(null);
    setToast({
      message:
        lang === "ko"
          ? "샘플 데이터를 초기화했습니다."
          : "Sample recordings reset.",
    });
  }

  async function googleLogin(existingAccount = false) {
    setBusy(true); setError("");
    try {
      if (existingAccount && supabase) {
        const { error } = await supabase.auth.signInWithOAuth({ provider: "google",
          options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: "select_account" } } });
        if (error) throw error;
      } else await signInGoogle();
    } catch { setError(t.google_error); }
    finally { setBusy(false); }
  }

  async function accountOperation(operation: "save" | "restore" | "unlink", owner?: string) {
    if (draftInProgress || busy) return;
    if (operation === "unlink" && !window.confirm(t.unlink_confirm)) return;
    setBusy(true); setError("");
    // Unmount players/editors and invalidate in-flight reads when switching owners.
    generation.current++; setRecords([]); setLoaded(false); setSelected(null);
    setConnection(null);
    try {
      setAccountWatches(await watchAccount(operation, owner));
      await refreshConnection();
      setAddingWatch(false);
    } catch { setError(t.account_error); await refreshConnection(); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    if (isDemo) {
      clearDemoState();
      setIsDemo(false);
      generation.current++;
      setConnection(null);
      setRecords([]);
      setLoaded(false);
      setSelected(null);
      return;
    }
    if (!supabase || !connection) return;
    setBusy(true);
    setError("");
    const { error } = await supabase
      .from("portal_connections")
      .update({ revoked_at: new Date().toISOString() })
      .eq("session_id", connection.session_id);
    if (error) {
      setError(
        "Could not revoke browser access. Connect to the internet and try again.",
      );
      setBusy(false);
      return;
    }
    generation.current++;
    setConnection(null);
    setRecords([]);
    setLoaded(false);
    await supabase.auth.signOut({ scope: "local" });
    setBusy(false);
  }
  const [toast, setToast] = useState<{ message: string; undoId?: string } | null>(null);
  const pendingTrashUpdates = useRef<Map<string, Promise<unknown>>>(new Map());

  async function moveToTrash(id: string) {
    const now = new Date().toISOString();
    setRecords((prev) => {
      const updated = prev.map((rec) =>
        rec.id === id ? { ...rec, deleted_at: now } : rec,
      );
      if (isDemo) saveStoredDemoRecords(updated);
      return updated;
    });
    setToast({ message: t.toast_moved_trash, undoId: id });
    if (isDemo) return;
    if (!supabase) return;
    const writePromise = (async () => {
      const { error } = await supabase
        .from("recordings")
        .update({ deleted_at: now })
        .eq("id", id);
      if (error) {
        setError(t.save_error);
        void load();
      }
    })();
    pendingTrashUpdates.current.set(id, writePromise);
    await writePromise;
    pendingTrashUpdates.current.delete(id);
  }

  async function restoreRecording(id: string) {
    setRecords((prev) => {
      const updated = prev.map((rec) =>
        rec.id === id ? { ...rec, deleted_at: null } : rec,
      );
      if (isDemo) saveStoredDemoRecords(updated);
      return updated;
    });
    setToast(null);
    if (isDemo) return;
    if (!supabase) return;
    const pending = pendingTrashUpdates.current.get(id);
    if (pending) await pending.catch(() => {});
    const { data, error } = await supabase
      .from("recordings")
      .update({ deleted_at: null })
      .eq("id", id)
      .is("purging_at", null)
      .select("id");
    if (error || !data?.length) {
      setError(t.save_error);
      void load();
    }
  }

  async function completePurge(ids: string[]) {
    if (!supabase) return;
    try {
      const deleted = new Set(await purgeRecordings(supabase, ids));
      setRecords((prev) => prev.filter((rec) => !deleted.has(rec.id)));
      if (selected && deleted.has(selected)) setSelected(null);
      if (deleted.size !== ids.length) setError(t.save_error);
    } catch {
      setError(t.save_error);
    } finally {
      // Refresh claims and partial results even after a lost response.
      void load();
    }
  }

  async function deletePermanently(id: string) {
    if (!window.confirm(t.confirm_delete)) return;
    if (isDemo) {
      setRecords((prev) => {
        const updated = prev.filter((rec) => rec.id !== id);
        saveStoredDemoRecords(updated);
        return updated;
      });
      if (selected === id) setSelected(null);
      return;
    }
    await completePurge([id]);
  }

  async function emptyTrash() {
    const ids = records.filter((r) => r.deleted_at).map((r) => r.id);
    if (!ids.length || !window.confirm(t.confirm_empty_trash(ids.length))) return;
    if (isDemo) {
      setRecords((prev) => {
        const updated = prev.filter((r) => !r.deleted_at);
        saveStoredDemoRecords(updated);
        return updated;
      });
      return;
    }
    await completePurge(ids);
  }

  const isTrashView = category === "Trash";
  const trashedCount = records.filter((r) => Boolean(r.deleted_at)).length;
  const activeRecords = records.filter((r) => !r.deleted_at);

  const filtered = records.filter((r) => {
    const isTrashed = Boolean(r.deleted_at);
    if (isTrashView !== isTrashed) return false;
    const e = latest(r);
    const day = localDate(r.recorded_at),
      today = toLocalDateString();
    return (
      (date === "all" ||
        (date === "today"
          ? day === today
          : day.slice(0, 7) === today.slice(0, 7))) &&
      (isTrashView || category === "All" || e?.intent_type === category.toUpperCase()) &&
      (!search ||
        `${e?.summary ?? ""} ${transcript(r)}`
          .toLowerCase()
          .includes(search.toLowerCase()))
    );
  });
  const active = filtered.find((r) => r.id === selected) ?? filtered[0];
  const spatioFiltered = stripDateKey === "ALL"
    ? filtered
    : filtered.filter((r) => localDate(r.recorded_at) === stripDateKey);
  const dateFilteredActiveRecords = activeRecords.filter((r) => {
    const day = localDate(r.recorded_at),
      today = toLocalDateString();
    return (
      date === "all" ||
      (date === "today"
        ? day === today
        : day.slice(0, 7) === today.slice(0, 7))
    );
  });
  const totalSeconds = dateFilteredActiveRecords.reduce(
    (n, r) => n + (r.duration_seconds ?? 0),
    0,
  );
  const summary = totals(dateFilteredActiveRecords);
  const ready = dateFilteredActiveRecords.filter(
    (r) => processingState(r) === "Ready",
  ).length;
  function exportCsv() {
    const url = URL.createObjectURL(
      new Blob([csv(filtered)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `haptilog-${toLocalDateString()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <header className="topbar">
        <Brand />
        <span className="top-label">{t.brand_slogan}</span>
        <div className="top-right">
          <button
            className="lang-switch-btn"
            onClick={toggleLang}
            title={lang === "en" ? "한국어로 변경" : "Switch to English"}
            aria-label="Toggle language"
          >
            {lang === "en" ? "KO" : "EN"}
          </button>
          {connection ? (
            <>
              <span className="watch-label">
                <Watch size={15} /> {connection.watch_id}
              </span>
              <button
                className="icon-button"
                title={t.disconnect}
                aria-label={t.disconnect}
                disabled={busy}
                onClick={disconnect}
              >
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <span className="watch-label">
              <Watch size={15} /> {t.wrist_promise}
            </span>
          )}
        </div>
      </header>
      {supabase && <section className="account-bar" aria-label={t.account}>
        <button onClick={() => setAccountOpen(!accountOpen)} aria-expanded={accountOpen}>{t.account}</button>
        {!accountEmail && <button disabled={busy || draftInProgress} onClick={() => googleLogin()}>{t.google_signin}</button>}
        {accountOpen && <div className="account-panel">
          {accountEmail ? <>
            <p>{t.signed_in_as}: {accountEmail}</p>
            {connection && (accountWatches.some(w => w.owner_user_id === connection.owner_user_id)
              ? <p role="status">{t.account_saved}</p>
              : <button disabled={busy || draftInProgress} onClick={() => accountOperation("save")}>{t.save_account}</button>)}
            {accountWatches.map(w => <div className="account-watch" key={w.owner_user_id}>
              <button disabled={busy || draftInProgress} onClick={() => accountOperation("restore", w.owner_user_id)}>{w.watch_id}</button>
              <button disabled={busy || draftInProgress} onClick={() => accountOperation("unlink", w.owner_user_id)} aria-label={`${t.unlink_watch} ${w.watch_id}`}>{t.unlink_watch}</button>
            </div>)}
            <button disabled={busy || draftInProgress} onClick={() => { setAddingWatch(true); setAccountOpen(false); }}>{t.add_watch}</button>
            <button disabled={busy || draftInProgress} onClick={async () => {
              if (!supabase) return;
              const { error } = await supabase.auth.signOut({ scope: "local" });
              if (error) setError(t.account_error);
            }}>{t.sign_out}</button>
            <p>{t.signout_help}</p>
          </> : <>
            <p>{t.recovery_help}</p>
            <button disabled={busy || draftInProgress} onClick={() => googleLogin(true)}>{t.google_existing}</button>
            <p>{t.google_existing_help}</p>
          </>}
          <p>{t.recovery_limit}</p>
        </div>}
      </section>}
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}
      {toast && (
        <div className="toast-banner" role="status">
          <span>{toast.message}</span>
          <div className="toast-actions">
            {toast.undoId && (
              <button
                className="undo-button"
                onClick={() => restoreRecording(toast.undoId!)}
              >
                {t.undo}
              </button>
            )}
            <button
              className="dismiss-button"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {!mobile && connection && !accountEmail && <p className="recovery-notice">{t.recovery_help}</p>}
      {checking ? (
        <main className="loading">
          <LoaderCircle className="spin" /> {t.opening_space}
        </main>
      ) : !connection || addingWatch ? (
        <main className="pair-page">
          <section className="pair-story">
            <span className="eyebrow">
              <span className="red-dot" /> {t.from_wrist}
            </span>
            <h1>
              {t.hero_title.split("\n").map((line, i) => (
                <Fragment key={i}>
                  {i > 0 && <br />}
                  {line}
                </Fragment>
              ))}
            </h1>
            <p>
              {t.hero_subtitle.split("\n").map((line, i) => (
                <Fragment key={i}>
                  {i > 0 && <br />}
                  {line}
                </Fragment>
              ))}
            </p>
            <div className="voice-card">
              <span className="voice-glyph">
                <AudioLines size={38} />
              </span>
              <div>
                <span className="eyebrow">{t.capture_moment}</span>
                <p>{t.review_pace}</p>
              </div>
              <span className="voice-line" />
            </div>
            <div className="pair-promises">
              <span>
                <Headphones size={16} /> {t.promise_audio}
              </span>
              <span>
                <ShieldCheck size={16} /> {t.promise_browser}
              </span>
            </div>
          </section>
          <section className="pair-card">
            <span className="step-label">{t.step_label}</span>
            <h2>{addingWatch ? t.add_watch : t.connect_title}</h2>
            {addingWatch && connection && <button onClick={() => setAddingWatch(false)}>{t.cancel_pair}</button>}
            {accountEmail && <p>{t.account_pair_help}</p>}
            <p>{t.connect_desc}</p>
            {!supabase ? (
              <div className="setup-note">
                <CircleHelp size={20} />
                <div>
                  <strong>{t.portal_setup_ready}</strong>
                  <p>{t.portal_setup_desc}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={pair}>
                <label htmlFor="code">
                  {t.access_code} <span>{t.expires_in}</span>
                </label>
                <input
                  id="code"
                  className="code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000 000"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                  pattern="[0-9]{6}"
                  maxLength={6}
                />
                <button className="primary-button" disabled={busy}>
                  {busy ? t.connecting : t.connect_btn}
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
            {showTestLogin && (
              <div className="preview-test-card" data-testid="preview-test-login-card">
                <div className="preview-divider">
                  <span>{t.preview_divider_or}</span>
                </div>
                <div className="preview-test-header">
                  <span className="preview-test-badge">
                    <Sparkles size={12} />
                    {t.preview_test_badge}
                  </span>
                </div>
                <p className="preview-test-desc">
                  {t.preview_test_desc}
                </p>
                <button
                  type="button"
                  className="test-login-btn"
                  data-testid="preview-test-login-button"
                  onClick={loginWithSampleData}
                  disabled={busy}
                >
                  <Sparkles size={15} />
                  <span>{t.preview_test_login_btn}</span>
                </button>
              </div>
            )}
            <div className="pair-footnote">
              <Link2 size={15} />
              <span>
                {t.pair_footnote.split("\n").map((line, i) => (
                  <Fragment key={i}>
                    {i > 0 && <br />}
                    {line}
                  </Fragment>
                ))}
              </span>
            </div>
          </section>
        </main>
      ) : mobile ? (
        <MobileWorkspace key={connection.session_id} records={records} filtered={filtered} loaded={loaded} truncated={truncated}
          date={date} setDate={setDate} category={category} setCategory={setCategory} search={search} setSearch={setSearch}
          summary={summary} count={dateFilteredActiveRecords.length} seconds={totalSeconds} lastChecked={lastChecked}
          lang={lang} t={t} busy={busy} onDraftChange={setDraftInProgress} onDetailChange={setMobileDetailOpen} refresh={() => { setError(""); void load(); }} exportCsv={exportCsv} disconnect={disconnect} emptyTrash={emptyTrash}
          isDemo={isDemo} onResetDemo={resetSampleData}
          renderInspector={(recording, onDirtyChange) => <Inspector key={`${recording.id}:${connection.session_id}`} recording={recording}
            onChange={load} onError={setError} onMoveToTrash={moveToTrash} onRestore={restoreRecording} onDeletePermanently={deletePermanently}
            lang={lang} t={t} onDirtyChange={onDirtyChange} isDemo={isDemo} />} />
      ) : (
        <main className="workspace">
          {isDemo && (
            <div className="demo-mode-banner" role="status" aria-label="Demo mode notice">
              <div className="demo-banner-content">
                <span className="demo-banner-badge">
                  <Sparkles size={12} />
                  {t.preview_banner_badge}
                </span>
                <span className="demo-banner-text">{t.preview_banner_text}</span>
              </div>
              <div className="demo-banner-actions">
                <button
                  type="button"
                  className="demo-reset-btn"
                  onClick={resetSampleData}
                  title={t.preview_banner_reset}
                >
                  <RotateCcw size={13} />
                  {t.preview_banner_reset}
                </button>
                <button
                  type="button"
                  className="demo-exit-btn"
                  onClick={disconnect}
                  title={t.preview_banner_exit}
                >
                  <LogOut size={13} />
                  {t.preview_banner_exit}
                </button>
              </div>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">{t.evening_review}</span>
              <h1>
                {t.workspace_title}
              </h1>
              <p>{t.workspace_subtitle}</p>
            </div>
            <div className="heading-actions">
              <label className="date-picker">
                <CalendarDays size={16} />
                <span className="sr-only">Date range</span>
                <select value={date} onChange={(e) => setDate(e.target.value)}>
                  <option value="all">{t.all_time}</option>
                  <option value="today">{t.today}</option>
                  <option value="month">{t.this_month}</option>
                </select>
              </label>
              <button
                className="secondary-button"
                onClick={exportCsv}
                disabled={!filtered.length}
              >
                <ArrowDownToLine size={16} />
                {t.export_csv}
              </button>
            </div>
          </div>
          {!isTrashView && <NotionExport key={connection.session_id} records={filtered} ko={lang === "ko"} />}
          <div className="metrics">
            <section>
              <span className="metric-label">{t.spending_label}</span>
              <strong>
                {Object.keys(summary.grouped).length
                  ? Object.entries(summary.grouped).map(([c, n]) => (
                      <span key={c}>{money(n, c)} </span>
                    ))
                  : "—"}
              </strong>
              <small>
                {summary.incomplete
                  ? t.spending_incomplete(summary.incomplete)
                  : t.spending_count}
              </small>
            </section>
            <section>
              <span className="metric-label">{t.moments_label}</span>
              <strong>
                {dateFilteredActiveRecords.length}
                <span className="metric-unit"> {t.recordings_unit}</span>
              </strong>
              <small>
                {lang === "ko"
                  ? `${Math.floor(totalSeconds / 60)}분 ${totalSeconds % 60}초 녹음됨`
                  : `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s captured`}
              </small>
            </section>
            <section>
              <span className="metric-label">{t.ready_label}</span>
              <strong>
                {ready}
                <span className="metric-unit"> / {dateFilteredActiveRecords.length}</span>
              </strong>
              <small>
                <span className="status-dot" />{" "}
                {t.awaiting_label(dateFilteredActiveRecords.length - ready)}
              </small>
            </section>
          </div>
          <div className="sync-note">
            <Activity size={14} />
            <span>
              {lastChecked
                ? t.cloud_checked(lastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
                : t.checking_cloud}{" "}
              · {t.watch_queue_unknown}
            </span>
            <button
              onClick={() => {
                setError("");
                void load();
              }}
              aria-label="Refresh recordings"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {truncated && (
            <p className="limit-note">
              {t.showing_limit_note}
            </p>
          )}
          <div className="view-switcher-bar">
            <div className="view-switcher-group" role="tablist" aria-label="View mode">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "list"}
                className={viewMode === "list" ? "active" : ""}
                onClick={() => setViewMode("list")}
              >
                <LayoutList size={14} /> {t.view_list}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "spatiotemporal"}
                className={viewMode === "spatiotemporal" ? "active" : ""}
                onClick={() => {
                  if (category === "Trash") setCategory("All");
                  setViewMode("spatiotemporal");
                }}
              >
                <Clock size={14} /> {t.view_timeline_map}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "calendar"}
                className={viewMode === "calendar" ? "active" : ""}
                onClick={() => {
                  if (viewMode === "calendar") return;
                  if (category === "Trash") setCategory("All");
                  setSelected(null);
                  setViewMode("calendar");
                }}
              >
                <CalendarDays size={14} /> {t.view_calendar}
              </button>
            </div>
          </div>

          <div className="global-filters-bar">
            <div
              className="tabs"
              role="group"
              aria-label="Recording category"
            >
              {(
                [
                  ["All", t.all_cat, null],
                  ["Expense", t.expense_cat, Receipt],
                  ["Travel", t.travel_cat, Luggage],
                  ["Workout", t.workout_cat, Activity],
                  ["Memo", t.memo_cat, FileText],
                ] as const
              ).map(([c, label, Icon]) => (
                <button
                  key={c}
                  className={category === c ? "active" : ""}
                  onClick={() => setCategory(c)}
                >
                  {Icon && <Icon size={12} />} {label}
                </button>
              ))}
              <button
                className={`trash-tab ${category === "Trash" ? "active" : ""}`}
                onClick={() => {
                  setCategory("Trash");
                  setViewMode("list");
                }}
                aria-label="View trash"
              >
                <Trash2 size={13} /> {t.trash} {trashedCount > 0 ? `(${trashedCount})` : ""}
              </button>
            </div>
            <input
              className="search"
              type="search"
              aria-label="Search transcripts"
              placeholder={t.search_placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {category === "Trash" && viewMode !== "list" && (
            <div className="trash-warning-banner">
              <span>{t.viewing_trash_warning}</span>
              <button type="button" onClick={() => setCategory("All")}>
                {t.exit_trash}
              </button>
            </div>
          )}

          {viewMode === "spatiotemporal" ? (
            <div className="spatiotemporal-view">
              <TimeSliderStrip
                recordings={filtered}
                selectedDateKey={stripDateKey}
                onSelectDate={setStripDateKey}
                t={t}
                lang={lang}
              />
              <div className="spatiotemporal-grid">
                <div className="timeline-pane">
                  <TimelineView
                    recordings={spatioFiltered}
                    selectedId={active?.id ?? null}
                    onSelect={(id, revealDetails) => {
                      setSelected(id);
                      if (revealDetails) {
                        requestAnimationFrame(() =>
                          document.querySelector(".inspector")?.scrollIntoView({
                            block: "start",
                            behavior: "smooth",
                          }),
                        );
                      }
                    }}
                    t={t}
                  />
                </div>
                <div className="map-pane">
                  <MapBoundary>
                    <Suspense fallback={<p>{t.loading_map}</p>}>
                      <RecordingMap
                        recordings={spatioFiltered}
                        selectedId={active?.id ?? null}
                        showRoute={true}
                        onSelect={(id, revealDetails) => {
                          setSelected(id);
                          if (revealDetails) {
                            requestAnimationFrame(() =>
                              document.querySelector(".inspector")?.scrollIntoView({
                                block: "start",
                                behavior: "smooth",
                              }),
                            );
                          }
                        }}
                      />
                    </Suspense>
                  </MapBoundary>
                </div>
              </div>
            </div>
          ) : viewMode === "calendar" ? (
            <CalendarView
              recordings={filtered}
              selectedId={active?.id ?? null}
              onSelect={(id, revealDetails) => {
                setSelected(id);
                if (revealDetails) {
                  requestAnimationFrame(() =>
                    document.querySelector(".inspector")?.scrollIntoView({
                      block: "start",
                      behavior: "smooth",
                    }),
                  );
                }
              }}
              t={t}
              lang={lang}
              onDateChange={() => {
                if (draftInProgress && !window.confirm(lang === "ko"
                  ? "저장하지 않은 변경을 버리고 날짜를 바꿀까요?"
                  : "Discard unsaved changes and change the date?")) return false;
                setSelected(null);
                return true;
              }}
            />
          ) : (
            <div className="review-layout">
              <section className="map-section" aria-label="Recording map view">
                <div className="map-heading">
                  <div>
                    <h2>{t.map_heading}</h2>
                    <p>{t.map_desc}</p>
                  </div>
                  <button className="secondary-button" onClick={() => setShowMap(!showMap)} aria-expanded={showMap}>
                    <MapPin size={16} />{showMap ? t.hide_map : t.show_map}
                  </button>
                </div>
                {showMap && <MapBoundary><Suspense fallback={<p>{t.loading_map}</p>}>
                  <RecordingMap recordings={filtered} selectedId={active?.id ?? null} onSelect={(id, revealDetails) => {
                    setSelected(id);
                    if (revealDetails) requestAnimationFrame(() => document.querySelector(".inspector")?.scrollIntoView({ block: "start", behavior: "smooth" }));
                  }} />
                </Suspense></MapBoundary>}
              </section>
              <section className="feed" aria-label="Recordings">
              <div className="feed-heading">
                <h2>{isTrashView ? t.trash : t.your_moments}</h2>
                <div className="feed-heading-right">
                  {isTrashView && trashedCount > 0 && (
                    <button
                      className="text-button empty-trash-btn"
                      onClick={emptyTrash}
                    >
                      {t.empty_trash}
                    </button>
                  )}
                  <span>{filtered.length}</span>
                </div>
              </div>
              {!loaded ? (
                <div className="empty">
                  <LoaderCircle className="spin" />
                  <h3>{t.finding_moments}</h3>
                </div>
              ) : !filtered.length ? (
                <div className="empty">
                  {isTrashView ? (
                    <>
                      <Trash2 size={30} />
                      <h3>{t.empty_trash_title}</h3>
                      <p>
                        {t.empty_trash_desc}
                      </p>
                    </>
                  ) : (
                    <>
                      <Mic size={30} />
                      <h3>
                        {records.length
                          ? t.empty_active_title
                          : t.empty_first_title}
                      </h3>
                      <p>
                        {records.length
                          ? t.empty_active_desc
                          : t.empty_first_desc}
                      </p>
                      <small>
                        {t.demo_note}
                      </small>
                    </>
                  )}
                </div>
              ) : (
                <div className="record-list">
                  {filtered.map((r) => {
                    const e = latest(r),
                      state = processingState(r),
                      x = expense(r);
                    return (
                      <button
                        key={r.id}
                        className={`record-card ${active?.id === r.id ? "selected" : ""}`}
                        onClick={() => setSelected(r.id)}
                      >
                        <span className="record-meta">
                          <time>
                            {new Date(r.recorded_at).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                          <CategoryBadge type={e?.intent_type} size={11} />
                        </span>
                        <strong>
                          {e?.summary || (lang === "ko" ? "기다리는 음성 기록" : "A moment, waiting to be heard")}
                        </strong>
                        <span className="record-bottom">
                          <span
                            className={
                              state === "Ready" ? "ready-text" : "pending-text"
                            }
                          >
                            <span className="status-dot" />
                            {state}
                          </span>
                          {x?.amount != null && x.currency ? (
                            <span className="record-amount">
                              {money(x.amount, x.currency)}
                            </span>
                          ) : (
                            <span>{r.duration_seconds ?? "—"} {lang === "ko" ? "초" : "sec"}</span>
                          )}
                          <ChevronRight size={14} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="inspector" aria-label="Recording details">
              {active ? (
                <Inspector
                  key={`${active.id}:${connection.session_id}`}
                  recording={active}
                  onChange={load}
                  onDirtyChange={setDraftInProgress}
                  onError={setError}
                  onMoveToTrash={moveToTrash}
                  onRestore={restoreRecording}
                  onDeletePermanently={deletePermanently}
                  lang={lang}
                  t={t}
                  isDemo={isDemo}
                />
              ) : (
                <div className="inspector-empty">
                  <span className="empty-orbit">
                    <AudioLines size={36} />
                  </span>
                  <h2>{t.closer_listen_title}</h2>
                  <p>
                    {t.closer_listen_desc.split("\n").map((line, i) => (
                      <Fragment key={i}>
                        {i > 0 && <br />}
                        {line}
                      </Fragment>
                    ))}
                  </p>
                </div>
              )}
            </section>
          </div>
          )}

          {viewMode !== "list" && active && (viewMode !== "calendar" || selected === active.id) && (
            <section className="inspector" style={{ marginTop: "24px" }} aria-label="Selected recording details">
              <Inspector
                key={active.id}
                recording={active}
                onChange={load}
                onDirtyChange={setDraftInProgress}
                onError={setError}
                onMoveToTrash={moveToTrash}
                onRestore={restoreRecording}
                onDeletePermanently={deletePermanently}
                lang={lang}
                t={t}
                isDemo={isDemo}
              />
            </section>
          )}
          <p className="timezone-note">
            {t.timezone_note(Intl.DateTimeFormat().resolvedOptions().timeZone)}
          </p>
        </main>
      )}
      <footer>
        <span>
          HaptiLog · {lang === "ko" ? "기억의 짐을 덜어주는 음성 기록." : "A little less to remember."} ·{" "}
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
            {t.privacy_policy}
          </a>
        </span>
        <span>{t.footer_quiet}</span>
      </footer>
    </>
  );
}
function Inspector({
  recording: r,
  onChange,
  onError,
  onMoveToTrash,
  onRestore,
  onDeletePermanently,
  lang,
  t,
  onDirtyChange,
  isDemo,
}: {
  recording: Recording;
  onChange: () => Promise<void>;
  onError: (message: string) => void;
  onMoveToTrash: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDeletePermanently: (id: string) => Promise<void>;
  lang: Language;
  t: TranslationKeys;
  onDirtyChange?: (dirty: boolean) => void;
  isDemo?: boolean;
}) {
  const e = latest(r),
    x = expense(r),
    state = processingState(r);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState(x?.amount?.toString() ?? "");
  const [currency, setCurrency] = useState(x?.currency ?? "");
  const [merchant, setMerchant] = useState(x?.merchant ?? "");
  const [category, setCategory] = useState(x?.category ?? "");
  const [dirty, setDirty] = useState(false);
  const [transcriptDirty, setTranscriptDirty] = useState(false);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  useEffect(() => { onDirtyChange?.(dirty || transcriptDirty || saving); }, [dirty, transcriptDirty, saving, onDirtyChange]);
  useEffect(() => () => { onDirtyChangeRef.current?.(false); }, []);
  const player = useRef<HTMLAudioElement>(null);
  const objectUrl = useRef("");
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  useEffect(() => {
    if (!dirty) {
      setAmount(x?.amount?.toString() ?? "");
      setCurrency(x?.currency ?? "");
      setMerchant(x?.merchant ?? "");
      setCategory(x?.category ?? "");
    }
  }, [r.recording_corrections?.updated_at, e?.created_at, dirty]);
  async function prepareAudio() {
    if (audioUrl) return;
    if (isDemo || r.audio_path?.startsWith("demo/")) {
      const blob = createDemoAudioBlob();
      objectUrl.current = URL.createObjectURL(blob);
      setAudioUrl(objectUrl.current);
      return;
    }
    if (!supabase || !r.audio_path) return;
    setAudioBusy(true);
    const { data, error } = await supabase.storage
      .from("recordings")
      .download(r.audio_path);
    if (!mounted.current) return;
    if (error || !data)
      onError(t.audio_load_error);
    else {
      objectUrl.current = URL.createObjectURL(data);
      setAudioUrl(objectUrl.current);
    }
    setAudioBusy(false);
  }
  async function retry() {
    if (isDemo || r.id.startsWith("demo-")) {
      setRetryBusy(true);
      setTimeout(async () => {
        if (mounted.current) {
          await onChange();
          setRetryBusy(false);
        }
      }, 300);
      return;
    }
    if (!supabase) return;
    const consentText = lang === "ko"
      ? "AI 분석은 만 18세 이상만 사용할 수 있습니다. 음성과 녹음 시각이 Supabase 및 Google Gemini에서 처리됩니다. 민감한 내용은 보내지 마세요. 개인정보처리방침: https://haptilog.keepory.app/privacy.html\n만 18세 이상이며 이 처리에 동의합니까? 워치에서도 동의가 필요합니다."
      : "AI analysis is for adults 18+. Audio and recording time are processed by Supabase and Google Gemini. Do not submit sensitive content. Privacy: https://haptilog.keepory.app/privacy.html\nAre you 18+ and do you consent? The watch owner must also consent.";
    if (!window.confirm(consentText)) return;
    onError("");
    setRetryBusy(true);
    const { error: consentError } = await supabase.rpc("set_cloud_consent", { p_enabled: true, p_adult: true });
    if (consentError) {
      onError(t.save_error);
      setRetryBusy(false);
      return;
    }
    const { error } = await supabase.functions.invoke("voice-enrich", {
      body: { recording_id: r.id, language: lang },
    });
    if (mounted.current) {
      if (error) {
        let failureCode: string | undefined;
        try { failureCode = (await error.context?.json())?.code; } catch { /* Network errors have no response body. */ }
        onError(failureCode === "CONSENT_REQUIRED" ? (lang === "ko" ? "워치 설정에서 만 18세 이상 클라우드 이용 동의가 필요합니다." : "Adult cloud consent is required in watch Settings.") : analysisFailure(failureCode));
      }
      await onChange();
      setRetryBusy(false);
    }
  }
  async function saveCorrection(patch: Partial<Correction>) {
    if (isDemo || r.id.startsWith("demo-")) {
      setSaving(true);
      const stored = getStoredDemoRecords() ?? [];
      const updated = stored.map((rec) => {
        if (rec.id !== r.id) return rec;
        return {
          ...rec,
          recording_corrections: {
            ...(rec.recording_corrections ?? {
              recording_id: r.id,
              amount: null,
              currency: null,
              merchant: null,
              category: null,
              completed_tasks: [],
              updated_at: new Date().toISOString(),
            }),
            ...patch,
            updated_at: new Date().toISOString(),
          },
        };
      });
      saveStoredDemoRecords(updated);
      if (mounted.current) {
        await onChange();
        setSaving(false);
      }
      return true;
    }
    if (!supabase) return false;
    setSaving(true);
    const { error } = await supabase
      .from("recording_corrections")
      .upsert(
        { ...patch, recording_id: r.id, updated_at: new Date().toISOString() },
        { onConflict: "recording_id", defaultToNull: false },
      );
    if (mounted.current) {
      if (error) onError(t.save_error);
      else await onChange();
      setSaving(false);
    }
    return !error;
  }
  async function saveExpense(event: React.FormEvent) {
    event.preventDefault();
    if (
      amount === "" ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) < 0 ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      onError(
        t.expense_validation,
      );
      return;
    }
    if (
      await saveCorrection({
        amount: Number(amount),
        currency,
        merchant,
        category,
      })
    )
      setDirty(false);
  }
  const tasks = taskItems(r),
    completed = r.recording_corrections?.completed_tasks ?? [];
  return (
    <>
      {r.deleted_at && (
        <div className="trashed-banner" role="alert">
          <div>
            <strong>{t.in_trash}</strong>
            <p>
              {t.moved_to_trash_on}{" "}
              {new Date(r.deleted_at).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="trash-actions">
            <button
              className="secondary-button restore-btn"
              onClick={() => onRestore(r.id)}
            >
              <RotateCcw size={14} /> {t.restore}
            </button>
            <button
              className="danger-button"
              onClick={() => onDeletePermanently(r.id)}
            >
              <Trash size={14} /> {t.delete_permanently}
            </button>
          </div>
        </div>
      )}
      <div className="inspector-top">
        <span className="eyebrow">{t.original_details}</span>
        <div className="inspector-top-actions">
          <span className={`state-pill ${state === "Ready" ? "is-ready" : ""}`}>
            {state}
          </span>
          {!r.deleted_at && (
            <button
              className="trash-trigger"
              onClick={() => onMoveToTrash(r.id)}
              title={t.move_to_trash}
              aria-label={lang === "en" ? "Move recording to trash" : t.move_to_trash}
            >
              <Trash2 size={13} /> {t.move_to_trash}
            </button>
          )}
        </div>
      </div>
      <h2>{e?.summary || (lang === "ko" ? "보존된 음성 기록." : "Your voice, preserved.")}</h2>
      <p className="detail-time">
        {new Date(r.recorded_at).toLocaleString()} ·{" "}
        {r.duration_seconds ?? (lang === "ko" ? "알 수 없음" : "Unknown")} {lang === "ko" ? "초" : "seconds"}
      </p>
      <section className="audio-section">
        <div className="section-label">
          <Headphones size={16} /> {t.original_audio}{" "}
          <span>{t.audio_truth}</span>
        </div>
        {audioUrl ? (
          <>
            <audio
              ref={player}
              controls
              src={audioUrl}
              onError={() =>
                onError(
                  t.audio_play_error,
                )
              }
            />
            <div className="audio-actions">
              <label>
                {t.speed}{" "}
                <select
                  aria-label="Playback speed"
                  defaultValue="1"
                  onChange={(event) => {
                    if (player.current)
                      player.current.playbackRate = Number(event.target.value);
                  }}
                >
                  {[0.8, 1, 1.25, 1.5, 2].map((speed) => (
                    <option key={speed} value={speed}>
                      {speed}×
                    </option>
                  ))}
                </select>
              </label>
              <a href={audioUrl} download={`haptilog-${r.id}.m4a`}>
                <ArrowDownToLine size={14} /> {t.download_audio}
              </a>
            </div>
          </>
        ) : (
          <button
            className="audio-load"
            onClick={prepareAudio}
            disabled={audioBusy || !r.audio_path}
          >
            <AudioLines size={30} />
            <span>
              {audioBusy
                ? t.loading_audio
                : r.audio_path
                  ? t.load_audio
                  : t.audio_unavailable}
            </span>
            <ArrowRight size={18} />
          </button>
        )}
      </section>
      {(state !== "Ready" || retryBusy) && (
        <div className="analysis-note">
          <div>
            <strong>
              {retryBusy || state === "Processing"
                ? t.listening_details
                : t.audio_comes_first}
            </strong>
            <p>
              {state === "Processing" || retryBusy
                ? t.analysis_in_progress
                : analysisFailure(r.enrichment_status?.error_code)}
            </p>
          </div>
          <button
            className="secondary-button"
            onClick={retry}
            disabled={retryBusy || state === "Processing" || !r.audio_path}
          >
            <RefreshCw size={14} />
            {retryBusy ? t.analysing : t.retry_analysis}
          </button>
        </div>
      )}
      {e && (
        <>
          <div className="section-label">
            <Mic size={16} /> {t.transcript}{" "}
            <span>{r.recording_corrections?.transcript != null
              ? (lang === "ko" ? "사용자 편집 · 원본 보존" : "Edited · original preserved")
              : t.transcript_note}</span>
          </div>
          <TranscriptEditor recording={r} lang={lang} onChange={onChange} onError={onError} onDirtyChange={setTranscriptDirty} />
          {x && (
            <form
              className="expense-form"
              onSubmit={saveExpense}
              onChange={() => setDirty(true)}
            >
              <div className="section-label">
                {t.expense_details} <span>{t.expense_note}</span>
              </div>
              <div className="field-row">
                <label>
                  {t.amount}
                  <input
                    type="number"
                    min="0"
                    max="999999999999"
                    step="any"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                  />
                </label>
                <label>
                  {t.currency}
                  <input
                    value={currency}
                    onChange={(event) =>
                      setCurrency(event.target.value.toUpperCase())
                    }
                    maxLength={3}
                    pattern="[A-Z]{3}"
                    placeholder="KRW"
                    required
                  />
                </label>
              </div>
              <label>
                {t.merchant}
                <input
                  value={merchant}
                  maxLength={200}
                  onChange={(event) => setMerchant(event.target.value)}
                  placeholder="Add a merchant"
                />
              </label>
              <label>
                {t.category}
                <input
                  value={category}
                  maxLength={100}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Add a category"
                />
              </label>
              <button className="secondary-button" disabled={saving || !dirty}>
                <Check size={14} />
                {saving ? t.saving : t.save_corrections}
              </button>
            </form>
          )}
          {tasks.length > 0 && (
            <section className="tasks">
              <div className="section-label">{t.follow_up_thoughts}</div>
              {tasks.map((task, index) => (
                <label key={`${task}:${index}`}>
                  <input
                    type="checkbox"
                    checked={completed.includes(task)}
                    disabled={saving}
                    onChange={(event) =>
                      void saveCorrection({
                        completed_tasks: event.target.checked
                          ? [...completed, task]
                          : completed.filter((t) => t !== task),
                      })
                    }
                  />
                  <span>{task}</span>
                </label>
              ))}
            </section>
          )}
          <details className="structured">
            <summary>{t.all_details}</summary>
            <pre>{JSON.stringify(e.structured_data, null, 2)}</pre>
            <small>{t.analysis_version}: {e.pipeline_version ?? "legacy"}</small>
          </details>
        </>
      )}
      <section className="context">
        <div className="section-label">
          <MapPin size={16} /> {t.captured_context}
        </div>
        {hasLocation(r) ? (
          <>
            <p>
              <a
                className="secondary-button"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.latitude},${r.longitude}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin size={16} aria-hidden="true" /> {t.open_in_maps}
              </a>
            </p>
            <dl>
              <div>
                <dt>Accuracy</dt>
                <dd>
                  {r.accuracy != null ? `± ${r.accuracy} m` : "Unavailable"}
                </dd>
              </div>
              <div>
                <dt>Altitude</dt>
                <dd>
                  {r.altitude != null ? `${r.altitude} m` : "Unavailable"}
                </dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd>{r.speed != null ? `${r.speed} m/s` : "Unavailable"}</dd>
              </div>
            </dl>
            <small>{t.location_snapshot}</small>
          </>
        ) : (
          <p className="muted">{t.no_location}</p>
        )}
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
