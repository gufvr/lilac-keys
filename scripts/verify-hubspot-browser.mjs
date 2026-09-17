// A fresh, unsigned-in headless browser profile; never accesses a user's session.
// Production code is bundled in memory, not written to dist or to any ZIP.
import { build } from "esbuild";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const executable = process.env.LILAC_TEST_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const temporary = await mkdtemp(join(tmpdir(), "lilac-hubspot-"));
const compiled = await build({ entryPoints: ["tests/browser/hubspot.browser.ts"], bundle: true, write: false, format: "iife", platform: "browser", target: "es2021" });
const content = await build({ entryPoints: ["src/content/content.ts"], bundle: true, write: false, format: "iife", platform: "browser", target: "es2021" });
let finish;
const completed = new Promise(resolve => { finish = resolve; });
const video = process.argv[2]?.endsWith(".mp4") ? process.argv[2] : undefined;
const videoBytes = video ? await readFile(video) : undefined;
const macroPathIndex = process.argv.indexOf("--macros");
const macroFile = macroPathIndex >= 0 ? process.argv[macroPathIndex + 1] : undefined;
const imported = macroFile ? JSON.parse(await readFile(macroFile, "utf8")) : null;
const macros = imported?.macros?.filter(macro => ["BvTT", "PJPJ", "PFPJ", "PFMEI", "SemFatContador", "saqueF"].includes(macro.atalho));
let lastRequest = "none";
const server = createServer(async (request, response) => {
  lastRequest = request.url;
  try {
    if (request.url === "/bundle.js") { response.setHeader("Content-Type", "text/javascript"); response.end(compiled.outputFiles[0].text); }
    else if (request.url === "/content.js") { response.setHeader("Content-Type", "text/javascript"); response.end(content.outputFiles[0].text); }
    else if (request.url === "/macros.json") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(macros ?? null)); }
    else if (request.url === "/video.mp4" && videoBytes) {
      response.setHeader("Content-Type", "video/mp4"); response.setHeader("Accept-Ranges", "bytes");
      const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? "");
      if (range) {
        const start = Number(range[1]); const end = Math.min(Number(range[2] || videoBytes.length - 1), videoBytes.length - 1);
        response.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${videoBytes.length}`, "Content-Length": end - start + 1 });
        response.end(videoBytes.subarray(start, end + 1));
      } else { response.setHeader("Content-Length", videoBytes.length); response.end(videoBytes); }
    }
    else if (request.url === "/result" && request.method === "POST") {
      let body = ""; for await (const chunk of request) body += chunk;
      finish(JSON.parse(body)); response.end("ok");
    } else if (request.url?.startsWith("/frame/") && request.method === "POST") {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      await writeFile(join(temporary, `frame-${Number(request.url.slice(7))}.png`), Buffer.concat(chunks)); response.end("ok");
    } else {
      response.setHeader("Content-Type", "text/html");
      response.setHeader("Content-Security-Policy", "img-src data:; connect-src 'self'; media-src 'self'");
      response.end(video ? `<!doctype html><video src="/video.mp4" muted preload="auto"></video><script>
        const video=document.querySelector('video'); video.onloadeddata=async()=>{video.onloadeddata=null;video.pause();
          const frames=[]; for(const seconds of [1,3,5,7,9,11,13,14,20,30,45,60,90]) {
            if(seconds>=video.duration) continue;
            await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=seconds;});
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
            canvas.getContext('2d').drawImage(video,0,0);
            const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
            await fetch('/frame/'+seconds,{method:'POST',body:blob});frames.push(seconds);
          }
          await fetch('/result',{method:'POST',body:JSON.stringify({duration:video.duration,frames})});
        };</script>` : '<!doctype html><html><body><script>for(const event of ["error","unhandledrejection"]) window.addEventListener(event,e=>fetch("/result",{method:"POST",body:JSON.stringify({error:"fixture-exception",reason:String(e.message??e.reason)})}));</script><script src="/bundle.js"></script></body></html>');
    }
  } catch { response.statusCode = 500; response.end("fixture error"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
let browserError = "";
const browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--no-proxy-server", `--user-data-dir=${join(temporary, "profile")}`, `http://127.0.0.1:${address.port}/`], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
browser.stderr.on("data", data => { browserError = (browserError + data.toString()).slice(-2000); });
const timeout = setTimeout(() => finish({ error: "browser-timeout", lastRequest, browserError }), 45000);
browser.on("error", () => finish({ error: "browser-unavailable" }));
browser.on("exit", code => finish({ error: "browser-exited", code, lastRequest, browserError }));
try {
  const result = await completed;
  console.log(JSON.stringify({ result, artifacts: temporary }, null, 2));
  if (!Array.isArray(result) ? Boolean(result.error) : result.some(item => !item.passed)) process.exitCode = 1;
} finally { clearTimeout(timeout); browser.kill(); server.closeAllConnections(); server.close(); }
