// Local-only acceptance server: emulate Workers' static assets and _headers.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const headers = Object.fromEntries(
  (await readFile(resolve(root, "_headers"), "utf8")).split("\n")
    .filter(line => /^\s+[^:]+:/.test(line)).map(line => {
      const split = line.indexOf(":");
      return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
    }),
);
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const target = resolve(root, `.${path === "/" ? "/index.html" : path}`);
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403).end(); return;
    }
    const body = await readFile(target);
    res.writeHead(200, { ...headers, "Content-Type": types[extname(target)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(4179, "127.0.0.1");
