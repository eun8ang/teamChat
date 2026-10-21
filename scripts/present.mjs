import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../docs/", import.meta.url);
const routes = new Map([
  ["/", ["presenter.html", "text/html; charset=utf-8"]],
  ["/presenter.html", ["presenter.html", "text/html; charset=utf-8"]],
  ["/git-flow.en.svg", ["git-flow.en.svg", "image/svg+xml"]],
  ["/git-flow.svg", ["git-flow.svg", "image/svg+xml"]],
]);
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/presenter.en.html") {
    response.writeHead(302, { Location: "/?lang=en" }).end();
    return;
  }
  const route = routes.get(url.pathname);
  if (!route) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const body = await readFile(fileURLToPath(new URL(route[0], root)));
    response.writeHead(200, { "Content-Type": route[1], "Cache-Control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(500).end("Presentation file unavailable");
  }
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(4173, "127.0.0.1", () => {
  console.log("Presentation / 발표 화면: http://127.0.0.1:4173");
  console.log("Language / 언어: 한국어 ↔ English (top toolbar)");
  console.log("Stop / 종료: Ctrl+C");
});
