import { useCallback, useState } from "react";
import manifest from "../manifest.json";
import { useMacros } from "./hooks/useMacros";
import { Macro } from "./types/macro";
import { ImportedData } from "./utils/exportImport";
import { Header } from "./components/Header/Header";
import { MacroForm } from "./components/MacroForm/MacroForm";
import { MacroList } from "./components/MacroList/MacroList";
import { ImportExport } from "./components/ImportExport/ImportExport";
import { Help } from "./components/Help/Help";
import { exportMacros } from "./utils/exportImport";
import "./App.css";

function App() {
  const {
    macros,
    loading,
    createMacro,
    updateMacro,
    deleteMacro,
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
    cloneFolder,
  } = useMacros();
  const [editingMacro, setEditingMacro] = useState<Macro | undefined>();
  const [query, setQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();

  const handleGoHome = useCallback(() => {
    setCurrentFolderId(undefined);
    setQuery("");
  }, []);

  const handleFormSubmit = (data: Omit<Macro, "id">) => {
    if (editingMacro?.id) {
      return updateMacro(editingMacro.id, data);
    } else {
      return createMacro(data);
    }
  };

  const handleFormCancel = () => {
    setEditingMacro(undefined);
  };

  const handleEdit = (macro: Macro) => {
    setEditingMacro(macro);
  };

  const handleClone = (macro: Macro) => {
    setEditingMacro({ ...macro, id: "" });
  };

  const handleCreateMacro = (folderId?: string) => {
    setEditingMacro({
      id: "",
      nome: "",
      atalho: "",
      textoExpandido: "",
      folderId,
    });
  };

  const handleDelete = (id: string) => {
    deleteMacro(id);
    if (editingMacro?.id === id) {
      setEditingMacro(undefined);
    }
  };

  const handleImport = (importedData: ImportedData) => {
    replaceMacros(importedData.macros, importedData.folders);
  };

  const handleCreateFolder = (parentId?: string) => {
    const name = window.prompt("Nome da nova pasta:");
    if (name === null) return;
    const result = createFolder(name, parentId);
    if (!result.success) window.alert(result.error);
  };

  const handleExportFolder = (folderId: string, format: "json" | "txt") => {
    exportMacros(macros, format, folders, folderId);
  };

  const handleExportMacros = (macroIds: string[], format: "json" | "txt") => {
    exportMacros(macros, format, folders, undefined, macroIds);
  };

  if (loading) {
    return (
      <div className="app-loading">
        <span className="material-symbols-outlined">hourglass_empty</span>
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Header onHome={handleGoHome} />
      <main className="app-main">
        <div className="container">
          <Help />
          <MacroList
            macros={macros}
            folders={folders}
            query={query}
            currentFolderId={currentFolderId}
            onQueryChange={setQuery}
            onFolderChange={setCurrentFolderId}
            onGoHome={handleGoHome}
            onCreateMacro={handleCreateMacro}
            onEdit={handleEdit}
            onClone={handleClone}
            onDelete={handleDelete}
            onExport={handleExportMacros}
            onCreateFolder={handleCreateFolder}
            onDeleteSelected={deleteSelected}
            onMoveMacros={moveMacros}
            onRenameFolder={renameFolder}
            onMoveFolder={moveFolder}
            onMoveFolders={moveFolders}
            onDeleteFolder={deleteFolder}
            onDeleteFolders={deleteFolders}
            onCloneFolder={cloneFolder}
            onExportFolder={handleExportFolder}
          />
          <ImportExport
            macros={macros}
            folders={folders}
            onImport={handleImport}
          />
          {editingMacro !== undefined && (
            <MacroForm
              macro={editingMacro}
              onSubmit={handleFormSubmit}
              onCancel={handleFormCancel}
              onSuccess={handleFormCancel}
              folders={folders}
            />
          )}
        </div>
      </main>
      <footer id="footer">
        <div className="container footer-content">
          <p className="footer-copyright">
            © 2026 LilacKeys · v{manifest.version} · Desenvolvido por{" "}
            <a
              href="https://github.com/gufvr"
              target="_blank"
              rel="noopener noreferrer"
            >
              Gustavo Favero
            </a>
            <a
              className="footer-project-link"
              href="https://github.com/gufvr/lilac-keys"
              target="_blank"
              rel="noopener noreferrer"
              title="Projeto no GitHub"
              aria-label="Abrir repositório do LilacKeys no GitHub"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fill="currentColor"
                  d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.305-5.467-1.334-5.467-5.93 0-1.31.467-2.382 1.235-3.222-.123-.303-.535-1.527.117-3.176 0 0 1.008-.322 3.301 1.23A11.52 11.52 0 0 1 12 6.097c1.02.005 2.045.138 3.003.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.649.242 2.873.119 3.176.77.84 1.233 1.912 1.233 3.222 0 4.61-2.807 5.622-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .321.216.694.825.576C20.565 22.092 24 17.596 24 12.297c0-6.627-5.373-12-12-12"
                />
              </svg>
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
