import type { Folder, Macro } from "../types/macro.ts";
import { sortItemsByOrder } from "./itemOrdering.ts";

type ExternalSnippet = {
  name: string;
  shortcut?: string;
  body: string;
  timestamp?: number;
};

export interface ImportedData {
  macros: Macro[];
  folders: Folder[];
}

export interface ExportPayload {
  format: "lilac-keys";
  version: 2;
  folders: Folder[];
  macros: Macro[];
}

export type ExportScope =
  | { kind: "all" }
  | { kind: "folder"; folderId: string }
  | { kind: "macros"; macroIds: string[] };

export interface ImportMacroConflict {
  name: boolean;
  shortcut: boolean;
}

function collectAncestorFolderIds(
  folderIds: Iterable<string>,
  folders: Folder[],
): Set<string> {
  const result = new Set(folderIds);
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));

  for (const folderId of [...result]) {
    let folder = foldersById.get(folderId);
    const visited = new Set<string>();
    while (folder && !visited.has(folder.id)) {
      visited.add(folder.id);
      result.add(folder.id);
      folder = folder.parentId ? foldersById.get(folder.parentId) : undefined;
    }
  }

  return result;
}

function collectDescendantFolderIds(
  folderId: string,
  folders: Folder[],
): Set<string> {
  const result = new Set<string>();
  if (!folders.some((folder) => folder.id === folderId)) return result;
  result.add(folderId);

  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (
        folder.parentId &&
        result.has(folder.parentId) &&
        !result.has(folder.id)
      ) {
        result.add(folder.id);
        changed = true;
      }
    }
  }

  return result;
}

export function resolveExportData(
  macros: Macro[],
  folders: Folder[],
  scope: ExportScope,
): ImportedData {
  if (scope.kind === "all") {
    return {
      macros: macros.map((macro) => ({ ...macro })),
      folders: folders.map((folder) => ({ ...folder })),
    };
  }

  if (scope.kind === "folder") {
    const selectedFolderIds = collectDescendantFolderIds(
      scope.folderId,
      folders,
    );
    return {
      macros: macros
        .filter(
          (macro) =>
            Boolean(macro.folderId) &&
            selectedFolderIds.has(macro.folderId as string),
        )
        .map((macro) => ({ ...macro })),
      folders: folders
        .filter((folder) => selectedFolderIds.has(folder.id))
        .map((folder) => ({ ...folder })),
    };
  }

  const selectedMacroIds = new Set(scope.macroIds);
  const selectedMacros = macros.filter((macro) => selectedMacroIds.has(macro.id));
  const selectedFolderIds = collectAncestorFolderIds(
    selectedMacros
      .map((macro) => macro.folderId)
      .filter((folderId): folderId is string => Boolean(folderId)),
    folders,
  );

  return {
    macros: selectedMacros.map((macro) => ({ ...macro })),
    folders: folders
      .filter((folder) => selectedFolderIds.has(folder.id))
      .map((folder) => ({ ...folder })),
  };
}

export function serializeExportData(
  data: ImportedData,
  format: "json" | "txt",
): string {
  if (format === "txt") {
    return buildTreeText(data.macros, data.folders);
  }

  const exportedFolderIds = new Set(data.folders.map((folder) => folder.id));
  const payload: ExportPayload = {
    format: "lilac-keys",
    version: 2,
    folders: data.folders.map((folder) => ({
      ...folder,
      parentId:
        folder.parentId && exportedFolderIds.has(folder.parentId)
          ? folder.parentId
          : undefined,
    })),
    macros: data.macros.map((macro) => ({ ...macro })),
  };
  return JSON.stringify(payload, null, 2);
}

function escapeTreeTextBody(body: string): string {
  return body
    .replace(/\r/g, "")
    .split("\n")
    .map((line) =>
      line.startsWith("\\") || line.trim() === "</macro-content>"
        ? `\\${line}`
        : line,
    )
    .join("\n");
}

export function exportMacros(
  macros: Macro[],
  format: "json" | "txt" = "json",
  folders: Folder[] = [],
  folderId?: string,
  macroIds?: string[],
): void {
  try {
    const scope: ExportScope = macroIds
      ? { kind: "macros", macroIds }
      : folderId
        ? { kind: "folder", folderId }
        : { kind: "all" };
    const exportData = resolveExportData(macros, folders, scope);
    const dataStr = serializeExportData(exportData, format);
    const mimeType = format === "txt" ? "text/plain" : "application/json";
    const extension = format;

    const dataBlob = new Blob([dataStr], { type: mimeType });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lilac-keys-${folderId ? "folder" : "macros"}-${
      new Date().toISOString().split("T")[0]
    }.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Erro ao exportar macros:", error);
    throw new Error("Não foi possível exportar as macros");
  }
}

export async function importMacros(file: File): Promise<ImportedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        resolve(parseImportedContent(reader.result as string, file.name));
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("Erro ao processar o arquivo"),
        );
      }
    };

    reader.onerror = () => {
      reject(new Error("Erro ao ler o arquivo"));
    };

    reader.readAsText(file);
  });
}

export function parseImportedContent(
  content: string,
  fileName: string,
): ImportedData {
  if (fileName.toLowerCase().endsWith(".txt")) {
    const externalData = parseExternalText(content);
    if (externalData) return externalData;

    const commaMacros = parseCommaText(content);
    if (commaMacros) return { macros: commaMacros, folders: [] };

    const lines = content
      .split("\n")
      .filter((line) => line.trim().length > 0);
    return {
      macros: lines.map((line, index) => {
        const parts = line.split("\t");
        if (parts.length < 1) {
          throw new Error(`Linha ${index + 1} está em formato inválido`);
        }
        return {
          id: crypto.randomUUID(),
          nome: parts[0]?.trim(),
          atalho: parts[1]?.trim(),
          textoExpandido: parts.slice(2).join("\t").replace(/\\n/g, "\n"),
        };
      }),
      folders: [],
    };
  }

  const parsed: unknown = JSON.parse(content);
  const externalData = parseExternalData(parsed);
  if (externalData) return externalData;

  if (isExportPayload(parsed)) {
    return {
      macros: parsed.macros.map((macro) => ({
        ...macro,
        id: crypto.randomUUID(),
      })),
      folders: parsed.folders.map((folder) => ({ ...folder })),
    };
  }

  if (!Array.isArray(parsed)) {
    throw new Error("O arquivo JSON não contém um array de macros");
  }

  const isValid = parsed.every(
    (macro) =>
      typeof macro === "object" &&
      macro !== null &&
      typeof (macro as Partial<Macro>).nome === "string" &&
      typeof (macro as Partial<Macro>).atalho === "string" &&
      typeof (macro as Partial<Macro>).textoExpandido === "string",
  );
  if (!isValid) {
    throw new Error("O arquivo contém macros com estrutura inválida");
  }

  return {
    macros: (parsed as Macro[]).map((macro) => ({
      ...macro,
      id: crypto.randomUUID(),
    })),
    folders: [],
  };
}

export function filterImportedData(
  data: ImportedData,
  macroIds: Iterable<string>,
): ImportedData {
  const selectedIds = new Set(macroIds);
  const selectedMacros = data.macros.filter((macro) =>
    selectedIds.has(macro.id),
  );
  const selectedFolderIds = collectAncestorFolderIds(
    selectedMacros
      .map((macro) => macro.folderId)
      .filter((folderId): folderId is string => Boolean(folderId)),
    data.folders,
  );
  return {
    macros: selectedMacros.map((macro) => ({ ...macro })),
    folders: data.folders
      .filter((folder) => selectedFolderIds.has(folder.id))
      .map((folder) => ({ ...folder })),
  };
}

export function getFolderPath(
  folderId: string | undefined,
  folders: Folder[],
): string {
  if (!folderId) return "Sem pasta";
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const path: string[] = [];
  const visited = new Set<string>();
  let folder = foldersById.get(folderId);
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id);
    path.unshift(folder.name);
    folder = folder.parentId ? foldersById.get(folder.parentId) : undefined;
  }
  return path.length ? path.join(" / ") : "Sem pasta";
}

export function getImportMacroConflicts(
  importedMacros: Macro[],
  existingMacros: Macro[],
): Map<string, ImportMacroConflict> {
  const usedNames = new Set(
    existingMacros.map((macro) => macro.nome.toLowerCase()),
  );
  const usedShortcuts = new Set(
    existingMacros.map((macro) => macro.atalho.toLowerCase()),
  );
  const conflicts = new Map<string, ImportMacroConflict>();

  for (const macro of importedMacros) {
    const normalizedName = macro.nome.toLowerCase();
    const normalizedShortcut = macro.atalho.toLowerCase();
    conflicts.set(macro.id, {
      name: usedNames.has(normalizedName),
      shortcut: usedShortcuts.has(normalizedShortcut),
    });
    usedNames.add(normalizedName);
    usedShortcuts.add(normalizedShortcut);
  }

  return conflicts;
}

function isExportPayload(data: unknown): data is ExportPayload {
  if (typeof data !== "object" || data === null) return false;
  const payload = data as Partial<ExportPayload>;
  return (
    payload.format === "lilac-keys" &&
    payload.version === 2 &&
    Array.isArray(payload.macros) &&
    Array.isArray(payload.folders)
  );
}

function buildTreeText(
  macros: Macro[],
  folders: Folder[],
): string {
  const lines: string[] = [];
  const childrenByParent = new Map<string | undefined, Folder[]>();
  const includedFolderIds = new Set(folders.map((folder) => folder.id));

  folders.forEach((folder) => {
    const parentId =
      folder.parentId && includedFolderIds.has(folder.parentId)
        ? folder.parentId
        : undefined;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(folder);
    childrenByParent.set(parentId, children);
  });

  childrenByParent.forEach((children, parentId) => {
    childrenByParent.set(parentId, sortItemsByOrder(children));
  });

  const appendMacros = (folderId: string | undefined, indent: string) => {
    sortItemsByOrder(
      macros.filter((macro) => macro.folderId === folderId),
    )
      .forEach((macro) => {
        lines.push(`${indent}{${macro.atalho}}`);
        lines.push(`${indent}<macro-name>${macro.nome}</macro-name>`);
        lines.push(`${indent}<macro-content>`);
        lines.push(escapeTreeTextBody(macro.textoExpandido));
        lines.push(`${indent}</macro-content>`);
      });
  };

  const appendFolder = (folder: Folder, indent: string) => {
    lines.push(`${indent}[${folder.name}]`);
    appendMacros(folder.id, `${indent}  `);
    (childrenByParent.get(folder.id) ?? []).forEach((child) =>
      appendFolder(child, `${indent}  `),
    );
  };

  appendMacros(undefined, "");
  (childrenByParent.get(undefined) ?? []).forEach((folder) =>
    appendFolder(folder, ""),
  );

  return lines.join("\n");
}

function parseExternalText(content: string): ImportedData | null {
  const trimmedContent = content.trim();

  const treeData = parseTreeText(trimmedContent);
  if (treeData) return treeData;

  try {
    const parsed = JSON.parse(trimmedContent);
    return parseExternalData(parsed);
  } catch {
    const snippets = extractJsonObjects(trimmedContent);

    if (snippets.length === 0) {
      return null;
    }

    return parseExternalData(snippets);
  }
}

function parseTreeText(content: string): ImportedData | null {
  const lines = content.split(/\r?\n/);
  const macros: Macro[] = [];
  const folders: Folder[] = [];
  const folderStack: { indent: number; folder: Folder }[] = [];
  const nextFolderOrder = new Map<string | undefined, number>();
  const nextMacroOrder = new Map<string | undefined, number>();
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const trimmedLine = rawLine.trim();
    const indent = rawLine.search(/\S|$/);

    if (!trimmedLine) {
      index += 1;
      continue;
    }

    const folderMatch = trimmedLine.match(/^\[([^\]]+)\]$/);
    if (folderMatch) {
      while (
        folderStack.length > 0 &&
        folderStack[folderStack.length - 1].indent >= indent
      ) {
        folderStack.pop();
      }
      const parentId = folderStack[folderStack.length - 1]?.folder.id;
      const folder: Folder = {
        id: crypto.randomUUID(),
        name: folderMatch[1].trim(),
        createdAt: Date.now() + folders.length,
        parentId,
        order: nextFolderOrder.get(parentId) ?? 0,
      };
      nextFolderOrder.set(parentId, (nextFolderOrder.get(parentId) ?? 0) + 1);
      folders.push(folder);
      folderStack.push({ indent, folder });
      index += 1;
      continue;
    }

    const shortcutMatch = trimmedLine.match(/^\{([^{}]+)\}$/);
    if (!shortcutMatch) {
      index += 1;
      continue;
    }

    const nameLine = lines[index + 1]?.trim();
    const nameMatch = nameLine?.match(/^<macro-name>(.*)<\/macro-name>$/);
    index += nameMatch ? 2 : 1;
    const bodyLines: string[] = [];
    const hasContentBoundary = lines[index]?.trim() === "<macro-content>";
    if (hasContentBoundary) {
      index += 1;
      while (
        index < lines.length &&
        lines[index].trim() !== "</macro-content>"
      ) {
        const line = lines[index];
        bodyLines.push(line.startsWith("\\") ? line.slice(1) : line);
        index += 1;
      }
      if (lines[index]?.trim() === "</macro-content>") index += 1;
    } else {
      while (index < lines.length) {
        const nextTrimmed = lines[index].trim();
        if (
          /^\[[^\]]+\]$/.test(nextTrimmed) ||
          /^\{[^{}]+\}$/.test(nextTrimmed)
        ) {
          break;
        }
        bodyLines.push(lines[index].trim());
        index += 1;
      }
    }

    const folder = folderStack[folderStack.length - 1]?.folder;
    const macroOrder = nextMacroOrder.get(folder?.id) ?? 0;
    nextMacroOrder.set(folder?.id, macroOrder + 1);
    macros.push({
      id: crypto.randomUUID(),
      nome: shortcutMatch[1].trim(),
      atalho: shortcutMatch[1].trim(),
      textoExpandido: hasContentBoundary
        ? bodyLines.join("\n")
        : bodyLines.join("\n").trim(),
      order: macroOrder,
      ...(folder
        ? { folderId: folder.id, folderName: folder.name }
        : {}),
    });

    if (nameMatch) {
      macros[macros.length - 1].nome = nameMatch[1].trim();
    }
  }

  return macros.length > 0 ? { macros, folders } : null;
}

function parseCommaText(content: string): Macro[] | null {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (
    lines.length === 0 ||
    !lines.every((line) => {
      const separatorIndex = line.indexOf(",");
      return separatorIndex > 0 && separatorIndex < line.length - 1;
    })
  ) {
    return null;
  }

  return lines.map((line) => {
    const separatorIndex = line.indexOf(",");
    const name = line.slice(0, separatorIndex).trim();
    const body = line.slice(separatorIndex + 1).trim();

    return {
      id: crypto.randomUUID(),
      nome: name,
      atalho: name,
      textoExpandido: body,
    };
  });
}

function extractJsonObjects(content: string): unknown[] {
  const objects: unknown[] = [];
  let objectStart = -1;
  let depth = 0;
  let insideString = false;
  let isEscaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (insideString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === "\\") {
        isEscaped = true;
      } else if (character === '"') {
        insideString = false;
      }
      continue;
    }

    if (character === '"') {
      insideString = true;
    } else if (character === "{" && depth === 0) {
      objectStart = index;
      depth = 1;
    } else if (character === "{" && depth > 0) {
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;

      if (depth === 0 && objectStart >= 0) {
        const objectText = content.slice(objectStart, index + 1);

        try {
          objects.push(JSON.parse(objectText.replace(/,\s*}/g, "}")));
        } catch {
          // Ignora blocos que não possuem JSON válido.
        }

        objectStart = -1;
      }
    }
  }

  return objects;
}

function parseExternalData(data: unknown): ImportedData | null {
  const snippets =
    typeof data === "object" && data !== null && "snippets" in data
      ? (data as { snippets?: unknown }).snippets
      : data;

  if (!Array.isArray(snippets)) return null;

  const macros: Macro[] = [];
  const folders: Folder[] = [];
  const visit = (
    items: unknown[],
    parentId: string | undefined,
    folderPath: string[],
  ) => {
    items.forEach((item) => {
      if (isExternalSnippet(item)) {
        const folderName = folderPath[folderPath.length - 1];
        macros.push({
          id: crypto.randomUUID(),
          nome: item.name.trim(),
          atalho: item.shortcut?.trim() || item.name.trim(),
          textoExpandido: item.body.trim(),
          ...(parentId ? { folderId: parentId } : {}),
          ...(folderName ? { folderName } : {}),
        });
        return;
      }

      if (!Array.isArray(item) || typeof item[0] !== "string") return;

      const folderName = item[0].trim();
      if (folderName.toLowerCase() === "snippets") {
        visit(item.slice(2), parentId, folderPath);
        return;
      }

      const folder: Folder = {
        id: crypto.randomUUID(),
        name: folderName,
        createdAt: typeof item[1] === "number" ? item[1] : Date.now(),
        parentId,
        order: folders.length,
      };
      folders.push(folder);
      visit(item.slice(2), folder.id, [...folderPath, folderName]);
    });
  };

  visit(snippets, undefined, []);
  return macros.length > 0 ? { macros, folders } : null;
}

function isExternalSnippet(item: unknown): item is ExternalSnippet {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as ExternalSnippet).name === "string" &&
    typeof (item as ExternalSnippet).body === "string"
  );
}
