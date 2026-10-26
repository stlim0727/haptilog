import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  LayoutList,
  LogOut,
  MapPin,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import CalendarView from "./CalendarView";
import { CategoryIcon } from "./TimelineView";
import { NotionExport } from "./NotionExport";
import {
  expense,
  hasLocation,
  latest,
  localDate,
  money,
  processingState,
} from "./domain";
import type { Recording } from "./domain";
import type { Language, TranslationKeys } from "./i18n";

const RecordingMap = lazy(() => import("./RecordingMap"));
type View = "list" | "map" | "calendar";
class MobileMapBoundary extends React.Component<
  { children: React.ReactNode; message: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed
      ? <p role="alert">{this.props.message}</p>
      : this.props.children;
  }
}

type Props = {
  records: Recording[];
  filtered: Recording[];
  loaded: boolean;
  truncated: boolean;
  date: string;
  setDate: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
  summary: { grouped: Record<string, number>; incomplete: number };
  count: number;
  seconds: number;
  lastChecked: Date | null;
  lang: Language;
  t: TranslationKeys;
  busy: boolean;
  onDraftChange: (dirty: boolean) => void;
  onDetailChange: (open: boolean) => void;
  refresh: () => void;
  exportCsv: () => void;
  disconnect: () => Promise<void>;
  emptyTrash: () => Promise<void>;
  isDemo?: boolean;
  onResetDemo?: () => void;
  locationControl?: React.ReactNode;
  renderInspector: (
    recording: Recording,
    onDirtyChange: (dirty: boolean) => void,
  ) => React.ReactNode;
};

export function MobileWorkspace(p: Props) {
  const { t, lang, filtered, records } = p;
  const ko = lang === "ko";
  const [view, setView] = useState<View>("list");
  const [detailId, setDetailId] = useState<string | null>(() =>
    new URL(location.href).searchParams.get("recording")
  );
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [mapSelected, setMapSelected] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState(
    p.category === "Trash" ? "All" : p.category,
  );
  const [notionOpen, setNotionOpen] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const filter = useRef<HTMLDialogElement>(null);
  const menuReturn = useRef<"menu" | "trash" | "notion">("menu");
  const menuButton = useRef<HTMLButtonElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const detailTitle = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const returnPosition = useRef({ y: 0, id: "" });
  const historyIndex = useRef<number>(
    Number.isSafeInteger(history.state?.mobileIndex)
      ? history.state.mobileIndex
      : 0,
  );
  const restoring = useRef(false);
  const discardMessage = ko
    ? "저장하지 않은 변경을 버리고 돌아갈까요?"
    : "Discard unsaved changes and go back?";
  const discardMessageRef = useRef(discardMessage);
  discardMessageRef.current = discardMessage;
  const detail = records.find((r) => r.id === detailId);
  const isTrash = p.category === "Trash";
  const categories = [
    ["All", t.all_cat],
    ["Expense", t.expense_cat],
    ["Travel", t.travel_cat],
    ["Workout", t.workout_cat],
    ["Memo", t.memo_cat],
  ];
  const located = filtered.filter(hasLocation);
  const placeKey = (r: Recording) => `${r.latitude},${r.longitude}`;
  const places = [...new Set(located.map(placeKey))];
  const currentPlace = selectedPlace && places.includes(selectedPlace)
    ? selectedPlace
    : places[0];
  const placeRecords = located.filter((r) => placeKey(r) === currentPlace);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
    p.onDraftChange(value);
  }, [p.onDraftChange]);

  useLayoutEffect(() => {
    p.onDetailChange(!!detailId);
  }, [detailId, p.onDetailChange]);

  useEffect(() => () => {
    p.onDetailChange(false);
    p.onDraftChange(false);
  }, [p.onDetailChange, p.onDraftChange]);

  useEffect(() => {
    const state = { ...history.state, mobileIndex: historyIndex.current };
    history.replaceState(state, "");
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const pop = (event: PopStateEvent) => {
      const nextIndex = event.state?.mobileIndex ?? 0;
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      if (dirty.current && !window.confirm(discardMessageRef.current)) {
        restoring.current = true;
        history.go(historyIndex.current - nextIndex);
        return;
      }
      dirty.current = false;
      p.onDraftChange(false);
      historyIndex.current = nextIndex;
      const id = new URL(location.href).searchParams.get("recording");
      setDetailId(id);
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("beforeunload", unload);
      history.scrollRestoration = previousRestoration;
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (detailId) {
        window.scrollTo(0, 0);
        detailTitle.current?.focus({ preventScroll: true });
      } else if (returnPosition.current.id) {
        window.scrollTo(0, returnPosition.current.y);
        const card = [
          ...document.querySelectorAll<HTMLElement>("[data-record-id]"),
        ].find((el) =>
          el.dataset.recordId === returnPosition.current.id &&
          el.getClientRects().length
        );
        (card ?? title.current)?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [detailId]);

  function closeDetail() {
    if (history.state?.mobileDetail && historyIndex.current > 0) {
      history.back();
      return;
    }
    if (dirty.current && !window.confirm(discardMessage)) return;
    dirty.current = false;
    p.onDraftChange(false);
    const url = new URL(location.href);
    url.searchParams.delete("recording");
    history.replaceState({ ...history.state, mobileDetail: false }, "", url);
    setDetailId(null);
  }
  function openDetail(r: Recording) {
    returnPosition.current = { y: window.scrollY, id: r.id };
    const url = new URL(location.href);
    url.searchParams.set("recording", r.id);
    historyIndex.current++;
    history.pushState(
      {
        ...history.state,
        mobileIndex: historyIndex.current,
        mobileDetail: true,
      },
      "",
      url,
    );
    setDetailId(r.id);
  }
  // A deleted/removed record must never silently switch the detail to another one.
  useEffect(() => {
    if (
      p.loaded && detailId && (!detail || (!!detail.deleted_at !== isTrash))
    ) {
      dirty.current = false;
      p.onDraftChange(false);
      closeDetail();
    }
  }, [p.loaded, detailId, detail?.deleted_at, isTrash, !!detail]);

  useEffect(() => {
    if (notionOpen) {
      const panel = document.querySelector<HTMLElement>(
        ".mobile-workspace .notion-panel",
      );
      panel?.scrollIntoView({ block: "start" });
      panel?.querySelector<HTMLButtonElement>("button")?.focus({
        preventScroll: true,
      });
    }
  }, [notionOpen]);

  const revealNotion = useCallback(() => {
    setNotionOpen(true);
  }, []);

  function changeView(next: View) {
    setView(next);
  }
  function showMenu() {
    menuReturn.current = "menu";
    menu.current?.showModal();
  }
  function showFilter() {
    setFilterDraft(isTrash ? "All" : p.category);
    filter.current?.showModal();
  }
  function closeMenu() {
    menu.current?.close();
  }
  function enterTrash() {
    menuReturn.current = "trash";
    closeMenu();
    p.setCategory("Trash");
    p.setSearch("");
    p.setDate("all");
    setView("list");
    window.scrollTo(0, 0);
  }
  function card(r: Recording) {
    const e = latest(r), cost = expense(r), state = processingState(r);
    const category =
      categories.find(([key]) => key.toUpperCase() === e?.intent_type)?.[1] ??
        (ko ? "음성" : "Voice");
    return (
      <button
        type="button"
        className="mobile-record"
        key={r.id}
        data-record-id={r.id}
        onClick={() => openDetail(r)}
      >
        <span className="mobile-record-meta">
          <time>
            {new Date(r.recorded_at).toLocaleTimeString(lang, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          <span
            className={`category category-${
              e?.intent_type?.toLowerCase() ?? "voice"
            }`}
          >
            <CategoryIcon type={e?.intent_type} size={12} />
            {category}
          </span>
        </span>
        <strong>
          {e?.summary ||
            (ko ? "기다리는 음성 기록" : "A moment, waiting to be heard")}
        </strong>
        <span className="mobile-record-foot">
          <Clock size={13} />
          <span>{r.duration_seconds ?? "—"}{ko ? "초" : " sec"}</span>
          {hasLocation(r) && <MapPin size={13} aria-label={t.gps_badge} />}
          {state !== "Ready" && (
            <span>
              {state === "Processing"
                ? (ko ? "분석 중" : "Processing")
                : (ko ? "분석 대기" : "Needs analysis")}
            </span>
          )}
          {cost?.amount != null && cost.currency && (
            <span className="mobile-amount">
              {money(cost.amount, cost.currency)}
            </span>
          )}
          <ChevronRight size={17} />
        </span>
      </button>
    );
  }
  const days = [...new Set(filtered.map((r) => localDate(r.recorded_at)))];
  return (
    <div className="mobile-workspace">
      <div hidden={!!detailId}>
        <main>
          {p.isDemo && (
            <div className="demo-mode-banner" role="status" aria-label="Demo mode notice">
              <div className="demo-banner-content">
                <span className="demo-banner-badge">
                  <Sparkles size={12} />
                  {t.preview_banner_badge}
                </span>
                <span className="demo-banner-text">{t.preview_banner_text}</span>
              </div>
              <div className="demo-banner-actions">
                {p.onResetDemo && (
                  <button
                    type="button"
                    className="demo-reset-btn"
                    onClick={p.onResetDemo}
                    title={t.preview_banner_reset}
                  >
                    <RotateCcw size={13} />
                    {t.preview_banner_reset}
                  </button>
                )}
                <button
                  type="button"
                  className="demo-exit-btn"
                  onClick={p.disconnect}
                  title={t.preview_banner_exit}
                >
                  <LogOut size={13} />
                  {t.preview_banner_exit}
                </button>
              </div>
            </div>
          )}
          <div className="mobile-heading">
            <div>
              <span className="eyebrow">
                {ko ? "나의 목소리로 남긴 순간" : "YOUR VOICE, REMEMBERED."}
              </span>
              <h1 ref={title} tabIndex={-1}>
                {isTrash ? t.trash : (ko ? "내가 남긴 순간들" : "Your moments")}
              </h1>
            </div>
            <button
              ref={menuButton}
              type="button"
              className="mobile-icon"
              aria-label={ko ? "더보기" : "More options"}
              onClick={showMenu}
            >
              <MoreHorizontal />
            </button>
          </div>
          {p.locationControl}
          {isTrash
            ? (
              <div className="mobile-toolbar">
                <button
                  className="secondary-button"
                  onClick={() => p.setCategory("All")}
                >
                  <ArrowLeft size={16} />
                  {ko ? "전체 기록" : "All recordings"}
                </button>
                {filtered.length > 0 && (
                  <button className="text-button" onClick={p.emptyTrash}>
                    {t.empty_trash}
                  </button>
                )}
              </div>
            )
            : (
              <>
                <div className="mobile-toolbar">
                  <label className="date-picker">
                    <CalendarDays size={16} />
                    <span className="sr-only">
                      {ko ? "조회 기간" : "Date range"}
                    </span>
                    <select
                      value={p.date}
                      onChange={(e) => p.setDate(e.target.value)}
                    >
                      <option value="all">{t.all_time}</option>
                      <option value="today">{t.today}</option>
                      <option value="month">{t.this_month}</option>
                    </select>
                  </label>
                  <button
                    className="mobile-icon"
                    aria-label={ko ? "기록 새로고침" : "Refresh recordings"}
                    onClick={p.refresh}
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
                <div className="mobile-summary">
                  <span>
                    {ko ? `기록 ${p.count}개` : `${p.count} recordings`} ·{" "}
                    {Math.floor(p.seconds / 60)}
                    {ko ? "분" : "m"} {p.seconds % 60}
                    {ko ? "초" : "s"}
                  </span>
                  <span>
                    {Object.entries(p.summary.grouped).map((
                      [currency, amount],
                    ) => <span key={currency}>{money(amount, currency)}</span>)}
                  </span>
                </div>
                {!!p.summary.incomplete && (
                  <p className="mobile-note">
                    {t.spending_incomplete(p.summary.incomplete)}
                  </p>
                )}
                <nav
                  className="mobile-views"
                  aria-label={ko ? "기록 보기" : "Recording views"}
                >
                  {([["list", t.view_list, LayoutList], [
                    "map",
                    ko ? "지도" : "Map",
                    MapPin,
                  ], [
                    "calendar",
                    ko ? "달력" : "Calendar",
                    CalendarDays,
                  ]] as const).map(([key, label, Icon]) => (
                    <button
                      type="button"
                      key={key}
                      aria-current={view === key ? "page" : undefined}
                      onClick={() => changeView(key)}
                    >
                      <Icon size={17} />
                      {label}
                    </button>
                  ))}
                </nav>
              </>
            )}
          <div className="mobile-search-row">
            <label className="mobile-search">
              <Search size={18} />
              <span className="sr-only">
                {ko ? "기록 검색" : "Search transcripts"}
              </span>
              <input
                type="search"
                placeholder={t.search_placeholder}
                value={p.search}
                onChange={(e) => p.setSearch(e.target.value)}
              />
            </label>
            {!isTrash && (
              <button
                ref={filterButton}
                className="secondary-button"
                onClick={showFilter}
              >
                <SlidersHorizontal size={16} />
                {ko ? "필터" : "Filter"}
                {p.category !== "All" && " · 1"}
              </button>
            )}
          </div>
          {!isTrash && p.category !== "All" && (
            <div className="mobile-active-filter">
              <span>{categories.find(([key]) => key === p.category)?.[1]}</span>
              <button
                onClick={() => {
                  p.setCategory("All");
                  filterButton.current?.focus();
                }}
              >
                {ko ? "필터 해제" : "Clear filter"}
                <X size={14} />
              </button>
            </div>
          )}
          {p.truncated && <p className="limit-note">{t.showing_limit_note}</p>}
          {!p.loaded ? <p role="status">{t.finding_moments}</p> : (
            <>
              {view === "list" && (filtered.length
                ? days.map((day) => (
                  <section key={day}>
                    <h2 className="mobile-day-heading">
                      {new Date(`${day}T12:00:00`).toLocaleDateString(lang, {
                        month: "long",
                        day: "numeric",
                        weekday: "short",
                      })}
                      <span>
                        {filtered.filter((r) =>
                          localDate(r.recorded_at) === day
                        ).length}
                        {ko ? "개" : " records"}
                      </span>
                    </h2>
                    {filtered.filter((r) => localDate(r.recorded_at) === day)
                      .map(card)}
                  </section>
                ))
                : (
                  <div className="mobile-empty">
                    <h2>
                      {isTrash
                        ? t.empty_trash_title
                        : records.length
                        ? t.empty_active_title
                        : t.empty_first_title}
                    </h2>
                    <p>
                      {isTrash
                        ? t.empty_trash_desc
                        : records.length
                        ? t.empty_active_desc
                        : t.empty_first_desc}
                    </p>
                  </div>
                ))}
              {view === "calendar" && (
                <CalendarView
                  recordings={filtered}
                  selectedId={detailId}
                  onSelect={(id) => {
                    const r = records.find((r) => r.id === id);
                    if (r) openDetail(r);
                  }}
                  t={t}
                  lang={lang}
                />
              )}
              {view === "map" && (
                <section className="mobile-map-view">
                  <p className="mobile-note">
                    {ko
                      ? `위치 있는 기록 ${located.length}개 · 장소 ${places.length}곳`
                      : `${located.length} located recordings · ${places.length} places`}
                  </p>
                  <MobileMapBoundary
                    message={ko
                      ? "지도를 불러올 수 없어요. 아래 기록이나 목록을 이용해 주세요."
                      : "Map unavailable. Use the records below or the list."}
                  >
                    <Suspense fallback={<p>{t.loading_map}</p>}>
                      <RecordingMap
                        heading={t.map_heading}
                        recordings={filtered}
                        selectedId={mapSelected}
                        showRoute={false}
                        lang={lang}
                        onSelect={(id, reveal) => {
                          const r = records.find((r) => r.id === id);
                          if (!r) {
                            return;
                          }
                          setSelectedPlace(placeKey(r));
                          setMapSelected(id);
                          if (reveal) {
                            openDetail(r);
                          }
                        }}
                      />
                    </Suspense>
                  </MobileMapBoundary>
                  <div className="mobile-map-access">
                    <span>
                      {ko
                        ? `위치 없는 기록 ${filtered.length - located.length}개`
                        : `${
                          filtered.length - located.length
                        } without location`}
                    </span>
                    <button
                      className="text-button"
                      onClick={() => {
                        setView("list");
                        requestAnimationFrame(() =>
                          document.querySelector<HTMLButtonElement>(
                            '.mobile-views [aria-current="page"]',
                          )?.focus()
                        );
                      }}
                    >
                      {ko ? "목록에서 보기" : "View list"}
                    </button>
                  </div>
                  {places.length > 0 && (
                    <label className="mobile-place-select">
                      {ko ? "장소 선택" : "Choose a place"}
                      <select
                        value={currentPlace}
                        onChange={(e) => {
                          setSelectedPlace(e.target.value);
                          setMapSelected(
                            located.find((r) => placeKey(r) === e.target.value)
                              ?.id ?? null,
                          );
                        }}
                      >
                        {places.map((key, index) => (
                          <option key={key} value={key}>
                            {ko ? `장소 ${index + 1}` : `Place ${index + 1}`} ·
                            {" "}
                            {located.filter((r) =>
                              placeKey(r) === key
                            ).length}
                            {ko ? "개 기록" : " recordings"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {placeRecords.map(card)}
                </section>
              )}
            </>
          )}
          <p className="mobile-sync">
            {p.lastChecked
              ? t.cloud_checked(
                p.lastChecked.toLocaleTimeString(lang, {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              )
              : t.checking_cloud} · {t.watch_queue_unknown}
          </p>
          <p className="timezone-note">
            {t.timezone_note(Intl.DateTimeFormat().resolvedOptions().timeZone)}
          </p>
          <div hidden={!notionOpen || isTrash}>
            <NotionExport
              records={filtered}
              ko={ko}
              onAuthorizationReturn={p.loaded ? revealNotion : undefined}
            />
          </div>
        </main>
      </div>
      {detailId && (
        <main className="mobile-detail">
          <div className="mobile-detail-nav">
            <button onClick={closeDetail}>
              <ArrowLeft size={18} />
              {ko ? "돌아가기" : "Back to recordings"}
            </button>
          </div>
          <div
            ref={detailTitle}
            tabIndex={-1}
            className="inspector"
            aria-label={ko ? "기록 상세" : "Recording details"}
          >
            {detail ? p.renderInspector(detail, onDirtyChange) : (
              <p>
                {ko ? "기록을 찾을 수 없어요." : "Recording unavailable."}
              </p>
            )}
          </div>
        </main>
      )}
      <dialog
        ref={menu}
        className="mobile-dialog"
        aria-labelledby="mobile-menu-title"
        onClose={() =>
          requestAnimationFrame(() => {
            if (menuReturn.current === "trash") title.current?.focus();
            else if (menuReturn.current === "notion") {
              document.querySelector<HTMLButtonElement>(
                ".mobile-workspace .notion-panel > button",
              )?.focus();
            } else menuButton.current?.focus();
          })}
      >
        <div className="mobile-dialog-heading">
          <h2 id="mobile-menu-title">{ko ? "더보기" : "More options"}</h2>
          <button
            className="mobile-icon"
            aria-label={ko ? "닫기" : "Close"}
            onClick={closeMenu}
          >
            <X />
          </button>
        </div>
        <button onClick={enterTrash}>
          <Trash2 size={18} />
          {t.trash} ({records.filter((r) => r.deleted_at).length})
        </button>
        <button
          disabled={!filtered.length}
          onClick={() => {
            closeMenu();
            p.exportCsv();
          }}
        >
          <ArrowDownToLine size={18} />
          {t.export_csv}
        </button>
        <button
          onClick={() => {
            menuReturn.current = "notion";
            setNotionOpen(true);
            closeMenu();
          }}
        >
          <FileText size={18} />
          {ko ? "Notion으로 내보내기" : "Export to Notion"}
        </button>
        <button
          disabled={p.busy}
          onClick={() => {
            closeMenu();
            void p.disconnect();
          }}
        >
          <LogOut size={18} />
          {t.disconnect}
        </button>
      </dialog>
      <dialog
        ref={filter}
        className="mobile-dialog"
        aria-labelledby="mobile-filter-title"
        onClose={() => filterButton.current?.focus()}
      >
        <div className="mobile-dialog-heading">
          <h2 id="mobile-filter-title">
            {ko ? "기록 필터" : "Filter recordings"}
          </h2>
          <button
            className="mobile-icon"
            aria-label={ko ? "닫기" : "Close"}
            onClick={() => filter.current?.close()}
          >
            <X />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            p.setCategory(filterDraft);
            filter.current?.close();
          }}
        >
          <label htmlFor="mobile-category">{t.category}</label>
          <select
            id="mobile-category"
            value={filterDraft}
            onChange={(e) => setFilterDraft(e.target.value)}
          >
            {categories.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button className="primary-button" type="submit">
            {ko ? "필터 적용" : "Apply filter"}
          </button>
        </form>
      </dialog>
    </div>
  );
}
