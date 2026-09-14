import assert from "node:assert/strict";
import test from "node:test";

import {
  findWhatsAppMacroMatch,
  isWhatsAppWebPage,
  isWhatsAppMessageComposerContext,
  orderWhatsAppEditorCandidates,
  type WhatsAppComposerContext,
} from "../src/content/editors/whatsappEditor.ts";
import type { Macro } from "../src/types/macro.ts";

const validContext: WhatsAppComposerContext = {
  hostname: "web.whatsapp.com",
  isContentEditable: true,
  role: "textbox",
  isLexicalEditor: false,
  insideMain: true,
  insideFooter: true,
  hasSendActionNearby: true,
  insideSearchRegion: false,
  insideSidePanel: false,
  insideHeader: false,
  insideNavigation: false,
  insideDialog: false,
  insideCaptionRegion: false,
  selectionInside: true,
};

const macros: Macro[] = [
  {
    id: "1",
    nome: "Saudação",
    atalho: "/oi",
    textoExpandido: "Olá!",
  },
  {
    id: "2",
    nome: "Saudação completa",
    atalho: "/oi-completo",
    textoExpandido: "Olá! Como posso ajudar?",
  },
  {
    id: "3",
    nome: "Acentuação",
    atalho: "/atenção",
    textoExpandido: "Atenção 😊\nSegunda linha",
  },
];

test("reconhece exclusivamente o domínio oficial do WhatsApp Web", () => {
  assert.equal(isWhatsAppWebPage("web.whatsapp.com"), true);
  assert.equal(isWhatsAppWebPage("WEB.WHATSAPP.COM"), true);
  assert.equal(isWhatsAppWebPage("fake.web.whatsapp.com"), false);
  assert.equal(isWhatsAppWebPage("whatsapp.com"), false);
});

test("aceita somente o compositor principal do WhatsApp Web", () => {
  assert.equal(isWhatsAppMessageComposerContext(validContext), true);
});

test("aceita variações sem depender simultaneamente de main e footer", () => {
  assert.equal(
    isWhatsAppMessageComposerContext({
      ...validContext,
      insideMain: false,
    }),
    true,
  );
  assert.equal(
    isWhatsAppMessageComposerContext({
      ...validContext,
      role: null,
      isLexicalEditor: true,
      insideMain: false,
      insideFooter: false,
      hasSendActionNearby: true,
    }),
    true,
  );
});

test("rejeita outros domínios e subdomínios", () => {
  assert.equal(
    isWhatsAppMessageComposerContext({
      ...validContext,
      hostname: "example.com",
    }),
    false,
  );
  assert.equal(
    isWhatsAppMessageComposerContext({
      ...validContext,
      hostname: "fake.web.whatsapp.com",
    }),
    false,
  );
});

test("rejeita pesquisa, painéis, diálogos, legendas e editores inválidos", () => {
  const invalidContexts: WhatsAppComposerContext[] = [
    { ...validContext, isContentEditable: false },
    { ...validContext, role: "searchbox" },
    { ...validContext, insideSearchRegion: true },
    { ...validContext, insideSidePanel: true },
    { ...validContext, insideHeader: true },
    { ...validContext, insideNavigation: true },
    { ...validContext, insideDialog: true },
    { ...validContext, insideCaptionRegion: true },
    { ...validContext, selectionInside: false },
    {
      ...validContext,
      insideMain: false,
      insideFooter: false,
      hasSendActionNearby: false,
    },
  ];

  invalidContexts.forEach((context) => {
    assert.equal(isWhatsAppMessageComposerContext(context), false);
  });
});

test("prioriza target, depois composedPath e por fim activeElement", () => {
  const editors: Record<string, string | null> = {
    targetChild: "targetEditor",
    targetEditor: "targetEditor",
    pathChild: "pathEditor",
    pathEditor: "pathEditor",
    activeChild: "activeEditor",
    activeEditor: "activeEditor",
  };
  const resolveEditor = (candidate: string) => editors[candidate] ?? null;

  assert.deepEqual(
    orderWhatsAppEditorCandidates(
      "targetChild",
      ["targetChild", "pathChild"],
      "activeChild",
      resolveEditor,
    ),
    ["targetEditor", "pathEditor", "activeEditor"],
  );
});

test("usa composedPath e activeElement como fallbacks independentes", () => {
  const resolveEditor = (candidate: string) =>
    candidate.endsWith("Editor") ? candidate : null;

  assert.deepEqual(
    orderWhatsAppEditorCandidates(
      "targetChild",
      ["pathChild", "pathEditor"],
      "activeEditor",
      resolveEditor,
    ),
    ["pathEditor", "activeEditor"],
  );
  assert.deepEqual(
    orderWhatsAppEditorCandidates(
      "targetChild",
      [],
      "activeEditor",
      resolveEditor,
    ),
    ["activeEditor"],
  );
});

test("encontra atalhos sem diferenciar maiúsculas e minúsculas", () => {
  const match = findWhatsAppMacroMatch(macros, "Mensagem anterior /ATENÇÃO");
  assert.equal(match?.macro.id, "3");
  assert.equal(match?.shortcutLength, "/atenção".length);
  assert.equal(match?.macro.textoExpandido, "Atenção 😊\nSegunda linha");
});

test("prefere o maior atalho correspondente", () => {
  const match = findWhatsAppMacroMatch(macros, "texto /oi-completo");
  assert.equal(match?.macro.id, "2");
});

test("não encontra macro quando o sufixo não corresponde", () => {
  assert.equal(findWhatsAppMacroMatch(macros, "texto sem atalho"), null);
});

test("ignora atalhos vazios", () => {
  const macroWithEmptyShortcut: Macro = {
    id: "4",
    nome: "Inválida",
    atalho: "   ",
    textoExpandido: "Não inserir",
  };
  assert.equal(findWhatsAppMacroMatch([macroWithEmptyShortcut], "texto"), null);
});
