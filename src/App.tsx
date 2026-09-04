import { useState } from "react";
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
    deleteFolder,
  } = useMacros();
  const [editingMacro, setEditingMacro] = useState<Macro | undefined>(
    undefined,
  );

  const handleFormSubmit = (data: Omit<Macro, "id">) => {
    if (editingMacro) {
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
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  const handleExportFolder = (folderId: string) => {
    exportMacros(macros, "json", folders, folderId);
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
          <ImportExport
            macros={macros}
            folders={folders}
            onImport={handleImport}
          />
          <MacroForm
            macro={editingMacro}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            onSuccess={handleFormCancel}
            folders={folders}
          />
          <MacroList
            macros={macros}
            folders={folders}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCreateFolder={handleCreateFolder}
            onDeleteSelected={deleteSelected}
            onMoveSelected={moveSelected}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
            onExportFolder={handleExportFolder}
          />
        </div>
      </main>
      <footer id="footer">
        <p>
          © 2026 Desenvolvido por{" "}
          <a
            href="https://github.com/gufvr"
            target="_blank"
            rel="noopener noreferrer"
          >
            Gustavo Favero
          </a>{" "}
          · Todos os direitos reservados
        </p>
        <p>
          Projeto no{" "}
          <a
            href="https://github.com/gufvr/lilac-keys"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
