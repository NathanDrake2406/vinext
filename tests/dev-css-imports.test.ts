import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { collectDevCssHrefsForFiles } from "../packages/vinext/src/server/dev-css-imports.js";

describe("dev CSS import discovery", () => {
  it("collects static CSS imports from TSX source without matching comments or strings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-dev-css-"));
    try {
      const appDir = path.join(root, "src", "app");
      await fs.mkdir(appDir, { recursive: true });
      const layoutPath = path.join(appDir, "layout.tsx");
      await fs.writeFile(
        layoutPath,
        `import "#/app/globals.css";
import styles from "./card.module.css?used";
export { default as theme } from "./theme.module.css";
import "./skip.css?raw";

const ignored = "import './string.css'";
// import "./comment.css";
/* import "./block.css"; */

export default function Layout({ children }: { children: React.ReactNode }) {
  return <main className={styles.card}>{children}</main>;
}
`,
      );

      const hrefs = await collectDevCssHrefsForFiles([layoutPath], {
        projectRoot: root,
        aliases: { "#": path.join(root, "src") },
      });

      expect(hrefs).toEqual([
        "/src/app/globals.css",
        "/src/app/card.module.css?used",
        "/src/app/theme.module.css",
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it("uses the resolver fallback for bare package CSS", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-dev-css-"));
    try {
      const appDir = path.join(root, "app");
      const packageDir = path.join(root, "node_modules", "pkg");
      await fs.mkdir(appDir, { recursive: true });
      await fs.mkdir(packageDir, { recursive: true });
      const pagePath = path.join(appDir, "page.tsx");
      const cssPath = path.join(packageDir, "styles.css");
      await fs.writeFile(pagePath, `import "pkg/styles.css";\nexport default function Page() {}`);
      await fs.writeFile(cssPath, `.pkg { color: red; }`);

      const hrefs = await collectDevCssHrefsForFiles([pagePath], {
        projectRoot: root,
        aliases: {},
        async resolve(specifier) {
          return specifier === "pkg/styles.css" ? cssPath : null;
        },
      });

      expect(hrefs).toEqual(["/node_modules/pkg/styles.css"]);
    } finally {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
