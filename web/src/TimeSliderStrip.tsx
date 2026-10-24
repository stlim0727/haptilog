import { useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles } from "lucide-react";
import { latest, localDate, toLocalDateString } from "./domain";
import type { Recording } from "./domain";
import type { translations } from "./i18n";

export default function TimeSliderStrip({
  recordings,
  selectedDateKey,
  onSelectDate,
  t,
  lang,
}: {
  recordings: Recording[];
  selectedDateKey: string; // "ALL" or "YYYY-MM-DD"
  onSelectDate: (key: string) => void;
  t: (typeof translations)["en"] | (typeof translations)["ko"];
  lang: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayKey = toLocalDateString();

  // Group recordings by local date key
  const dateMap = new Map<string, Recording[]>();
  for (const r of recordings) {
    const key = localDate(r.recorded_at);
    const list = dateMap.get(key) ?? [];
    list.push(r);
    dateMap.set(key, list);
  }

  // Ensure today is at least present in keys if there are recordings
  const dateKeysSet = new Set(dateMap.keys());
  if (recordings.length > 0) {
    dateKeysSet.add(todayKey);
  }

  // Sort ascending chronologically (left: past -> right: today)
  const sortedDates = Array.from(dateKeysSet).sort((a, b) => a.localeCompare(b));

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const offset = direction === "left" ? -280 : 280;
    scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  // Scroll active card into view on mount or change
  useEffect(() => {
    if (!scrollRef.current || selectedDateKey === "ALL") return;
    const activeEl = scrollRef.current.querySelector<HTMLElement>(
      `[data-date-key="${selectedDateKey}"]`,
    );
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selectedDateKey]);

  const weekdayNames = lang === "ko"
    ? ["일", "월", "화", "수", "목", "금", "토"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="time-strip-container" aria-label={t.strip_heading}>
      <div className="time-strip-header">
        <div className="time-strip-title">
          <CalendarIcon size={14} />
          <strong>{t.strip_heading}</strong>
          {selectedDateKey !== "ALL" ? (
            <span className="time-strip-current-badge">
              {selectedDateKey} {selectedDateKey === todayKey ? `(${t.strip_today})` : ""}
            </span>
          ) : (
            <span className="time-strip-current-badge all">
              <Sparkles size={11} /> {t.strip_all_days}
            </span>
          )}
        </div>

        <div className="time-strip-actions">
          <button
            type="button"
            className={`time-strip-all-btn ${selectedDateKey === "ALL" ? "active" : ""}`}
            onClick={() => onSelectDate("ALL")}
          >
            {t.strip_all_days}
          </button>
          <button
            type="button"
            className="time-strip-nav-btn"
            onClick={() => scroll("left")}
            aria-label={t.strip_prev}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            className="time-strip-nav-btn"
            onClick={() => scroll("right")}
            aria-label={t.strip_next}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="time-strip-track" ref={scrollRef}>
        {sortedDates.map((dateKey) => {
          const list = dateMap.get(dateKey) ?? [];
          const isSelected = selectedDateKey === dateKey;
          const isToday = dateKey === todayKey;

          const parts = dateKey.split("-");
          const monthNum = parts[1];
          const dayNum = parts[2];
          const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          const weekday = weekdayNames[dateObj.getDay()];

          // Extract distinct categories present on this day
          const categories = new Set(
            list.map((r) => latest(r)?.intent_type?.toLowerCase() ?? "voice"),
          );

          return (
            <div
              key={dateKey}
              data-date-key={dateKey}
              className={`time-strip-card ${isSelected ? "selected" : ""} ${
                isToday ? "today" : ""
              } ${list.length === 0 ? "empty-day" : ""}`}
              onClick={() => onSelectDate(dateKey)}
              role="button"
              tabIndex={0}
              onKeyDown={(evt) => {
                if (evt.key === "Enter" || evt.key === " ") {
                  evt.preventDefault();
                  onSelectDate(dateKey);
                }
              }}
            >
              <div className="time-strip-card-top">
                <span className="time-strip-weekday">{weekday}</span>
                {isToday && <span className="time-strip-today-badge">{t.strip_today}</span>}
              </div>

              <div className="time-strip-card-date">
                <span className="time-strip-date-number">{monthNum}.{dayNum}</span>
              </div>

              <div className="time-strip-card-bottom">
                <span className="time-strip-count">
                  {list.length > 0 ? `${list.length}${lang === "ko" ? "건" : " logs"}` : "-"}
                </span>

                <div className="time-strip-dots" aria-hidden="true">
                  {categories.has("expense") && <span className="dot dot-expense" />}
                  {categories.has("travel") && <span className="dot dot-travel" />}
                  {categories.has("workout") && <span className="dot dot-workout" />}
                  {categories.has("memo") && <span className="dot dot-memo" />}
                  {categories.has("voice") && !categories.has("expense") && !categories.has("travel") && (
                    <span className="dot dot-voice" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
