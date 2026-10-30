// Real Chromium editing input in an isolated, unsigned-in browser profile.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const executable = process.env.LILAC_TEST_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const profile = await mkdtemp(join(tmpdir(), "lilac-rich-text-"));
const bundle = await build({ entryPoints: ["tests/browser/richText.browser.tsx"], bundle: true, write: false,
  outdir: "fixture", format: "iife", platform: "browser", target: "es2021", jsx: "automatic" });
const server = createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/bundle.js" ? "text/javascript" : request.url === "/bundle.css" ? "text/css" : "text/html");
  response.end(request.url === "/bundle.js" ? bundle.outputFiles.find(file => file.path.endsWith(".js")).text
    : request.url === "/bundle.css" ? bundle.outputFiles.find(file => file.path.endsWith(".css")).text
    : '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/bundle.css"></head><body><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--no-proxy-server", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  `http://127.0.0.1:${server.address().port}/`], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
let browserError = "";
browser.stderr.on("data", data => { browserError = (browserError + data).slice(-1000); });
let socket;
try {
  let port;
  for (let attempt = 0; attempt < 100 && !port; attempt += 1) {
    try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  assert.ok(port, `Browser did not start: ${browserError}`);
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  const page = pages.find(item => item.type === "page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      if (task) { clearTimeout(task.timeout); pending.delete(message.id); if (message.error) task.reject(message.error); else task.resolve(message.result); }
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    const timeout = setTimeout(() => { pending.delete(callId); reject(new Error(`Timeout: ${method}`)); }, 10000);
    pending.set(callId, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + result.exceptionDetails.exception?.description);
    return result.result.value;
  };
  const browserVersion = await send("Browser.getVersion");
  for (let attempt = 0; attempt < 50 && !await evaluate("Boolean(window.editorFixture)"); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(await evaluate("Boolean(window.editorFixture)"), "Editor fixture did not load");
  const settle = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const mount = async html => { await evaluate(`editorFixture.mount(${JSON.stringify(html)})`); await settle(); };
  const read = () => evaluate("editorFixture.read()");
  const select = (selector = ".rich-text-content", start, end) => evaluate(`editorFixture.select(${JSON.stringify(selector)},${start ?? "undefined"},${end ?? "undefined"})`);
  const key = async (key, modifiers = 0, text) => {
    const code = key.length === 1 && /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key === " " ? "Space" : key === "." ? "Period" : key === "-" ? "Minus" : key;
    const windowsVirtualKeyCode = key === "Enter" ? 13 : key === "Backspace" ? 8 : key === "Tab" ? 9 : key === "Escape" ? 27 : key === " " ? 32 : key === "." ? 190 : key === "-" ? 189 : key.toUpperCase().charCodeAt(0);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, modifiers, text: text ?? (modifiers === 0 && key === "Enter" ? "\r" : modifiers === 0 && key.length === 1 ? key : undefined) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, modifiers });
    await settle();
  };
  const type = async text => { for (const character of text) await key(character); };
  const click = async expression => {
    const point = await evaluate(`(() => { const element=${expression}; if(!element)throw new Error('Missing click target');element.scrollIntoView({block:'center'});const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
    await settle();
  };
  const button = label => click(`Array.from(document.querySelectorAll('button')).find(button=>(button.getAttribute('aria-label')||button.textContent.trim())===${JSON.stringify(label)})`);
  const url = async value => {
    await evaluate("document.querySelector('.rich-text-link-dialog input').focus()");
    await key("a", 2);
    await send("Input.insertText", { text: value });
    await settle();
  };
  const paste = async (text, html = "", image = false) => {
    // ClipboardEvent data exercises the real paste handler and Chromium commands
    // without reading or overwriting the user's operating-system clipboard.
    const prevented = await evaluate(`(() => {
      const data=new DataTransfer();data.setData('text/plain',${JSON.stringify(text)});
      if(${JSON.stringify(html)})data.setData('text/html',${JSON.stringify(html)});
      if(${image}) {
        const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6u8AAAAASUVORK5CYII='),character=>character.charCodeAt(0));
        data.items.add(new File([bytes],'fixture.png',{type:'image/png'}));
      }
      const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});
      document.querySelector('.rich-text-content').dispatchEvent(event);
      return event.defaultPrevented;
    })()`);
    await settle();
    return prevented;
  };
  const results = [];
  const test = async (name, run) => { try { await run(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: String(error), fixture: await read() }); } };

  for (const [marker, tag] of [["- ", "ul"], ["1. ", "ol"]]) {
    await test(`${marker}: real typing, Enter, exit and no empty serialized tail`, async () => {
      await mount(""); await select();
      await type(marker + "Olá");
      assert.equal(await evaluate(`document.querySelector('.rich-text-content ${tag} > li').textContent`), "Olá");
      await key("Enter");
      assert.equal(await evaluate("document.querySelectorAll('.rich-text-content li').length"), 2);
      assert.equal(await evaluate("new DOMParser().parseFromString(editorFixture.read().published,'text/html').querySelectorAll('li').length"), 1);
      await type("Segundo"); await key("Enter"); await key("Enter");
      const exited = await read();
      assert.equal(await evaluate("Boolean(getSelection().anchorNode.parentElement.closest('li'))"), false);
      assert.equal(await evaluate("new DOMParser().parseFromString(editorFixture.read().published,'text/html').body.lastElementChild.tagName"), tag.toUpperCase());
      await type("Depois");
      const final = await read();
      assert.ok(final.published.endsWith("Depois</div>") || final.published.endsWith("Depois</p>"), JSON.stringify(final));
      assert.ok(!exited.published.includes("&nbsp;") && !/[\u200b\ufeff]/.test(final.published));
    });
  }
  await test("conversion before and after independent lists preserves inline content and caret", async () => {
    for (const [neighbor, marker, tag] of [["ul", "-", "ul"], ["ol", "1.", "ol"], ["ol", "-", "ul"], ["ul", "1.", "ol"]]) {
      await mount(`<${neighbor}><li>Antes</li></${neighbor}><p><strong>${marker}restante</strong></p><${neighbor}><li>Depois</li></${neighbor}>`);
      await select("p strong", marker.length); await type(" X");
      assert.deepEqual(await evaluate("Array.from(document.querySelector('.rich-text-content').children).map(list=>[list.tagName.toLowerCase(),list.textContent])"), [[neighbor, "Antes"], [tag, "Xrestante"], [neighbor, "Depois"]]);
      assert.ok((await read()).published.includes("<strong>Xrestante</strong>"), (await read()).published);
    }
  });
  await test("conversion preserves native undo and redo", async () => {
    await mount("<p>-restante</p>"); await select("p", 1); await type(" ");
    assert.equal(await evaluate("Boolean(document.querySelector('ul'))"), true);
    await key("z", 2);
    assert.equal((await read()).html, "<p>-restante</p>");
    await key("y", 2);
    assert.equal(await evaluate("Boolean(document.querySelector('ul'))"), true);
  });
  await test("native Backspace at the beginning of an item preserves text", async () => {
    await mount("<ul><li>Conteúdo</li></ul>"); await select("li", 0); await key("Backspace");
    assert.equal(await evaluate("document.querySelector('.rich-text-content').textContent"), "Conteúdo");
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content ul ul,.rich-text-content ol ul').length"), 0);
  });
  await test("literal numbers, mid-paragraph markers, bulk input and noncollapsed selection do not format", async () => {
    for (const value of ["2.", "Texto -", "Texto 1."]) {
      await mount(`<p>${value}</p>`); await select("p"); await type(" ");
      assert.equal(await evaluate("document.querySelectorAll('.rich-text-content ul,.rich-text-content ol').length"), 0);
    }
    await mount("<p>-</p>"); await select("p", 0, 1); await type(" ");
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content ul').length"), 0);
    await mount("<p><br></p>"); await select("p");
    await send("Input.insertText", { text: "- colado" }); await settle();
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content ul').length"), 0);
  });
  await test("excluded contexts and IME composition preserve literal markers", async () => {
    for (const [html, selector] of [
      ['<p><a href="https://example.test">-</a></p>', 'a'], ['<p><code>-</code></p>', 'code'],
      ['<pre>-</pre>', 'pre'], ['<blockquote><p>-</p></blockquote>', 'p'], ['<ul><li>-</li></ul>', 'li'],
    ]) {
      await mount(html); await select(selector); await type(" ");
      assert.equal(await evaluate("document.querySelectorAll('.rich-text-content ul,.rich-text-content ol').length"), selector === "li" ? 1 : 0);
    }
    await mount("<p><br></p>"); await select("p");
    await send("Input.imeSetComposition", { text: "-", selectionStart: 1, selectionEnd: 1 });
    await send("Input.insertText", { text: "- " }); await settle();
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content ul').length"), 0);
  });
  await test("automatic list preserves active inline formatting", async () => {
    await mount("<p><strong>-</strong></p>"); await select("strong"); await type(" A");
    assert.equal(await evaluate("document.querySelector('.rich-text-content li strong,.rich-text-content li b')?.textContent"), "A");
  });
  await test("undo and redo of list exit keep the serialized tail clean", async () => {
    await mount("<p><br></p>"); await select("p"); await type("- A"); await key("Enter"); await key("Enter");
    await key("z", 2); await key("y", 2);
    assert.ok((await read()).published.endsWith("</ul>"), JSON.stringify(await read()));
  });
  await test("Tab and Shift+Tab preserve nested list behavior", async () => {
    await mount("<ul><li>A</li><li>B</li></ul>"); await select("li:last-child"); await key("Tab");
    assert.equal(await evaluate("document.querySelector('ul ul li').textContent"), "B");
    await select("ul ul li"); await key("Tab", 8);
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content > ul > li').length"), 2);
  });
  await test("click existing link edits URL and removal preserves rich text; undo/redo work", async () => {
    await mount('<p>Antes <a href="https://example.test/old"><strong>Link</strong></a> depois</p>');
    await click("document.querySelector('.rich-text-content a strong')");
    assert.equal(await evaluate("document.querySelector('.rich-text-link-dialog input').value"), "https://example.test/old");
    await url("https://example.test/new"); await button("Salvar link");
    assert.equal(await evaluate("document.querySelector('a').getAttribute('href')"), "https://example.test/new");
    assert.equal(await evaluate("document.querySelector('.rich-text-content strong').textContent"), "Link");
    await key("z", 2); assert.equal(await evaluate("document.querySelector('a').getAttribute('href')"), "https://example.test/old");
    await key("y", 2); assert.equal(await evaluate("document.querySelector('a').getAttribute('href')"), "https://example.test/new");
    await click("document.querySelector('.rich-text-content a')"); await button("Remover link");
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content a').length"), 0);
    assert.equal(await evaluate("document.querySelector('.rich-text-content').textContent"), "Antes Link depois");
    assert.ok((await read()).published.includes("<strong>Link</strong>"));
  });
  await test("link mutation restores the original selection across native inline normalization", async () => {
    await mount('<p>Antes <a href="https://example.test/old"><strong>Link</strong></a> depois</p>');
    await select("a strong", 1, 3); await key("k", 2); await url("https://example.test/new"); await button("Salvar link");
    assert.equal(await evaluate("getSelection().toString()"), "in");
    await type("X");
    assert.equal(await evaluate("document.querySelector('.rich-text-content').textContent"), "Antes LXk depois");
  });
  await test("Escape and Cancel preserve HTML, focus and selection without closing the macro form", async () => {
    const html = '<p>Olá <a href="https://example.test">%NOME%</a> 🫡</p>';
    await evaluate(`editorFixture.form(${JSON.stringify(html)})`); await settle();
    await select("a", 1, 4); await key("k", 2); await url("https://example.test/changed"); await key("Escape");
    assert.equal((await read()).html, html); assert.equal((await read()).closed, 0);
    assert.equal(await evaluate("getSelection().toString()"), "NOM");
    assert.equal(await evaluate("document.activeElement.classList.contains('rich-text-content')"), true);
    await key("k", 4); await button("Cancelar");
    assert.equal((await read()).html, html);
    assert.equal(await evaluate("getSelection().toString()"), "NOM");
  });
  await test("toolbar and shortcut create safe links; empty selection asks for text", async () => {
    for (const address of ["https://example.test", "mailto:test@example.test", "tel:+5511999999999"]) {
      await mount("<p><em>Selecionado</em></p>"); await select("em", 0, 11); await button("Inserir link");
      await url(address); await button("Salvar link");
      assert.equal(await evaluate("document.querySelector('a').getAttribute('href')"), address);
      assert.equal(await evaluate("document.querySelector('.rich-text-content').textContent"), "Selecionado");
    }
    await mount("<p>Texto</p>"); await select("p"); await key("k", 2);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.rich-text-link-dialog button')).find(b=>b.textContent==='Salvar link').disabled"), true);
    await key("Escape"); assert.equal((await read()).html, "<p>Texto</p>");
  });
  await test("pasting one URL links the selected label and preserves formatting, selection and native undo", async () => {
    for (const address of ["https://example.test/pasted?x=1&y=2", "mailto:test@example.test", "tel:+5511999999999"]) {
      const original = '<p>Antes <strong>link</strong> depois 🫡</p>';
      await mount(original); await select("strong", 0, 4);
      assert.equal(await paste(address, '<b>Clipboard label must not replace selected text</b>'), true);
      assert.equal(await evaluate("document.querySelector('a').getAttribute('href')"), address);
      assert.equal(await evaluate("document.querySelector('.rich-text-content').textContent"), "Antes link depois 🫡");
      assert.equal(await evaluate("document.querySelector('strong').textContent"), "link");
      assert.equal(await evaluate("getSelection().toString()"), "link");
      assert.equal(await evaluate("Boolean(document.querySelector('.rich-text-link-dialog'))"), false);
      await key("z", 2); assert.equal((await read()).html, original);
      await key("y", 2); assert.equal(await evaluate("document.querySelector('a').getAttribute('href')"), address);
    }
  });
  await test("URL paste updates an existing link and remains editable by clicking it", async () => {
    await mount('<p><a href="https://example.test/old"><em>link</em></a></p>'); await select("em", 0, 4);
    assert.equal(await paste("https://example.test/new"), true);
    assert.equal(await evaluate("document.querySelector('.rich-text-content').textContent"), "link");
    await click("document.querySelector('.rich-text-content a')");
    assert.equal(await evaluate("document.querySelector('.rich-text-link-dialog input').value"), "https://example.test/new");
    await button("Cancelar");
  });
  await test("ordinary text, multiple URLs and pastes without a text selection retain default paste behavior", async () => {
    for (const [clipboard, start, end] of [["texto comum", 0, 4], ["javascript:alert(1)", 0, 4], ["https://one.test https://two.test", 0, 4], ["https://example.test", 4, 4]]) {
      await mount("<p>link</p>"); await select("p", start, end);
      assert.equal(await paste(clipboard), false);
      assert.equal((await read()).html, "<p>link</p>");
    }
  });
  await test("image paste still takes precedence over URL linking", async () => {
    await mount("<p>link</p>"); await select("p", 0, 4);
    assert.equal(await paste("https://example.test", "", true), true);
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content img').length"), 1);
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content a').length"), 0);
  });
  await test("pasted link persists through save and reopen with lists and placeholders", async () => {
    await evaluate(`editorFixture.form('<p>Antes</p><ul><li><em>link</em> %NOME%</li></ul><p>Depois</p>')`); await settle();
    await select("em", 0, 4); assert.equal(await paste("https://example.test/saved"), true);
    await key("Enter", 2);
    const saved = (await read()).saved;
    assert.ok(saved.textoExpandido.includes('href="https://example.test/saved"'));
    assert.ok(saved.textoExpandido.includes("%NOME%"));
    await evaluate(`editorFixture.form(${JSON.stringify(saved.textoExpandido)})`); await settle();
    assert.equal((await read()).html, saved.textoExpandido);
    assert.equal(await evaluate("document.querySelector('ul li').textContent"), "link %NOME%");
  });
  const markdownExample = "Por favor, me envie um **comprovante bancário vinculado ao novo documento**, contendo:\n\n" +
    "- nome do titular\n- banco\n- agência com dígito\n- conta com dígito\n\n" +
    "Pode ser um **print do aplicativo do banco** ou uma **declaração bancária**.";
  await test("ChatGPT-style Markdown paste preserves bold, lists and paragraphs with native undo and redo", async () => {
    await mount(""); await select();
    assert.equal(await paste(markdownExample), true);
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content strong,.rich-text-content b').length"), 3);
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content ul > li').length"), 4);
    assert.equal(await evaluate("document.querySelector('.rich-text-content').textContent.includes('**')"), false);
    assert.equal(await evaluate("new DOMParser().parseFromString(editorFixture.read().published,'text/html').body.lastElementChild.textContent"), "Pode ser um print do aplicativo do banco ou uma declaração bancária.");
    await key("z", 2); assert.equal(await evaluate("document.querySelector('.rich-text-content').textContent"), "");
    await key("y", 2); assert.equal(await evaluate("document.querySelectorAll('.rich-text-content ul > li').length"), 4);
  });
  await test("already rich HTML keeps native paste handling, including CSS-based bold", async () => {
    for (const html of ['<p><strong>Texto</strong></p>', '<span style="font-weight:700">Texto</span>']) {
      await mount("<p>Base</p>"); await select("p");
      assert.equal(await paste("Texto", html), false);
      assert.equal((await read()).html, "<p>Base</p>");
    }
  });
  await test("plain HTML wrappers with Markdown convert, while code destinations remain literal", async () => {
    await mount("<p><br></p>"); await select("p");
    assert.equal(await paste("**Título**", "<div>**Título**</div>"), true);
    assert.equal(await evaluate("document.querySelector('.rich-text-content strong').textContent"), "Título");
    await mount("<pre><code>Base</code></pre>"); await select("code");
    assert.equal(await paste("**literal**"), false);
    assert.equal((await read()).html, "<pre><code>Base</code></pre>");
  });
  await test("Markdown replacement preserves text surrounding the selection", async () => {
    await mount("<p>Antes substituir depois</p>"); await select("p", 6, 16);
    assert.equal(await paste("**forte**"), true);
    const text = await evaluate("document.querySelector('.rich-text-content').textContent");
    // Chromium's native editing canonicalizes boundary spaces as NBSP. Check
    // their rendered equivalence without changing or trimming the saved HTML.
    assert.equal(text.replace(/\u00a0/g, " "), "Antes forte depois");
    assert.equal(await evaluate("document.querySelector('.rich-text-content').children.length"), 1);
    assert.equal(await evaluate("document.querySelector('.rich-text-content strong').textContent"), "forte");
  });
  await test("Markdown paste is stored as HTML and reopens without reinterpreting placeholders", async () => {
    await evaluate(`editorFixture.form('<p>Antes %NOME%</p><p><br></p>')`); await settle(); await select("p:last-child");
    assert.equal(await paste(markdownExample), true); await key("Enter", 2);
    const saved = (await read()).saved;
    assert.ok(saved.textoExpandido.includes("%NOME%"));
    assert.ok(!saved.textoExpandido.includes("**"));
    await evaluate(`editorFixture.form(${JSON.stringify(saved.textoExpandido)})`); await settle();
    assert.equal((await read()).html, saved.textoExpandido);
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content strong,.rich-text-content b').length"), 3);
    assert.equal(await evaluate("document.querySelectorAll('.rich-text-content ul > li').length"), 4);
  });
  await test("unsafe URLs are rejected and legacy href remains unchanged on cancel", async () => {
    const original = '<p><a href="http://example.test/legacy">Legado</a></p>';
    await mount(original); await click("document.querySelector('a')");
    for (const address of ["javascript:alert(1)", "data:text/html,test", "file:///test"]) {
      await url(address); await button("Salvar link");
      assert.ok(await evaluate("Boolean(document.querySelector('.rich-text-link-dialog [role=alert]'))"));
      assert.equal((await read()).html, original);
    }
    await button("Cancelar"); assert.equal((await read()).html, original);
  });
  await test("moving the caret does not open a dialog; keyboard cancel and focus trapping work", async () => {
    await mount('<p><a href="https://example.test">Link</a></p>'); await select("a", 1);
    assert.equal(await evaluate("Boolean(document.querySelector('.rich-text-link-dialog'))"), false);
    await key("k", 2);
    await key("Tab", 8);
    assert.equal(await evaluate("document.activeElement.textContent"), "Salvar link");
    await key("Tab");
    assert.equal(await evaluate("document.activeElement.tagName"), "INPUT");
    await evaluate("Array.from(document.querySelectorAll('.rich-text-link-dialog button')).find(b=>b.textContent==='Cancelar').focus()");
    await key("Enter");
    assert.equal(await evaluate("Boolean(document.querySelector('.rich-text-link-dialog'))"), false);
    assert.equal((await read()).published, '<p><a href="https://example.test">Link</a></p>');
  });
  await test("saving immediately after exiting a list does not persist a technical paragraph", async () => {
    await evaluate(`editorFixture.form('<p><br></p>')`); await settle(); await select("p");
    await type("1. A"); await key("Enter"); await key("Enter"); await key("Enter", 2);
    const saved = (await read()).saved;
    assert.ok(saved.textoExpandido.endsWith("</ol>"), saved.textoExpandido);
    await evaluate(`editorFixture.form(${JSON.stringify(saved.textoExpandido)})`); await settle();
    assert.equal((await read()).html, saved.textoExpandido);
  });
  await test("save and reopen preserve links, lists, images, placeholders and deliberate blank lines", async () => {
    const image = '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Fixture">';
    const html = `<p><strong>%NOME%</strong> 🫡</p><p><br></p><ol><li>A<ul><li>B</li></ul></li></ol><p><a href="https://example.test">Link</a></p>${image}<p><br></p>`;
    await evaluate(`editorFixture.form(${JSON.stringify(html)})`); await settle(); await select(".rich-text-content"); await key("Enter", 2);
    const saved = (await read()).saved;
    assert.equal(saved.textoExpandido, html);
    await evaluate(`editorFixture.form(${JSON.stringify(saved.textoExpandido)})`); await settle();
    assert.equal((await read()).html, html);
  });
  await test("external values are restored after editing and switching between snippets", async () => {
    await mount("<p>A</p>"); await select("p"); await type("X");
    const previous = (await read()).published;
    await evaluate(`editorFixture.replace('<p>B</p>')`); await settle();
    assert.equal((await read()).html, "<p>B</p>");
    await evaluate(`editorFixture.replace(${JSON.stringify(previous)})`); await settle();
    assert.equal((await read()).html, previous);
  });
  console.log(JSON.stringify({ browser: browserVersion.product, results, passed: results.filter(item => item.passed).length, total: results.length }));
  if (results.some(item => !item.passed)) process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  server.close();
}
