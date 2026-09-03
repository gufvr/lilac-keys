import { useState, useEffect, useCallback } from "react";
import { Folder, Macro } from "../types/macro";
import { StorageService } from "../services/storageService";
import { validateMacro, isShortcutUnique } from "../utils/macroValidation";

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
      setMacros(loadedMacros);
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
      const validation = validateMacro(macroData);
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(", ") };
      }

      if (!isShortcutUnique(macroData.atalho, macros)) {
        return { success: false, error: "Este atalho já está em uso" };
      }

      const newMacro: Macro = {
        ...macroData,
        id: crypto.randomUUID(),
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
      const validation = validateMacro(macroData);
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(", ") };
      }

      if (macroData.atalho && !isShortcutUnique(macroData.atalho, macros, id)) {
        return { success: false, error: "Este atalho já está em uso" };
      }

      setMacros((prev) =>
        prev.map((macro) =>
          macro.id === id ? { ...macro, ...macroData } : macro,
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
    (newMacros: Macro[]): void => {
      const importedFolderNames = [
        ...new Set(
          newMacros
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
      const allFolders = [...folders, ...missingFolders];
      const folderIds = new Map(
        allFolders.map((folder) => [folder.name.toLowerCase(), folder.id]),
      );
      setFolders(allFolders);
      setMacros(
        newMacros.map(({ folderName, ...macro }) => ({
          ...macro,
          folderId: folderName
            ? folderIds.get(folderName.toLowerCase())
            : macro.folderId,
        })),
      );
    },
    [folders],
  );

  const createFolder = useCallback(
    (name: string): { success: boolean; error?: string } => {
      const trimmedName = name.trim();
      if (!trimmedName)
        return { success: false, error: "O nome da pasta é obrigatório" };
      if (
        folders.some(
          (folder) => folder.name.toLowerCase() === trimmedName.toLowerCase(),
        )
      ) {
        return { success: false, error: "Esta pasta já existe" };
      }
      setFolders((prev) => [
        ...prev,
        { id: crypto.randomUUID(), name: trimmedName, createdAt: Date.now() },
      ]);
      return { success: true };
    },
    [folders],
  );

  const deleteSelected = useCallback((ids: string[]): void => {
    setMacros((prev) => prev.filter((macro) => !ids.includes(macro.id)));
  }, []);

  const moveSelected = useCallback((ids: string[], folderId?: string): void => {
    setMacros((prev) =>
      prev.map((macro) =>
        ids.includes(macro.id) ? { ...macro, folderId } : macro,
      ),
    );
  }, []);

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
    moveSelected,
  };
}
