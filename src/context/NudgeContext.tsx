import { createContext, useContext, type ReactNode } from "react";
import { useAtlasData } from "./AtlasDataContext";
import { useNudgeScheduler } from "../hooks/useNudgeScheduler";

type NudgeContextValue = ReturnType<typeof useNudgeScheduler>;

const NudgeContext = createContext<NudgeContextValue | null>(null);

export function NudgeProvider({ children }: { children: ReactNode }) {
  const { items, links } = useAtlasData();
  const value = useNudgeScheduler(items, links);
  return <NudgeContext.Provider value={value}>{children}</NudgeContext.Provider>;
}

export function useNudges() {
  const value = useContext(NudgeContext);
  if (!value) {
    throw new Error("useNudges must be used within NudgeProvider");
  }
  return value;
}
