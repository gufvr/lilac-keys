import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { RichTextEditor } from "../../src/components/RichTextEditor";
import { MacroForm } from "../../src/components/MacroForm/MacroForm";

const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);
let generation = 0;
let published = "";
let saved: unknown;
let closed = 0;
let replaceValue: (html: string) => void = () => {};
export function Editor({ html }: { html: string }) {
  const [value, setValue] = useState(html);
  replaceValue = setValue;
  return <RichTextEditor id="fixture-editor" value={value} onChange={(next) => {
    published = next;
    setValue(next);
  }} />;
}

Object.assign(window, {
  editorFixture: {
    mount(html = "") {
      published = html;
      flushSync(() => root.render(<Editor key={++generation} html={html} />));
    },
    form(html: string) {
      saved = null;
      closed = 0;
      flushSync(() => root.render(<MacroForm key={++generation}
        macro={{ id: "fixture", nome: "Fixture", atalho: "fixture", textoExpandido: html }}
        onSubmit={(macro) => { saved = macro; return { success: true }; }}
        onCancel={() => { closed += 1; }} />));
    },
    read: () => ({ html: document.querySelector(".rich-text-content")?.innerHTML, published, saved, closed }),
    replace(html: string) { flushSync(() => replaceValue(html)); },
    select(selector = ".rich-text-content", start?: number, end?: number) {
      const element = document.querySelector(selector);
      if (!element) throw new Error("Missing selection target");
      const range = document.createRange();
      range.selectNodeContents(element);
      if (start !== undefined) {
        if (!element.firstChild) element.append(document.createTextNode(""));
        range.setStart(element.firstChild!, start);
        range.setEnd(element.firstChild!, end ?? start);
      } else range.collapse(false);
      (element.closest(".rich-text-content") as HTMLElement).focus();
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    },
  },
});
