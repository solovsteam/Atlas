import type { EntryStage } from "@shared/documentationEntries";

// Validated with the dataviz palette checker on the dark surfaces (#111620,
// #0b0f17). The stages are ordered, so they use one indigo ramp (earliest
// noticing is the lightest, most visible step). The gray marks entries without
// a recorded stage. The trailing-average line is a light neutral, checked
// against every stage colour (normal vision and colour blindness).
export const CHART_ACCENT = "#7a80f0";
export const CHART_CONTEXT = "#5b6478";
export const CHART_LINE = "#dce1e9";
export const STAGE_COLORS: Record<EntryStage, string> = {
  urge: "#a5abf8",
  during: "#6d73e0",
  after: "#3d4296"
};
// The daily aim of a habit to build; checked against the bars and the average line.
export const CHART_AIM = "#e7b65a";
