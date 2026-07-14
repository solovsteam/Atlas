import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { authDisplayName, authPicture, useAuthSession } from "./hooks/useAuthSession";
import { AtlasDataProvider, useAtlasData } from "./context/AtlasDataContext";
import { RelevanceProvider } from "./context/RelevanceContext";
import { UndoProvider, useUndo } from "./context/UndoContext";
import { NowPage } from "./pages/NowPage";
import { ItemPage } from "./pages/ItemPage";

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
    <button className="text-sm text-neutral-400 hover:text-white" type="button" onClick={() => void undo()}>
      Undo
    </button>
  );
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
  const { items, itemsLoading, itemsError, updateItem } = useAtlasData();

  if (loading) {
    return <main className="min-h-screen bg-black px-6 py-10 text-white">Loading…</main>;
  }

  if (!session) {
    return <LoginScreen onSignIn={signInWithGoogle} />;
  }

  const label = authDisplayName(session.user);
  const picture = authPicture(session.user);

  return (
    <UndoProvider updateItem={updateItem}>
      <RelevanceProvider items={items}>
        <main className="min-h-screen bg-black px-6 py-10 text-white" lang="de">
          <section className="mx-auto max-w-6xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <AuthAvatar label={label} picture={picture} />
                <p className="min-w-0 truncate font-mono text-sm text-neutral-500">signed in as {label}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <UndoButton />
                <button className="text-sm text-neutral-400 hover:text-white" type="button" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            </div>
            <nav className="mb-8 flex gap-4 text-sm text-neutral-400">
              <Link className="hover:text-white" to="/">
                Now
              </Link>
            </nav>
            {itemsLoading ? <p className="text-sm text-neutral-500">Loading items…</p> : null}
            {itemsError ? <p className="mb-4 text-sm text-red-400">{itemsError}</p> : null}
            <Routes>
              <Route path="/" element={<NowPage />} />
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
