<p align="center">
  <img src="public/LilacKeys_logo.png" alt="LilacKeys logo" width="120" />
</p>

<h1 align="center">LilacKeys</h1>

<p align="center">A browser extension for creating, organizing, searching, and expanding text snippets.</p>

## Features

* Create and expand snippets with custom shortcuts.
* Organize snippets into folders and subfolders.
* Search snippets by name, shortcut, or content.
* Use editable placeholders in snippets.
* Import and export snippets in JSON or TXT format.
* Light and dark themes.
* Local browser storage.

## Getting started

1. [Install LilacKeys from the Chrome Web Store](https://chromewebstore.google.com/detail/lilackeys/edbejkgpcffchpocpopbkiiihinbjdol).
2. Open LilacKeys from your browser's extensions menu.
3. Click **New Snippet**.
4. Enter a name, shortcut, and text.
5. Optionally, organize the snippet inside a folder.
6. Type the shortcut in a compatible text field and press `Shift + Space`.

## Placeholders

Use placeholders to create editable sections inside a snippet.

For example:

```text
Hello, %NAME%! Your request has been received.
```

After expanding the snippet, the first placeholder is selected automatically. Press `Tab` to move between placeholders.

## Folders

Use folders and subfolders to organize snippets by topic, project, or workflow.

You can create, rename, and organize folders, move snippets between them, reorder folders or snippets by dragging them, and export complete folder structures.

## Import and export

Import and export snippets using JSON or TXT files.

JSON is recommended for backups because it preserves folders and snippet organization.

When importing snippets with duplicate names, LilacKeys creates a variation of the name instead of overwriting existing data.

## Privacy

Snippets and preferences are stored locally in your browser profile.

LilacKeys does not synchronize snippet content with external servers. The extension interacts with compatible text fields only to detect shortcuts and insert snippets.

## Compatibility

LilacKeys works with Chromium-based browsers that support Manifest V3.

Snippet expansion supports standard text inputs, textareas, content-editable fields, and compatible rich text editors. Formatting support may vary depending on the website or editor.

## License

This project is licensed under the MIT License.
