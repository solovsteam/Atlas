# Atlas

Atlas is a unified notes, tasks, and calendar app built on [Lakebed](https://lakebed.dev).

## Deployed app

https://open-signal-da4407053d.lakebed.app

## Phase 1 features

- Unified **Item** model (tasks subsume notes)
- Directed **itemLinks** graph (parents/children, no folders)
- **Now** inbox with relevance ranking and tag/status boosts
- Stable list ordering (re-ranks on selection change or filter toggle)
- Item detail with **Content** and **Associations**
- Autosave with revision-based conflict detection

## Phase 2 features

- **scheduleSlots** table — fixed, due, window, and all-day bindings
- **Calendar** week view (`/calendar`) with archived slots grayed out
- Item detail **Schedule** editor — create, edit, archive, restore, delete slots
- Marking a task done/cancelled auto-archives its schedule slots
- Fuzzy date parsing (`4 july 12` → `04.07.2026 12:00`)

## Phase 3 features

- **Relevance metadata UI** — edit tags, location, daily startable window, manual relevance boost
- **Documentation items** — schema editor, tracked state form, documentation links
- **Completion rules** — manual, all-children-done, or documentation-field auto-complete
- **Recurrence** — daily/weekly/monthly templates materialize generated occurrences
- **Undo** — Cmd/Ctrl+Z and Undo button for task status, item patches, and links

## Phase 4 features

- **Time boxes** decoupled from tasks — `scheduleSlots` are calendar intervals; `slotAssignments` links 0..N tasks to each box
- **Calendar views** — day (time grid), week, and month with view toggle
- **Time box detail** — `/calendar/box/:slotId` lists assigned tasks, assign/unassign, edit times
- **Empty boxes** — create free-time blocks from Calendar without tasks; overlap between active boxes is rejected
- **Item Schedule tab** — scheduling constraints (location, startable window) separate from calendar placements
- **Generators** — still create a time box + assignment per occurrence

Auto-scheduling from constraints is planned for a later phase.

## Develop locally

```sh
npx lakebed dev
```

Local state resets when dev restarts. Use deploy for persistent data.

## Deploy

```sh
npx lakebed deploy
```
By default, use deploy over dev unless specifically told otherwise.

## Inspect deployed state

```sh
npx lakebed inspect dep_-9wbI5D3Xqk8RFUu
npx lakebed db dump dep_-9wbI5D3Xqk8RFUu
```
