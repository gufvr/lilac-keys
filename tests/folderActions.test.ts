import assert from "node:assert/strict";
import test from "node:test";

import {
  isolateFolderAction,
  runFolderAction,
} from "../src/utils/folderActions.ts";

test("ação direta interrompe a linha e executa somente a ação", () => {
  let stopped = 0;
  let called = 0;
  runFolderAction(
    { stopPropagation: () => { stopped += 1; } },
    () => { called += 1; },
  );
  assert.equal(stopped, 1);
  assert.equal(called, 1);
});

test("pointer e teclado dos controles ficam isolados da linha", () => {
  let stopped = false;
  isolateFolderAction({ stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true);
});
