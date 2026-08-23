import { useState } from "react";
import { notificationPermission } from "../services/notifications";
import { useNudges } from "../context/NudgeContext";

export function NudgeToggle() {
  const { enabled, next, enable, disable } = useNudges();
  const [error, setError] = useState<string | null>(null);
  const permission = notificationPermission();

  async function onEnable() {
    const result = await enable();
    if (result === "unsupported") {
      setError("This browser cannot notify you. Import the calendar file instead.");
      return;
    }
    if (result !== "granted") {
      setError("Notifications are blocked. Use the browser site settings, or import today’s blocks into Calendar.");
      return;
    }
    setError(null);
  }

  if (permission === "unsupported") {
    return <p className="text-xs text-neutral-600">This browser cannot send notifications.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {enabled ? (
        <button className="border border-white px-3 py-1.5 text-xs" type="button" onClick={disable}>
          Pings on
        </button>
      ) : (
        <button
          className="border border-neutral-600 px-3 py-1.5 text-xs hover:border-white"
          type="button"
          onClick={() => void onEnable()}
        >
          Ping me at block time
        </button>
      )}
      {enabled && next ? (
        <p className="text-xs text-neutral-500">
          Next: {next.title} ·{" "}
          {next.fireAt <= Date.now()
            ? "due now"
            : new Date(next.fireAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
