import type { Item } from "./item";

export type LinkKind = "context" | "documentation";

export type ItemLinkRow = {
  id: string;
  ownerId: string;
  fromId: string;
  toId: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
};

export type ItemLink = {
  id: string;
  ownerId: string;
  fromId: string;
  toId: string;
  kind: LinkKind;
  createdAt: string;
  updatedAt: string;
};

export type BreadcrumbSegment = {
  id: string;
  title: string;
};

export type ItemGraphNode = {
  item: Item;
  parents: Item[];
  children: Item[];
  ancestorPaths: BreadcrumbSegment[][];
};

const LINK_KINDS: LinkKind[] = ["context", "documentation"];

export function linkFromRow(row: ItemLinkRow): ItemLink {
  const kind = LINK_KINDS.includes(row.kind as LinkKind) ? (row.kind as LinkKind) : "context";
  return {
    id: row.id,
    ownerId: row.ownerId,
    fromId: row.fromId,
    toId: row.toId,
    kind,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function getParentIds(itemId: string, links: ItemLink[], kind: LinkKind = "context"): string[] {
  return links.filter((link) => link.toId === itemId && link.kind === kind).map((link) => link.fromId);
}

export function getChildIds(itemId: string, links: ItemLink[], kind: LinkKind = "context"): string[] {
  return links.filter((link) => link.fromId === itemId && link.kind === kind).map((link) => link.toId);
}

export function getAncestorPaths(itemId: string, links: ItemLink[], maxPaths = 20): string[][] {
  const parents = getParentIds(itemId, links);
  if (parents.length === 0) {
    return [[itemId]];
  }

  const paths: string[][] = [];
  const seen = new Set<string>();

  for (const parentId of parents) {
    for (const prefix of getAncestorPaths(parentId, links, maxPaths)) {
      const path = [...prefix, itemId];
      const key = path.join("\0");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      paths.push(path);
      if (paths.length >= maxPaths) {
        return paths;
      }
    }
  }

  return paths.length > 0 ? paths : [[itemId]];
}

export function buildItemGraph(item: Item, items: Item[], links: ItemLink[]): ItemGraphNode {
  const byId = new Map(items.map((entry) => [entry.id, entry]));
  const parentIds = getParentIds(item.id, links);
  const childIds = getChildIds(item.id, links);

  const paths = getAncestorPaths(item.id, links);
  return {
    item,
    parents: parentIds.map((id) => byId.get(id)).filter((entry): entry is Item => Boolean(entry)),
    children: childIds.map((id) => byId.get(id)).filter((entry): entry is Item => Boolean(entry)),
    ancestorPaths: paths.map((path) =>
      path.map((id) => ({
        id,
        title: byId.get(id)?.title ?? "Untitled"
      }))
    )
  };
}
