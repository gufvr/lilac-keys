import { useState, useEffect, useCallback } from "react";
import { Folder, Macro } from "../types/macro";
import { StorageService } from "../services/storageService";
import { validateMacro, isShortcutUnique } from "../utils/macroValidation";
import { Folder as ImportedFolder } from "../types/macro";
import { stripUnsupportedMacroImages } from "../utils/macroImages";
import {
  ItemPlacement,
  nextOrderInScope,
  reorderScopedItems,
  sortItemsByOrder,
} from "../utils/itemOrdering";

export function useMacros() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);

  useEffect(() => {
    async function load() {
      const [loadedMacros, loadedFolders] = await Promise.all([
        StorageService.loadMacros(),
        StorageService.loadFolders(),
      ]);
      setMacros(
        loadedMacros.map((macro) => ({
          ...macro,
          textoExpandido: stripUnsupportedMacroImages(macro.textoExpandido).html,
        })),
      );
      setFolders(loadedFolders);
      setLoading(false);
    }

    load();
  }, []);

  useEffect(() => {
    if (!loading) {
      StorageService.saveMacros(macros);
    }
  }, [macros, loading]);

  useEffect(() => {
    if (!loading) StorageService.saveFolders(folders);
  }, [folders, loading]);

  const createMacro = useCallback(
    (macroData: Omit<Macro, "id">): { success: boolean; error?: string } => {
      const sanitizedMacroData = {
        ...macroData,
        textoExpandido: stripUnsupportedMacroImages(macroData.textoExpandido).html,
      };
      const validation = validateMacro(sanitizedMacroData);
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(", ") };
      }

      if (!isShortcutUnique(sanitizedMacroData.atalho, macros)) {
        return { success: false, error: "Este atalho já está em uso" };
      }

      const newMacro: Macro = {
        ...sanitizedMacroData,
        id: crypto.randomUUID(),
        order: nextOrderInScope(
          macros,
          sanitizedMacroData.folderId,
          (macro) => macro.folderId,
        ),
      };

      setMacros((prev) => [...prev, newMacro]);
      return { success: true };
    },
    [macros],
  );

  const updateMacro = useCallback(
    (
      id: string,
      macroData: Partial<Macro>,
    ): { success: boolean; error?: string } => {
      const sanitizedMacroData =
        typeof macroData.textoExpandido === "string"
          ? {
              ...macroData,
              textoExpandido: stripUnsupportedMacroImages(
                macroData.textoExpandido,
              ).html,
            }
          : macroData;
      const validation = validateMacro(sanitizedMacroData);
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(", ") };
      }

      if (
        sanitizedMacroData.atalho &&
        !isShortcutUnique(sanitizedMacroData.atalho, macros, id)
      ) {
        return { success: false, error: "Este atalho já está em uso" };
      }

      setMacros((prev) =>
        prev.map((macro) =>
          macro.id === id ? { ...macro, ...sanitizedMacroData } : macro,
        ),
      );
      return { success: true };
    },
    [macros],
  );

  const deleteMacro = useCallback((id: string): void => {
    setMacros((prev) => prev.filter((macro) => macro.id !== id));
  }, []);

  const getMacroById = useCallback(
    (id: string): Macro | undefined => {
      return macros.find((macro) => macro.id === id);
    },
    [macros],
  );

  const replaceMacros = useCallback(
    (newMacros: Macro[], importedFolders: ImportedFolder[] = []): void => {
      const importedFolderIds = new Map<string, string>();
      const importedFoldersByParent = new Map<string | undefined, ImportedFolder[]>();
      importedFolders.forEach((folder) => {
        const siblings = importedFoldersByParent.get(folder.parentId) ?? [];
        siblings.push(folder);
        importedFoldersByParent.set(folder.parentId, siblings);
      });

      const createImportedFolders = (
        parentId: string | undefined,
        sourceParentId: string | undefined,
      ): Folder[] => {
        const created: Folder[] = [];
        const children = (importedFoldersByParent.get(sourceParentId) ?? []).sort(
          (first, second) =>
            (first.order ?? first.createdAt) -
            (second.order ?? second.createdAt),
        );

        children.forEach((folder) => {
          const newId = crypto.randomUUID();
          importedFolderIds.set(folder.id, newId);
          created.push({
            ...folder,
            id: newId,
            parentId,
          });
          created.push(...createImportedFolders(newId, folder.id));
        });

        return created;
      };

      const importedTree = createImportedFolders(undefined, undefined);
      const importedFolderNames = [
        ...new Set(
          newMacros
            .filter((macro) => !macro.folderId)
            .map((macro) => macro.folderName)
            .filter((name): name is string => Boolean(name)),
        ),
      ];
      const foldersByName = new Map(
        folders.map((folder) => [folder.name.toLowerCase(), folder]),
      );
      const missingFolders = importedFolderNames
        .filter((name) => !foldersByName.has(name.toLowerCase()))
        .map((name) => ({
          id: crypto.randomUUID(),
          name,
          createdAt: Date.now(),
        }));
      const allFolders = [...folders, ...missingFolders, ...importedTree];
      const folderIds = new Map(
        allFolders.map((folder) => [folder.name.toLowerCase(), folder.id]),
      );
      setFolders(allFolders);
      const importedMacros = newMacros.map(({ folderName, ...macro }) => ({
        ...macro,
        textoExpandido: stripUnsupportedMacroImages(macro.textoExpandido).html,
        id: crypto.randomUUID(),
        folderId: macro.folderId
          ? importedFolderIds.get(macro.folderId) ?? macro.folderId
          : folderName
            ? folderIds.get(folderName.toLowerCase())
            : undefined,
      }));

      setMacros((currentMacros) => {
        const usedNames = new Set(
          currentMacros.map((macro) => macro.nome.toLowerCase()),
        );

        const renamedMacros = importedMacros.map((macro) => {
          const originalName = macro.nome;
          let name = originalName;
          let suffix = 1;

          while (usedNames.has(name.toLowerCase())) {
            name = `${originalName} (${suffix})`;
            suffix += 1;
          }

          usedNames.add(name.toLowerCase());
          return { ...macro, nome: name };
        });

        const importedOrderById = new Map<string, number>();
        const importedScopes = new Set(
          renamedMacros.map((macro) => macro.folderId),
        );
        for (const scope of importedScopes) {
          sortItemsByOrder(
            renamedMacros.filter((macro) => macro.folderId === scope),
          ).forEach((macro, index) => importedOrderById.set(macro.id, index));
        }
        const firstOrders = new Map<string | undefined, number>();
        const appendedMacros = renamedMacros.map((macro) => {
          const scope = macro.folderId;
          const firstOrder =
            firstOrders.get(scope) ??
            nextOrderInScope(currentMacros, scope, (item) => item.folderId);
          firstOrders.set(scope, firstOrder);
          return {
            ...macro,
            order: firstOrder + (importedOrderById.get(macro.id) ?? 0),
          };
        });

        return [...currentMacros, ...appendedMacros];
      });
    },
    [folders],
  );

  const createFolder = useCallback(
    (name: string, parentId?: string): { success: boolean; error?: string } => {
      const trimmedName = name.trim();
      if (!trimmedName)
        return { success: false, error: "O nome da pasta é obrigatório" };
      if (
        folders.some(
          (folder) =>
            folder.parentId === parentId &&
            folder.name.toLowerCase() === trimmedName.toLowerCase(),
        )
      ) {
        return { success: false, error: "Esta pasta já existe" };
      }
      setFolders((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: trimmedName,
          createdAt: Date.now(),
          parentId,
          order: Date.now(),
        },
      ]);
      return { success: true };
    },
    [folders],
  );

  const deleteSelected = useCallback((ids: string[]): void => {
    setMacros((prev) => prev.filter((macro) => !ids.includes(macro.id)));
  }, []);

  const renameFolder = useCallback(
    (id: string, name: string): { success: boolean; error?: string } => {
      const trimmedName = name.trim();
      const folder = folders.find((item) => item.id === id);
      if (!trimmedName)
        return { success: false, error: "O nome da pasta é obrigatório" };
      if (!folder) return { success: false, error: "Pasta não encontrada" };
      if (
        folders.some(
          (item) =>
            item.id !== id &&
            item.parentId === folder.parentId &&
            item.name.toLowerCase() === trimmedName.toLowerCase(),
        )
      ) {
        return { success: false, error: "Esta pasta já existe neste local" };
      }
      setFolders((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, name: trimmedName } : item,
        ),
      );
      return { success: true };
    },
    [folders],
  );

  const moveFolder = useCallback(
    (
      id: string,
      parentId?: string,
      placement: "inside" | "above" | "below" = "inside",
      relativeToId?: string,
    ): { success: boolean; error?: string } => {
      const folder = folders.find((item) => item.id === id);
      if (!folder) return { success: false, error: "Pasta não encontrada" };
      const relativeTo = relativeToId
        ? folders.find((item) => item.id === relativeToId)
        : undefined;
      const destinationParent =
        placement === "inside" ? parentId : relativeTo?.parentId;
      if (parentId === id || destinationParent === id) {
        return {
          success: false,
          error: "Uma pasta não pode ser movida para si mesma",
        };
      }

      const descendantIds = new Set<string>();
      let changed = true;
      while (changed) {
        changed = false;
        folders.forEach((item) => {
          if (
            item.parentId &&
            (item.parentId === id || descendantIds.has(item.parentId)) &&
            !descendantIds.has(item.id)
          ) {
            descendantIds.add(item.id);
            changed = true;
          }
        });
      }

      if (destinationParent && descendantIds.has(destinationParent)) {
        return {
          success: false,
          error: "Uma pasta não pode ser movida para dentro de uma subpasta",
        };
      }
      if (
        folders.some(
          (item) =>
            item.id !== id &&
            item.parentId === destinationParent &&
            item.name.toLowerCase() === folder.name.toLowerCase(),
        )
      ) {
        return {
          success: false,
          error: "Já existe uma pasta com esse nome no destino",
        };
      }

      setFolders((prev) => {
        const siblings = prev
          .filter(
            (item) =>
              item.parentId === destinationParent && item.id !== id,
          )
          .sort(
            (first, second) =>
              (first.order ?? first.createdAt) -
              (second.order ?? second.createdAt),
          );
        const targetIndex = relativeTo
          ? siblings.findIndex((item) => item.id === relativeTo.id)
          : siblings.length;
        const insertAt =
          placement === "above"
            ? Math.max(targetIndex, 0)
            : placement === "below"
              ? targetIndex + 1
              : siblings.length;
        siblings.splice(insertAt, 0, {
          ...folder,
          parentId: destinationParent,
        });
        const orderById = new Map(
          siblings.map((item, index) => [item.id, index]),
        );
        return prev.map((item) =>
          orderById.has(item.id)
            ? {
                ...item,
                parentId:
                  item.id === id ? destinationParent : item.parentId,
                order: orderById.get(item.id),
              }
            : item,
        );
      });
      return { success: true };
    },
    [folders],
  );

  const moveFolders = useCallback(
    (
      ids: string[],
      parentId?: string,
      placement: ItemPlacement = "inside",
      relativeToId?: string,
    ): { success: boolean; error?: string } => {
      const selectedIds = new Set(ids);
      const selectedFolders = folders.filter((folder) => selectedIds.has(folder.id));
      if (!selectedFolders.length) {
        return { success: false, error: "Nenhuma pasta selecionada" };
      }
      const relativeTo = relativeToId
        ? folders.find((folder) => folder.id === relativeToId)
        : undefined;
      if (placement !== "inside" && !relativeTo) {
        return { success: false, error: "Pasta de referência não encontrada" };
      }
      if (relativeTo && selectedIds.has(relativeTo.id)) {
        return { success: false, error: "Destino faz parte da seleção" };
      }
      const destinationParent =
        placement === "inside" ? parentId : relativeTo?.parentId;
      if (destinationParent && selectedIds.has(destinationParent)) {
        return {
          success: false,
          error: "Uma pasta não pode ser movida para dentro dela mesma",
        };
      }
      let ancestor = folders.find((folder) => folder.id === destinationParent);
      while (ancestor) {
        if (selectedIds.has(ancestor.id)) {
          return {
            success: false,
            error: "Uma pasta não pode ser movida para dentro de uma subpasta selecionada",
          };
        }
        ancestor = folders.find((folder) => folder.id === ancestor?.parentId);
      }
      const destinationNames = new Set(
        folders
          .filter(
            (folder) =>
              folder.parentId === destinationParent &&
              !selectedIds.has(folder.id),
          )
          .map((folder) => folder.name.toLowerCase()),
      );
      if (
        selectedFolders.some((folder) =>
          destinationNames.has(folder.name.toLowerCase()),
        )
      ) {
        return {
          success: false,
          error: "Já existe uma pasta com esse nome no destino",
        };
      }
      setFolders((prev) => {
        return reorderScopedItems(prev, ids, {
          destinationScope: destinationParent,
          placement,
          relativeToId,
          getScope: (folder) => folder.parentId,
          setScope: (folder, scope) => ({ ...folder, parentId: scope }),
          getFallbackOrder: (folder) => folder.createdAt,
        }).items;
      });
      return { success: true };
    },
    [folders],
  );

  const deleteFolders = useCallback(
    (ids: string[]): void => {
      const idsToDelete = new Set<string>(ids);
      let changed = true;
      while (changed) {
        changed = false;
        folders.forEach((folder) => {
          if (
            folder.parentId &&
            idsToDelete.has(folder.parentId) &&
            !idsToDelete.has(folder.id)
          ) {
            idsToDelete.add(folder.id);
            changed = true;
          }
        });
      }
      setFolders((prev) =>
        prev.filter((folder) => !idsToDelete.has(folder.id)),
      );
      setMacros((prev) =>
        prev.filter(
          (macro) => !macro.folderId || !idsToDelete.has(macro.folderId),
        ),
      );
    },
    [folders],
  );

  const deleteFolder = useCallback(
    (id: string): void => {
      deleteFolders([id]);
    },
    [deleteFolders],
  );

  const moveMacros = useCallback(
    (
      ids: string[],
      folderId?: string,
      placement: ItemPlacement = "inside",
      relativeToId?: string,
    ): { success: boolean; error?: string } => {
      const selectedIds = new Set(ids);
      if (!macros.some((macro) => selectedIds.has(macro.id))) {
        return { success: false, error: "Nenhum snippet selecionado" };
      }
      const relativeTo = relativeToId
        ? macros.find((macro) => macro.id === relativeToId)
        : undefined;
      if (placement !== "inside" && !relativeTo) {
        return { success: false, error: "Snippet de referência não encontrado" };
      }
      if (relativeTo && selectedIds.has(relativeTo.id)) {
        return { success: false, error: "Destino faz parte da seleção" };
      }

      setMacros((prev) =>
        reorderScopedItems(prev, ids, {
          destinationScope: folderId,
          placement,
          relativeToId,
          getScope: (macro) => macro.folderId,
          setScope: (macro, scope) => ({ ...macro, folderId: scope }),
        }).items,
      );
      return { success: true };
    },
    [macros],
  );

  return {
    macros,
    loading,
    createMacro,
    updateMacro,
    deleteMacro,
    getMacroById,
    replaceMacros,
    folders,
    createFolder,
    deleteSelected,
    moveMacros,
    renameFolder,
    moveFolder,
    moveFolders,
    deleteFolder,
    deleteFolders,
  };
}
