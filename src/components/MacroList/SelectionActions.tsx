import { KeyboardEvent, useEffect, useRef, useState } from "react";

interface SelectionActionsProps {
  selectedMacroCount: number;
  selectedFolderCount: number;
  visibleMacroCount: number;
  visibleFolderCount: number;
  allVisibleMacrosSelected: boolean;
  allVisibleFoldersSelected: boolean;
  onToggleVisibleMacros: () => void;
  onToggleVisibleFolders: () => void;
  onExportJson: () => void;
  onExportTxt: () => void;
  onMoveMacros: () => void;
  onMoveFolders: () => void;
  onDeleteSelection: () => void;
}

export function SelectionActions({
  selectedMacroCount,
  selectedFolderCount,
  visibleMacroCount,
  visibleFolderCount,
  allVisibleMacrosSelected,
  allVisibleFoldersSelected,
  onToggleVisibleMacros,
  onToggleVisibleFolders,
  onExportJson,
  onExportTxt,
  onMoveMacros,
  onMoveFolders,
  onDeleteSelection,
}: SelectionActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const totalSelected = selectedMacroCount + selectedFolderCount;
  const hasMacros = selectedMacroCount > 0;
  const hasFolders = selectedFolderCount > 0;
  const hasMixedSelection = hasMacros && hasFolders;

  useEffect(() => {
    if (totalSelected === 0) setIsOpen(false);
  }, [totalSelected]);

  useEffect(() => {
    if (!isOpen) return;

    menuRef.current
      ?.querySelector<HTMLButtonElement>("[role='menuitem']")
      ?.focus();

    const handleOutsidePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleOutsideFocus = (event: FocusEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("focusin", handleOutsideFocus);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("focusin", handleOutsideFocus);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const runAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']:not(:disabled)",
      ) ?? [],
    );
    if (!items.length) return;

    event.preventDefault();
    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (currentIndex + 1) % items.length
            : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex].focus();
  };

  return (
    <div className="macro-list-bulk">
      <div className="macro-selection-summary" aria-live="polite">
        <strong>
          {totalSelected}{" "}
          {totalSelected === 1 ? "item selecionado" : "itens selecionados"}
        </strong>
        <span>
          {selectedFolderCount} {selectedFolderCount === 1 ? "pasta" : "pastas"}
          {" · "}
          {selectedMacroCount} {selectedMacroCount === 1 ? "snippet" : "snippets"}
        </span>
      </div>

      <div className="macro-selection-controls">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={visibleFolderCount === 0}
          onClick={onToggleVisibleFolders}
        >
          <span className="material-symbols-outlined">
            {allVisibleFoldersSelected ? "deselect" : "select_all"}
          </span>
          {allVisibleFoldersSelected ? "Desmarcar" : "Selecionar"}{" "}
          {visibleFolderCount === 1 ? "pasta" : "pastas"}
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          disabled={visibleMacroCount === 0}
          onClick={onToggleVisibleMacros}
        >
          <span className="material-symbols-outlined">
            {allVisibleMacrosSelected ? "deselect" : "select_all"}
          </span>
          {allVisibleMacrosSelected ? "Desmarcar" : "Selecionar"}{" "}
          {visibleMacroCount === 1 ? "snippet" : "snippets"}
        </button>

        <div ref={containerRef} className="macro-selection-actions">
          <button
            ref={triggerRef}
            type="button"
            className="btn btn-secondary"
            disabled={totalSelected === 0}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-controls="macro-selection-actions-menu"
            onClick={() => setIsOpen((open) => !open)}
          >
            <span className="material-symbols-outlined">more_horiz</span>
            Ações
          </button>

          {isOpen && (
            <div
              id="macro-selection-actions-menu"
              ref={menuRef}
              className="macro-selection-menu"
              role="menu"
              aria-label="Ações da seleção"
              onKeyDown={handleMenuKeyDown}
            >
              {hasMacros && (
                <div
                  className="macro-selection-menu-group"
                  role="group"
                  aria-label={`Ações de ${
                    selectedMacroCount === 1 ? "snippet" : "snippets"
                  }`}
                >
                  {hasMixedSelection && (
                    <strong className="macro-selection-menu-title">
                      {selectedMacroCount === 1 ? "Snippet" : "Snippets"} (
                      {selectedMacroCount})
                    </strong>
                  )}
                  <button
                    type="button"
                    className="macro-selection-menu-action"
                    role="menuitem"
                    onClick={() => runAction(onExportJson)}
                  >
                    <span className="material-symbols-outlined">download</span>
                    Exportar JSON
                  </button>
                  <button
                    type="button"
                    className="macro-selection-menu-action"
                    role="menuitem"
                    onClick={() => runAction(onExportTxt)}
                  >
                    <span className="material-symbols-outlined">description</span>
                    Exportar TXT
                  </button>
                  <button
                    type="button"
                    className="macro-selection-menu-action"
                    role="menuitem"
                    onClick={() => runAction(onMoveMacros)}
                  >
                    <span className="material-symbols-outlined">drive_file_move</span>
                    Mover {selectedMacroCount === 1 ? "snippet" : "snippets"}
                  </button>
                </div>
              )}

              {hasFolders && (
                <div
                  className={`macro-selection-menu-group${
                    hasMixedSelection ? " is-separated" : ""
                  }`}
                  role="group"
                  aria-label={`Ações de ${
                    selectedFolderCount === 1 ? "pasta" : "pastas"
                  }`}
                >
                  {hasMixedSelection && (
                    <strong className="macro-selection-menu-title">
                      {selectedFolderCount === 1 ? "Pasta" : "Pastas"} (
                      {selectedFolderCount})
                    </strong>
                  )}
                  <button
                    type="button"
                    className="macro-selection-menu-action"
                    role="menuitem"
                    onClick={() => runAction(onMoveFolders)}
                  >
                    <span className="material-symbols-outlined">drive_file_move</span>
                    Mover {selectedFolderCount === 1 ? "pasta" : "pastas"}
                  </button>
                </div>
              )}

              <div className="macro-selection-menu-group is-separated">
                <button
                  type="button"
                  className="macro-selection-menu-action macro-selection-menu-action-danger"
                  role="menuitem"
                  onClick={() => runAction(onDeleteSelection)}
                >
                  <span className="material-symbols-outlined">delete</span>
                  Excluir seleção
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
