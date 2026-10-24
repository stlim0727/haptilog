import { useEffect, useRef } from "react";
import {
  Activity,
  CalendarDays,
  FileText,
  Luggage,
  MapPin,
  Mic,
  Receipt,
  Tag,
} from "lucide-react";
import { expense, hasLocation, latest, localDate, money } from "./domain";
import type { Recording } from "./domain";
import type { translations } from "./i18n";

export function CategoryBadge({
  type,
  size = 12,
}: {
  type: string | undefined;
  size?: number;
}) {
  const norm = type?.toUpperCase();
  switch (norm) {
    case "EXPENSE":
      return (
        <span className="category category-expense">
          <Receipt size={size} /> 지출 · EXPENSE
        </span>
      );
    case "TRAVEL":
      return (
        <span className="category category-travel">
          <Luggage size={size} /> 여행 · TRAVEL
        </span>
      );
    case "WORKOUT":
      return (
        <span className="category category-workout">
          <Activity size={size} /> 운동 · WORKOUT
        </span>
      );
    case "MEMO":
      return (
        <span className="category category-memo">
          <FileText size={size} /> 메모 · MEMO
        </span>
      );
    default:
      return (
        <span className="category category-voice">
          <Mic size={size} /> 음성 · VOICE
        </span>
      );
  }
}

export function CategoryIcon({
  type,
  size = 14,
}: {
  type: string | undefined;
  size?: number;
}) {
  const norm = type?.toUpperCase();
  switch (norm) {
    case "EXPENSE":
      return <Receipt size={size} />;
    case "TRAVEL":
      return <Luggage size={size} />;
    case "WORKOUT":
      return <Activity size={size} />;
    case "MEMO":
      return <FileText size={size} />;
    default:
      return <Mic size={size} />;
  }
}

export default function TimelineView({
  recordings,
  selectedId,
  onSelect,
  t,
}: {
  recordings: Recording[];
  selectedId: string | null;
  onSelect: (id: string, revealDetails?: boolean) => void;
  t: (typeof translations)["en"] | (typeof translations)["ko"];
}) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Group recordings by date
  const groups: { dateKey: string; items: Recording[] }[] = [];
  const map = new Map<string, Recording[]>();

  for (const r of recordings) {
    const key = localDate(r.recorded_at);
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }

  for (const [dateKey, items] of map.entries()) {
    // Sort items chronologically within day
    items.sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );
    groups.push({ dateKey, items });
  }

  // Scroll to active card when selected externally (e.g. from map)
  useEffect(() => {
    if (!selectedId) return;
    const el = cardRefs.current.get(selectedId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId]);

  if (!recordings.length) {
    return (
      <div className="empty-panel">
        <p className="empty-title">{t.empty_active_title}</p>
        <p className="empty-desc">{t.empty_active_desc}</p>
      </div>
    );
  }

  return (
    <div className="timeline-container" role="feed" aria-label={t.timeline_heading}>
      {groups.map(({ dateKey, items }) => (
        <div key={dateKey} className="timeline-day-group">
          <div className="timeline-day-header">
            <CalendarDays size={14} />
            <span>{dateKey}</span>
            <span className="timeline-day-count">
              {items.length} {t.recordings_unit}
            </span>
          </div>

          <div className="timeline-rail">
            {items.map((r) => {
              const e = latest(r);
              const isSelected = r.id === selectedId;
              const hasGps = hasLocation(r);
              const cost = expense(r);
              const intent = e?.intent_type;

              return (
                <div
                  key={r.id}
                  ref={(node) => {
                    if (node) cardRefs.current.set(r.id, node);
                    else cardRefs.current.delete(r.id);
                  }}
                  className={`timeline-item ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelect(r.id, false)}
                  role="article"
                  tabIndex={0}
                  onKeyDown={(evt) => {
                    if (evt.target !== evt.currentTarget) return;
                    if (evt.key === "Enter" || evt.key === " ") {
                      evt.preventDefault();
                      onSelect(r.id, false);
                    }
                  }}
                >
                  {/* Timeline Node Dot */}
                  <div className={`timeline-node node-${intent?.toLowerCase() ?? "voice"}`}>
                    <CategoryIcon type={intent} size={11} />
                  </div>

                  {/* Timeline Card */}
                  <div className="timeline-card">
                    <div className="timeline-card-top">
                      <time className="timeline-time">
                        {new Date(r.recorded_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </time>
                      <CategoryBadge type={intent} size={11} />
                      {hasGps ? (
                        <span className="gps-pill" title={`${r.latitude}, ${r.longitude}`}>
                          <MapPin size={11} /> {t.gps_badge}
                        </span>
                      ) : (
                        <span className="no-gps-pill">
                          {t.no_gps_badge}
                        </span>
                      )}
                    </div>

                    <strong className="timeline-title">
                      {e?.summary || "Voice recording"}
                    </strong>

                    {cost && cost.amount != null && cost.currency && (
                      <div className="timeline-expense">
                        <Receipt size={12} />
                        <span>{money(cost.amount, cost.currency)}</span>
                        {cost.merchant && <span className="merchant-tag">· {cost.merchant}</span>}
                      </div>
                    )}

                    <div className="timeline-card-bottom">
                      <span>{r.duration_seconds}s</span>
                      <button
                        type="button"
                        className="timeline-inspect-btn"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          onSelect(r.id, true);
                        }}
                        onKeyDown={(evt) => {
                          evt.stopPropagation();
                        }}
                      >
                        {t.switch_to_detail} ↗
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
