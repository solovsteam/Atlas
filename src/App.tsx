import { PhoneNavigation } from "./components/PhoneNavigation";
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import type { ComponentType } from "react";
import { authDisplayName, authPicture, useAuthSession } from "./hooks/useAuthSession";
import { AtlasDataProvider, useAtlasData } from "./context/AtlasDataContext";
import { RelevanceProvider } from "./context/RelevanceContext";
import { UndoProvider, useUndo } from "./context/UndoContext";
import { NudgeProvider } from "./context/NudgeContext";
import { CaptureBar } from "./components/CaptureBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { IntakePage } from "./pages/IntakePage";
import { SleepPage } from "./pages/SleepPage";
import { SleepLogPage } from "./pages/SleepLogPages";
import { SleepTestPage } from "./pages/SleepTestPage";
import { NowPage } from "./pages/NowPage";
import { RoutinesPage, RoutinePage } from "./pages/RoutinesPage";
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
  { to: "/sleep", label: "Sleep", icon: SleepIcon },
  { to: "/intake", label: "Intake", icon: IntakeIcon },
  { to: "/archive", label: "Archive", icon: ArchiveIcon }
];

function IntakeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 4-5 5a5 5 0 0 0 7 7l5-5a5 5 0 0 0-7-7Z" /><path d="m6.5 6.5 7 7" /></svg>;
}

function SleepIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20.8 13.1A9 9 0 0 1 10.9 3.2a9 9 0 1 0 9.9 9.9Z" /></svg>;
}

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
        <main className="min-h-screen bg-black px-4 pb-28 pt-3 text-neutral-100 md:px-8 lg:pb-12 md:pt-5" lang="de">
          <section className="mx-auto max-w-6xl">
            <header className="mb-3 flex items-center gap-3 md:mb-5">
              <Link className="flex items-center gap-2 text-lg font-semibold tracking-tight" to="/">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" />
                Atlas
              </Link>
              <nav className="ml-4 hidden gap-1 lg:flex">
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
            <PhoneNavigation key={session.user.id} tabs={NAV} metadata={session.user.user_metadata} />
            {/* The calendar opens with the calendar itself; capture stays on every other page. */}
            {pathname === "/" || pathname === "/calendar" || pathname.startsWith("/sleep") || pathname === "/intake" ? null : <CaptureBar />}
            {itemsLoading ? <p className="text-sm text-neutral-500">Loading items…</p> : null}
            {itemsError ? <p className="mb-4 text-sm text-red-400">{itemsError}</p> : null}
            {linksError ? <p className="mb-4 text-sm text-red-400">{linksError}</p> : null}
            {items.some(item=>item.recurrenceView?.needsReview)?<aside className="mb-4 rounded border border-amber-700 p-3 text-sm text-amber-200" role="status">
              <p>Generator changes need review. These occurrences keep their earlier version:</p>
              {items.filter(item=>item.recurrenceView?.needsReview).map(item=><Link className="mr-3 underline" key={item.id} to={`/item/${item.id}`}>{item.title || item.occurrenceKey} ({item.occurrenceKey})</Link>)}
            </aside>:null}
            {/* Keyed by path, so moving to another page clears an error. */}
            <ErrorBoundary key={pathname}>
            <Routes>
              <Route path="/" element={<NowPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/items" element={<ItemsPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="/intake" element={<IntakePage />} />
              <Route path="/sleep" element={<SleepPage />} />
              <Route path="/sleep/evening" element={<SleepLogPage kind="evening" />} />
              <Route path="/sleep/lights-out" element={<SleepLogPage kind="lights-out" />} />
              <Route path="/sleep/morning" element={<SleepLogPage kind="morning" />} />
              <Route path="/sleep/test" element={<SleepTestPage />} />
              <Route path="/track" element={<TrackPage />} />
              <Route path="/routines" element={<RoutinesPage />} />
              <Route path="/routines/:id" element={<RoutinePage />} />
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
            </ErrorBoundary>
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
