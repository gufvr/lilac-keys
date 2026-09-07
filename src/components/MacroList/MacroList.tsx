import { useMemo, useState } from "react";
import { Folder, Macro } from "../../types/macro";
import { MacroCard } from "../MacroCard/MacroCard";
import "./MacroList.css";

interface MacroListProps {
  macros: Macro[];
  folders: Folder[];
  onCreateMacro: () => void;
  onEdit: (macro: Macro) => void;
  onDelete: (id: string) => void;
  onCreateFolder: (parentId?: string) => void;
  onDeleteSelected: (ids: string[]) => void;
  onMoveSelected: (ids: string[], folderId?: string) => void;
  onRenameFolder: (
    id: string,
    name: string,
  ) => { success: boolean; error?: string };
  onDeleteFolder: (id: string) => void;
  onExportFolder: (id: string) => void;
}

export function MacroList({
  macros,
  folders,
  onCreateMacro,
  onEdit,
  onDelete,
  onCreateFolder,
  onDeleteSelected,
  onMoveSelected,
  onRenameFolder,
  onDeleteFolder,
  onExportFolder,
}: MacroListProps) {
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();
  const currentFolder = folders.find((folder) => folder.id === currentFolderId);
  const childFolders = folders.filter(
    (folder) => folder.parentId === currentFolderId,
  );
  const folderPath = useMemo(() => {
    const path: Folder[] = [];
    let folder = currentFolder;
    while (folder) {
      path.unshift(folder);
      folder = folders.find((item) => item.id === folder?.parentId);
    }
    return path;
  }, [currentFolder, folders]);
  const filteredMacros = useMemo(
    () =>
      macros.filter((macro) => {
        const haystack =
          `${macro.nome} ${macro.atalho} ${macro.textoExpandido}`.toLowerCase();
        return (
          (query.trim() || folderFilter !== "all"
            ? folderFilter === "all" || (macro.folderId ?? "") === folderFilter
            : (macro.folderId ?? undefined) === currentFolderId) &&
          haystack.includes(query.toLowerCase())
        );
      }),
    [macros, query, folderFilter, currentFolderId],
  );
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  const selectAll = () =>
    setSelected(
      selected.length === filteredMacros.length
        ? []
        : filteredMacros.map((macro) => macro.id),
    );
  const bulkDelete = () => {
    if (window.confirm(`Excluir ${selected.length} macro(s)?`)) {
      onDeleteSelected(selected);
      setSelected([]);
    }
  };
  const renameFolder = (folder: Folder) => {
    const name = window.prompt("Novo nome da pasta:", folder.name);
    if (name === null || name.trim() === folder.name) return;
    const result = onRenameFolder(folder.id, name);
    if (!result.success) window.alert(result.error);
  };
  const deleteFolder = (folder: Folder) => {
    if (
      window.confirm(`Excluir a pasta "${folder.name}" e todo o seu conteúdo?`)
    ) {
      onDeleteFolder(folder.id);
      if (folderPath.some((item) => item.id === folder.id)) {
        setCurrentFolderId(folder.parentId);
      }
    }
  };
  if (macros.length === 0 && folders.length === 0) {
    return (
      <div className="macro-list-empty">
        <span className="material-symbols-outlined">inbox</span>
        <p>Nenhuma macro cadastrada ainda.</p>
        <p className="macro-list-empty-hint">
          Crie sua primeira macro usando o formulário acima.
        </p>
      </div>
    );
  }

  return (
    <div className="macro-list">
      <div className="macro-list-header">
        <div className="macro-list-breadcrumbs">
          <button
            className="btn-icon"
            onClick={() => setCurrentFolderId(undefined)}
            disabled={!currentFolderId}
            title="Ir para a raiz"
          >
            <span className="material-symbols-outlined">home</span>
          </button>
          <button
            className="macro-list-breadcrumb"
            onClick={() => setCurrentFolderId(undefined)}
          >
            Snippets
          </button>
          {folderPath.map((folder, index) => {
            const isFirstFolder = index === 0;
            const isCurrentFolder = index === folderPath.length - 1;

            return (
            <span
              key={folder.id}
              className={`macro-list-breadcrumb-item${
                !isFirstFolder && !isCurrentFolder
                  ? " macro-list-breadcrumb-item-collapsed"
                  : ""
              }`}
            >
              <span className="material-symbols-outlined">chevron_right</span>
              <button
                className="macro-list-breadcrumb"
                onClick={() => setCurrentFolderId(folder.id)}
                aria-current={isCurrentFolder ? "page" : undefined}
                aria-label={`Ir para ${folder.name}`}
              >
                {!isFirstFolder && !isCurrentFolder && (
                  <span className="material-symbols-outlined macro-list-breadcrumb-folder-icon">
                    folder
                  </span>
                )}
                <span className="macro-list-breadcrumb-label">
                  {folder.name}
                </span>
              </button>
              {!isFirstFolder && !isCurrentFolder && (
                <button
                  type="button"
                  className="macro-folder-preview"
                  onClick={() => setCurrentFolderId(folder.id)}
                  aria-label={`Navegar para ${folder.name}`}
                >
                  {folder.name}
                </button>
              )}
              <span className="macro-folder-actions">
                <button
                  className="btn-icon"
                  title="Exportar pasta"
                  aria-label={`Exportar pasta ${folder.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onExportFolder(folder.id);
                  }}
                >
                  <span className="material-symbols-outlined">download</span>
                </button>
                <button
                  className="btn-icon"
                  title="Renomear pasta"
                  aria-label={`Renomear pasta ${folder.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    renameFolder(folder);
                  }}
                >
                  <span className="material-symbols-outlined">edit</span>
                </button>
                <button
                  className="btn-icon btn-icon-danger"
                  title="Excluir pasta"
                  aria-label={`Excluir pasta ${folder.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteFolder(folder);
                  }}
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </span>
            </span>
            );
          })}
        </div>
        <div className="macro-list-heading">
          <h2 className="macro-list-title">
            <span className="material-symbols-outlined">list</span>
            Macros ({macros.length})
          </h2>
          <button className="btn btn-primary" onClick={onCreateMacro}>
            <span className="material-symbols-outlined">add</span>
            Nova Macro
          </button>
        </div>
      </div>
      <div className="macro-list-toolbar">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar nome, atalho ou texto..."
        />
        <select
          className="input"
          value={folderFilter}
          onChange={(e) => setFolderFilter(e.target.value)}
        >
          <option value="all">Todas as pastas</option>
          <option value="">Sem pasta</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        <button
          className="btn btn-secondary"
          onClick={() => onCreateFolder(currentFolderId)}
        >
          <span className="material-symbols-outlined">create_new_folder</span>
          Nova pasta
        </button>
      </div>
      {query.trim() === "" &&
        folderFilter === "all" &&
        childFolders.length > 0 && (
          <div className="macro-folder-list">
            {childFolders.map((folder) => (
              <div
                key={folder.id}
                className="macro-folder-row"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setCurrentFolderId(folder.id);
                  setSelected([]);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setCurrentFolderId(folder.id);
                    setSelected([]);
                  }
                }}
              >
                <span className="macro-folder-name">
                  <span className="material-symbols-outlined">folder</span>
                  {folder.name}
                </span>
                <span className="macro-folder-count">
                  {
                    macros.filter((macro) => macro.folderId === folder.id)
                      .length
                  }{" "}
                  snippet(s)
                </span>
              </div>
            ))}
          </div>
        )}
      <div className="macro-list-bulk">
        <button className="btn btn-secondary" onClick={selectAll}>
          {selected.length === filteredMacros.length
            ? "Desmarcar todos"
            : "Selecionar todos"}
        </button>
        <span>{selected.length} selecionada(s)</span>
        <select
          className="input"
          disabled={!selected.length}
          defaultValue=""
          onChange={(e) => {
            onMoveSelected(selected, e.target.value || undefined);
            setSelected([]);
            e.target.value = "";
          }}
        >
          <option value="">Mover para...</option>
          <option value="">Sem pasta</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        <button
          className="btn btn-danger"
          disabled={!selected.length}
          onClick={bulkDelete}
        >
          Excluir selecionadas
        </button>
      </div>
      <div className="macro-list-grid">
        {filteredMacros.map((macro) => (
          <MacroCard
            key={macro.id}
            macro={macro}
            onEdit={onEdit}
            onDelete={onDelete}
            selected={selected.includes(macro.id)}
            onSelect={toggle}
          />
        ))}
      </div>
      {filteredMacros.length === 0 && (
        <div className="macro-list-empty">
          <p>Nenhuma macro encontrada.</p>
        </div>
      )}
    </div>
  );
}
