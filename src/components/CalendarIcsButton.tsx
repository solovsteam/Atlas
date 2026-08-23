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
    <button className="border border-neutral-600 px-3 py-1.5 text-xs hover:border-white" type="button" onClick={download}>
      Add 7 days to Calendar
    </button>
  );
}
