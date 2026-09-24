export type ItemPlacement = "inside" | "above" | "below";

interface OrderedItem {
  id: string;
  order?: number;
}

interface ReorderScopedItemsOptions<T extends OrderedItem> {
  destinationScope?: string;
  placement?: ItemPlacement;
  relativeToId?: string;
  getScope: (item: T) => string | undefined;
  setScope: (item: T, scope: string | undefined) => T;
  getFallbackOrder?: (item: T, sourceIndex: number) => number;
}

export interface ReorderScopedItemsResult<T> {
  items: T[];
  moved: boolean;
}

export function canReorderVisibleItems(query: string): boolean {
  return query.trim().length === 0;
}

function effectiveOrder<T extends OrderedItem>(
  item: T,
  sourceIndex: Map<string, number>,
  getFallbackOrder?: (item: T, sourceIndex: number) => number,
): number {
  const index = sourceIndex.get(item.id) ?? 0;
  return typeof item.order === "number" && Number.isFinite(item.order)
    ? item.order
    : (getFallbackOrder?.(item, index) ?? index);
}

export function sortItemsByOrder<T extends OrderedItem>(items: T[]): T[] {
  const sourceIndex = new Map(items.map((item, index) => [item.id, index]));
  return [...items].sort(
    (first, second) =>
      effectiveOrder(first, sourceIndex) -
        effectiveOrder(second, sourceIndex) ||
      (sourceIndex.get(first.id) ?? 0) - (sourceIndex.get(second.id) ?? 0),
  );
}

export function nextOrderInScope<T extends OrderedItem>(
  items: T[],
  scope: string | undefined,
  getScope: (item: T) => string | undefined,
): number {
  const sourceIndex = new Map(items.map((item, index) => [item.id, index]));
  const orders = items
    .filter((item) => getScope(item) === scope)
    .map((item) => effectiveOrder(item, sourceIndex));
  return orders.length ? Math.max(...orders) + 1 : 0;
}

export function prependItemInScope<T extends OrderedItem>(
  items: T[],
  item: T,
  scope: string | undefined,
  getScope: (item: T) => string | undefined,
): T[] {
  const scopedItems = sortItemsByOrder(
    items.filter((current) => getScope(current) === scope),
  );
  const orderById = new Map(
    scopedItems.map((current, index) => [current.id, index + 1]),
  );

  return [
    ...items.map((current) =>
      orderById.has(current.id)
        ? { ...current, order: orderById.get(current.id) }
        : current,
    ),
    { ...item, order: 0 },
  ];
}

export function reorderScopedItems<T extends OrderedItem>(
  items: T[],
  ids: string[],
  options: ReorderScopedItemsOptions<T>,
): ReorderScopedItemsResult<T> {
  const selectedIds = new Set(ids);
  if (!selectedIds.size) return { items, moved: false };

  const sourceIndex = new Map(items.map((item, index) => [item.id, index]));
  const selected = items.filter((item) => selectedIds.has(item.id));
  if (!selected.length) return { items, moved: false };

  const relativeTo = options.relativeToId
    ? items.find((item) => item.id === options.relativeToId)
    : undefined;
  const placement = options.placement ?? "inside";
  if (
    placement !== "inside" &&
    (!relativeTo || selectedIds.has(relativeTo.id))
  ) {
    return { items, moved: false };
  }

  const destinationScope =
    placement === "inside"
      ? options.destinationScope
      : options.getScope(relativeTo!);
  const compare = (first: T, second: T) =>
    effectiveOrder(first, sourceIndex, options.getFallbackOrder) -
      effectiveOrder(second, sourceIndex, options.getFallbackOrder) ||
    (sourceIndex.get(first.id) ?? 0) - (sourceIndex.get(second.id) ?? 0);
  const moved = [...selected].sort((first, second) =>
    options.getScope(first) === options.getScope(second)
      ? compare(first, second)
      : (sourceIndex.get(first.id) ?? 0) -
        (sourceIndex.get(second.id) ?? 0),
  );
  const affectedScopes = new Set(
    selected.map((item) => options.getScope(item)),
  );
  affectedScopes.add(destinationScope);

  const destinationItems = items
    .filter(
      (item) =>
        options.getScope(item) === destinationScope &&
        !selectedIds.has(item.id),
    )
    .sort(compare);
  const targetIndex = relativeTo
    ? destinationItems.findIndex((item) => item.id === relativeTo.id)
    : destinationItems.length;
  if (placement !== "inside" && targetIndex < 0) {
    return { items, moved: false };
  }
  const insertAt =
    placement === "above"
      ? targetIndex
      : placement === "below"
        ? targetIndex + 1
        : destinationItems.length;
  destinationItems.splice(
    insertAt,
    0,
    ...moved.map((item) => options.setScope(item, destinationScope)),
  );

  const updates = new Map<string, T>();
  for (const scope of affectedScopes) {
    const siblings =
      scope === destinationScope
        ? destinationItems
        : items
            .filter(
              (item) =>
                options.getScope(item) === scope &&
                !selectedIds.has(item.id),
            )
            .sort(compare);
    siblings.forEach((item, index) =>
      updates.set(item.id, { ...item, order: index }),
    );
  }

  return {
    items: items.map((item) => updates.get(item.id) ?? item),
    moved: true,
  };
}
