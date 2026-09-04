const STORAGE_KEY = "lilac-keys-macros";

chrome.runtime.onInstalled.addListener(() => {
  console.log("LilacKeys instalado");
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
