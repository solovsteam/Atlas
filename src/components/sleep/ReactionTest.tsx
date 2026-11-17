import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  createReactionTestResult,
  generateReactionSchedule,
  hasReactionTimedOut,
  isPractice,
  KAROLINSKA_SLEEPINESS_SCALE,
  REACTION_PROTOCOL,
  recordReactionMiss,
  recordReactionResponse,
  type KarolinskaSleepiness,
  type ReactionEvent,
  type ReactionTestResult,
} from "@shared/reactionTest";

export interface ReactionTestProps {
  /** Count completed tests, including previous practice tests. Cancelled tests do not count. */
  previousTestCount: number;
  /** Called once, immediately after the sleepiness selection. The host owns storage. */
  onComplete: (result: ReactionTestResult) => void;
  onCancel: () => void;
}

type Screen = "ready" | "running" | "sleepiness" | "result";
interface TestRun {
  startedAt: string;
  startedPerformanceMs: number;
  deviceBrowser: string;
  previousTestCount: number;
  schedule: Generator<number, never>;
  waitUntilMs: number;
  feedbackUntilMs: number;
  stimulusAtMs: number | null;
  events: ReactionEvent[];
}

/** A standalone screen. It has no route, service, or persistence dependency. */
export function ReactionTest({ previousTestCount, onComplete, onCancel }: ReactionTestProps) {
  const [screen, setScreen] = useState<Screen>("ready");
  const [remainingSeconds, setRemainingSeconds] = useState(REACTION_PROTOCOL.durationMs / 1000);
  const [message, setMessage] = useState("Wait for the dot.");
  const [interruption, setInterruption] = useState<string | null>(null);
  const [result, setResult] = useState<ReactionTestResult | null>(null);
  const runRef = useRef<TestRun | null>(null);
  const finishedRunRef = useRef<TestRun | null>(null);
  const stimulusRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  function hideStimulus() {
    if (stimulusRef.current) stimulusRef.current.style.visibility = "hidden";
  }

  function start() {
    const schedule = generateReactionSchedule();
    runRef.current = {
      startedAt: new Date().toISOString(),
      startedPerformanceMs: performance.now(),
      // The user agent records OS, device and browser identifiers without a service call.
      deviceBrowser: `${navigator.userAgent}; platform=${navigator.platform}; touchPoints=${navigator.maxTouchPoints}`,
      previousTestCount,
      schedule,
      waitUntilMs: schedule.next().value,
      feedbackUntilMs: 0,
      stimulusAtMs: null,
      events: [],
    };
    completedRef.current = false;
    finishedRunRef.current = null;
    setResult(null);
    setInterruption(null);
    setRemainingSeconds(REACTION_PROTOCOL.durationMs / 1000);
    setMessage("Wait for the dot.");
    setScreen("running");
  }

  function finish(run: TestRun) {
    if (runRef.current !== run) return;
    if (run.stimulusAtMs !== null) {
      run.events.push(recordReactionMiss(run.stimulusAtMs, REACTION_PROTOCOL.durationMs));
    }
    hideStimulus();
    finishedRunRef.current = run;
    runRef.current = null;
    setScreen("sleepiness");
  }

  function waitAgain(run: TestRun, elapsedMs: number, feedback: string) {
    hideStimulus();
    run.stimulusAtMs = null;
    run.feedbackUntilMs = elapsedMs + REACTION_PROTOCOL.feedbackMs;
    run.waitUntilMs = run.feedbackUntilMs + run.schedule.next().value;
    setMessage(feedback);
  }

  function tap(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!event.isPrimary || event.button !== 0) return;
    const run = runRef.current;
    if (!run) return;
    const elapsedMs = performance.now() - run.startedPerformanceMs;
    if (elapsedMs >= REACTION_PROTOCOL.durationMs) {
      finish(run);
      return;
    }
    if (run.stimulusAtMs === null) {
      run.events.push({ type: "false-start", atMs: elapsedMs });
      waitAgain(run, elapsedMs, "Too soon. Wait for the dot.");
      return;
    }
    const response = recordReactionResponse(run.stimulusAtMs, elapsedMs);
    run.events.push(response);
    waitAgain(run, elapsedMs, response.type === "response" ? `${Math.round(response.reactionTimeMs)} ms` : "No response.");
  }

  function cancel() {
    runRef.current = null;
    finishedRunRef.current = null;
    hideStimulus();
    setScreen("ready");
    onCancel();
  }

  function selectSleepiness(sleepiness: KarolinskaSleepiness) {
    const run = finishedRunRef.current;
    if (!run || completedRef.current) return;
    completedRef.current = true;
    const completed = createReactionTestResult({ ...run, sleepiness });
    setResult(completed);
    setScreen("result");
    onComplete(completed);
  }

  // Move focus into the full-screen panel and restore it when the host closes it.
  useEffect(() => {
    const previousFocus = document.activeElement;
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  // The previous button may have disappeared when the screen changed.
  useEffect(() => {
    panelRef.current?.focus();
  }, [screen]);

  useEffect(() => {
    if (screen !== "running") return;
    const run = runRef.current;
    if (!run) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousTouchAction = body.style.touchAction;
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    const preventGesture = (event: Event) => event.preventDefault();
    document.addEventListener("touchmove", preventGesture, { passive: false });
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("dblclick", preventGesture, { passive: false });

    // A hidden page cannot present stimuli reliably. Discard this incomplete run
    // instead of silently counting background time as valid performance data.
    function visibilityChanged() {
      if (!document.hidden || runRef.current !== run) return;
      runRef.current = null;
      hideStimulus();
      setInterruption("The test stopped because the screen was hidden. Keep Atlas open when you start again.");
      setScreen("ready");
    }
    document.addEventListener("visibilitychange", visibilityChanged);

    let frame = 0;
    function drawFrame() {
      if (!run || runRef.current !== run) return;
      const elapsedMs = performance.now() - run.startedPerformanceMs;
      if (elapsedMs >= REACTION_PROTOCOL.durationMs) {
        finish(run);
        return;
      }
      setRemainingSeconds((previous) => {
        const next = Math.ceil((REACTION_PROTOCOL.durationMs - elapsedMs) / 1000);
        return previous === next ? previous : next;
      });
      if (run.stimulusAtMs !== null && hasReactionTimedOut(run.stimulusAtMs, elapsedMs)) {
        run.events.push(recordReactionMiss(run.stimulusAtMs, elapsedMs));
        waitAgain(run, elapsedMs, "No response.");
      } else if (run.stimulusAtMs === null && elapsedMs >= run.waitUntilMs && stimulusRef.current) {
        // Mutate the dot in this animation frame. A React state update could be
        // committed in a later frame and start the clock before the dot exists.
        stimulusRef.current.style.visibility = "visible";
        run.stimulusAtMs = performance.now() - run.startedPerformanceMs;
        setMessage("Tap now.");
      } else if (run.stimulusAtMs === null && elapsedMs >= run.feedbackUntilMs) {
        setMessage("Wait for the dot.");
      }
      frame = requestAnimationFrame(drawFrame);
    }
    frame = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibilityChanged);
      document.removeEventListener("touchmove", preventGesture);
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("dblclick", preventGesture);
      body.style.overflow = previousOverflow;
      body.style.touchAction = previousTouchAction;
      if (runRef.current === run) runRef.current = null;
    };
  }, [screen]);

  const running = screen === "running";
  const practice = isPractice(previousTestCount);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Reaction test"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
        if (event.key !== "Tab") return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className={`fixed inset-0 z-[100] flex h-dvh flex-col bg-neutral-950 text-neutral-100 outline-none ${running ? "touch-none select-none overflow-hidden" : "overflow-y-auto overscroll-contain"}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 px-5 pb-3 pt-[max(env(safe-area-inset-top),1rem)]">
        <h1 className="font-semibold">{running ? "Reaction test" : "Daily reaction test"}</h1>
        {running ? <span className="font-mono text-neutral-400" aria-label="Time remaining">{minutes}:{seconds}</span> : null}
        <button type="button" onClick={cancel} className="min-h-11 rounded-xl px-3 text-sm text-neutral-300 hover:bg-neutral-800">
          {screen === "result" ? "Close" : "Cancel"}
        </button>
      </header>

      {screen === "ready" ? (
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6">
          <p className="text-sm text-indigo-300">1 minute{practice ? " · Practice test" : ""}</p>
          <h2 className="text-3xl font-semibold">Tap when the dot appears.</h2>
          <p className="leading-relaxed text-neutral-300">Wait for the red dot, then tap anywhere in the large area as quickly as you can.</p>
          <p className="text-sm leading-relaxed text-neutral-400">Keep Atlas open for the whole test. Use the same phone and browser each day.</p>
          {practice ? <p className="text-sm text-neutral-400">Your first three tests are practice.</p> : null}
          {interruption ? <p role="status" className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">{interruption}</p> : null}
          <button type="button" onClick={start} className="mt-3 min-h-14 rounded-xl bg-indigo-500 px-5 py-4 font-semibold text-white hover:bg-indigo-400">Start the test</button>
        </div>
      ) : null}

      {running ? (
        <button
          type="button"
          onPointerDown={tap}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="Reaction test tap area"
          className="relative flex min-h-0 w-full flex-1 touch-none select-none flex-col items-center justify-center gap-8 rounded-none px-6 pb-[max(env(safe-area-inset-bottom),2rem)] outline-none [-webkit-touch-callout:none]"
        >
          <span className="text-lg text-neutral-300">{message}</span>
          <span ref={stimulusRef} aria-hidden="true" style={{ visibility: "hidden" }} className="h-28 w-28 shrink-0 rounded-full bg-red-400" />
          <span className="text-sm text-neutral-500">Tap this area when the dot appears.</span>
        </button>
      ) : null}

      {screen === "sleepiness" ? (
        <div className="mx-auto w-full max-w-md px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-5">
          <h2 className="text-xl font-semibold">How sleepy do you feel?</h2>
          <p className="mb-4 mt-1 text-sm text-neutral-400">Think about the last five minutes. Choose one answer.</p>
          <div className="flex flex-col gap-2" aria-label="Karolinska Sleepiness Scale">
            {KAROLINSKA_SLEEPINESS_SCALE.map(({ value, label }) => (
              <button key={value} type="button" onClick={() => selectSleepiness(value)} className="flex min-h-12 items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-left hover:border-indigo-400 hover:bg-neutral-800">
                <span className="w-4 shrink-0 font-semibold text-indigo-300">{value}</span>
                <span className="text-sm">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {screen === "result" && result ? (
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6" role="status">
          <p className="text-sm text-indigo-300">{result.practice ? "Practice test complete" : "Test complete"}</p>
          <h2 className="text-3xl font-semibold">{result.summary.lapses} {result.summary.lapses === 1 ? "lapse" : "lapses"}</h2>
          <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <dt className="text-neutral-400">Median reaction</dt>
            <dd className="text-right font-mono">{result.summary.medianReactionTimeMs === null ? "No responses" : `${Math.round(result.summary.medianReactionTimeMs)} ms`}</dd>
            <dt className="text-neutral-400">False starts</dt><dd className="text-right">{result.summary.falseStarts}</dd>
            <dt className="text-neutral-400">Sleepiness</dt><dd className="text-right">{result.sleepiness} of 9</dd>
          </dl>
          <p className="text-sm leading-relaxed text-neutral-400">A lapse is a response slower than 355 ms, or a missed dot.</p>
          <button type="button" onClick={cancel} className="min-h-14 rounded-xl bg-indigo-500 px-5 py-4 font-semibold text-white hover:bg-indigo-400">Done</button>
        </div>
      ) : null}
    </div>
  );
}
