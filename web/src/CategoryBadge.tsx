import {
  Activity,
  FileText,
  Luggage,
  Mic,
  MapPin,
  Receipt,
} from "lucide-react";

export function CategoryBadge({
  type,
  size = 12,
}: {
  type: string | undefined;
  size?: number;
}) {
  const norm = type?.toUpperCase();
  switch (norm) {
    case "STAY":
      return <span className="category category-stay"><MapPin size={size} /> 체류 · STAY</span>;
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
    case "STAY":
      return <MapPin size={size} />;
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
