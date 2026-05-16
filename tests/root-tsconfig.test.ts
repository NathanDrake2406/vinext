import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const rootTsconfig = path.join(repoRoot, "tsconfig.json");

function loadRootTsconfigFileNames(): string[] {
  const config = ts.readConfigFile(rootTsconfig, (fileName) => ts.sys.readFile(fileName));
  if (config.error) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  }

  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repoRoot);
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
        .join("\n"),
    );
  }

  return parsed.fileNames.map((fileName) =>
    path.relative(repoRoot, fileName).replaceAll(path.sep, "/"),
  );
}

describe("root tsconfig scope", () => {
  it("keeps independent app files and package build output outside the root project", () => {
    const fileNames = loadRootTsconfigFileNames();

    expect(fileNames).toContain("packages/vinext/src/index.ts");
    expect(fileNames).toContain("tests/root-tsconfig.test.ts");
    expect(fileNames).toContain("vite.config.ts");
    expect(fileNames.some((fileName) => fileName.startsWith("apps/"))).toBe(false);
    expect(fileNames.some((fileName) => fileName.startsWith("packages/vinext/dist/"))).toBe(false);
    expect(fileNames.some((fileName) => fileName.startsWith(".claude/"))).toBe(false);
    expect(fileNames.some((fileName) => fileName.startsWith(".worktrees/"))).toBe(false);
  });
});
