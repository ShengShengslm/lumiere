import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = resolve(process.cwd());
const output = resolve(root, "dist");
const files = [
  "index.html", "app.js", "api.js", "voice-call.js", "push-notifications.js", "real-ui.js", "ombre-dashboard-ui.js", "journal-ui.js", "pet.js", "service-worker.js", "manifest.webmanifest",
  "app-icon-512.png", "app-icon.svg", "apple-touch-icon.png", "apple-touch-icon-152.png", "apple-touch-icon-167.png"
];
const css = (await import("node:fs/promises")).readdir(root).then((names) => names.filter((name) => name.endsWith(".css")));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of [...files, ...(await css)]) await cp(resolve(root, file), resolve(output, basename(file)));
await cp(resolve(root, "pet-assets"), resolve(output, "pet-assets"), { recursive: true });
await cp(resolve(root, "journal-assets"), resolve(output, "journal-assets"), { recursive: true });
await cp(resolve(root, "third-party"), resolve(output, "third-party"), { recursive: true });
await cp(resolve(root, "THIRD_PARTY_NOTICES.md"), resolve(output, "THIRD_PARTY_NOTICES.md"));
const apiBase = process.env.PUBLIC_API_BASE_URL || "/api";
await writeFile(resolve(output, "config.js"), `window.LUMIERE_CONFIG = ${JSON.stringify({ API_BASE_URL: apiBase })};\n`, "utf8");
const html = await readFile(resolve(output, "index.html"), "utf8");
await writeFile(resolve(output, "index.html"), html, "utf8");
console.log(`Built ${output} with API ${apiBase}`);
