import type { Folder, Macro } from "../types/macro.ts";
import { sortItemsByOrder } from "./itemOrdering.ts";
import { createUniqueValue } from "./uniqueValue.ts";

export interface FolderCloneResult {
  success: boolean;
  folders: Folder[];
  macros: Macro[];
  clonedFolderId?: string;
  adjustedShortcuts: number;
  error?: string;
}

interface FolderCloneOptions {
  createId?: () => string;
  now?: () => number;
}

function collectSubtreeIds(sourceId: string, folders: Folder[]): Set<string> {
  const ids = new Set([sourceId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function uniqueFolderCopyName(source: Folder, folders: Folder[]): string {
  const usedNames = new Set(
    folders
      .filter((folder) => folder.parentId === source.parentId)
      .map((folder) => folder.name.toLowerCase()),
  );
  const base = `${source.name} (cópia)`;
  if (!usedNames.has(base.toLowerCase())) return base;
  let counter = 2;
  while (usedNames.has(`${source.name} (cópia ${counter})`.toLowerCase())) {
    counter += 1;
  }
  return `${source.name} (cópia ${counter})`;
}

export function cloneFolderTree(
  folders: Folder[],
  macros: Macro[],
  sourceId: string,
  options: FolderCloneOptions = {},
): FolderCloneResult {
  const source = folders.find((folder) => folder.id === sourceId);
  if (!source) {
    return {
      success: false,
      folders,
      macros,
      adjustedShortcuts: 0,
      error: "Pasta não encontrada",
    };
  }

  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => Date.now());
  const subtreeIds = collectSubtreeIds(sourceId, folders);
  const subtree = folders.filter((folder) => subtreeIds.has(folder.id));
  const idBySourceId = new Map<string, string>();
  subtree.forEach((folder) => idBySourceId.set(folder.id, createId()));

  const copiedFolders = subtree.map((folder, index) => ({
    ...folder,
    id: idBySourceId.get(folder.id)!,
    name:
      folder.id === sourceId ? uniqueFolderCopyName(source, folders) : folder.name,
    createdAt: now() + index,
    parentId:
      folder.id === sourceId
        ? source.parentId
        : idBySourceId.get(folder.parentId as string),
  }));
  const clonedFolderId = idBySourceId.get(sourceId)!;
  const combinedFolders = [...folders, ...copiedFolders];
  const rootSiblings = sortItemsByOrder(
    combinedFolders.filter((folder) => folder.parentId === source.parentId),
  ).filter((folder) => folder.id !== clonedFolderId);
  const sourceIndex = rootSiblings.findIndex((folder) => folder.id === sourceId);
  rootSiblings.splice(sourceIndex + 1, 0, copiedFolders.find((folder) => folder.id === clonedFolderId)!);
  const rootOrderById = new Map(
    rootSiblings.map((folder, index) => [folder.id, index]),
  );
  const normalizedFolders = combinedFolders.map((folder) =>
    rootOrderById.has(folder.id)
      ? { ...folder, order: rootOrderById.get(folder.id) }
      : folder,
  );

  const usedShortcuts = new Set(macros.map((macro) => macro.atalho.toLowerCase()));
  let adjustedShortcuts = 0;
  const copiedMacros = macros
    .filter(
      (macro) => macro.folderId && subtreeIds.has(macro.folderId),
    )
    .map((macro) => {
      const shortcut = createUniqueValue(macro.atalho, usedShortcuts, "-copia");
      if (shortcut !== macro.atalho) adjustedShortcuts += 1;
      return {
        ...macro,
        id: createId(),
        atalho: shortcut,
        folderId: idBySourceId.get(macro.folderId as string),
      };
    });

  return {
    success: true,
    folders: normalizedFolders,
    macros: [...macros, ...copiedMacros],
    clonedFolderId,
    adjustedShortcuts,
  };
}
