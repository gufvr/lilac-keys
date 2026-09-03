import { Folder, Macro } from "../types/macro";

type ProKeysSnippet = {
  name: string;
  body: string;
  timestamp?: number;
};

type ProKeysFolder = [string, number, ...ProKeysSnippet[]];

export function exportMacros(
  macros: Macro[],
  format: "json" | "txt" = "json",
  folders: Folder[] = [],
  folderId?: string,
): void {
  try {
    let dataStr: string;
    let mimeType: string;
    let extension: string;

    if (format === "txt") {
      dataStr = macros
        .map(
          (macro) =>
            `${macro.nome}\t${macro.atalho}\t${macro.textoExpandido.replace(
              /\n/g,
              "\\n",
            )}`,
        )
        .join("\n");
      mimeType = "text/plain";
      extension = "txt";
    } else {
      const selectedFolderIds = folderId
        ? new Set(
            folders
              .filter((folder) => folder.id === folderId)
              .map((folder) => folder.id),
          )
        : undefined;
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
      const exportFolders = selectedFolderIds
        ? folders.filter((folder) => selectedFolderIds.has(folder.id))
        : folders;
      const exportMacros = selectedFolderIds
        ? macros.filter(
            (macro) => macro.folderId && selectedFolderIds.has(macro.folderId),
          )
        : macros;
      const groups = exportFolders.map(
        (folder): ProKeysFolder => [
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
      const unfiled = selectedFolderIds
        ? []
        : macros.filter((macro) => !macro.folderId);
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
          const proKeysMacros = parseProKeysText(content);

          if (proKeysMacros) {
            resolve(proKeysMacros);
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

        const proKeysMacros = parseProKeysData(parsed);

        if (proKeysMacros) {
          resolve(proKeysMacros);
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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function parseProKeysText(content: string): Macro[] | null {
  const trimmedContent = content.trim();

  try {
    const parsed = JSON.parse(trimmedContent);
    return parseProKeysData(parsed);
  } catch {
    const snippets = extractJsonObjects(trimmedContent);

    if (snippets.length === 0) {
      return null;
    }

    return parseProKeysData(snippets);
  }
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

function parseProKeysData(data: unknown): Macro[] | null {
  if (Array.isArray(data) && data.every((item) => Array.isArray(item))) {
    const folders = data as unknown[][];
    const nestedMacros = folders.flatMap((folder) => {
      const folderName = typeof folder[0] === "string" ? folder[0] : "";
      return folder.slice(2).flatMap((item) => {
        if (!isProKeysSnippet(item)) return [];
        return [
          {
            id: crypto.randomUUID(),
            nome: item.name.trim(),
            atalho: item.name.trim(),
            textoExpandido: stripHtml(item.body),
            ...(folderName ? { folderName } : {}),
          },
        ];
      });
    });
    return nestedMacros.length > 0 ? nestedMacros : null;
  }
  const snippets =
    typeof data === "object" && data !== null && "snippets" in data
      ? (data as { snippets?: unknown }).snippets
      : data;

  if (!Array.isArray(snippets)) return null;

  const validSnippets = snippets.filter(
    (item): item is ProKeysSnippet =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as ProKeysSnippet).name === "string" &&
      typeof (item as ProKeysSnippet).body === "string",
  );

  if (validSnippets.length === 0) return null;

  return validSnippets.map((snippet) => ({
    id: crypto.randomUUID(),
    nome: snippet.name.trim(),
    atalho: snippet.name.trim(),
    textoExpandido: stripHtml(snippet.body),
  }));
}

function isProKeysSnippet(item: unknown): item is ProKeysSnippet {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as ProKeysSnippet).name === "string" &&
    typeof (item as ProKeysSnippet).body === "string"
  );
}
