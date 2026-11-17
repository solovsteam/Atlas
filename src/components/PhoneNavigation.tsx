import { useState, type ComponentType } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { NAVIGATION_METADATA_KEY, normalizeNavigation, splitNavigation, tabIsActive } from "../../shared/navigation";
import { savePhoneNavigation } from "../services/navigation";

type Tab = { to: string; label: string; icon: ComponentType<{ className?: string }> };

export function PhoneNavigation({ tabs, metadata }: { tabs: Tab[]; metadata: Record<string, unknown> }) {
  const [choice, setChoice] = useState(() => normalizeNavigation(metadata[NAVIGATION_METADATA_KEY]));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const { pathname } = useLocation();
  const { bar, more } = splitNavigation(choice, tabs.map(tab => tab.to));
  const tab = (id: string) => tabs.find(item => item.to === id)!;
  const change = (ids: string[]) => { setChoice(ids); setMessage("Your changes are not saved to your account yet."); };
  const move = (index: number, direction: number) => {
    const next = [...choice];
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    change(next);
  };
  async function save() {
    setSaving(true);
    try {
      await savePhoneNavigation(choice);
      setMessage("Saved to your account.");
    } catch {
      setMessage("Could not save to your account. Your choice is kept here. Try Save again.");
    } finally { setSaving(false); }
  }
  const control = "min-h-11 rounded-lg border border-neutral-700 px-3 text-sm disabled:opacity-35";
  return <div className="lg:hidden">
    {open && <section aria-label="More navigation" className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 max-h-[70dvh] overflow-y-auto rounded-t-2xl border border-neutral-700 bg-neutral-950 p-4 shadow-xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">More</h2><button type="button" className={control} onClick={() => setOpen(false)}>Close</button></div>
      <nav aria-label="Other tabs" className="my-2">
        {more.map(id => <NavLink key={id} to={id} end={id === "/"} onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-lg px-3 ${isActive ? "bg-indigo-500/15 text-indigo-200" : "text-neutral-200"}`}>{(() => { const Icon = tab(id).icon; return <Icon className="h-5 w-5" />; })()}{tab(id).label}</NavLink>)}
      </nav>
      <button type="button" className={control + " w-full"} aria-expanded={editing} onClick={() => setEditing(!editing)}>Choose and order tabs</button>
      {editing && <div className="mt-3 space-y-2">
        <p className="text-sm text-neutral-400">Choose up to five tabs. Remove a tab to make room. Use Up and Down to change the order.</p>
        {[...bar, ...more].map(id => { const index = bar.indexOf(id); const selected = index >= 0; return <div key={id} className="flex min-h-12 items-center gap-2">
          <label className="flex min-h-11 flex-1 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={selected} disabled={saving || (!selected && bar.length >= 5)} onChange={() => change(selected ? choice.filter(value => value !== id) : [...choice, id])} />{tab(id).label}</label>
          {selected && <><button type="button" className={control} disabled={saving || index === 0} aria-label={`Move ${tab(id).label} up`} onClick={() => move(index, -1)}>Up</button><button type="button" className={control} disabled={saving || index === bar.length - 1} aria-label={`Move ${tab(id).label} down`} onClick={() => move(index, 1)}>Down</button></>}
        </div>; })}
        <button type="button" disabled={saving} className={control + " w-full bg-indigo-500/20"} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
        {message && <p role="status" className="text-sm text-amber-200">{message}</p>}
      </div>}
    </section>}
    <nav aria-label="Phone navigation" style={{ gridTemplateColumns: `repeat(${bar.length + 1}, minmax(0, 1fr))` }} className="fixed inset-x-0 bottom-0 z-40 grid border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      {bar.map(id => { const item = tab(id); const Icon = item.icon; return <NavLink key={id} to={id} end={id === "/"} onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-medium ${isActive ? "text-indigo-300" : "text-neutral-400"}`}><Icon className="h-6 w-6" />{item.label}</NavLink>; })}
      <button type="button" aria-expanded={open} aria-label="More" aria-current={more.some(id => tabIsActive(pathname, id)) ? "page" : undefined} onClick={() => setOpen(!open)} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium ${open || more.some(id => tabIsActive(pathname, id)) ? "text-indigo-300" : "text-neutral-400"}`}><span aria-hidden="true" className="h-6 text-xl leading-6">•••</span>More</button>
    </nav>
  </div>;
}
