import { Folder, Macro } from "../types/macro";

type ExternalSnippet = {
  name: string;
  body: string;
  timestamp?: number;
};

type ExternalFolder = [string, number, ...ExternalSnippet[]];

export function exportMacros(
  macros: Macro[],
  format: "json" | "txt" = "json",
  folders: Folder[] = [],
  folderId?: string,
  macroIds?: string[],
): void {
  try {
    let dataStr: string;
    let mimeType: string;
    let extension: string;
    const selectedMacroIds = macroIds ? new Set(macroIds) : undefined;
    const selectedFolderIds = folderId
      ? new Set(
          folders
            .filter((folder) => folder.id === folderId)
            .map((folder) => folder.id),
        )
      : macroIds
        ? new Set<string>()
        : undefined;

    if (selectedMacroIds) {
      const macroFolderIds = new Set(
        macros
          .filter((macro) => selectedMacroIds.has(macro.id) && macro.folderId)
          .map((macro) => macro.folderId as string),
      );
      let changed = true;
      while (changed) {
        changed = false;
        folders.forEach((folder) => {
          if (
            macroFolderIds.has(folder.id) &&
            folder.parentId &&
            !macroFolderIds.has(folder.parentId)
          ) {
            macroFolderIds.add(folder.parentId);
            changed = true;
          }
        });
      }
      macroFolderIds.forEach((id) => selectedFolderIds?.add(id));
    }

    if (selectedFolderIds) {
      let changed = true;
      while (changed) {
        changed = false;
        folders.forEach((folder) => {
          if (
            folder.parentId &&
            selectedFolderIds.has(folder.parentId) &&
            !selectedFolderIds.has(folder.id)
          ) {
            selectedFolderIds.add(folder.id);
            changed = true;
          }
        });
      }
    }

    if (format === "txt") {
      const selectedMacros = selectedMacroIds
        ? macros.filter((macro) => selectedMacroIds.has(macro.id))
        : macros;
      dataStr = buildTreeText(selectedMacros, folders, selectedFolderIds);
      mimeType = "text/plain";
      extension = "txt";
    } else {
      const exportFolders = selectedFolderIds
        ? folders.filter((folder) => selectedFolderIds.has(folder.id))
        : folders;
      const exportMacros = selectedMacroIds
        ? macros.filter((macro) => selectedMacroIds.has(macro.id))
        : selectedFolderIds
        ? macros.filter(
            (macro) => macro.folderId && selectedFolderIds.has(macro.folderId),
          )
        : macros;
      const groups = exportFolders.map(
        (folder): ExternalFolder => [
          folder.name,
          folder.createdAt,
          ...exportMacros
            .filter((macro) => macro.folderId === folder.id)
            .map((macro) => ({
              name: macro.atalho,
              body: macro.textoExpandido,
              timestamp: Date.now(),
            })),
        ],
      );
      const unfiled = exportMacros.filter((macro) => !macro.folderId);
      if (unfiled.length > 0) {
        groups.push([
          "",
          Date.now(),
          ...unfiled.map((macro) => ({
            name: macro.atalho,
            body: macro.textoExpandido,
            timestamp: Date.now(),
          })),
        ]);
      }
      dataStr = JSON.stringify(groups, null, 2);
      mimeType = "application/json";
      extension = "json";
    }

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

export async function importMacros(file: File): Promise<Macro[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const content = reader.result as string;
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith(".txt")) {
          const externalMacros = parseExternalText(content);

          if (externalMacros) {
            resolve(externalMacros);
            return;
          }

          const lines = content
            .split("\n")
            .filter((line) => line.trim().length > 0);

          const macros = lines.map((line, index) => {
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
          });

          resolve(macros);
          return;
        }

        const parsed = JSON.parse(content);

        const externalMacros = parseExternalData(parsed);

        if (externalMacros) {
          resolve(externalMacros);
          return;
        }

        if (!Array.isArray(parsed)) {
          reject(new Error("O arquivo JSON não contém um array de macros"));
          return;
        }

        const isValid = parsed.every(
          (macro) =>
            typeof macro.nome === "string" &&
            typeof macro.atalho === "string" &&
            typeof macro.textoExpandido === "string",
        );

        if (!isValid) {
          reject(new Error("O arquivo contém macros com estrutura inválida"));
          return;
        }

        const macros: Macro[] = parsed.map((macro) => ({
          ...macro,
          id: macro.id ?? crypto.randomUUID(),
        }));

        resolve(macros);
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

function buildTreeText(
  macros: Macro[],
  folders: Folder[],
  selectedFolderIds?: Set<string>,
): string {
  const lines: string[] = [];
  const childrenByParent = new Map<string | undefined, Folder[]>();

  folders.forEach((folder) => {
    if (!selectedFolderIds || selectedFolderIds.has(folder.id)) {
      const children = childrenByParent.get(folder.parentId) ?? [];
      children.push(folder);
      childrenByParent.set(folder.parentId, children);
    }
  });

  const appendMacros = (folderId: string | undefined, indent: string) => {
    macros
      .filter((macro) => macro.folderId === folderId)
      .forEach((macro) => {
        lines.push(`${indent}{${macro.atalho}}`);
        lines.push(macro.textoExpandido.replace(/\r/g, ""));
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

function parseExternalText(content: string): Macro[] | null {
  const trimmedContent = content.trim();

  const treeMacros = parseTreeText(trimmedContent);
  if (treeMacros) return treeMacros;

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

function parseTreeText(content: string): Macro[] | null {
  const lines = content.split(/\r?\n/);
  const macros: Macro[] = [];
  const folderStack: { indent: number; name: string }[] = [];
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
      folderStack.push({ indent, name: folderMatch[1].trim() });
      index += 1;
      continue;
    }

    const shortcutMatch = trimmedLine.match(/^\{([^{}]+)\}$/);
    if (!shortcutMatch) {
      index += 1;
      continue;
    }

    const bodyLines: string[] = [];
    index += 1;
    while (index < lines.length) {
      const nextTrimmed = lines[index].trim();
      if (/^\[[^\]]+\]$/.test(nextTrimmed) || /^\{[^{}]+\}$/.test(nextTrimmed)) {
        break;
      }
      bodyLines.push(lines[index].trim());
      index += 1;
    }

    macros.push({
      id: crypto.randomUUID(),
      nome: shortcutMatch[1].trim(),
      atalho: shortcutMatch[1].trim(),
      textoExpandido: bodyLines.join("\n").trim(),
      ...(folderStack.length > 0
        ? { folderName: folderStack[folderStack.length - 1].name }
        : {}),
    });
  }

  return macros.length > 0 ? macros : null;
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

function parseExternalData(data: unknown): Macro[] | null {
  const snippets =
    typeof data === "object" && data !== null && "snippets" in data
      ? (data as { snippets?: unknown }).snippets
      : data;

  if (!Array.isArray(snippets)) return null;

  const macros: Macro[] = [];
  const visit = (items: unknown[], folderPath: string[]) => {
    items.forEach((item) => {
      if (isExternalSnippet(item)) {
        const folderName = folderPath.join(" / ");
        macros.push({
          id: crypto.randomUUID(),
          nome: item.name.trim(),
          atalho: item.name.trim(),
          textoExpandido: item.body.trim(),
          ...(folderName ? { folderName } : {}),
        });
        return;
      }

      if (!Array.isArray(item) || typeof item[0] !== "string") return;

      const folderName = item[0].trim();
      const nextPath =
        folderName.toLowerCase() === "snippets"
          ? folderPath
          : [...folderPath, folderName];
      visit(item.slice(2), nextPath);
    });
  };

  visit(snippets, []);
  return macros.length > 0 ? macros : null;
}

function isExternalSnippet(item: unknown): item is ExternalSnippet {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as ExternalSnippet).name === "string" &&
    typeof (item as ExternalSnippet).body === "string"
  );
}
