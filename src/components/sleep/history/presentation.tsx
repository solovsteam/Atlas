import type { ReactNode } from 'react';
import './history.css';
export type HistoryTheme = 'dark' | 'light';
export function HistoryPanel({ title, children, theme = 'dark' }: { title: string; children: ReactNode; theme?: HistoryTheme }) {
  return <section aria-label={title} className="sleep-history-panel" data-theme={theme}>
    <h3 className="mb-3 text-base font-semibold">{title}</h3>{children}
  </section>;
}
