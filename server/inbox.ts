import type { ServerContext } from "lakebed/server";
import { buildInboxEntries, type InboxEntry } from "../shared/relevance";
import { listOwnedItems } from "./items";

export function getInbox(ctx: ServerContext): InboxEntry[] {
  const items = listOwnedItems(ctx.db, ctx.auth.userId);
  return buildInboxEntries(items, {
    now: new Date(),
    activeTags: [],
    activeStatusBoosts: []
  });
}
