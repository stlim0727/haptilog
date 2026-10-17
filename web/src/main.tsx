import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
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
  Headphones,
  Link2,
  LoaderCircle,
  LogOut,
  MapPin,
  Mic,
  RefreshCw,
  ShieldCheck,
  Watch,
} from "lucide-react";
import { supabase } from "./client";
import {
  csv,
  analysisFailure,
  expense,
  latest,
  localDate,
  money,
  processingState,
  taskItems,
  totals,
} from "./domain";
import type { Correction, Recording } from "./domain";
import "./style.css";
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
  const [connection, setConnection] = useState<Connection | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<Recording[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [watchId, setWatchId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("all");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showMap, setShowMap] = useState(false);
  const generation = useRef(0);
  const refreshConnection = useCallback(async () => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setChecking(false);
      return;
    }
    const { data, error } = await supabase
      .from("portal_connections")
      .select("session_id,watch_id,owner_user_id,expires_at")
      .eq("browser_user_id", session.user.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
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
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        generation.current++;
        setConnection(null);
        setRecords([]);
        setLoaded(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  const load = useCallback(async () => {
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
        body: { action: "redeem", watch_id: watchId, code },
      });
      if (error) throw error;
      setCode("");
      await refreshConnection();
    } catch {
      setError(
        "Could not connect. Check the ID and code on your watch. If you tried several times, wait before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
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
  const filtered = records.filter((r) => {
    const e = latest(r);
    const day = localDate(r.recorded_at),
      today = localDate(new Date().toISOString());
    return (
      (date === "all" ||
        (date === "today"
          ? day === today
          : day.slice(0, 7) === today.slice(0, 7))) &&
      (category === "All" || e?.intent_type === category.toUpperCase()) &&
      (!search ||
        `${e?.summary ?? ""} ${e?.transcript ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()))
    );
  });
  const active = filtered.find((r) => r.id === selected) ?? filtered[0];
  const totalSeconds = filtered.reduce(
    (n, r) => n + (r.duration_seconds ?? 0),
    0,
  );
  const summary = totals(filtered);
  const ready = filtered.filter((r) => processingState(r) === "Ready").length;
  function exportCsv() {
    const url = URL.createObjectURL(
      new Blob([csv(filtered)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `haptilog-${localDate(new Date().toISOString())}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <header className="topbar">
        <Brand />
        <span className="top-label">A LITTLE SPACE TO REFLECT</span>
        <div className="top-right">
          {connection ? (
            <>
              <span className="watch-label">
                <Watch size={15} /> {connection.watch_id}
              </span>
              <button
                className="icon-button"
                title="Disconnect browser"
                aria-label="Disconnect browser"
                disabled={busy}
                onClick={disconnect}
              >
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <span className="watch-label">
              <Watch size={15} /> Made for your wrist. Open on the web.
            </span>
          )}
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
      {checking ? (
        <main className="loading">
          <LoaderCircle className="spin" /> Opening your space…
        </main>
      ) : !connection ? (
        <main className="pair-page">
          <section className="pair-story">
            <span className="eyebrow">
              <span className="red-dot" /> FROM YOUR WRIST, TO HERE
            </span>
            <h1>
              Your voice.
              <br />A little <em>clearer.</em>
            </h1>
            <p>
              That passing thought. The coffee on the corner.
              <br />A moment worth keeping. Come back to it here.
            </p>
            <div className="voice-card">
              <span className="voice-glyph">
                <AudioLines size={38} />
              </span>
              <div>
                <span className="eyebrow">CAPTURE IN THE MOMENT</span>
                <p>Review at your own pace.</p>
              </div>
              <span className="voice-line" />
            </div>
            <div className="pair-promises">
              <span>
                <Headphones size={16} /> Your original audio, always
              </span>
              <span>
                <ShieldCheck size={16} /> Only the browsers you connect
              </span>
            </div>
          </section>
          <section className="pair-card">
            <span className="step-label">YOUR WATCH → YOUR BROWSER</span>
            <h2>Make the connection.</h2>
            <p>
              On your watch, open <strong>Web access</strong> and tap{" "}
              <strong>Create code</strong>. Enter what you see below.
            </p>
            {!supabase ? (
              <div className="setup-note">
                <CircleHelp size={20} />
                <div>
                  <strong>This portal is ready for setup.</strong>
                  <p>
                    Configure the Supabase URL and publishable key to connect
                    your watch.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={pair}>
                <label htmlFor="watch-id">Watch ID</label>
                <input
                  id="watch-id"
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="HL-0123456789"
                  value={watchId}
                  onChange={(e) => setWatchId(e.target.value.toUpperCase())}
                  required
                  pattern="HL-[A-Fa-f0-9]{10}"
                  maxLength={13}
                />
                <label htmlFor="code">
                  Access code <span>Expires after 5 minutes</span>
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
                  {busy ? "Connecting…" : "Connect my watch"}
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
            <div className="pair-footnote">
              <Link2 size={15} />
              <span>
                No phone. No password. Just your watch.
                <br />
                Disconnect this browser any time.
              </span>
            </div>
          </section>
        </main>
      ) : (
        <main className="workspace">
          <div className="page-heading">
            <div>
              <span className="eyebrow">YOUR EVENING REVIEW</span>
              <h1>
                A day, in your own words<span>.</span>
              </h1>
              <p>Listen back. Find the details. Pick up a thought.</p>
            </div>
            <div className="heading-actions">
              <label className="date-picker">
                <CalendarDays size={16} />
                <span className="sr-only">Date range</span>
                <select value={date} onChange={(e) => setDate(e.target.value)}>
                  <option value="all">All time</option>
                  <option value="today">Today</option>
                  <option value="month">This month</option>
                </select>
              </label>
              <button
                className="secondary-button"
                onClick={exportCsv}
                disabled={!filtered.length}
              >
                <ArrowDownToLine size={16} />
                Export CSV
              </button>
            </div>
          </div>
          <div className="metrics">
            <section>
              <span className="metric-label">SPENDING · SELECTED PERIOD</span>
              <strong>
                {Object.keys(summary.grouped).length
                  ? Object.entries(summary.grouped).map(([c, n]) => (
                      <span key={c}>{money(n, c)} </span>
                    ))
                  : "—"}
              </strong>
              <small>
                {summary.incomplete
                  ? `${summary.incomplete} expense${summary.incomplete > 1 ? "s" : ""} need amount or currency`
                  : "Each currency counted separately"}
              </small>
            </section>
            <section>
              <span className="metric-label">MOMENTS CAPTURED</span>
              <strong>
                {filtered.length}
                <span className="metric-unit"> recordings</span>
              </strong>
              <small>
                {Math.floor(totalSeconds / 60)}m {totalSeconds % 60}s captured
              </small>
            </section>
            <section>
              <span className="metric-label">READY TO REVIEW</span>
              <strong>
                {ready}
                <span className="metric-unit"> / {filtered.length}</span>
              </strong>
              <small>
                <span className="status-dot" />{" "}
                {filtered.length - ready
                  ? `${filtered.length - ready} awaiting attention or analysis`
                  : "Your uploaded moments, at a glance"}
              </small>
            </section>
          </div>
          <div className="sync-note">
            <Activity size={14} />
            <span>
              {lastChecked
                ? `Cloud checked ${lastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Checking cloud…"}{" "}
              · Watch offline queue unknown
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
              Showing the most recent 500 recordings. Totals and exports cover
              only these loaded recordings. Dates use your browser’s timezone.
            </p>
          )}
          <div className="review-layout">
            <section className="map-section" aria-label="Recording map view">
              <div className="map-heading">
                <div>
                  <h2>Your voices, by place</h2>
                  <p>Select a pin to open a recording. Date, category and search filters apply.</p>
                </div>
                <button className="secondary-button" onClick={() => setShowMap(!showMap)} aria-expanded={showMap}>
                  <MapPin size={16} />{showMap ? "Hide map" : "Show map"}
                </button>
              </div>
              {showMap && <MapBoundary><Suspense fallback={<p>Loading map…</p>}>
                <RecordingMap recordings={filtered} selectedId={active?.id ?? null} onSelect={(id, revealDetails) => {
                  setSelected(id);
                  if (revealDetails) requestAnimationFrame(() => document.querySelector(".inspector")?.scrollIntoView({ block: "start", behavior: "smooth" }));
                }} />
              </Suspense></MapBoundary>}
            </section>
            <section className="feed" aria-label="Recordings">
              <div className="feed-heading">
                <h2>Your moments</h2>
                <span>{filtered.length}</span>
              </div>
              <div
                className="tabs"
                role="group"
                aria-label="Recording category"
              >
                {["All", "Expense", "Travel", "Workout", "Memo"].map((c) => (
                  <button
                    key={c}
                    className={category === c ? "active" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <input
                className="search"
                type="search"
                aria-label="Search transcripts"
                placeholder="Find a thought…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {!loaded ? (
                <div className="empty">
                  <LoaderCircle className="spin" />
                  <h3>Finding your moments…</h3>
                </div>
              ) : !filtered.length ? (
                <div className="empty">
                  <Mic size={30} />
                  <h3>
                    {records.length
                      ? "Nothing here just yet."
                      : "Your first moment starts on your wrist."}
                  </h3>
                  <p>
                    {records.length
                      ? "Try another date, category, or search."
                      : "Record a thought on your watch and enable cloud sync. It will appear here after upload."}
                  </p>
                  <small>
                    Original audio stays on your watch. No demo recordings here.
                  </small>
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
                          <span
                            className={`category category-${e?.intent_type?.toLowerCase()}`}
                          >
                            {e?.intent_type ?? "VOICE"}
                          </span>
                        </span>
                        <strong>
                          {e?.summary || "A moment, waiting to be heard"}
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
                            <span>{r.duration_seconds ?? "—"} sec</span>
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
                  onError={setError}
                />
              ) : (
                <div className="inspector-empty">
                  <span className="empty-orbit">
                    <AudioLines size={36} />
                  </span>
                  <h2>A closer listen.</h2>
                  <p>
                    Select a moment to hear the original,
                    <br />
                    read the transcript, and explore the details.
                  </p>
                </div>
              )}
            </section>
          </div>
          <p className="timezone-note">
            Dates and daily totals use{" "}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}. Only uploaded
            recordings are visible here.
          </p>
        </main>
      )}
      <footer>
        <span>HaptiLog · A little less to remember.</span>
        <span>CAPTURE QUIETLY. COME BACK CLEARLY.</span>
      </footer>
    </>
  );
}
function Inspector({
  recording: r,
  onChange,
  onError,
}: {
  recording: Recording;
  onChange: () => Promise<void>;
  onError: (message: string) => void;
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
    if (!supabase || !r.audio_path || audioUrl) return;
    setAudioBusy(true);
    const { data, error } = await supabase.storage
      .from("recordings")
      .download(r.audio_path);
    if (!mounted.current) return;
    if (error || !data)
      onError("Original audio could not be loaded. Try again when connected.");
    else {
      objectUrl.current = URL.createObjectURL(data);
      setAudioUrl(objectUrl.current);
    }
    setAudioBusy(false);
  }
  async function retry() {
    if (!supabase) return;
    setRetryBusy(true);
    const { error } = await supabase.functions.invoke("voice-enrich", {
      body: { recording_id: r.id },
    });
    if (mounted.current) {
      if (error) {
        let failureCode: string | undefined;
        try { failureCode = (await error.context?.json())?.code; } catch { /* Network errors have no response body. */ }
        onError(analysisFailure(failureCode));
      }
      await onChange();
      setRetryBusy(false);
    }
  }
  async function saveCorrection(patch: Partial<Correction>) {
    if (!supabase) return false;
    setSaving(true);
    const { error } = await supabase
      .from("recording_corrections")
      .upsert(
        { ...patch, recording_id: r.id, updated_at: new Date().toISOString() },
        { onConflict: "recording_id", defaultToNull: false },
      );
    if (mounted.current) {
      if (error) onError("Changes were not saved. Try again when connected.");
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
        "Enter a non-negative amount and a three-letter currency, such as KRW.",
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
      <div className="inspector-top">
        <span className="eyebrow">THE ORIGINAL & THE DETAILS</span>
        <span className={`state-pill ${state === "Ready" ? "is-ready" : ""}`}>
          {state}
        </span>
      </div>
      <h2>{e?.summary || "Your voice, preserved."}</h2>
      <p className="detail-time">
        {new Date(r.recorded_at).toLocaleString()} ·{" "}
        {r.duration_seconds ?? "Unknown"} seconds
      </p>
      <section className="audio-section">
        <div className="section-label">
          <Headphones size={16} /> ORIGINAL AUDIO{" "}
          <span>Always your source of truth</span>
        </div>
        {audioUrl ? (
          <>
            <audio
              ref={player}
              controls
              src={audioUrl}
              onError={() =>
                onError(
                  "This audio could not be played by your browser. Download the original to inspect it.",
                )
              }
            />
            <div className="audio-actions">
              <label>
                Speed{" "}
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
                <ArrowDownToLine size={14} /> Download .m4a
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
                ? "Loading original…"
                : r.audio_path
                  ? "Load original audio"
                  : "Audio not available yet"}
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
                ? "Listening for the details…"
                : "Your audio comes first."}
            </strong>
            <p>
              {state === "Processing" || retryBusy
                ? "Analysis is in progress. You can still listen to the original."
                : analysisFailure(r.enrichment_status?.error_code)}
            </p>
          </div>
          <button
            className="secondary-button"
            onClick={retry}
            disabled={retryBusy || state === "Processing" || !r.audio_path}
          >
            <RefreshCw size={14} />
            {retryBusy ? "Analysing…" : "Retry analysis"}
          </button>
        </div>
      )}
      {e && (
        <>
          <div className="section-label">
            <Mic size={16} /> TRANSCRIPT{" "}
            <span>AI generated · check against audio</span>
          </div>
          <p className="transcript">{e.transcript || "No speech detected."}</p>
          {x && (
            <form
              className="expense-form"
              onSubmit={saveExpense}
              onChange={() => setDirty(true)}
            >
              <div className="section-label">
                EXPENSE DETAILS <span>Your corrections are kept</span>
              </div>
              <div className="field-row">
                <label>
                  Amount
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
                  Currency
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
                Merchant
                <input
                  value={merchant}
                  maxLength={200}
                  onChange={(event) => setMerchant(event.target.value)}
                  placeholder="Add a merchant"
                />
              </label>
              <label>
                Category
                <input
                  value={category}
                  maxLength={100}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Add a category"
                />
              </label>
              <button className="secondary-button" disabled={saving || !dirty}>
                <Check size={14} />
                {saving ? "Saving…" : "Save corrections"}
              </button>
            </form>
          )}
          {tasks.length > 0 && (
            <section className="tasks">
              <div className="section-label">THOUGHTS TO FOLLOW UP</div>
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
            <summary>All generated details</summary>
            <pre>{JSON.stringify(e.structured_data, null, 2)}</pre>
            <small>Analysis version: {e.pipeline_version ?? "legacy"}</small>
          </details>
        </>
      )}
      <section className="context">
        <div className="section-label">
          <MapPin size={16} /> CAPTURED CONTEXT
        </div>
        {r.latitude != null && r.longitude != null ? (
          <>
            <p>
              {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
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
            <small>A location snapshot, recorded with your voice.</small>
          </>
        ) : (
          <p className="muted">No location was captured for this recording.</p>
        )}
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
