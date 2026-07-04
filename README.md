# AtlasRefactored1

Atlas is a unified notes, tasks, and calendar app built on [Lakebed](https://lakebed.dev).

## Deployed app

https://open-signal-da4407053d.lakebed.app

## Phase 1 features

- Unified **Item** model (tasks subsume notes)
- Directed **itemLinks** graph (parents/children, no folders)
- **Now** inbox with relevance scoring and tag boosts
- Stable list ordering (re-ranks only on selection change)
- Item detail with **Content** and **Associations** tabs
- Autosave with revision-based conflict detection

## Develop locally

```sh
npx lakebed dev
```

Local state resets when dev restarts. Use deploy for persistent data.

## Deploy

```sh
npx lakebed deploy
```

## Inspect deployed state

```sh
npx lakebed inspect dep_-9wbI5D3Xqk8RFUu
npx lakebed db dump dep_-9wbI5D3Xqk8RFUu
```
