import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Folder, Macro } from "../../types/macro";
import { MacroCard } from "../MacroCard/MacroCard";
import { flattenFolders, formatFolderLabel } from "../../utils/folderTree";
import "./MacroList.css";

interface MacroListProps {
  macros: Macro[];
  folders: Folder[];
  query: string;
  currentFolderId?: string;
  onQueryChange: (query: string) => void;
  onFolderChange: (folderId?: string) => void;
  onGoHome: () => void;
  onCreateMacro: (folderId?: string) => void;
  onEdit: (macro: Macro) => void;
  onDelete: (id: string) => void;
  onExport: (ids: string[], format: "json" | "txt") => void;
  onCreateFolder: (parentId?: string) => void;
  onDeleteSelected: (ids: string[]) => void;
  onMoveSelected: (ids: string[], folderId?: string) => void;
  onRenameFolder: (
    id: string,
    name: string,
  ) => { success: boolean; error?: string };
  onMoveFolder: (
    id: string,
    parentId?: string,
    placement?: "inside" | "above" | "below",
    relativeToId?: string,
  ) => { success: boolean; error?: string };
  onMoveFolders: (
    ids: string[],
    parentId?: string,
  ) => { success: boolean; error?: string };
  onDeleteFolder: (id: string) => void;
  onDeleteFolders: (ids: string[]) => void;
  onExportFolder: (id: string, format: "json" | "txt") => void;
}

type FolderDropPlacement = "inside" | "above" | "below";

interface FolderDragState {
  folder: Folder;
  folderIds: string[];
  pointerId: number;
  x: number;
  y: number;
  dragging: boolean;
}

interface FolderDropTarget {
  folderId: string;
  placement: FolderDropPlacement;
}

export function MacroList({
  macros,
  folders,
  query,
  currentFolderId,
  onQueryChange,
  onFolderChange,
  onGoHome,
  onCreateMacro,
  onEdit,
  onDelete,
  onExport,
  onCreateFolder,
  onDeleteSelected,
  onMoveSelected,
  onRenameFolder,
  onMoveFolder,
  onMoveFolders,
  onDeleteFolder,
  onDeleteFolders,
  onExportFolder,
}: MacroListProps) {
  const [folderFilter, setFolderFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [isMacroMoveModalOpen, setIsMacroMoveModalOpen] = useState(false);
  const [isFolderMoveModalOpen, setIsFolderMoveModalOpen] = useState(false);
  const [expandedMoveFolders, setExpandedMoveFolders] = useState<Set<string>>(
    new Set(),
  );
  const [openFolderMenuId, setOpenFolderMenuId] = useState<
    string | undefined
  >();
  const [folderToMove, setFolderToMove] = useState<Folder | undefined>();
  const [folderDrag, setFolderDrag] = useState<FolderDragState>();
  const [folderDropTarget, setFolderDropTarget] =
    useState<FolderDropTarget>();
  const [macroDragIds, setMacroDragIds] = useState<string[]>([]);
  const breadcrumbsRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const suppressFolderClickRef = useRef(false);

  useEffect(() => {
    if (
      currentFolderId &&
      !folders.some((folder) => folder.id === currentFolderId)
    ) {
      onGoHome();
    }
  }, [currentFolderId, folders, onGoHome]);

  useEffect(() => {
    if (!openFolderMenuId) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!breadcrumbsRef.current?.contains(event.target as Node)) {
        setOpenFolderMenuId(undefined);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openFolderMenuId]);

  useEffect(() => {
    if (!folderDrag) return;

    const updateDropTarget = (x: number, y: number) => {
      const element = document.elementFromPoint(x, y);
      const row = element?.closest<HTMLElement>("[data-folder-row-id]");
      const targetId = row?.dataset.folderRowId;
      if (
        !targetId ||
        folderDrag.folderIds.includes(targetId) ||
        folderDrag.folderIds.some((id) => isDescendantOf(targetId, id))
      ) {
        setFolderDropTarget(undefined);
        return;
      }

      const targetFolder = folders.find((folder) => folder.id === targetId);
      if (!targetFolder) {
        setFolderDropTarget(undefined);
        return;
      }

      const bounds = row.getBoundingClientRect();
      const relativeY = y - bounds.top;
      const edgeZone = bounds.height * 0.28;
      const placement: FolderDropPlacement =
        relativeY < edgeZone
          ? "above"
          : relativeY > bounds.height - edgeZone
            ? "below"
            : "inside";
      setFolderDropTarget({
        folderId: targetId,
        placement,
      });
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== folderDrag.pointerId) return;
      const distance = Math.hypot(
        event.clientX - dragStartRef.current.x,
        event.clientY - dragStartRef.current.y,
      );
      const dragging = folderDrag.dragging || distance >= 6;

      if (dragging) {
        suppressFolderClickRef.current = true;
        const edge = 72;
        const speed = 12;
        if (event.clientY < edge) window.scrollBy(0, -speed);
        else if (event.clientY > window.innerHeight - edge)
          window.scrollBy(0, speed);
        updateDropTarget(event.clientX, event.clientY);
      }

      setFolderDrag((current) =>
        current && current.pointerId === event.pointerId
          ? { ...current, x: event.clientX, y: event.clientY, dragging }
          : current,
      );
    };

    const finishDrag = (event: PointerEvent) => {
      if (event.pointerId !== folderDrag.pointerId) return;
      if (folderDrag.dragging && folderDropTarget) {
        const targetFolder = folders.find(
          (folder) => folder.id === folderDropTarget.folderId,
        );
        if (targetFolder) {
          if (folderDrag.folderIds.length > 1) {
            const result = onMoveFolders(
              folderDrag.folderIds,
              folderDropTarget.placement === "inside"
                ? targetFolder.id
                : targetFolder.parentId,
            );
            if (result.success) setSelectedFolders([]);
            else if (result.error) window.alert(result.error);
          } else {
            moveFolder(
              folderDrag.folder,
              folderDropTarget.placement === "inside"
                ? targetFolder.id
                : targetFolder.parentId,
              folderDropTarget.placement,
              folderDropTarget.placement === "inside"
                ? undefined
                : targetFolder.id,
            );
          }
        }
      }
      setFolderDrag(undefined);
      setFolderDropTarget(undefined);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    const autoScroll =
      folderDrag.dragging &&
      window.setInterval(() => {
        const edge = 72;
        const speed = 12;
        if (folderDrag.y < edge) window.scrollBy(0, -speed);
        else if (folderDrag.y > window.innerHeight - edge)
          window.scrollBy(0, speed);
        if (folderDrag.dragging)
          updateDropTarget(folderDrag.x, folderDrag.y);
      }, 40);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      if (autoScroll) window.clearInterval(autoScroll);
    };
  }, [folderDrag, folderDropTarget, folders]);
  const currentFolder = folders.find((folder) => folder.id === currentFolderId);
  const folderTree = useMemo(() => flattenFolders(folders), [folders]);
  const childFolders = useMemo(
    () =>
      folders
        .filter((folder) => folder.parentId === currentFolderId)
        .sort(
          (first, second) =>
            (first.order ?? first.createdAt) -
            (second.order ?? second.createdAt),
        ),
    [folders, currentFolderId],
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
        const hasSearch = query.trim().length > 0;
        const matchesLocation =
          folderFilter !== "all"
            ? (macro.folderId ?? "") === folderFilter
            : currentFolderId === undefined
              ? macro.folderId === undefined
              : macro.folderId === currentFolderId;
        return (
          (hasSearch || matchesLocation) &&
          haystack.includes(query.toLowerCase())
        );
      }),
    [macros, query, folderFilter, currentFolderId],
  );
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  const toggleFolder = (id: string) =>
    setSelectedFolders((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  const selectAll = () =>
    setSelected(
      selected.length === filteredMacros.length
        ? []
        : filteredMacros.map((macro) => macro.id),
    );
  const selectAllFolders = () =>
    setSelectedFolders(
      selectedFolders.length === childFolders.length
        ? []
        : childFolders.map((folder) => folder.id),
    );
  const bulkDelete = () => {
    if (window.confirm(`Excluir ${selected.length} macro(s)?`)) {
      onDeleteSelected(selected);
      setSelected([]);
    }
  };
  const bulkDeleteFolders = () => {
    if (
      window.confirm(
        `Excluir ${selectedFolders.length} pasta(s) e todo o seu conteúdo?`,
      )
    ) {
      onDeleteFolders(selectedFolders);
      setSelectedFolders([]);
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
        onFolderChange(folder.parentId);
      }
    }
  };
  const moveFolder = (
    folder: Folder,
    parentId?: string,
    placement: "inside" | "above" | "below" = "inside",
    relativeToId?: string,
  ) => {
    const result = onMoveFolder(folder.id, parentId, placement, relativeToId);
    if (!result.success) window.alert(result.error);
    if (result.success) setFolderToMove(undefined);
  };
  const moveSelectedFolders = (parentId?: string) => {
    const result = onMoveFolders(selectedFolders, parentId);
    if (!result.success) window.alert(result.error);
    else {
      setSelectedFolders([]);
      setIsFolderMoveModalOpen(false);
    }
  };
  const moveSelectedMacros = (folderId?: string) => {
    onMoveSelected(selected, folderId);
    setSelected([]);
    setIsMacroMoveModalOpen(false);
  };
  const toggleMoveFolder = (folderId: string) => {
    setExpandedMoveFolders((ids) => {
      const next = new Set(ids);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };
  const isDescendantOf = (folderId: string, ancestorId: string): boolean => {
    let folder = folders.find((item) => item.id === folderId);
    while (folder?.parentId) {
      if (folder.parentId === ancestorId) return true;
      folder = folders.find((item) => item.id === folder?.parentId);
    }
    return false;
  };
  if (macros.length === 0 && folders.length === 0) {
    return (
      <div className="macro-list-empty">
        <span className="material-symbols-outlined">inbox</span>
        <p>Nenhuma macro cadastrada ainda.</p>
        <p className="macro-list-empty-hint">
          Comece criando sua primeira macro ou pasta.
        </p>
        <div className="macro-list-empty-actions">
          <button
            className="btn btn-primary"
            onClick={() => onCreateMacro(currentFolderId)}
          >
            <span className="material-symbols-outlined">add</span>
            Nova Macro
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => onCreateFolder()}
          >
            <span className="material-symbols-outlined">create_new_folder</span>
            Nova pasta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="macro-list">
      <div className="macro-list-header">
        <div ref={breadcrumbsRef} className="macro-list-breadcrumbs">
          <button
            className="btn-icon"
            onClick={onGoHome}
            disabled={!currentFolderId && !query}
            title="Ir para a raiz"
          >
            <span className="material-symbols-outlined">home</span>
          </button>
          <button
            className="macro-list-breadcrumb"
            onClick={onGoHome}
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
                  type="button"
                  className="macro-list-breadcrumb"
                  onClick={() => onFolderChange(folder.id)}
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
                    onClick={() => onFolderChange(folder.id)}
                    aria-label={`Navegar para ${folder.name}`}
                  >
                    {folder.name}
                  </button>
                )}
                <button
                  type="button"
                  className="macro-folder-menu-trigger"
                  aria-label={`Opções da pasta ${folder.name}`}
                  aria-expanded={openFolderMenuId === folder.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenFolderMenuId((id) =>
                      id === folder.id ? undefined : folder.id,
                    );
                  }}
                >
                  <span className="material-symbols-outlined">more_vert</span>
                </button>
                {openFolderMenuId === folder.id && (
                  <div className="macro-folder-actions" role="menu">
                    <strong className="macro-folder-menu-title">
                      {folder.name}
                    </strong>
                    <button
                      type="button"
                      className="macro-folder-menu-action"
                      title="Exportar pasta"
                      role="menuitem"
                      onClick={(event) => {
                        event.stopPropagation();
                        onExportFolder(folder.id, "json");
                        setOpenFolderMenuId(undefined);
                      }}
                    >
                      <span className="material-symbols-outlined">
                        download
                      </span>
                      Exportar pasta em JSON
                    </button>
                    <button
                      type="button"
                      className="macro-folder-menu-action"
                      title="Exportar pasta em TXT"
                      role="menuitem"
                      onClick={(event) => {
                        event.stopPropagation();
                        onExportFolder(folder.id, "txt");
                        setOpenFolderMenuId(undefined);
                      }}
                    >
                      <span className="material-symbols-outlined">
                        description
                      </span>
                      Exportar pasta em TXT
                    </button>
                    <button
                      type="button"
                      className="macro-folder-menu-action"
                      role="menuitem"
                      onClick={(event) => {
                        event.stopPropagation();
                        setFolderToMove(folder);
                        setOpenFolderMenuId(undefined);
                      }}
                    >
                      <span className="material-symbols-outlined">
                        drive_file_move
                      </span>
                      Mover pasta
                    </button>
                    <button
                      type="button"
                      className="macro-folder-menu-action"
                      title="Renomear pasta"
                      role="menuitem"
                      onClick={(event) => {
                        event.stopPropagation();
                        renameFolder(folder);
                        setOpenFolderMenuId(undefined);
                      }}
                    >
                      <span className="material-symbols-outlined">edit</span>
                      Renomear pasta
                    </button>
                    <button
                      type="button"
                      className="macro-folder-menu-action macro-folder-menu-action-danger"
                      title="Excluir pasta"
                      role="menuitem"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteFolder(folder);
                        setOpenFolderMenuId(undefined);
                      }}
                    >
                      <span className="material-symbols-outlined">delete</span>
                      Excluir pasta
                    </button>
                  </div>
                )}
              </span>
            );
          })}
        </div>
        <div className="macro-list-heading">
          <h2 className="macro-list-title">
            <span className="material-symbols-outlined">list</span>
            Macros ({macros.length})
          </h2>
          <button
            className="btn btn-primary"
            onClick={() => onCreateMacro(currentFolderId)}
          >
            <span className="material-symbols-outlined">add</span>
            Nova Macro
          </button>
        </div>
      </div>
      <div className="macro-list-bulk">
        {childFolders.length > 0 && (
          <>
            <span>{selectedFolders.length} pasta(s) selecionada(s)</span>
            <button
              className="btn btn-danger"
              disabled={!selectedFolders.length}
              onClick={bulkDeleteFolders}
            >
              Excluir pastas selecionadas
            </button>
          </>
        )}
        {childFolders.length > 0 && (
          <button className="btn btn-secondary" onClick={selectAllFolders}>
            {selectedFolders.length === childFolders.length
              ? "Desmarcar todas as pastas"
              : "Selecionar todas as pastas"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!selectedFolders.length}
          onClick={() => setIsFolderMoveModalOpen(true)}
        >
          <span className="material-symbols-outlined">drive_file_move</span>
          Mover pastas para...
        </button>
        <button className="btn btn-secondary" onClick={selectAll}>
          {selected.length === filteredMacros.length
            ? "Desmarcar todos"
            : "Selecionar todos"}
        </button>
        <span>{selected.length} selecionada(s)</span>
        <button
          className="btn btn-secondary"
          disabled={!selected.length}
          onClick={() => onExport(selected, "json")}
        >
          <span className="material-symbols-outlined">download</span>
          Exportar JSON
        </button>
        <button
          className="btn btn-secondary"
          disabled={!selected.length}
          onClick={() => onExport(selected, "txt")}
        >
          <span className="material-symbols-outlined">download</span>
          Exportar TXT
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!selected.length}
          onClick={() => setIsMacroMoveModalOpen(true)}
        >
          <span className="material-symbols-outlined">drive_file_move</span>
          Mover para...
        </button>
        <button
          className="btn btn-danger"
          disabled={!selected.length}
          onClick={bulkDelete}
        >
          Excluir selecionadas
        </button>
      </div>
      <div className="macro-list-toolbar">
        <input
          className="input"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Pesquisar nome, atalho ou texto..."
        />
        <select
          className="input"
          value={folderFilter}
          onChange={(e) => setFolderFilter(e.target.value)}
        >
          <option value="all">Todas as pastas</option>
          <option value="">Sem pasta</option>
          {folderTree.map(({ folder, level }) => (
            <option key={folder.id} value={folder.id}>
              {formatFolderLabel(folder.name, level)}
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
          <>
            {folderDrag?.dragging && (
              <div
                className={`macro-folder-drag-ghost${
                  folderDropTarget ? " macro-folder-drag-ghost-targeted" : ""
                }`}
                style={{
                  left: folderDrag.x,
                  top: folderDrag.y,
                  transform: `translate(-50%, -50%) scale(${folderDropTarget ? 0.72 : 0.88})`,
                }}
                aria-hidden="true"
              >
                <span className="material-symbols-outlined">folder</span>
              </div>
            )}
            <div className="macro-folder-list">
            {childFolders.map((folder) => (
              <div
                key={folder.id}
                className={`macro-folder-row${
                  folderDrag?.folder.id === folder.id && folderDrag.dragging
                    ? " macro-folder-row-dragging"
                    : ""
                }${
                  folderDropTarget?.folderId === folder.id
                    ? ` macro-folder-row-drop-target macro-folder-row-drop-${folderDropTarget.placement}`
                    : ""
                }`}
                data-folder-row-id={folder.id}
                role="button"
                tabIndex={0}
                onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                  if (event.button !== 0) return;
                  dragStartRef.current = {
                    x: event.clientX,
                    y: event.clientY,
                  };
                  suppressFolderClickRef.current = false;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setFolderDrag({
                    folder,
                    folderIds: selectedFolders.includes(folder.id)
                      ? selectedFolders
                      : [folder.id],
                    pointerId: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    dragging: false,
                  });
                }}
                onClick={() => {
                  if (suppressFolderClickRef.current) {
                    suppressFolderClickRef.current = false;
                    return;
                  }
                  onFolderChange(folder.id);
                  setSelected([]);
                  setSelectedFolders([]);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onFolderChange(folder.id);
                    setSelected([]);
                    setSelectedFolders([]);
                  }
                }}
                onDragOver={(event) => {
                  if (!macroDragIds.length) return;
                  event.preventDefault();
                  setFolderDropTarget({
                    folderId: folder.id,
                    placement: "inside",
                  });
                }}
                onDragLeave={() => {
                  if (macroDragIds.length) setFolderDropTarget(undefined);
                }}
                onDrop={(event) => {
                  if (!macroDragIds.length) return;
                  event.preventDefault();
                  onMoveSelected(macroDragIds, folder.id);
                  setSelected((ids) =>
                    ids.filter((id) => !macroDragIds.includes(id)),
                  );
                  setMacroDragIds([]);
                  setFolderDropTarget(undefined);
                }}
              >
                <label
                  className="macro-folder-checkbox"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedFolders.includes(folder.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggleFolder(folder.id)}
                    aria-label={`Selecionar pasta ${folder.name}`}
                  />
                  <span
                    className="macro-folder-checkbox-mark"
                    aria-hidden="true"
                  />
                </label>
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
          </>
        )}
      <div className="macro-list-grid">
        {filteredMacros.map((macro) => (
          <MacroCard
            key={macro.id}
            macro={macro}
            onEdit={onEdit}
            onDelete={onDelete}
            onExport={onExport}
            selected={selected.includes(macro.id)}
            onSelect={toggle}
            onDragStart={(id) =>
              setMacroDragIds(selected.includes(id) ? selected : [id])
            }
            onDragEnd={() => {
              setMacroDragIds([]);
              setFolderDropTarget(undefined);
            }}
          />
        ))}
      </div>
      {filteredMacros.length === 0 && (
        <div className="macro-list-empty">
          <p>Nenhuma macro encontrada.</p>
        </div>
      )}
      {folderToMove && (
        <div
          className="macro-folder-move-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="macro-folder-move-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setFolderToMove(undefined);
          }}
        >
          <div className="macro-folder-move-dialog">
            <div className="macro-folder-move-header">
              <h3 id="macro-folder-move-title">Mover pasta</h3>
              <button
                type="button"
                className="btn-icon"
                aria-label="Fechar seleção de destino"
                onClick={() => setFolderToMove(undefined)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="macro-folder-move-description">
              Selecione onde deseja colocar “{folderToMove.name}”.
            </p>
            <div className="macro-folder-destination-list">
              <button
                type="button"
                className="macro-folder-destination"
                onClick={() => moveFolder(folderToMove)}
              >
                <span className="material-symbols-outlined">home</span>
                Raiz
              </button>
              {folderTree.map(({ folder, level }) => {
                const hasChildren = folders.some(
                  (item) => item.parentId === folder.id,
                );
                const isExpanded = expandedMoveFolders.has(folder.id);
                let parentId = folder.parentId;
                let isVisible = true;
                while (parentId) {
                  if (!expandedMoveFolders.has(parentId)) {
                    isVisible = false;
                    break;
                  }
                  parentId = folders.find(
                    (item) => item.id === parentId,
                  )?.parentId;
                }
                if (!isVisible) return null;

                const isInvalidDestination =
                  folder.id === folderToMove.id ||
                  isDescendantOf(folder.id, folderToMove.id);

                return (
                  <div
                    key={folder.id}
                    className="macro-folder-destination-row"
                    style={{ paddingLeft: `${0.25 + level * 1.25}rem` }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        className="macro-folder-destination-toggle"
                        aria-label={`${isExpanded ? "Recolher" : "Expandir"} ${folder.name}`}
                        onClick={() => toggleMoveFolder(folder.id)}
                      >
                        <span className="material-symbols-outlined">
                          {isExpanded ? "expand_more" : "chevron_right"}
                        </span>
                      </button>
                    ) : (
                      <span className="macro-folder-destination-toggle-placeholder" />
                    )}
                    <button
                      type="button"
                      className="macro-folder-destination"
                      disabled={isInvalidDestination}
                      onClick={() => moveFolder(folderToMove, folder.id)}
                    >
                      <span className="material-symbols-outlined">folder</span>
                      {folder.name}
                      {isInvalidDestination && " (selecionada)"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {isMacroMoveModalOpen && (
        <div
          className="macro-folder-move-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="macro-destination-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setIsMacroMoveModalOpen(false);
          }}
        >
          <div className="macro-folder-move-dialog">
            <div className="macro-folder-move-header">
              <h3 id="macro-destination-title">Mover macros</h3>
              <button
                type="button"
                className="btn-icon"
                aria-label="Fechar seleção de destino"
                onClick={() => setIsMacroMoveModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="macro-folder-move-description">
              Selecione onde deseja colocar {selected.length === 1 ? "a macro selecionada" : `as ${selected.length} macros selecionadas`}.
            </p>
            <div className="macro-folder-destination-list">
              <button
                type="button"
                className="macro-folder-destination"
                onClick={() => moveSelectedMacros()}
              >
                <span className="material-symbols-outlined">home</span>
                Raiz
              </button>
              {folderTree.map(({ folder }) => {
                const hasChildren = folders.some(
                  (item) => item.parentId === folder.id,
                );
                const isExpanded = expandedMoveFolders.has(folder.id);
                let parentId = folder.parentId;
                let isVisible = true;
                while (parentId) {
                  if (!expandedMoveFolders.has(parentId)) {
                    isVisible = false;
                    break;
                  }
                  parentId = folders.find((item) => item.id === parentId)?.parentId;
                }
                if (!isVisible) return null;

                return (
                  <div
                    key={folder.id}
                    className="macro-folder-destination-row"
                    style={{ paddingLeft: `${0.25 + (folderTree.find((item) => item.folder.id === folder.id)?.level ?? 0) * 1.25}rem` }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        className="macro-folder-destination-toggle"
                        aria-label={`${isExpanded ? "Recolher" : "Expandir"} ${folder.name}`}
                        onClick={() => toggleMoveFolder(folder.id)}
                      >
                        <span className="material-symbols-outlined">
                          {isExpanded ? "expand_more" : "chevron_right"}
                        </span>
                      </button>
                    ) : (
                      <span className="macro-folder-destination-toggle-placeholder" />
                    )}
                    <button
                      type="button"
                      className="macro-folder-destination"
                      onClick={() => moveSelectedMacros(folder.id)}
                    >
                      <span className="material-symbols-outlined">folder</span>
                      {folder.name}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {isFolderMoveModalOpen && (
        <div
          className="macro-folder-move-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="folder-destination-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setIsFolderMoveModalOpen(false);
          }}
        >
          <div className="macro-folder-move-dialog">
            <div className="macro-folder-move-header">
              <h3 id="folder-destination-title">Mover pastas</h3>
              <button
                type="button"
                className="btn-icon"
                aria-label="Fechar seleção de destino"
                onClick={() => setIsFolderMoveModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="macro-folder-move-description">
              Selecione onde deseja colocar {selectedFolders.length === 1 ? "a pasta selecionada" : `as ${selectedFolders.length} pastas selecionadas`}.
            </p>
            <div className="macro-folder-destination-list">
              <button
                type="button"
                className="macro-folder-destination"
                onClick={() => moveSelectedFolders()}
              >
                <span className="material-symbols-outlined">home</span>
                Raiz
              </button>
              {folderTree.map(({ folder }) => {
                const hasChildren = folders.some(
                  (item) => item.parentId === folder.id,
                );
                const isExpanded = expandedMoveFolders.has(folder.id);
                let parentId = folder.parentId;
                let isVisible = true;
                while (parentId) {
                  if (!expandedMoveFolders.has(parentId)) {
                    isVisible = false;
                    break;
                  }
                  parentId = folders.find((item) => item.id === parentId)?.parentId;
                }
                if (!isVisible) return null;
                const isInvalidDestination = selectedFolders.some(
                  (selectedFolderId) =>
                    selectedFolderId === folder.id ||
                    isDescendantOf(folder.id, selectedFolderId),
                );

                return (
                  <div
                    key={folder.id}
                    className="macro-folder-destination-row"
                    style={{ paddingLeft: `${0.25 + (folderTree.find((item) => item.folder.id === folder.id)?.level ?? 0) * 1.25}rem` }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        className="macro-folder-destination-toggle"
                        aria-label={`${isExpanded ? "Recolher" : "Expandir"} ${folder.name}`}
                        onClick={() => toggleMoveFolder(folder.id)}
                      >
                        <span className="material-symbols-outlined">
                          {isExpanded ? "expand_more" : "chevron_right"}
                        </span>
                      </button>
                    ) : (
                      <span className="macro-folder-destination-toggle-placeholder" />
                    )}
                    <button
                      type="button"
                      className="macro-folder-destination"
                      disabled={isInvalidDestination}
                      onClick={() => moveSelectedFolders(folder.id)}
                    >
                      <span className="material-symbols-outlined">folder</span>
                      {folder.name}
                      {isInvalidDestination && " (selecionada)"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
