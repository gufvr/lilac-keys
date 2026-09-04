<p align="center">
  <img src="public/LilacKeys_logo.png" alt="LilacKeys logo" width="120" />
</p>

<h1 align="center">LilacKeys</h1>

<p align="center">A browser extension for creating, organizing, searching, and expanding text snippets.</p>

<p align="center">
  <a href="https://github.com/gufvr/lilac-keys">Repository</a> ·
  <a href="https://github.com/gufvr/lilac-keys/issues">Issues</a>
</p>

## Overview

LilacKeys keeps frequently used text close at hand. Create a shortcut once, organize snippets into nested folders, and expand saved content in supported text fields with `Shift + Space`.

It is a Manifest V3 browser extension with a React management interface and a lightweight content script for expansion.

## Features

- Create, edit, delete, and search text macros.
- Expand snippets in inputs, textareas, and content-editable fields.
- Organize snippets into folders and nested subfolders.
- Create, rename, export, and delete folders from the folder browser.
- Search by macro name, shortcut, or expanded text.
- Select snippets individually or select all filtered results.
- Move or delete multiple snippets at once.
- Import and export JSON and TXT files.
- Import and export folder-based JSON structures.
- Persist macros and folders in `chrome.storage.local`.
- Use `unlimitedStorage` to avoid the default extension storage quota.
- Switch between light and dark themes.

## Usage

1. Open the LilacKeys extension page.
2. Create a macro with a name, shortcut, expanded text, and optional folder.
3. Type the shortcut in a supported text field.
4. Press `Shift + Space` to expand the matching snippet.
5. Browse folders or search by name, shortcut, or content.

Search is global while a query is active. Without a query, the folder browser shows the current level and its snippets.

## Folder Export Format

Exports use folder arrays containing the folder name, creation timestamp, and snippets:

```json
[
  [
    "Stack",
    1768177038544,
    {
      "name": "JS",
      "body": "JavaScript",
      "timestamp": 1768177065086
    }
  ]
]
```

Exporting a folder includes its nested folders and snippets.

## Tech Stack

- React 18
- TypeScript
- Vite
- Chrome Extension Manifest V3
- Chrome Storage API
- Material Symbols

## Project Structure

```text
src/
├── background/             Extension service worker
├── components/             React UI components
│   ├── Header/
│   ├── Help/
│   ├── ImportExport/
│   ├── MacroCard/
│   ├── MacroForm/
│   └── MacroList/
├── content/                Text expansion content script
├── hooks/                  React state and theme hooks
├── services/               Storage and theme services
├── types/                  Shared TypeScript types
├── utils/                  Validation and import/export helpers
├── App.tsx
└── main.tsx
```

## Getting Started

```bash
npm install
npm run dev
npm run lint
npm run build
```

The production extension is generated in `dist/`.

## Load the Extension in a Chromium Browser

1. Run `npm run build`.
2. Open the browser's extensions page.
3. Enable Developer mode.
4. Choose **Load unpacked**.
5. Select the generated `dist/` folder.
6. Reload the extension and the target page after rebuilding.

## Storage Notes

LilacKeys stores data locally in the browser extension profile. `unlimitedStorage` removes the standard quota for `chrome.storage.local`, but storage still depends on available disk space and browser policies. Data is not synchronized between browsers or devices.

## License

No license has been specified for this repository yet.
