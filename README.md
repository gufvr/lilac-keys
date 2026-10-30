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

## Editing snippets

Type `- ` or `1. ` at the start of a paragraph to create a bulleted or numbered
list. Other numbers remain literal outside a list. Enter continues a list; Enter
on an empty item exits it. Tab and Shift+Tab adjust nesting. Backspace keeps the
browser's native behavior. Newly generated empty list items and exit paragraphs
are kept for editing but omitted from saved HTML while empty; deliberate blank
lines and existing snippets are preserved.

Click a link, or place the caret inside it and press Ctrl/Command+K, to change
its URL or remove the link while keeping the text. The same dialog creates links
from selected text. New addresses must use HTTPS, mailto or tel. Existing links
are preserved until explicitly changed. Cancel and Escape restore the selection.

You can also select existing text and paste a single HTTPS, mailto or tel URL to
make that text a link without replacing its label or inline formatting. Ordinary
text, image pastes and pastes without a text selection keep their existing behavior.

Rich HTML copied from other applications keeps the browser's formatted paste.
When the clipboard contains Markdown instead, common `**bold**` / `__bold__`
markers and bulleted or numbered lists are converted to semantic HTML on paste.
Code and placeholders are protected. This conversion applies only to new pastes;
it does not migrate or reinterpret existing snippets, imports or exports.

Run `npm run test:editor-browser` for real Chromium editing checks in an isolated
Edge profile; `LILAC_TEST_BROWSER` can specify another Chromium executable.

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

When creating or editing a snippet, **Buscar pasta** finds existing folders by
partial name, ignoring case, accents and repeated spaces. Emoji can be searched
alone or together with the name in either order, such as `MYEDUZZ 🟦`. Results
show the full folder path to distinguish identical names. Use the arrow keys and
Enter to select; Escape closes the results. **Sem pasta** keeps the snippet at
the root. The existing folder tree remains available below the search field.

## Import and export

Import and export snippets using JSON or TXT files.

JSON is recommended for backups because it preserves folders and snippet organization.

The JSON and TXT buttons on a snippet open an export choice. **Export snippet**
exports the clicked snippet (or all selected snippets when it is selected) without
folders; these snippets import into the root. **Export snippet and folder(s)**
includes only the ancestor folders needed to rebuild their paths. Global exports
and complete folder exports keep their existing scope.

A single snippet exported without folders uses its shortcut as the suggested
JSON/TXT filename. Characters invalid in filenames are replaced with underscores;
other exports use `LilacKeys DD MM YYYY.json` or `.txt`, with the browser's local
date and spaces instead of hyphens.

Folder-free TXT exports include an optional `<macro-metadata>` line to retain
snippet IDs and order in the file. The current importer reads this metadata and
still creates new IDs on import; it also accepts previous TXT files. Use JSON for
sharing folder-free exports with older LilacKeys versions.

When importing snippets with duplicate names, LilacKeys creates a variation of the name instead of overwriting existing data.

## Privacy

Snippets and preferences are stored locally in your browser profile.

LilacKeys does not synchronize snippet content with external servers. The extension interacts with compatible text fields only to detect shortcuts and insert snippets.

## Compatibility

LilacKeys works with Chromium-based browsers that support Manifest V3.

Snippet expansion supports standard text inputs, textareas, content-editable fields, and compatible rich text editors. Formatting support may vary depending on the website or editor.

## License

This project is licensed under the MIT License.
