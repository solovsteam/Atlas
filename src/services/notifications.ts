import type { Nudge } from "@shared/nudges";

const ENABLED_KEY = "atlas.nudges.enabled";
const FIRED_KEY = "atlas.nudges.fired";
const FIRED_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export function nudgesEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNudgesEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestNudgePermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") {
    return "unsupported";
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    setNudgesEnabled(true);
    await registerNudgeWorker();
  }
  return permission;
}

export function disableNudges(): void {
  setNudgesEnabled(false);
}

function readFired(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, number>;
    const cutoff = Date.now() - FIRED_MAX_AGE_MS;
    const next: Record<string, number> = {};
    for (const [id, at] of Object.entries(parsed)) {
      if (at >= cutoff) {
        next[id] = at;
      }
    }
    return next;
  } catch {
    return {};
  }
}

export function firedNudgeIds(): Set<string> {
  return new Set(Object.keys(readFired()));
}

export function markNudgeFired(id: string): void {
  const next = readFired();
  next[id] = Date.now();
  localStorage.setItem(FIRED_KEY, JSON.stringify(next));
}

export function wasNudgeFired(id: string): boolean {
  return Boolean(readFired()[id]);
}

export async function registerNudgeWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    // Dev or missing file — page notifications still work.
  }
}

export async function deliverNudge(nudge: Nudge): Promise<void> {
  if (wasNudgeFired(nudge.id)) {
    return;
  }
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    return;
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }

  const options: NotificationOptions = {
    body: nudge.body,
    tag: nudge.id,
    silent: false
  };

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.showNotification) {
      await registration.showNotification(nudge.title, options);
    } else {
      new Notification(nudge.title, options);
    }
    markNudgeFired(nudge.id);
  } catch {
    try {
      new Notification(nudge.title, options);
      markNudgeFired(nudge.id);
    } catch {
      // Permission revoked or browser blocked the banner.
    }
  }
}
