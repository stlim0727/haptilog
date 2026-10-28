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
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  FileText,
  Headphones,
  Link2,
  LoaderCircle,
  LogOut,
  Luggage,
  MapPin,
  MoreHorizontal,
  Mic,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash,
  Trash2,
  User,
  Watch,
} from "lucide-react";
import { supabase, authCallbackFailed } from "./client";
import { journalItems, matchesJournal, journalDates } from "./journal";
import type { JournalItem } from "./journal";
import { useLocationJournal } from "./location-stays/useLocationJournal";
import { JOURNAL_CATEGORIES, categorySelection, categoryPressed, toggleCategory } from "./categoryFilter";
import { JournalTimeline } from "./JournalTimeline";
import { StayInspector } from "./location-stays/StayInspector";
import { StayPlaceName } from "./location-stays/StayPlaceName";
import { clearAllDismissals } from "./location-stays/dismissals";
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
import { TranscriptEditor, TranscriptHistory } from "./TranscriptEditor";
import { purgeRecordings } from "./purge";
import { CategoryBadge } from "./CategoryBadge";
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
const RawLocationLauncher = lazy(() => import("./raw-location/RawLocationLauncher"));
const LocationLauncher = lazy(() => import("./location-stays/LocationLauncher"));
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
function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
      />
    </svg>
  );
}
function PairStep({ screen, label }: { screen: React.ReactNode; label: string }) {
  return (
    <div className="pair-step">
      <svg className="watch-frame" width="76" height="92" viewBox="0 0 76 92" aria-hidden="true">
        <rect x="26" y="2" width="24" height="16" rx="5" className="watch-strap" />
        <rect x="26" y="74" width="24" height="16" rx="5" className="watch-strap" />
        <rect x="8" y="14" width="60" height="64" rx="20" className="watch-bezel" />
        <rect x="13" y="19" width="50" height="54" rx="16" className="watch-screen" />
        {screen}
      </svg>
      <span>{label}</span>
    </div>
  );
}
function WatchPairGuide() {
  return (
    <div className="pair-guide" role="img" aria-label="Three steps on the watch: open Settings, tap Review on the web, tap Create connection code">
      <PairStep label="Settings"
        screen={<>
          <circle cx="38" cy="37" r="11" className="watch-ghost" />
          <g transform="translate(46 58) scale(0.4)" className="watch-accent">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" className="watch-accent-fill" />
            <circle cx="12" cy="12" r="3" className="watch-screen-fill" />
          </g>
        </>} />
      <ChevronRight size={16} className="pair-guide-arrow" aria-hidden="true" />
      <PairStep label="Review on the web"
        screen={<>
          <rect x="28" y="23" width="20" height="3" rx="1.5" className="watch-ghost" />
          <rect x="19" y="31" width="38" height="10" rx="5" className="watch-ghost" />
          <rect x="19" y="45" width="38" height="13" rx="6.5" className="watch-active" />
          <g transform="translate(23 48.5) scale(0.34)" className="watch-accent">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" fill="none" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" />
          </g>
          <rect x="38" y="49.5" width="15" height="4" rx="2" className="watch-active-ink" />
        </>} />
      <ChevronRight size={16} className="pair-guide-arrow" aria-hidden="true" />
      <PairStep label="Create connection code"
        screen={<>
          <text x="38" y="42" textAnchor="middle" className="watch-code">123 456</text>
          <rect x="19" y="47" width="38" height="12" rx="6" className="watch-active" />
        </>} />
    </div>
  );
}
function App() {
  const [draftInProgress, setDraftInProgress] = useState(false);
  const [notionOpen, setNotionOpen] = useState(false);
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
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [accountOpen]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [checking, setChecking] = useState(true);
  const [sampleRevision, setSampleRevision] = useState(0);
  const locationJournal = useLocationJournal(connection?.owner_user_id, connection?.session_id, isDemoSessionActive(), sampleRevision);
  const [error, setError] = useState(authCallbackFailed
    ? translations[getInitialLanguage()].google_error : "");
  const [records, setRecords] = useState<Recording[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("all");
  useEffect(() => {
    // The mobile page has no period dropdown: its day strip and calendar already
    // are the date controls, so a range picked on desktop would silently keep
    // filtering a list the phone user has no way to widen again.
    if (mobile) setDate("all");
  }, [mobile]);
  const [category, setCategoryState] = useState("All");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([...JOURNAL_CATEGORIES]);
  const setCategory = (next: string) => {
    setCategoryState(next);
    if (next !== "Trash") setSelectedCategories(categorySelection(next));
  };
  const applyCategories = (next: string[]) => {
    setSelectedCategories(next);
    setCategoryState(next.length === 1 && next[0] === "Stay" ? "Stay" : "All");
  };
  const [selected, setSelected] = useState<string | null>(() => new URL(window.location.href).searchParams.get("recording") ?? new URL(window.location.href).searchParams.get("stay"));
  const [search, setSearch] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [viewMode, setViewMode] = useState<"timeline" | "calendar">("timeline");
  const [dateKey, setDateKey] = useState<string>("ALL");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const saved = localStorage.getItem("haptilog_theme");
    return saved === "light" || saved === "dark" ? saved : "dark";
  });
  const [lang, setLang] = useState<Language>(getInitialLanguage);
  const [isDemo, setIsDemo] = useState(isDemoSessionActive);
  const showTestLogin = isPreviewEnvironment();
  const t = translations[lang];
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", theme === "dark");
    document.body.classList.toggle("light-mode", theme === "light");
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("haptilog_theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

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
        if (event === "SIGNED_OUT") clearAllDismissals(localStorage);
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
    setSampleRevision(value => value + 1);
    const samples = generateSampleRecordings();
    saveStoredDemoRecords(samples);
    setRecords(samples);
    setSelected(null);
    setToast({
      message:
        lang === "ko"
          ? "샘플 데이터를 초기화했습니다."
          : "Sample journal reset.",
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

  const allItems = journalItems(records, locationJournal.snapshot?.stays ?? [], locationJournal.snapshot?.places ?? [], locationJournal.now);
  const filteredItems = allItems.filter(item => matchesJournal(item, { category: isTrashView ? "Trash" : "All", categories: selectedCategories, date, search }));
  const stayEmptyMessage = search || date !== "all"
    ? (lang === "ko" ? "조건에 맞는 체류가 없습니다." : "No stays match these filters.")
    : locationJournal.snapshot?.state.consent_enabled
      ? (lang === "ko" ? `아직 확인된 체류가 없어요. 한곳에 ${locationJournal.snapshot.state.threshold_minutes}분 이상 머무르면 기록돼요.` : `No stays confirmed yet. Stay in one area for at least ${locationJournal.snapshot.state.threshold_minutes} minutes.`)
      : (lang === "ko" ? "워치 설정에서 위치 기록을 켜고 클라우드 동기화를 허용하면 이곳에 표시됩니다." : "Turn on location recording in watch settings and allow cloud sync to see places here.");
  const filtered = filteredItems.flatMap(item => item.kind === "voice" ? [item.recording] : []);
  const activeItem = filteredItems.find(item => item.id === selected) ?? (selected ? undefined : filteredItems[0]);
  const active = activeItem?.kind === "voice" ? activeItem.recording : undefined;
  const displayItems = viewMode === "timeline" && dateKey !== "ALL" ? filteredItems.filter(item => journalDates(item).includes(dateKey)) : filteredItems;
  const openRelatedRecording = (recording: Recording) => {
    setSelected(recording.id);
    if (!filteredItems.some(item => item.kind === "voice" && item.id === recording.id)) {
      setCategory("All"); setSearch(""); setDate("all"); setDateKey("ALL");
    }
  };
  const renderPlaceName = (item: Extract<JournalItem, { kind: "stay" }>, compact = false, identity?: string) => !isDemo ? <StayPlaceName key={`${connection?.owner_user_id}:${connection?.session_id}:${identity ?? item.id}`} item={item} journal={locationJournal} lang={lang} compact={compact} /> : null;
  const renderStay = (item: Extract<JournalItem, { kind: "stay" }>, onOpenRecording = openRelatedRecording) => <StayInspector key={`${item.id}:${connection?.session_id}`} item={item} journal={locationJournal} readOnly={isDemo} records={records} onOpenRecording={onOpenRecording} lang={lang} renderPlaceName={renderPlaceName} />;
  const displayRecordings =
    viewMode === "timeline" && dateKey !== "ALL"
      ? filtered.filter((r) => localDate(r.recorded_at) === dateKey)
      : filtered;
  const calendarActiveDateKey = dateKey === "ALL" ? toLocalDateString() : dateKey;
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
  const dateJournal = allItems.filter(item => matchesJournal(item, { date }));
  const stayMinutes = dateJournal.reduce((total, item) => total + (item.kind === "stay" ? Math.floor(item.stay.observed_duration_millis / 60_000) : 0), 0);
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
        <div className="topbar-inner">
          <div className="top-brand-group">
            <Brand />
            <span className="top-label">{t.brand_slogan}</span>
          </div>
          <div className="top-right">
            {connection && <Suspense fallback={null}><RawLocationLauncher key={`${connection.owner_user_id}:${connection.session_id}`} owner={connection.owner_user_id} lang={lang} isDemo={isDemo} stays={locationJournal.snapshot?.stays ?? []} /></Suspense>}
            <button
              className="theme-switch-btn"
              onClick={toggleTheme}
              title={theme === "dark" ? t.theme_light : t.theme_dark}
              aria-label={t.theme_toggle}
            >
              <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
              <span className="theme-btn-text">{theme === "dark" ? t.theme_light : t.theme_dark}</span>
            </button>
            <button
              className="lang-switch-btn"
              onClick={toggleLang}
              title={lang === "en" ? "한국어로 변경" : "Switch to English"}
              aria-label="Toggle language"
            >
              {lang === "en" ? "KO" : "EN"}
            </button>

            {supabase && (
              <div className="account-dropdown-wrapper" ref={accountMenuRef}>
                <button
                  className={`account-trigger-btn ${accountEmail ? "signed-in" : ""}`}
                  onClick={() => setAccountOpen(!accountOpen)}
                  aria-expanded={accountOpen}
                  aria-label={t.account}
                >
                  <span className={`account-avatar-mark ${accountEmail ? "signed-in" : ""}`}>
                    {accountEmail ? accountEmail.slice(0, 1).toUpperCase() : <User size={15} />}
                  </span>
                  <span className="account-btn-text">{t.account}</span>
                  <ChevronDown size={14} className={`chevron-indicator ${accountOpen ? "open" : ""}`} />
                </button>
                {accountOpen && (
                  <div className="account-dropdown-panel" role="region" aria-label={t.account}>
                    {accountEmail ? (
                      <>
                        <div className="account-user-card">
                          <span className="account-avatar-mark signed-in">
                            {accountEmail.slice(0, 1).toUpperCase()}
                          </span>
                          <div className="account-user-meta">
                            <span className="account-user-email">{accountEmail}</span>
                            <span className="account-user-status">{t.signed_in_as}</span>
                          </div>
                        </div>

                        {connection && (
                          accountWatches.some((w) => w.owner_user_id === connection.owner_user_id) ? (
                            <div className="account-status-card complete" role="status">
                              <span className="account-status-badge complete">
                                {lang === "ko" ? "계정 연결 완료" : "Linked"}
                              </span>
                              <p>{t.account_saved}</p>
                            </div>
                          ) : (
                            <div className="account-status-card unlinked">
                              <div className="account-status-card-header">
                                <span className="account-status-badge unlinked">
                                  {lang === "ko" ? "계정 미연결" : "Not linked"}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="save-account-btn"
                                disabled={busy || draftInProgress}
                                onClick={() => accountOperation("save")}
                              >
                                {t.save_account}
                              </button>
                            </div>
                          )
                        )}

                        <div className="account-section-heading">
                          <span>{lang === "ko" ? "연결된 워치" : "Connected watches"}</span>
                        </div>
                        <div className="account-watches-list">
                          {accountWatches.map((w) => (
                            <div className="account-watch-row" key={w.owner_user_id}>
                              <button
                                type="button"
                                className="account-watch-select-btn"
                                disabled={busy || draftInProgress}
                                onClick={() => accountOperation("restore", w.owner_user_id)}
                              >
                                <Watch size={15} />
                                <span className="account-watch-name">{w.watch_id}</span>
                                {connection?.owner_user_id === w.owner_user_id && (
                                  <span className="current-watch-tag">
                                    {lang === "ko" ? "현재" : "Active"}
                                  </span>
                                )}
                              </button>
                              <button
                                type="button"
                                className="account-watch-unlink-btn"
                                disabled={busy || draftInProgress}
                                onClick={() => accountOperation("unlink", w.owner_user_id)}
                                aria-label={`${t.unlink_watch} ${w.watch_id}`}
                              >
                                {t.unlink_watch}
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="account-dropdown-actions">
                          <button
                            type="button"
                            className="account-action-btn"
                            disabled={busy || draftInProgress}
                            onClick={() => {
                              setAddingWatch(true);
                              setAccountOpen(false);
                            }}
                          >
                            <Watch size={15} />
                            <span>{t.add_watch}</span>
                          </button>
                          <button
                            type="button"
                            className="account-action-btn sign-out"
                            disabled={busy || draftInProgress}
                            onClick={async () => {
                              if (!supabase) return;
                              const { error } = await supabase.auth.signOut({ scope: "local" });
                              if (error) setError(t.account_error);
                            }}
                          >
                            <LogOut size={15} />
                            <span>{t.sign_out}</span>
                          </button>
                        </div>
                        <p className="account-help-note">{t.signout_help}</p>
                      </>
                    ) : (
                      <>
                        <div className="account-guest-header">
                          <div className="account-guest-icon">
                            <User size={20} />
                          </div>
                          <h3>{t.account}</h3>
                          <p>{t.recovery_help}</p>
                        </div>
                        <div className="account-guest-actions">
                          <button
                            type="button"
                            className="google-button full"
                            disabled={busy || draftInProgress}
                            onClick={() => googleLogin()}
                          >
                            <GoogleIcon size={18} />
                            <span>{t.google_signin}</span>
                          </button>
                          <button
                            type="button"
                            className="account-secondary-btn"
                            disabled={busy || draftInProgress}
                            onClick={() => googleLogin(true)}
                          >
                            <span>{t.google_existing}</span>
                          </button>
                        </div>
                        <p className="account-help-note">{t.google_existing_help}</p>
                      </>
                    )}
                    <details className="recovery-details">
                      <summary>
                        {lang === "ko" ? "어떤 기록을 다시 볼 수 있나요?" : "Which recordings can be restored?"}
                      </summary>
                      <p>{t.recovery_limit}</p>
                    </details>
                  </div>
                )}
              </div>
            )}

            {connection ? (
              <div className="watch-status-group">
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
              </div>
            ) : (
              <span className="watch-label">
                <Watch size={15} /> {t.wrist_promise}
              </span>
            )}
          </div>
        </div>
      </header>
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
            <WatchPairGuide />
            {accountEmail && <p>{t.account_pair_help}</p>}
            <p>{t.connect_desc}</p>
            {!accountEmail && !addingWatch && supabase && (
              <div className="pair-google-card">
                <button
                  type="button"
                  className="google-button full"
                  disabled={busy || draftInProgress}
                  onClick={() => googleLogin()}
                >
                  <GoogleIcon size={18} />
                  <span>{t.google_signin}</span>
                </button>
                <div className="pair-divider">
                  <span>{lang === "ko" ? "또는 워치 코드로 연결" : "OR CONNECT WITH WATCH CODE"}</span>
                </div>
              </div>
            )}
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
        <MobileWorkspace key={connection.session_id} records={records} filtered={filtered} items={allItems} filteredItems={filteredItems} renderPlaceName={renderPlaceName} renderStay={renderStay} stayEmptyMessage={stayEmptyMessage} locationLoaded={!!locationJournal.snapshot || !!locationJournal.error || isDemo} loaded={loaded} truncated={truncated}
          category={category} setCategory={setCategory} selectedCategories={selectedCategories} applyCategories={applyCategories} search={search} setSearch={setSearch}
          summary={summary} count={dateJournal.length} stayMinutes={stayMinutes} now={locationJournal.now} seconds={totalSeconds} lastChecked={lastChecked}
          lang={lang} t={t} busy={busy} onDraftChange={setDraftInProgress} onDetailChange={setMobileDetailOpen} refresh={() => { setError(""); void load(); }} exportCsv={exportCsv} disconnect={disconnect} emptyTrash={emptyTrash}
          isDemo={isDemo} onResetDemo={resetSampleData}
          locationControl={(beforeOpen) => <Suspense fallback={null}><LocationLauncher key={`${connection.owner_user_id}:${connection.session_id}`} journal={locationJournal} lang={lang} isDemo={isDemo} beforeOpen={beforeOpen} /></Suspense>}
          renderInspector={(recording, onDirtyChange) => <Inspector key={`${recording.id}:${connection.session_id}`} recording={recording}
            onChange={load} onError={setError} onMoveToTrash={moveToTrash} onRestore={restoreRecording} onDeletePermanently={deletePermanently}
            lang={lang} t={t} onDirtyChange={onDirtyChange} isDemo={isDemo} />} />
      ) : (
        <main className="workspace">
          {!accountEmail && supabase && (
            <div className="account-nudge-banner" role="region" aria-label="Account link prompt">
              <div className="account-nudge-content">
                <span className="account-status-badge unlinked">{lang === "ko" ? "계정 미연결" : "Account unlinked"}</span>
                <span className="account-nudge-text">{t.recovery_help}</span>
              </div>
              <button
                type="button"
                className="account-nudge-btn"
                disabled={busy || draftInProgress}
                onClick={() => googleLogin()}
              >
                <GoogleIcon size={16} />
                <span>{t.google_signin}</span>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
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
                {lang === "ko" ? "기록" : "Journal"}
              </h1>
              <p>{lang === "ko" ? "음성과 머문 장소를 한곳에서 돌아보세요." : "Your voice and the places you stayed, together."}</p>
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
              <Suspense fallback={null}><LocationLauncher key={`${connection.owner_user_id}:${connection.session_id}`} journal={locationJournal} lang={lang} isDemo={isDemo} moreActions={<>
              <button
                className="secondary-button"
                onClick={exportCsv}
                disabled={!filtered.length}
              >
                <ArrowDownToLine size={16} />
                {lang === "ko" ? "음성 CSV" : "Voice CSV"}
              </button>
              {!isTrashView && <button
                className="secondary-button"
                aria-expanded={notionOpen}
                aria-controls="desktop-notion-export"
                onClick={() => setNotionOpen(!notionOpen)}
              >
                <ArrowDownToLine size={16} />
                {lang === "ko" ? "음성을 Notion으로 내보내기" : "Export voice to Notion"}
              </button>}
              </>} /></Suspense>
            </div>
          </div>
          {!isTrashView && <NotionExport key={connection.session_id} records={filtered} ko={lang === "ko"}
            expanded={notionOpen} onExpandedChange={setNotionOpen} />}
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
                {dateJournal.length}
                <span className="metric-unit"> {lang === "ko" ? "개 기록" : "records"}</span>
              </strong>
              <small>
                {lang === "ko"
                  ? `음성 ${Math.floor(totalSeconds / 60)}분 ${totalSeconds % 60}초 · 확인된 체류 ${stayMinutes}분`
                  : `Voice ${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s · stays ${stayMinutes} min observed`}
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
                void load(); void locationJournal.load();
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
                aria-selected={viewMode === "timeline"}
                className={viewMode === "timeline" ? "active" : ""}
                onClick={() => setViewMode("timeline")}
              >
                <Clock size={14} /> {t.view_timeline}
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
            {!isTrashView && (
              <div className="workbench-toggles">
                <button
                  type="button"
                  className={`workbench-toggle-btn ${showMap ? "active" : ""}`}
                  onClick={() => setShowMap(!showMap)}
                  aria-expanded={showMap}
                >
                  <MapPin size={14} /> {showMap ? t.hide_map : t.show_map}
                </button>
              </div>
            )}
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
                  ["Voice", lang === "ko" ? "음성" : "Voice", Mic],
                  ["Stay", lang === "ko" ? "체류" : "Stays", MapPin],
                  ["Expense", t.expense_cat, Receipt],
                  ["Travel", t.travel_cat, Luggage],
                  ["Workout", t.workout_cat, Activity],
                  ["Memo", t.memo_cat, FileText],
                ] as const
              ).map(([c, label, Icon]) => (
                <button
                  key={c}
                  className={!isTrashView && categoryPressed(selectedCategories, c) === true ? "active" : ""}
                  aria-pressed={!isTrashView && categoryPressed(selectedCategories, c)}
                  onClick={() => applyCategories(toggleCategory(isTrashView ? [] : selectedCategories, c))}
                >
                  {Icon && <Icon size={12} />} {label}
                </button>
              ))}
              <button
                className={`trash-tab ${category === "Trash" ? "active" : ""}`}
                onClick={() => {
                  setCategory("Trash");
                  setViewMode("timeline");
                  setDateKey("ALL");
                }}
                aria-label="View trash"
              >
                <Trash2 size={13} /> {t.trash} {trashedCount > 0 ? `(${trashedCount})` : ""}
              </button>
            </div>
            <input
              className="search"
              type="search"
              aria-label="Search journal"
              placeholder={lang === "ko" ? "음성·장소 검색" : "Search voice and places"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {category === "Trash" && viewMode !== "timeline" && (
            <div className="trash-warning-banner">
              <span>{t.viewing_trash_warning}</span>
              <button type="button" onClick={() => setCategory("All")}>
                {t.exit_trash}
              </button>
            </div>
          )}

          {viewMode === "calendar" ? (
            <>
              {showMap && (
                <section className="map-section" aria-label="Recording map view">
                  <div className="map-heading">
                    <div>
                      <p>{t.map_desc}</p>
                    </div>
                    <button
                      className="map-close-btn"
                      onClick={() => setShowMap(false)}
                      aria-label="Close map"
                      title={t.hide_map}
                    >
                      ✕
                    </button>
                  </div>
                  <MapBoundary>
                    <Suspense fallback={<p>{t.loading_map}</p>}>
                      <RecordingMap
                        heading={t.map_heading}
                        lang={lang}
                        recordings={filtered.filter((r) => localDate(r.recorded_at) === calendarActiveDateKey)}
                        journalItems={filteredItems.filter(item => journalDates(item).includes(calendarActiveDateKey))}
                        selectedId={activeItem?.id ?? null}
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
                </section>
              )}
              <CalendarView
                recordings={filtered}
                journalItems={filteredItems}
                selectedId={activeItem?.id ?? null}
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
                selectedDateKey={calendarActiveDateKey}
                onSelectDay={setDateKey}
              />
            </>
          ) : (
            <>
              {!isTrashView && (
                <div className="workbench-slider-wrapper">
                  <TimeSliderStrip
                    recordings={filtered}
                    journalItems={filteredItems}
                    selectedDateKey={dateKey}
                    onSelectDate={setDateKey}
                    t={t}
                    lang={lang}
                  />
                </div>
              )}
              <div className="review-layout">
                {showMap && (
                  <section className="map-section" aria-label="Recording map view">
                    <div className="map-heading">
                      <div>
                        <p>{t.map_desc}</p>
                      </div>
                      <button
                        className="map-close-btn"
                        onClick={() => setShowMap(false)}
                        aria-label="Close map"
                        title={t.hide_map}
                      >
                        ✕
                      </button>
                    </div>
                    <MapBoundary>
                      <Suspense fallback={<p>{t.loading_map}</p>}>
                        <RecordingMap
                          heading={t.map_heading}
                          lang={lang}
                          recordings={displayRecordings}
                          journalItems={displayItems}
                          selectedId={activeItem?.id ?? null}
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
                  </section>
                )}
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
                      <span>{displayItems.length}</span>
                    </div>
                  </div>
                  {locationJournal.error && !isTrashView && <p className="location-feed-note" role="status">{lang === "ko" ? "체류를 불러오지 못했습니다. 음성 기록은 계속 사용할 수 있습니다." : "Could not refresh stays. Voice recordings remain available."} <button className="text-button" onClick={() => void locationJournal.load()}>{lang === "ko" ? "다시 시도" : "Retry"}</button></p>}
                  {category === "Stay" && !displayItems.length && <p className="location-feed-note">{stayEmptyMessage}</p>}
                  {!loaded ? (
                    <div className="empty">
                      <LoaderCircle className="spin" />
                      <h3>{t.finding_moments}</h3>
                    </div>
                  ) : !displayItems.length ? (
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
                      <JournalTimeline items={displayItems} allItems={allItems} now={locationJournal.now} lang={lang} onSelectStay={item => setSelected(item.id)} renderPlaceName={renderPlaceName} renderVoice={(item) => {
                    if (item.kind !== "voice") return null;
                    const r = item.recording;
                    const e = latest(r),
                      state = processingState(r),
                      x = expense(r);
                    return (
                      <button
                        key={`voice:${r.id}`}
                        data-record-id={r.id}
                        data-journal-kind="voice"
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
                  }} />
                </div>
              )}
            </section>
            <section className="inspector" aria-label="Recording details">
              {activeItem?.kind === "stay" ? renderStay(activeItem) : active ? (
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
          </>
          )}

          {viewMode === "calendar" && activeItem?.kind === "stay" && selected === activeItem.id && <section className="inspector" aria-label="Journal details">{renderStay(activeItem)}</section>}
          {viewMode === "calendar" && active && selected === active.id && (
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
  const updateTranscriptDirty = useCallback((isDirty: boolean) => {
    setTranscriptDirty(isDirty);
    onDirtyChangeRef.current?.(dirty || isDirty || saving);
  }, [dirty, saving]);
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
    if (audioUrl) return audioUrl;
    if (isDemo || r.audio_path?.startsWith("demo/")) {
      const blob = createDemoAudioBlob();
      objectUrl.current = URL.createObjectURL(blob);
      setAudioUrl(objectUrl.current);
      return objectUrl.current;
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
    return error || !data ? undefined : objectUrl.current;
  }
  async function downloadAudio() {
    const url = await prepareAudio();
    if (!url || !mounted.current) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `haptilog-${r.id}.m4a`;
    link.click();
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
        <h2>{e?.summary || (lang === "ko" ? "보존된 음성 기록." : "Your voice, preserved.")}</h2>
        <div className="inspector-top-actions">
          {state !== "Ready" && <span className="state-pill">{state}</span>}
          <details className="recording-actions" onKeyDown={event => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
          }}>
            <summary aria-label={lang === "ko" ? "녹음 옵션" : "Recording options"}><MoreHorizontal size={20} /></summary>
            <div className="recording-actions-popover">
              <button onClick={() => { if (!audioBusy) void downloadAudio(); }} disabled={!r.audio_path} aria-disabled={audioBusy}>
                <ArrowDownToLine size={14} /> {audioBusy ? t.loading_audio : t.download_audio}
              </button>
              {!r.deleted_at && <button className="trash-trigger" onClick={() => onMoveToTrash(r.id)} aria-label={lang === "en" ? "Move recording to trash" : t.move_to_trash}>
                <Trash2 size={14} /> {t.move_to_trash}
              </button>}
            </div>
          </details>
        </div>
      </div>
      <p className="detail-time">
        {new Date(r.recorded_at).toLocaleString()} ·{" "}
        {r.duration_seconds ?? (lang === "ko" ? "알 수 없음" : "Unknown")} {lang === "ko" ? "초" : "seconds"}
      </p>
      <section className="audio-section">
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
          <TranscriptEditor recording={r} lang={lang} onChange={onChange} onError={onError} onDirtyChange={updateTranscriptDirty} />
          {x && (
            <form
              className="expense-form"
              onSubmit={saveExpense}
              onChange={() => {
                setDirty(true);
                onDirtyChangeRef.current?.(true);
              }}
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
        </>
      )}
      <section className="recording-location">
        <span><MapPin size={16} aria-hidden="true" /> {lang === "ko" ? "녹음 위치" : "Recording location"}</span>
        {hasLocation(r) ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.latitude},${r.longitude}`)}`} target="_blank" rel="noopener noreferrer">{t.open_in_maps}</a>
          : <p className="muted">{t.no_location}</p>}
      </section>
      <details className="recording-details">
        <summary>{lang === "ko" ? "기록 상세" : "Recording details"}</summary>
        <p className="muted">{t.audio_truth}</p>
        {e && <TranscriptHistory recording={r} lang={lang} />}
        {hasLocation(r) && <section className="context">
          <h3>{t.captured_context}</h3>
          <dl>
            <div><dt>{lang === "ko" ? "정확도" : "Accuracy"}</dt><dd>{r.accuracy != null ? `±${Math.round(r.accuracy)} m` : "—"}</dd></div>
            <div><dt>{lang === "ko" ? "고도" : "Altitude"}</dt><dd>{r.altitude != null ? `${Math.round(r.altitude)} m` : "—"}</dd></div>
            <div><dt>{lang === "ko" ? "속도" : "Speed"}</dt><dd>{r.speed != null ? `${Number(r.speed.toFixed(1))} m/s` : "—"}</dd></div>
          </dl>
          <small>{t.location_snapshot}</small>
        </section>}
        {e && (
          <details className="structured">
            <summary>{t.all_details}</summary>
            <pre>{JSON.stringify(e.structured_data, null, 2)}</pre>
            <small>{t.analysis_version}: {e.pipeline_version ?? "legacy"}</small>
          </details>
        )}
      </details>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
