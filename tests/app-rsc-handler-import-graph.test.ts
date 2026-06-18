import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vite-plus/test";

const OPTIONAL_BRANCH_MODULES = [
  "./app-prerender-endpoints.js",
  "./image-optimization.js",
  "./implicit-tags.js",
  "./metadata-route-response.js",
  "./pages-data-route.js",
] as const;

type ImportGraph = {
  dynamicImports: Set<string>;
  staticValueImports: Set<string>;
};

function stringLiteralText(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function collectImportGraph(source: string): ImportGraph {
  const sourceFile = ts.createSourceFile(
    "app-rsc-handler.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const staticValueImports = new Set<string>();
  const dynamicImports = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
    const specifier = stringLiteralText(statement.moduleSpecifier);
    if (specifier) staticValueImports.add(specifier);
  }

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = stringLiteralText(node.arguments[0]);
      if (specifier) dynamicImports.add(specifier);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { dynamicImports, staticValueImports };
}

describe("App RSC handler import graph", () => {
  it("keeps optional App Router branches out of the cold-start import graph", () => {
    const source = readFileSync(
      new URL("../packages/vinext/src/server/app-rsc-handler.ts", import.meta.url),
      "utf8",
    );
    const imports = collectImportGraph(source);

    for (const specifier of OPTIONAL_BRANCH_MODULES) {
      expect(imports.staticValueImports.has(specifier), specifier).toBe(false);
      expect(imports.dynamicImports.has(specifier), specifier).toBe(true);
    }
  });
});
