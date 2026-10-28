import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  MapPin,
  Clock,
} from "lucide-react";
import { CategoryBadge } from "./CategoryBadge";
import { money, toLocalDateString } from "./domain";
import type { Recording } from "./domain";
import { voiceItem, journalDates, journalTitle, journalIntent, journalExpense, journalDuration, journalLocated } from "./journal";
import type { JournalItem } from "./journal";
import type { TranslationKeys } from "./i18n";

export default function CalendarView({
  recordings,
  journalItems,
  selectedId,
  onSelect,
  t,
  lang = "en",
  onDateChange,
  selectedDateKey,
  onSelectDay,
}: {
  lang?: "en" | "ko";
  onDateChange?: () => boolean | void;
  selectedDateKey: string;
  onSelectDay: (dateKey: string) => void;
  recordings: Recording[];
  journalItems?: JournalItem[];
  selectedId: string | null;
  onSelect: (id: string, revealDetails?: boolean) => void;
  t: TranslationKeys;
}) {
  const [currentDate, setCurrentDate] = useState(() => new Date(`${selectedDateKey}T12:00:00`));

  // The selected day can change from outside the grid (e.g. the time slider),
  // so keep the displayed month in sync with it.
  useEffect(() => {
    const next = new Date(`${selectedDateKey}T12:00:00`);
    setCurrentDate((prev) =>
      prev.getFullYear() === next.getFullYear() && prev.getMonth() === next.getMonth()
        ? prev : next);
  }, [selectedDateKey]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const items = journalItems ?? recordings.map(voiceItem);
  // One original stay appears on each observed local date.
  const dateMap = new Map<string, JournalItem[]>();
  for (const r of items) for (const key of journalDates(r)) {
    const list = dateMap.get(key) ?? []; list.push(r); dateMap.set(key, list);
  }

  // Days in month calculation
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const selectDate = (next: Date) => {
    const key = toLocalDateString(next);
    if (key === selectedDateKey) return;
    if (onDateChange?.() === false) return;
    setCurrentDate(next);
    onSelectDay(key);
  };
  const prevMonth = () => selectDate(new Date(year, month - 1, 1));
  const nextMonth = () => selectDate(new Date(year, month + 1, 1));
  const goToday = () => selectDate(new Date());

  const dayCells = [];

  // Previous month trailing days
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    dayCells.push({
      day: prevMonthDays - i,
      monthOffset: -1,
      dateKey: "",
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const monthStr = String(month + 1).padStart(2, "0");
    const dayStr = String(d).padStart(2, "0");
    const dateKey = `${year}-${monthStr}-${dayStr}`;
    dayCells.push({
      day: d,
      monthOffset: 0,
      dateKey,
      isCurrentMonth: true,
    });
  }

  // Next month leading days (to complete 35 or 42 cells)
  const remainingCells = (7 - (dayCells.length % 7)) % 7;
  for (let d = 1; d <= remainingCells; d++) {
    dayCells.push({
      day: d,
      monthOffset: 1,
      dateKey: "",
      isCurrentMonth: false,
    });
  }

  const selectedDayRecordings = dateMap.get(selectedDateKey) ?? [];

  const weekdays = lang === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="calendar-view-container">
      {/* Calendar Grid Section */}
      <div className="calendar-card">
        <div className="calendar-header">
          <div className="calendar-title-wrap">
            <CalendarIcon size={18} />
            <h2>
              {year}. {String(month + 1).padStart(2, "0")}
            </h2>
          </div>
          <div className="calendar-nav-buttons">
            <button
              type="button"
              className="secondary-button"
              onClick={goToday}
              title={t.calendar_today}
            >
              {t.calendar_today}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={prevMonth}
              aria-label={t.calendar_prev}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={nextMonth}
              aria-label={t.calendar_next}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="calendar-grid">
          {weekdays.map((w) => (
            <div key={w} className="calendar-weekday">
              {w}
            </div>
          ))}

          {dayCells.map((cell, idx) => {
            const list = cell.isCurrentMonth ? dateMap.get(cell.dateKey) ?? [] : [];
            const isSelected = cell.dateKey === selectedDateKey;
            const isToday =
              cell.isCurrentMonth &&
              cell.dateKey === toLocalDateString();

            // Extract distinct category types on this day
            const categories = new Set(
              list.map((r) => journalIntent(r)?.toLowerCase() ?? "voice"),
            );

            return (
              <button
                type="button"
                key={idx}
                disabled={!cell.isCurrentMonth}
                aria-label={cell.isCurrentMonth ? t.selected_date_recordings(cell.dateKey, list.length) : undefined}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                className={`calendar-cell ${!cell.isCurrentMonth ? "other-month" : ""} ${
                  isSelected ? "selected-day" : ""
                } ${isToday ? "today-cell" : ""}`}
                onClick={() => {
                  if (cell.isCurrentMonth) selectDate(new Date(`${cell.dateKey}T12:00:00`));
                }}
              >
                <div className="calendar-cell-top">
                  <span className="calendar-day-num">{cell.day}</span>
                  {list.length > 0 && (
                    <span className="calendar-count-badge">{list.length}</span>
                  )}
                </div>

                {/* Category dots */}
                <div className="calendar-dots">
                  {categories.has("expense") && <span className="cat-dot dot-expense" title="지출" />}
                  {categories.has("travel") && <span className="cat-dot dot-travel" title="여행" />}
                  {categories.has("workout") && <span className="cat-dot dot-workout" title="운동" />}
                  {categories.has("memo") && <span className="cat-dot dot-memo" title="메모" />}
                  {categories.has("stay") && <span className="cat-dot dot-stay" title={lang === "ko" ? "체류" : "Stay"} />}
                  {categories.has("voice") && <span className="cat-dot dot-voice" title="음성" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Details Panel */}
      <div className="calendar-day-panel">
        <div className="calendar-day-panel-header">
          <h3>
            {t.selected_date_recordings(selectedDateKey, selectedDayRecordings.length)}
          </h3>
        </div>

        {selectedDayRecordings.length === 0 ? (
          <div className="calendar-empty-day">
            <p>{t.no_recordings_on_date}</p>
            {items.length > 0 && <button className="text-button" onClick={() => {
              const key = items.flatMap(journalDates).sort().at(-1)!;
              selectDate(new Date(`${key}T12:00:00`));
            }}>{lang === "ko" ? "최근 기록 날짜로 이동" : "Go to latest recording date"}</button>}
          </div>
        ) : (
          <div className="calendar-day-list">
            {selectedDayRecordings.map((r) => {
              const intent = journalIntent(r);
              const cost = journalExpense(r);
              const isSelected = r.id === selectedId;

              return (
                <button
                  type="button"
                  key={r.id}
                  data-record-id={r.id}
                  data-journal-kind={r.kind}
                  className={`calendar-day-card ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelect(r.id, true)}
                >
                  <div className="calendar-day-card-header">
                    <span className="calendar-card-time">
                      <Clock size={12} />
                      {new Date(r.recorded_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <CategoryBadge type={intent} size={11} />
                  </div>

                  <strong className="calendar-card-title">
                    {journalTitle(r, lang)}
                  </strong>

                  {cost && cost.amount != null && cost.currency && (
                    <div className="calendar-card-amount">
                      {money(cost.amount, cost.currency)} {cost.merchant && `· ${cost.merchant}`}
                    </div>
                  )}

                  <div className="calendar-card-footer">
                    <span>{journalDuration(r, lang)}</span>
                    {journalLocated(r) ? (
                      <span className="gps-pill">
                        <MapPin size={11} /> {t.gps_badge}
                      </span>
                    ) : (
                      <span className="no-gps-pill">{t.no_gps_badge}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
