import type { Folder } from "../types/macro.ts";
import { flattenFolders } from "./folderTree.ts";

export interface FolderSearchResult {
  folder: Folder;
  level: number;
  path: string;
  ancestorIds: string[];
}

export function normalizeFolderSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase().replace(/\s+/gu, " ").trim();
}

export function searchFolders(folders: Folder[], query = ""): FolderSearchResult[] {
  // Match text and symbols independently so an emoji can occur on either side
  // of the name. Symbol-only queries still require that symbol to be present.
  const terms = normalizeFolderSearch(query).match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]+/gu) ?? [];
  const lineage: Folder[] = [];
  const results: FolderSearchResult[] = [];

  for (const { folder, level } of flattenFolders(folders)) {
    lineage.length = level;
    lineage.push(folder);
    const name = normalizeFolderSearch(folder.name);
    if (terms.every((term) => name.includes(term))) {
      results.push({
        folder,
        level,
        path: lineage.map((item) => item.name).join(" / "),
        ancestorIds: lineage.slice(0, -1).map((item) => item.id),
      });
    }
  }
  return results;
}
