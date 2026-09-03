chrome.runtime.onInstalled.addListener(() => {
  console.log("LilacKeys instalado");
});

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({
    url: chrome.runtime.getURL("index.html"),
  });
});
