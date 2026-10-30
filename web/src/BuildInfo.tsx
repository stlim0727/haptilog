import { useEffect, useState } from "react";

declare const __BUILD_INFO__: { branch: string; commit: string; committedAt: string };

export function BuildInfo() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const { branch, commit, committedAt } = __BUILD_INFO__;
  if (!commit || !committedAt) return null;
  const minutes = Math.max(0, Math.floor((now - Date.parse(committedAt)) / 60_000));
  const hours = Math.floor(minutes / 60);
  const age = minutes < 1 ? "just now" : hours > 0 ? `${hours}h ${minutes % 60}min ago` : `${minutes}min ago`;
  return (
    <small className="build-info" aria-label="Deployed version">
      <span>{branch}</span> · <a href={`https://github.com/stlim0727/haptilog/commit/${commit}`} target="_blank" rel="noopener noreferrer" title={commit}>{commit.slice(0, 7)}</a> · <time dateTime={committedAt} title={new Date(committedAt).toLocaleString()}>{age}</time>
    </small>
  );
}
