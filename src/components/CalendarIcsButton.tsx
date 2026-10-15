import { calendarIcs } from "@shared/ics";
import { useAtlasData } from "../context/AtlasDataContext";

export function CalendarIcsButton() {
  const { items, links } = useAtlasData();

  function download() {
    const ics = calendarIcs(items, links, new Date());
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "atlas.ics";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 hover:text-white" type="button" onClick={download}>
      Add 7 days to calendar app
    </button>
  );
}
