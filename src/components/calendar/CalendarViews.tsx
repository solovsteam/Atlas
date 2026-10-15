import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { WEEKDAYS_SHORT, weekdayShort } from "@shared/calendar";
import type { ItemLink } from "@shared/links";
import {
  addDays,
  allDayBoxesOnDay,
  boxDisplayLabel,
  boxesForDay,
  dayGridRange,
  daysInMonthGrid,
  layoutBoxesOnDay,
  slotOverlapsRange,
  slotRangeEnd,
  slotRangeStart,
  startOfDay,
  startOfWeek,
  type DayGridRange,
  type DayLayoutEntry,
  type ScheduleSlot
} from "@shared/schedule";
import { eventTone, slotHref, TONE_BOX, TONE_DOT } from "./eventStyle";

const HOUR_PX = 52;

type SharedProps = {
  slots: ScheduleSlot[];
  links: ItemLink[];
  itemTitles: Map<string, string>;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clock(date: Date | null): string {
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "";
}

function timeRange(slot: ScheduleSlot): string {
  const start = slotRangeStart(slot);
  const end = slotRangeEnd(slot);
  if (slot.kind === "allDay") return "All day";
  if (slot.kind === "due") return `Due ${clock(end)}`;
  return start && end && start.getTime() !== end.getTime() ? `${clock(start)}–${clock(end)}` : clock(start);
}

function sameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** A compact one-line entry for lists, all-day rows and month cells. */
function EventChip({ slot, links, itemTitles, showTime = true }: Omit<SharedProps, "slots"> & { slot: ScheduleSlot; showTime?: boolean }) {
  const tone = eventTone(slot, links);
  const label = boxDisplayLabel(slot, links, itemTitles);
  return (
    <Link
      className={`block min-w-0 truncate rounded-md px-2 py-1 text-xs ${TONE_BOX[tone]}`}
      title={`${label} · ${timeRange(slot)}`}
      to={slotHref(slot)}
      onClick={(event) => event.stopPropagation()}
    >
      {showTime && slot.kind !== "allDay" ? <span className="mr-1.5 tabular-nums opacity-75">{timeRange(slot)}</span> : null}
      <span className="font-medium">{label}</span>
    </Link>
  );
}

/** A timed entry on the hour grid: a rounded box exactly as tall as its duration. */
function EventBox({ entry, range, links, itemTitles }: Omit<SharedProps, "slots"> & { entry: DayLayoutEntry; range: DayGridRange }) {
  const { slot, lane, lanes, span, startMinutes, endMinutes } = entry;
  const tone = eventTone(slot, links);
  const top = ((startMinutes - range.startHour * 60) / 60) * HOUR_PX;
  const height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_PX - 2, 20);
  const label = boxDisplayLabel(slot, links, itemTitles);
  const compact = height < 36;
  return (
    <Link
      className={`absolute overflow-hidden rounded-lg px-1.5 shadow-sm shadow-black/30 ${compact ? "py-0.5" : "py-1"} ${TONE_BOX[tone]}`}
      style={{
        top: top + 1,
        height,
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${(span / lanes) * 100}% - 4px)`
      }}
      title={`${label} · ${timeRange(slot)}`}
      to={slotHref(slot)}
      onClick={(event) => event.stopPropagation()}
    >
      {compact ? (
        <p className="truncate text-[11px] leading-4">
          <span className="font-semibold">{label}</span>
          <span className="ml-1 tabular-nums opacity-75">{clock(slotRangeStart(slot))}</span>
        </p>
      ) : (
        <>
          <p className={`text-xs font-semibold leading-4 ${height < 56 ? "truncate" : "line-clamp-2"}`}>{label}</p>
          <p className="truncate text-[11px] tabular-nums leading-4 opacity-75">{timeRange(slot)}</p>
        </>
      )}
    </Link>
  );
}

/** Hour grid for one or more days side by side, with a line at the current time. */
function TimeGrid({
  days,
  slots,
  links,
  itemTitles,
  onPickTime
}: SharedProps & { days: Date[]; onPickTime?: (start: Date) => void }) {
  const now = useNow();
  const range = dayGridRange(slots, days);
  const hours = Array.from({ length: range.endHour - range.startHour }, (_, index) => range.startHour + index);
  const height = hours.length * HOUR_PX;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - range.startHour * 60) / 60) * HOUR_PX;
  const nowVisible = nowMinutes >= range.startHour * 60 && nowMinutes <= range.endHour * 60;

  function pick(day: Date, event: MouseEvent<HTMLDivElement>) {
    if (!onPickTime) return;
    const offset = event.clientY - event.currentTarget.getBoundingClientRect().top;
    const minutes = range.startHour * 60 + Math.floor(((offset / HOUR_PX) * 60) / 30) * 30;
    const start = startOfDay(day);
    start.setMinutes(minutes);
    onPickTime(start);
  }

  return (
    <div className="flex">
      <div className="relative w-11 shrink-0" style={{ height }}>
        {hours.map((hour, index) =>
          index === 0 ? null : (
            <span
              className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-neutral-500"
              key={hour}
              style={{ top: index * HOUR_PX }}
            >
              {pad(hour)}:00
            </span>
          )
        )}
      </div>
      <div className="grid min-w-0 flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((day) => {
          const isToday = sameDay(day, now);
          const layout = layoutBoxesOnDay(boxesForDay(slots, day), day, range);
          return (
            <div
              className={`relative border-l border-neutral-800 ${onPickTime ? "cursor-cell" : ""} ${isToday && days.length > 1 ? "bg-indigo-500/[0.04]" : ""}`}
              key={day.toISOString()}
              style={{
                height,
                backgroundImage:
                  "linear-gradient(to bottom, var(--color-neutral-800) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-neutral-800) 45%, transparent) 1px, transparent 1px)",
                backgroundSize: `100% ${HOUR_PX}px, 100% ${HOUR_PX / 2}px`
              }}
              onClick={(event) => pick(day, event)}
            >
              {layout.map((entry) => (
                <EventBox entry={entry} itemTitles={itemTitles} key={entry.slot.id} links={links} range={range} />
              ))}
              {isToday && nowVisible ? (
                <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: nowTop }}>
                  <div className="h-0.5 bg-rose-500" />
                  <div className="absolute -left-1.5 -top-[5px] h-3 w-3 rounded-full bg-rose-500" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AllDayRow({ days, slots, links, itemTitles }: SharedProps & { days: Date[] }) {
  const perDay = days.map((day) => allDayBoxesOnDay(boxesForDay(slots, day), day));
  if (perDay.every((entries) => entries.length === 0)) return null;
  return (
    <div className="flex border-b border-neutral-800 py-1">
      <div className="w-11 shrink-0 pr-2 pt-1 text-right text-[10px] text-neutral-500">all-day</div>
      <div className="grid min-w-0 flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {perDay.map((entries, index) => (
          <div className="min-w-0 space-y-1 px-0.5" key={days[index]!.toISOString()}>
            {entries.map((slot) => (
              <EventChip itemTitles={itemTitles} key={slot.id} links={links} showTime={false} slot={slot} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayNumber({ day, today, selected = false }: { day: Date; today: boolean; selected?: boolean }) {
  const base = "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums";
  if (selected) return <span className={`${base} bg-indigo-500 font-semibold text-white`}>{day.getDate()}</span>;
  if (today) return <span className={`${base} font-semibold text-indigo-300 ring-1 ring-indigo-400/70`}>{day.getDate()}</span>;
  return <span className={`${base} text-neutral-200`}>{day.getDate()}</span>;
}

export function CalendarDayView({
  day,
  slots,
  links,
  itemTitles,
  onSelectDay,
  onPickTime
}: SharedProps & { day: Date; onSelectDay: (day: Date) => void; onPickTime: (start: Date) => void }) {
  const now = useNow();
  const week = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(day), index));
  const daySlots = boxesForDay(slots, day);
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1">
        {week.map((entry) => {
          const selected = sameDay(entry, day);
          const busy = boxesForDay(slots, entry).length > 0;
          return (
            <button
              aria-pressed={selected}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 ${selected ? "bg-neutral-900" : "hover:bg-neutral-900/60"}`}
              key={entry.toISOString()}
              type="button"
              onClick={() => onSelectDay(entry)}
            >
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">{weekdayShort(entry)}</span>
              <DayNumber day={entry} selected={selected} today={sameDay(entry, now)} />
              <span className={`h-1 w-1 rounded-full ${busy ? "bg-indigo-400" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
        <AllDayRow days={[day]} itemTitles={itemTitles} links={links} slots={daySlots} />
        <div className="py-2 pr-2">
          <TimeGrid days={[day]} itemTitles={itemTitles} links={links} slots={daySlots} onPickTime={onPickTime} />
        </div>
      </div>
    </div>
  );
}

export function CalendarWeekView({
  weekStart,
  slots,
  links,
  itemTitles,
  onSelectDay,
  onPickTime
}: SharedProps & { weekStart: Date; onSelectDay: (day: Date) => void; onPickTime: (start: Date) => void }) {
  const now = useNow();
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <>
      {/* Phone: an agenda, one row per day. */}
      <div className="divide-y divide-neutral-800 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 md:hidden">
        {days.map((day) => {
          const daySlots = boxesForDay(slots, day).sort(
            (a, b) => Number(a.kind !== "allDay") - Number(b.kind !== "allDay") || (slotRangeStart(a)?.getTime() ?? 0) - (slotRangeStart(b)?.getTime() ?? 0)
          );
          const today = sameDay(day, now);
          return (
            <div className={`flex gap-3 px-3 py-2.5 ${today ? "bg-indigo-500/[0.06]" : ""}`} key={day.toISOString()}>
              <button
                className="flex w-10 shrink-0 flex-col items-center self-start rounded-lg py-0.5 hover:bg-neutral-900"
                type="button"
                onClick={() => onSelectDay(day)}
              >
                <span className={`text-[10px] uppercase tracking-wide ${today ? "text-indigo-300" : "text-neutral-500"}`}>{weekdayShort(day)}</span>
                <DayNumber day={day} selected={today} today={today} />
              </button>
              <div className="min-w-0 flex-1 space-y-1 py-0.5">
                {daySlots.length === 0 ? (
                  <button className="pt-1.5 text-xs text-neutral-600" type="button" onClick={() => onSelectDay(day)}>
                    Nothing planned
                  </button>
                ) : (
                  daySlots.map((slot) => <EventChip itemTitles={itemTitles} key={slot.id} links={links} slot={slot} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Wider screens: seven columns on one hour grid. */}
      <div className="hidden overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 md:block">
        <div className="flex border-b border-neutral-800">
          <div className="w-11 shrink-0" />
          <div className="grid flex-1 grid-cols-7">
            {days.map((day) => (
              <button
                className="flex items-center justify-center gap-1.5 rounded-none border-l border-neutral-800 py-2 hover:bg-neutral-900"
                key={day.toISOString()}
                type="button"
                onClick={() => onSelectDay(day)}
              >
                <span className="text-xs uppercase tracking-wide text-neutral-500">{weekdayShort(day)}</span>
                <DayNumber day={day} selected={sameDay(day, now)} today={sameDay(day, now)} />
              </button>
            ))}
          </div>
        </div>
        <AllDayRow days={days} itemTitles={itemTitles} links={links} slots={slots} />
        <div className="py-2 pr-2">
          <TimeGrid days={days} itemTitles={itemTitles} links={links} slots={slots} onPickTime={onPickTime} />
        </div>
      </div>
    </>
  );
}

export function CalendarMonthView({
  monthStart,
  slots,
  links,
  itemTitles,
  onSelectDay
}: SharedProps & { monthStart: Date; onSelectDay: (day: Date) => void }) {
  const now = useNow();
  const gridDays = daysInMonthGrid(monthStart);
  const gridEnd = addDays(gridDays[gridDays.length - 1]!, 1);
  const monthSlots = slots.filter((slot) => slotOverlapsRange(slot, gridDays[0]!, gridEnd));

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
      <div className="grid grid-cols-7 border-b border-neutral-800 py-1.5 text-center text-[10px] uppercase tracking-wide text-neutral-500">
        {WEEKDAYS_SHORT.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {gridDays.map((day, index) => {
          const inMonth = day.getMonth() === monthStart.getMonth();
          const dayStart = startOfDay(day);
          const daySlots = monthSlots
            .filter((slot) => slotOverlapsRange(slot, dayStart, addDays(dayStart, 1)))
            .sort((a, b) => Number(a.kind !== "allDay") - Number(b.kind !== "allDay") || (slotRangeStart(a)?.getTime() ?? 0) - (slotRangeStart(b)?.getTime() ?? 0));
          const today = sameDay(day, now);
          const weekend = index % 7 >= 5;
          return (
            <button
              className={`flex min-h-[4.75rem] min-w-0 flex-col items-stretch gap-0.5 rounded-none border-neutral-800 p-1 text-left hover:bg-neutral-900 md:min-h-28 md:p-1.5 ${
                index % 7 === 0 ? "" : "border-l"
              } ${index >= 7 ? "border-t" : ""} ${weekend ? "bg-neutral-900/30" : ""}`}
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay(dayStart)}
            >
              <span className={`flex justify-center md:justify-start ${inMonth ? "" : "opacity-35"}`}>
                <DayNumber day={day} selected={today} today={today} />
              </span>
              <span className={`flex min-w-0 flex-col gap-0.5 ${inMonth ? "" : "opacity-35"}`}>
                {daySlots.slice(0, 3).map((slot) => {
                  const tone = eventTone(slot, links);
                  const label = boxDisplayLabel(slot, links, itemTitles);
                  return (
                    <span className={`block min-w-0 truncate rounded px-1 text-[10px] leading-4 md:text-[11px] ${TONE_BOX[tone]}`} key={slot.id}>
                      <span className="hidden tabular-nums opacity-75 md:inline">{slot.kind === "allDay" ? "" : `${clock(slotRangeStart(slot))} `}</span>
                      {label}
                    </span>
                  );
                })}
                {daySlots.length > 3 ? (
                  <span className="flex items-center gap-1 px-1 text-[10px] text-neutral-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[eventTone(daySlots[3]!, links)]}`} />+{daySlots.length - 3}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
