import { Link, Route, Router, Routes, SignInWithGoogle, signOut, useAuth, useQuery } from "lakebed/client";
import type { Item } from "../shared/item";
import { RelevanceProvider } from "./context/RelevanceContext";
import { BrowsePage } from "./pages/BrowsePage";
import { ItemPage } from "./pages/ItemPage";
import { NowPage } from "./pages/NowPage";

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

function AppShell() {
  const auth = useAuth();
  const items = useQuery<Item[]>("items");
  const authLabel = auth.displayName;
  const authStatus = auth.isLoading && auth.isGuest ? "checking session" : "signed in as " + authLabel;

  return (
    <RelevanceProvider items={items}>
      <main className="min-h-screen bg-black px-6 py-10 text-white">
        <section className="mx-auto max-w-3xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {!auth.isLoading ? <AuthAvatar label={authLabel} picture={auth.picture} /> : null}
              <p className="min-w-0 truncate font-mono text-sm text-neutral-500">{authStatus}</p>
            </div>
            {!auth.isLoading && auth.isGuest ? (
              <SignInWithGoogle className="shrink-0 border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-white hover:text-white" />
            ) : !auth.isLoading ? (
              <button className="shrink-0 text-sm text-neutral-400 hover:text-white" type="button" onClick={() => signOut()}>
                Sign out
              </button>
            ) : null}
          </div>
          <nav className="mb-8 flex gap-4 text-sm text-neutral-400">
            <Link className="hover:text-white" to="/">
              Now
            </Link>
            <Link className="hover:text-white" to="/browse">
              Browse
            </Link>
          </nav>
          <Routes>
            <Route path="/" element={<NowPage />} />
            <Route path="/browse" element={<BrowsePage />} />
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
  );
}

export function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}
