import { useMemo, useState } from "react";
import { Folder, Macro } from "../../types/macro";
import { MacroCard } from "../MacroCard/MacroCard";
import "./MacroList.css";

interface MacroListProps {
  macros: Macro[];
  folders: Folder[];
  onEdit: (macro: Macro) => void;
  onDelete: (id: string) => void;
  onCreateFolder: () => void;
  onDeleteSelected: (ids: string[]) => void;
  onMoveSelected: (ids: string[], folderId?: string) => void;
}

export function MacroList({
  macros,
  folders,
  onEdit,
  onDelete,
  onCreateFolder,
  onDeleteSelected,
  onMoveSelected,
}: MacroListProps) {
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const filteredMacros = useMemo(
    () =>
      macros.filter((macro) => {
        const haystack =
          `${macro.nome} ${macro.atalho} ${macro.textoExpandido}`.toLowerCase();
        return (
          (folderFilter === "all" || (macro.folderId ?? "") === folderFilter) &&
          haystack.includes(query.toLowerCase())
        );
      }),
    [macros, query, folderFilter],
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
  if (macros.length === 0) {
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
        <h2 className="macro-list-title">
          <span className="material-symbols-outlined">list</span>
          Macros ({macros.length})
        </h2>
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
        <button className="btn btn-secondary" onClick={onCreateFolder}>
          <span className="material-symbols-outlined">create_new_folder</span>
          Nova pasta
        </button>
      </div>
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
