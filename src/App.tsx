import { useState } from "react";
import manifest from "../manifest.json";
import { useMacros } from "./hooks/useMacros";
import { Macro } from "./types/macro";
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
    moveSelected,
    renameFolder,
    moveFolder,
    moveFolders,
    deleteFolder,
    deleteFolders,
  } = useMacros();
  const [editingMacro, setEditingMacro] = useState<Macro | undefined>();

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

  const handleImport = (importedMacros: Macro[]) => {
    replaceMacros(importedMacros);
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
      <Header />
      <main className="app-main">
        <div className="container">
          <Help />
          <MacroList
            macros={macros}
            folders={folders}
            onCreateMacro={handleCreateMacro}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onExport={handleExportMacros}
            onCreateFolder={handleCreateFolder}
            onDeleteSelected={deleteSelected}
            onMoveSelected={moveSelected}
            onRenameFolder={renameFolder}
            onMoveFolder={moveFolder}
            onMoveFolders={moveFolders}
            onDeleteFolder={deleteFolder}
            onDeleteFolders={deleteFolders}
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
          </p>
          <a
            className="footer-project-link"
            href="https://github.com/gufvr/lilac-keys"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="material-symbols-outlined">code</span>
            Projeto no GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;
