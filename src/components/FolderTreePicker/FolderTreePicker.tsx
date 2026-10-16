import { useEffect, useMemo, useRef, useState } from "react";
import { Folder } from "../../types/macro";
import { searchFolders } from "../../utils/folderSearch";

interface FolderTreePickerProps {
  folders: Folder[];
  value: string;
  onChange: (folderId: string) => void;
  id?: string;
}

export function FolderTreePicker({
  folders,
  value,
  onChange,
  id = "folderId",
}: FolderTreePickerProps) {
  const [menu, setMenu] = useState<"search" | "tree" | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const folderTree = useMemo(() => searchFolders(folders), [folders]);
  const results = query.trim() ? searchFolders(folders, query) : folderTree;
  const selectedFolderItem = folderTree.find(
    ({ folder }) => folder.id === value,
  );
  const searchOpen = menu === "search";
  const resultsId = `${id}-search-results`;
  const selectionId = `${id}-selection`;
  const activeOptionId = searchOpen && activeIndex >= 0 && activeIndex <= results.length
    ? `${resultsId}-${activeIndex}` : undefined;

  useEffect(() => {
    if (activeOptionId) {
      document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeOptionId, query]);

  const chooseFolder = (folderId: string) => {
    onChange(folderId);
    if (searchOpen) searchRef.current?.focus();
    else triggerRef.current?.focus();
    setQuery("");
    setMenu(null);
    setActiveIndex(-1);
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  return (
    <div
      className="macro-form-folder-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu) {
          // The first Escape dismisses the picker, not the surrounding form.
          event.preventDefault();
          event.stopPropagation();
          if (searchOpen) searchRef.current?.focus();
          else triggerRef.current?.focus();
          setMenu(null);
        }
      }}
    >
      <div className="macro-form-folder-search">
        <label htmlFor={`${id}-search`} className="macro-form-label">Buscar pasta</label>
        <input
          ref={searchRef}
          id={`${id}-search`}
          type="text"
          className="input"
          role="combobox"
          autoComplete="off"
          placeholder="Buscar pasta por nome"
          value={query}
          aria-autocomplete="list"
          aria-expanded={searchOpen}
          aria-controls={searchOpen ? resultsId : undefined}
          aria-activedescendant={activeOptionId}
          aria-describedby={selectionId}
          onFocus={() => {
            if (query.trim()) setMenu("search");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setMenu(event.target.value.trim() ? "search" : null);
            setActiveIndex(searchFolders(folders, event.target.value).length > 0 ? 0 : -1);
          }}
          onKeyDown={(event) => {
            if (event.isDefaultPrevented() || event.nativeEvent.isComposing ||
                event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const count = results.length + 1; // Includes the explicit root option.
              const direction = event.key === "ArrowDown" ? 1 : -1;
              setActiveIndex(!searchOpen || activeIndex < 0
                ? (direction === 1 ? 0 : count - 1)
                : (activeIndex + direction + count) % count);
              setMenu("search");
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (!searchOpen) return;
              const index = activeIndex;
              if (index >= 0 && index <= results.length) {
                chooseFolder(results[index]?.folder.id ?? "");
              }
            } else if (event.key === "Tab") {
              setMenu(null);
            }
          }}
        />
        {searchOpen && (
          <div className="macro-form-folder-picker-menu macro-form-folder-search-menu">
            {results.length === 0 && <p className="macro-form-folder-search-empty">Nenhuma pasta encontrada.</p>}
            <div id={resultsId} role="listbox" aria-label="Resultados de pastas">
              {results.map(({ folder, path }, index) => (
                <button
                  key={folder.id}
                  id={`${resultsId}-${index}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={value === folder.id}
                  className={`macro-form-folder-picker-option${value === folder.id ? " is-selected" : ""}${activeIndex === index ? " is-active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseFolder(folder.id)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">folder</span>
                  <span className="macro-form-folder-search-copy">
                    <span>{folder.name}</span>
                    <small>{path}</small>
                  </span>
                </button>
              ))}
              <button
                id={`${resultsId}-${results.length}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={!value}
                className={`macro-form-folder-picker-option${!value ? " is-selected" : ""}${activeIndex === results.length ? " is-active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseFolder("")}
              >Sem pasta</button>
            </div>
          </div>
        )}
      </div>
      <span id={selectionId} className="macro-form-folder-search-status" role="status" aria-atomic="true">
        {searchOpen ? `${results.length} pasta(s) encontrada(s). ` : ""}
        Pasta selecionada: {selectedFolderItem?.path ?? "Sem pasta"}.
      </span>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="input macro-form-folder-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={menu === "tree"}
        aria-controls={menu === "tree" ? `${id}-tree` : undefined}
        onClick={() => {
          setMenu(menu === "tree" ? null : "tree");
          setQuery("");
          setActiveIndex(-1);
          setExpandedFolders((current) => new Set([...current, ...(selectedFolderItem?.ancestorIds ?? [])]));
        }}
      >
        <span>
          {selectedFolderItem?.folder.name ?? "Sem pasta"}
        </span>
        <span className="material-symbols-outlined" aria-hidden="true">
          {menu === "tree" ? "expand_less" : "expand_more"}
        </span>
      </button>
      {menu === "tree" && (
        <div id={`${id}-tree`} className="macro-form-folder-picker-menu" role="listbox" aria-label="Árvore de pastas">
          <button
            type="button"
            className={`macro-form-folder-picker-option${!value ? " is-selected" : ""}`}
            role="option"
            aria-selected={!value}
            onClick={() => chooseFolder("")}
          >
            Sem pasta
          </button>
          {folderTree.map(({ folder, level, ancestorIds }) => {
            const hasChildren = folders.some(
              (item) => item.parentId === folder.id,
            );
            const isExpanded = expandedFolders.has(folder.id);
            const isVisible = ancestorIds.every((parentId) => expandedFolders.has(parentId));
            if (!isVisible) return null;

            return (
              <div
                key={folder.id}
                className="macro-form-folder-picker-row"
                style={{ paddingLeft: `${0.25 + level * 1.25}rem` }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    className="macro-folder-destination-toggle"
                    aria-label={`${isExpanded ? "Recolher" : "Expandir"} ${folder.name}`}
                    onClick={() => toggleFolder(folder.id)}
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
                  className={`macro-form-folder-picker-option${value === folder.id ? " is-selected" : ""}`}
                  role="option"
                  aria-selected={value === folder.id}
                  onClick={() => chooseFolder(folder.id)}
                >
                  <span className="material-symbols-outlined">folder</span>
                  {folder.name}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
