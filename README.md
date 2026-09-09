# LilacKeys

A browser extension for creating, organizing, and expanding frequently used text.

[Install LilacKeys from the Chrome Web Store](https://chromewebstore.google.com/detail/lilackeys/edbejkgpcffchpocpopbkiiihinbjdol)

## Features

- Create macros with a name, shortcut, and expanded text.
- Expand macros in text fields, textareas, and compatible editors.
- Press `Shift + Space` to expand a macro.
- Organize macros into folders and subfolders.
- Search by macro name, shortcut, or content.
- Use markers such as `%NAME%` for editable parts of a text.
- Import and export macros in JSON or TXT format.
- Export complete folders, including subfolders and macros.
- Switch between light and dark themes.

## Getting started

1. [Install LilacKeys from the Chrome Web Store](https://chromewebstore.google.com/detail/lilackeys/edbejkgpcffchpocpopbkiiihinbjdol).
2. Open LilacKeys from your browser's extensions menu.
3. Click **New Macro**.
4. Enter a name, shortcut, and expanded text.
5. Optionally, choose a folder for the macro.
6. Type the shortcut in a compatible text field and press `Shift + Space`.

## Placeholders

Use percent signs to create editable sections, for example:

```text
Hello, %NAME%! Your request has been received.
```

When the text is expanded, the first placeholder is selected. Press `Tab` to move between placeholders.

## Folders

Use folders to organize macros by topic, project, or workflow. You can create subfolders, move macros, rename folders, and export folder contents.

## Backup and restore

Use **Export** to save your macros as JSON or TXT. To restore or transfer your data, use **Import** and select the saved file.

JSON is recommended for backups because it preserves folder organization. When importing macros with duplicate names, LilacKeys creates a variation of the name instead of overwriting existing data.

## Privacy

Macros and theme preferences are stored locally in your browser profile. LilacKeys does not synchronize this data with external servers.

The extension needs access to text fields on web pages to detect shortcuts and expand macros. It does not send the content of those fields outside your browser.

## Compatibility

LilacKeys works with Chromium-based browsers that support Manifest V3, including Google Chrome and Microsoft Edge.

## License

This project is licensed under the MIT License.
