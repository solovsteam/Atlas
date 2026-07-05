import { boolean, capsule, mutation, query, string, table } from "lakebed/server";
import { getInbox } from "./inbox";
import { createItem, deleteItem, listOwnedItems, updateItem } from "./items";
import { linkItems, listOwnedLinks, unlinkItems } from "./links";
import {
  archiveScheduleSlot,
  archiveSlotsForItem,
  createScheduleSlot,
  deleteScheduleSlot,
  listOwnedScheduleSlots,
  updateScheduleSlot
} from "./schedule";
import type { LinkKind } from "../shared/links";

export default capsule({
  name: "AtlasRefactored1",

  schema: {
    items: table({
      ownerId: string(),
      title: string(),
      body: string(),
      isTask: boolean().default(false),
      isDocumentation: boolean().default(false),
      taskStatus: string().default(""),
      manualRelevance: string().default("0"),
      tags: string().default("[]"),
      location: string().default(""),
      startableWindow: string().default(""),
      completionRule: string().default(""),
      documentationSchema: string().default(""),
      documentationData: string().default(""),
      recurrenceRule: string().default(""),
      generatedFromId: string().default(""),
      occurrenceKey: string().default(""),
      overriddenFields: string().default("[]"),
      revision: string().default("0")
    }),
    itemLinks: table({
      ownerId: string(),
      fromId: string(),
      toId: string(),
      kind: string().default("context")
    }),
    scheduleSlots: table({
      ownerId: string(),
      itemId: string(),
      kind: string().default("fixed"),
      startsAt: string().default(""),
      endsAt: string().default(""),
      slotStatus: string().default("scheduled"),
      recurrenceRule: string().default("")
    })
  },

  queries: {
    items: query((ctx) => listOwnedItems(ctx.db, ctx.auth.userId)),
    itemLinks: query((ctx) => listOwnedLinks(ctx.db, ctx.auth.userId)),
    scheduleSlots: query((ctx) => listOwnedScheduleSlots(ctx.db, ctx.auth.userId)),
    inbox: query((ctx) => getInbox(ctx))
  },

  mutations: {
    createItem: mutation((ctx, title: string) => createItem(ctx.db, ctx.auth.userId, title)),

    updateItem: mutation((ctx, id: string, patchJson: string, expectedRevision: number) =>
      updateItem(ctx.db, ctx.auth.userId, id, patchJson, expectedRevision)
    ),

    deleteItem: mutation((ctx, id: string) => {
      deleteItem(ctx.db, ctx.auth.userId, id);
    }),

    linkItems: mutation((ctx, fromId: string, toId: string, kind: string = "context") =>
      linkItems(ctx.db, ctx.auth.userId, fromId, toId, (kind || "context") as LinkKind)
    ),

    unlinkItems: mutation((ctx, fromId: string, toId: string, kind: string = "context") => {
      unlinkItems(ctx.db, ctx.auth.userId, fromId, toId, (kind || "context") as LinkKind);
    }),

    setTags: mutation((ctx, id: string, tagsJson: string, expectedRevision: number) =>
      updateItem(ctx.db, ctx.auth.userId, id, JSON.stringify({ tags: JSON.parse(tagsJson) }), expectedRevision)
    ),

    setManualRelevance: mutation((ctx, id: string, value: number, expectedRevision: number) =>
      updateItem(ctx.db, ctx.auth.userId, id, JSON.stringify({ manualRelevance: value }), expectedRevision)
    ),

    createScheduleSlot: mutation((ctx, itemId: string, kind: string, startsAt: string = "", endsAt: string = "") =>
      createScheduleSlot(ctx.db, ctx.auth.userId, itemId, kind, startsAt, endsAt)
    ),

    updateScheduleSlot: mutation((ctx, id: string, patchJson: string) =>
      updateScheduleSlot(ctx.db, ctx.auth.userId, id, patchJson)
    ),

    archiveScheduleSlot: mutation((ctx, id: string) => {
      archiveScheduleSlot(ctx.db, ctx.auth.userId, id);
    }),

    deleteScheduleSlot: mutation((ctx, id: string) => {
      deleteScheduleSlot(ctx.db, ctx.auth.userId, id);
    })
  }
});
