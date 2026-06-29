const fs = require("node:fs");

const workspace = fs.readFileSync("pnpm-workspace.yaml", "utf8");
let inCatalog = false;

for (const line of workspace.split(/\r?\n/)) {
  if (/^\S/.test(line)) {
    inCatalog = line === "catalog:";
    continue;
  }

  if (!inCatalog) {
    continue;
  }

  const vitePlus = line.match(/^\s{2}vite-plus:\s*["']?([^"'\s#]+)["']?/);
  if (vitePlus) {
    process.stdout.write(vitePlus[1]);
    process.exit(0);
  }
}

throw new Error("Missing vite-plus catalog entry in pnpm-workspace.yaml");
