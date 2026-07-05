# Atlas

Atlas is a unified notes, tasks, and calendar app built on [Lakebed](https://lakebed.dev).

## Deployed app

https://open-signal-da4407053d.lakebed.app

## Phase 1 features

- Unified **Item** model (tasks subsume notes)
- Directed **itemLinks** graph (parents/children, no folders)
- **Now** inbox with relevance ranking and tag/status boosts
- Stable list ordering (re-ranks on selection change or filter toggle)
- Item detail with **Content** and **Associations** tabs
- Autosave with revision-based conflict detection
- **Browse** page for all items

## Phase 2 features

- **scheduleSlots** table — fixed, due, window, and all-day bindings
- **Calendar** week view (`/calendar`) with archived slots grayed out
- Item detail **Schedule** tab — create, edit, archive, restore, delete slots
- Marking a task done/cancelled auto-archives its schedule slots

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
