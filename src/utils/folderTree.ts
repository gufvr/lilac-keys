import { Folder } from "../types/macro";

export interface FolderTreeItem {
  folder: Folder;
  level: number;
}

export function flattenFolders(folders: Folder[]): FolderTreeItem[] {
  const childrenByParent = new Map<string | undefined, Folder[]>();

  folders.forEach((folder) => {
    const children = childrenByParent.get(folder.parentId) ?? [];
    children.push(folder);
    childrenByParent.set(folder.parentId, children);
  });

  const result: FolderTreeItem[] = [];
  const visit = (parentId: string | undefined, level: number) => {
    (childrenByParent.get(parentId) ?? []).forEach((folder) => {
      result.push({ folder, level });
      visit(folder.id, level + 1);
    });
  };

  visit(undefined, 0);
  return result;
}

export function formatFolderLabel(name: string, level: number): string {
  return `${"　".repeat(level)}${level > 0 ? "↳ " : ""}${name}`;
}