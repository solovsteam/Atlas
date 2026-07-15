# Repository layout (post-flatten)

The active Atlas app lives at the **repo root**. The old Lakebed capsule has been removed.

## Lakebed archive

Porting reference (old `client/`, `server/`, `shared/`) is in **`.lakebed/reference/`**.

- **Gitignored** — not pushed to GitHub (see root `.gitignore`)
- **Local only** — exists on your machine after migration; other clones need a fresh copy if porting
- **Read-only** for agents — study and adapt, do not import directly

If `.lakebed/reference/` is missing, restore from git history before the flatten commit or re-copy from backup.

## Agent docs

| File | Purpose |
|------|---------|
| `AGENTS.md` / `CLAUDE.md` | Stack rules |
| `docs/ROADMAP.md` | Product direction, notifications, phases |
| `docs/LESSONS.md` | Migration notes, mistakes to avoid |

## Verify

```sh
npm run build
npm run dev
```
