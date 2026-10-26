import type { ReactNode } from "react";
import { presence, splitStayByDate, visibleStay } from "./domain.ts";
import type { Stay, StaySlice } from "./types.ts";
import "./stays.css";

/** Unmounted foundation component. Caller owns permissions, fetching and clock refresh. */
export function StayTimeline({ stays, now, timeZone, lang = "ko", date, renderRecordings, onSavePlace }: {
  stays: Stay[]; now: number; timeZone: string; lang?: "ko" | "en"; date?: string;
  renderRecordings: (stay: Stay, slice: StaySlice) => ReactNode;
  onSavePlace: (stay: Stay) => void;
}) {
  const ko = lang === "ko";
  const time = (value: number) => new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {
    timeZone, hour: "2-digit", minute: "2-digit",
  }).format(value);
  const segments = stays.filter(s => visibleStay(s, now)).flatMap(stay =>
    splitStayByDate(stay, timeZone).filter(slice => !date || slice.date === date).map(slice => ({ stay, slice })));
  segments.sort((a, b) => a.slice.from - b.slice.from || a.stay.id.localeCompare(b.stay.id));
  return <section className="stay-timeline" aria-label={ko ? "체류 기록" : "Observed stays"}>
    <p>{ko ? "위치 관측으로 추정한 체류입니다." : "Stays inferred from location observations."} · {timeZone}</p>
    {!segments.length && <p>{ko ? "이 날짜에 표시할 체류가 없습니다." : "No observed stays to show for this date."}</p>}
    {segments.map(({ stay, slice }) => {
      const state = presence(stay, now);
      return <details key={`${stay.id}:${slice.date}`}>
        <summary>{slice.date} · {time(slice.from)}–{time(slice.to)} · {ko ? "이름 없는 체류" : "Unnamed stay"}</summary>
        <p>{state === "active" ? (ko ? "최근 관측에서 체류 확인" : "Presence recently observed") :
          state === "stale" ? (ko ? "관측이 오래되어 현재 상태를 알 수 없습니다." : "Observation is stale; current presence is unknown.") :
            (ko ? "종료된 체류" : "Closed stay")}</p>
        <p>{ko ? "마지막 확인" : "Last observed"}: {new Date(stay.last_observed_at).toLocaleString(ko ? "ko-KR" : "en-US", { timeZone })}</p>
        {stay.end_reason && <p>{({ moved: ko ? "이동 확인" : "Movement confirmed", observation_gap: ko ? "관측 공백" : "Observation gap", stopped: ko ? "기록 중단" : "Journal stopped", interrupted: ko ? "예기치 않은 중단" : "Interrupted" })[stay.end_reason]}</p>}
        <button type="button" onClick={() => onSavePlace(stay)}>{ko ? "내 장소로 저장" : "Save as my place"}</button>
        {renderRecordings(stay, slice)}
      </details>;
    })}
  </section>;
}
