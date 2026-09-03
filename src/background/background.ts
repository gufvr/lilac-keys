chrome.runtime.onInstalled.addListener(() => {
  console.log("LilacKeys instalado");
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "inject-content-script") return;

  void chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => {
      if (!tab.id) return;
      const tabId = tab.id;

      chrome.tabs.sendMessage(tabId, { type: "lilac-keys-ping" }, () => {
        if (!chrome.runtime.lastError) return;

        void chrome.scripting
          .executeScript({
            target: { tabId },
            files: ["content.js"],
          })
          .catch(() => undefined);
      });
    });
});
