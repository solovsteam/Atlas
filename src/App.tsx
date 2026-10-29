import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import type { ComponentType } from "react";
import { authDisplayName, authPicture, useAuthSession } from "./hooks/useAuthSession";
import { AtlasDataProvider, useAtlasData } from "./context/AtlasDataContext";
import { RelevanceProvider } from "./context/RelevanceContext";
import { UndoProvider, useUndo } from "./context/UndoContext";
import { NudgeProvider } from "./context/NudgeContext";
import { CaptureBar } from "./components/CaptureBar";
import { NowPage } from "./pages/NowPage";
import { ItemPage } from "./pages/ItemPage";
import { TasksPage } from "./pages/TasksPage";
import { ItemsPage } from "./pages/ItemsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { ArchivePage } from "./pages/ArchivePage";
import { TrackerPage, TrackPage } from "./pages/TrackPage";
import { useEntryMutations } from "./hooks/useDocumentationEntries";
import { ArchiveIcon, CalendarIcon, ItemsIcon, NowIcon, TasksIcon, TrackIcon, UndoIcon } from "./components/icons";

function AuthAvatar({ label, picture }: { label: string; picture?: string }) {
  const initial = label.trim().slice(0, 1).toUpperCase() || "?";

  if (picture) {
    return (
      <img
        alt=""
        className="h-7 w-7 shrink-0 rounded-full border border-neutral-800 bg-neutral-900 object-cover"
        referrerPolicy="no-referrer"
        src={picture}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-xs font-medium text-neutral-300"
    >
      {initial}
    </span>
  );
}

function UndoButton() {
  const { canUndo, undo } = useUndo();
  if (!canUndo) {
    return null;
  }
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:border-neutral-500"
      type="button"
      onClick={() => void undo()}
    >
      <UndoIcon className="h-4 w-4" />
      Undo
    </button>
  );
}

function AccountMenu({ label, picture, onSignOut }: { label: string; picture?: string; onSignOut: () => void }) {
  return (
    <details className="relative">
      <summary aria-label="Account" className="block cursor-pointer list-none rounded-full [&::-webkit-details-marker]:hidden">
        <AuthAvatar label={label} picture={picture} />
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-neutral-800 bg-neutral-900 p-1 shadow-xl">
        <p className="truncate px-3 py-2 text-xs text-neutral-400">Signed in as {label}</p>
        <button className="w-full px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800" type="button" onClick={() => void onSignOut()}>
          Sign out
        </button>
      </div>
    </details>
  );
}

const NAV: { to: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { to: "/", label: "Now", icon: NowIcon },
  { to: "/tasks", label: "Tasks", icon: TasksIcon },
  { to: "/items", label: "Items", icon: ItemsIcon },
  { to: "/calendar", label: "Calendar", icon: CalendarIcon },
  { to: "/track", label: "Track", icon: TrackIcon },
  { to: "/archive", label: "Archive", icon: ArchiveIcon }
];

function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <section className="max-w-md text-center">
        <h1 className="text-4xl font-bold tracking-tight">Atlas</h1>
        <p className="mt-3 text-sm text-neutral-400">Sign in to access your notes and tasks.</p>
        <button
          className="mt-8 border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-white hover:text-white"
          type="button"
          onClick={() => void onSignIn()}
        >
          Sign in with Google
        </button>
      </section>
    </main>
  );
}

function AppShell() {
  const { session, loading, signInWithGoogle, signOut } = useAuthSession();
  const { userId, items, itemsLoading, itemsError, linksError, updateItem, deleteItem, restoreItem, deleteLink, restoreLink } =
    useAtlasData();
  const { deleteEntry, restoreEntry, updateEntry } = useEntryMutations(userId);
  const { pathname } = useLocation();

  if (loading) {
    return <main className="min-h-screen bg-black px-6 py-10 text-white">Loading…</main>;
  }

  if (!session) {
    return <LoginScreen onSignIn={signInWithGoogle} />;
  }

  const label = authDisplayName(session.user);
  const picture = authPicture(session.user);

  return (
    <UndoProvider
      items={items}
      updateItem={updateItem}
      deleteItem={deleteItem}
      restoreItem={restoreItem}
      deleteLink={deleteLink}
      restoreLink={restoreLink}
      deleteEntry={deleteEntry}
      restoreEntry={restoreEntry}
      updateEntry={updateEntry}
    >
      <RelevanceProvider items={items}>
        <NudgeProvider>
        <main className="min-h-screen bg-black px-4 pb-28 pt-3 text-neutral-100 md:px-8 md:pb-12 md:pt-5" lang="de">
          <section className="mx-auto max-w-6xl">
            <header className="mb-3 flex items-center gap-3 md:mb-5">
              <Link className="flex items-center gap-2 text-lg font-semibold tracking-tight" to="/">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" />
                Atlas
              </Link>
              <nav className="ml-4 hidden gap-1 md:flex">
                {NAV.map(({ to, label: navLabel, icon: NavIcon }) => (
                  <NavLink
                    className={({ isActive }) =>
                      `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                        isActive ? "bg-indigo-500/15 text-indigo-200" : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                      }`
                    }
                    end={to === "/"}
                    key={to}
                    to={to}
                  >
                    <NavIcon className="h-4 w-4" />
                    {navLabel}
                  </NavLink>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-3">
                <UndoButton />
                <AccountMenu label={label} picture={picture} onSignOut={signOut} />
              </div>
            </header>
            <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
              {NAV.map(({ to, label: navLabel, icon: NavIcon }) => (
                <NavLink
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium ${isActive ? "text-indigo-300" : "text-neutral-500"}`
                  }
                  end={to === "/"}
                  key={to}
                  to={to}
                >
                  <NavIcon className="h-6 w-6" />
                  {navLabel}
                </NavLink>
              ))}
            </nav>
            {/* The calendar opens with the calendar itself; capture stays on every other page. */}
            {pathname === "/calendar" ? null : <CaptureBar />}
            {itemsLoading ? <p className="text-sm text-neutral-500">Loading items…</p> : null}
            {itemsError ? <p className="mb-4 text-sm text-red-400">{itemsError}</p> : null}
            {linksError ? <p className="mb-4 text-sm text-red-400">{linksError}</p> : null}
            {items.some(item=>item.recurrenceView?.needsReview)?<aside className="mb-4 rounded border border-amber-700 p-3 text-sm text-amber-200" role="status">
              <p>Generator changes need review. These occurrences keep their earlier version:</p>
              {items.filter(item=>item.recurrenceView?.needsReview).map(item=><Link className="mr-3 underline" key={item.id} to={`/item/${item.id}`}>{item.title || item.occurrenceKey} ({item.occurrenceKey})</Link>)}
            </aside>:null}
            <Routes>
              <Route path="/" element={<NowPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/items" element={<ItemsPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="/track" element={<TrackPage />} />
              <Route path="/track/:id" element={<TrackerPage />} />
              <Route path="/item/:id" element={<ItemPage />} />
              <Route
                path="*"
                element={
                  <section>
                    <h1 className="mb-4 text-4xl font-bold">Not found</h1>
                    <Link className="text-neutral-300 hover:text-white" to="/">
                      Back to Now
                    </Link>
                  </section>
                }
              />
            </Routes>
          </section>
        </main>
        </NudgeProvider>
      </RelevanceProvider>
    </UndoProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AtlasDataProvider>
        <AppShell />
      </AtlasDataProvider>
    </BrowserRouter>
  );
}
