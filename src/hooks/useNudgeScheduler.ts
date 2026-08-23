import { useEffect, useState } from "react";
import type { Item } from "@shared/item";
import type { ItemLink } from "@shared/links";
import { buildNudges, nextPendingNudge, type Nudge } from "@shared/nudges";
import {
  deliverNudge,
  disableNudges,
  firedNudgeIds,
  nudgesEnabled,
  registerNudgeWorker,
  requestNudgePermission,
  wasNudgeFired
} from "../services/notifications";

export function useNudgeScheduler(items: Item[], links: ItemLink[]) {
  const [enabled, setEnabled] = useState(() => nudgesEnabled());
  const [next, setNext] = useState<Nudge | null>(null);

  useEffect(() => {
    if (!enabled) {
      setNext(null);
      return;
    }
    void registerNudgeWorker();

    let timers: number[] = [];

    function clearTimers() {
      for (const id of timers) {
        window.clearTimeout(id);
      }
      timers = [];
    }

    function schedule() {
      clearTimers();
      const now = new Date();
      const nudges = buildNudges(items, links, now);
      setNext(nextPendingNudge(nudges, now, firedNudgeIds()));
      for (const nudge of nudges) {
        if (wasNudgeFired(nudge.id)) {
          continue;
        }
        const delay = Math.max(0, nudge.fireAt - Date.now());
        timers.push(
          window.setTimeout(() => {
            void deliverNudge(nudge);
          }, delay)
        );
      }
    }

    schedule();
    const pulse = window.setInterval(schedule, 60_000);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimers();
      window.clearInterval(pulse);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [enabled, items, links]);

  async function enable() {
    const permission = await requestNudgePermission();
    setEnabled(permission === "granted" && nudgesEnabled());
    return permission;
  }

  function disable() {
    disableNudges();
    setEnabled(false);
  }

  return { enabled, next, enable, disable };
}
