import { Folder, Macro } from "../types/macro";

const STORAGE_KEY = "lilac-keys-macros";
const FOLDERS_KEY = "lilac-keys-folders";
const MENU_ROOT_ID = "lilackeys-root";

chrome.runtime.onInstalled.addListener(() => {
  console.log("LilacKeys instalado");
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

function createContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.storage.local.get([STORAGE_KEY, FOLDERS_KEY], (result) => {
      const macros = (result[STORAGE_KEY] as Macro[] | undefined) ?? [];
      const folders = (result[FOLDERS_KEY] as Folder[] | undefined) ?? [];

      chrome.contextMenus.create({
        id: MENU_ROOT_ID,
        title: "LilacKeys",
        contexts: ["all"],
      });
      chrome.contextMenus.create({
        id: "lilackeys-open",
        parentId: MENU_ROOT_ID,
        title: "Abrir LilacKeys",
        contexts: ["all"],
      });

      const addFolderMenu = (folder: Folder, parentId: string) => {
        const menuId = `lilackeys-folder-${folder.id}`;
        chrome.contextMenus.create({
          id: menuId,
          parentId,
          title: folder.name,
          contexts: ["all"],
        });

        macros
          .filter((macro) => macro.folderId === folder.id)
          .forEach((macro) => addMacroMenu(macro, menuId));

        folders
          .filter((child) => child.parentId === folder.id)
          .forEach((child) => addFolderMenu(child, menuId));
      };

      const addMacroMenu = (macro: Macro, parentId: string) => {
        chrome.contextMenus.create({
          id: `lilackeys-macro-${macro.id}`,
          parentId,
          title: `${macro.nome} (${macro.atalho})`,
          contexts: ["all"],
        });
      };

      macros
        .filter((macro) => !macro.folderId)
        .forEach((macro) => addMacroMenu(macro, MENU_ROOT_ID));
      folders
        .filter((folder) => !folder.parentId)
        .forEach((folder) => addFolderMenu(folder, MENU_ROOT_ID));
    });
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "local" &&
    (changes[STORAGE_KEY] || changes[FOLDERS_KEY])
  ) {
    createContextMenu();
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "lilackeys-open") {
    void chrome.tabs.create({
      url: chrome.runtime.getURL("index.html"),
    });
  }

  if (typeof info.menuItemId !== "string") return;
  if (!info.menuItemId.startsWith("lilackeys-folder-")) return;

  const folderId = info.menuItemId.replace("lilackeys-folder-", "");
  void chrome.tabs.create({
    url: `${chrome.runtime.getURL("index.html")}#folder=${encodeURIComponent(folderId)}`,
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "getMacros") return;

  chrome.storage.local.get(STORAGE_KEY, (result) => {
    if (chrome.runtime.lastError) {
      sendResponse({ macros: [] });
      return;
    }

    sendResponse({ macros: result[STORAGE_KEY] ?? [] });
  });

  return true;
});

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({
    url: chrome.runtime.getURL("index.html"),
  });
});
