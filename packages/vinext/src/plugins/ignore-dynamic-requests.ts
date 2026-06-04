import path from "node:path";
import MagicString from "magic-string";
import type { Plugin } from "vite";
import { parseAst } from "vite";

const MODULE_EXTENSIONS = new Set([".cjs", ".mjs", ".js", ".cts", ".mts", ".ts", ".jsx", ".tsx"]);
const DYNAMIC_REQUIRE_HELPER_BASE = "__vinext_ignored_dynamic_require__";

type AstRecord = {
  type: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
};

type TransformResult = {
  code: string;
  map: ReturnType<MagicString["generateMap"]>;
};

type ParserLang = "js" | "jsx" | "ts" | "tsx";

function getObjectProperty(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return null;
  return Reflect.get(value, key);
}

function isAstRecord(value: unknown): value is AstRecord {
  return typeof getObjectProperty(value, "type") === "string";
}

function toAstRecord(value: unknown): AstRecord | null {
  return isAstRecord(value) ? value : null;
}

function astArray(value: unknown): AstRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const node = toAstRecord(entry);
    return node ? [node] : [];
  });
}

function hasRange(node: AstRecord | null): node is AstRecord & { start: number; end: number } {
  return node !== null && typeof node.start === "number" && typeof node.end === "number";
}

function walkAst(value: unknown, visit: (node: AstRecord) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkAst(item, visit);
    }
    return;
  }

  const node = toAstRecord(value);
  if (!node) return;

  visit(node);

  for (const [key, child] of Object.entries(node)) {
    if (key === "parent") continue;
    walkAst(child, visit);
  }
}

function isIdentifierNamed(node: AstRecord | null, name: string): boolean {
  return node?.type === "Identifier" && node.name === name;
}

function firstArgument(node: AstRecord): AstRecord | null {
  return astArray(node.arguments)[0] ?? null;
}

function templateElementHasStaticPart(node: AstRecord): boolean {
  const raw = getObjectProperty(node.value, "raw");
  const cooked = getObjectProperty(node.value, "cooked");
  return (
    (typeof raw === "string" && raw.length > 0) || (typeof cooked === "string" && cooked.length > 0)
  );
}

function requestHasStaticPart(node: AstRecord | null): boolean {
  if (!node) return false;

  if (node.type === "Literal" || node.type === "StringLiteral") {
    return typeof node.value === "string" && node.value.length > 0;
  }

  if (node.type === "TemplateLiteral") {
    return astArray(node.quasis).some(templateElementHasStaticPart);
  }

  if (
    node.type === "BinaryExpression" ||
    node.type === "LogicalExpression" ||
    node.type === "ConditionalExpression"
  ) {
    return (
      requestHasStaticPart(toAstRecord(node.left)) ||
      requestHasStaticPart(toAstRecord(node.right)) ||
      requestHasStaticPart(toAstRecord(node.consequent)) ||
      requestHasStaticPart(toAstRecord(node.alternate))
    );
  }

  return false;
}

function isVeryDynamicRequireCall(node: AstRecord): boolean {
  if (node.type !== "CallExpression") return false;
  if (!isIdentifierNamed(toAstRecord(node.callee), "require")) return false;
  return !requestHasStaticPart(firstArgument(node));
}

function isVeryDynamicImportExpression(node: AstRecord): boolean {
  if (node.type !== "ImportExpression") return false;
  return !requestHasStaticPart(toAstRecord(node.source));
}

function directiveInsertionPoint(body: unknown): number {
  let insertionPoint = 0;

  for (const node of astArray(body)) {
    if (node.type !== "ExpressionStatement") break;
    const expression = toAstRecord(node.expression);
    if (
      expression?.type !== "Literal" ||
      typeof expression.value !== "string" ||
      typeof node.end !== "number"
    ) {
      break;
    }
    insertionPoint = node.end;
  }

  return insertionPoint;
}

function uniqueHelperName(code: string): string {
  let helperName = DYNAMIC_REQUIRE_HELPER_BASE;
  let suffix = 0;

  while (code.includes(helperName)) {
    suffix += 1;
    helperName = `${DYNAMIC_REQUIRE_HELPER_BASE}${suffix}`;
  }

  return helperName;
}

function cleanModuleId(id: string): string {
  return id.split(/[?#]/, 1)[0] ?? id;
}

function parserLangForId(id: string): ParserLang {
  const extension = path.extname(cleanModuleId(id));
  if (extension === ".jsx") return "jsx";
  if (extension === ".ts" || extension === ".tsx" || extension === ".cts" || extension === ".mts") {
    return extension === ".tsx" ? "tsx" : "ts";
  }
  return "js";
}

function isTransformableModuleId(id: string): boolean {
  const cleanId = cleanModuleId(id);
  if (cleanId.includes("/node_modules/")) return false;
  return MODULE_EXTENSIONS.has(path.extname(cleanId));
}

function ignoreVeryDynamicRequests(code: string, id: string): TransformResult | null {
  if (!/\b(?:import|require)\s*\(/.test(code)) return null;

  let ast: ReturnType<typeof parseAst>;
  try {
    ast = parseAst(code, { lang: parserLangForId(id) }, cleanModuleId(id));
  } catch {
    return null;
  }

  const output = new MagicString(code);
  const helperName = uniqueHelperName(code);
  let rewroteRequire = false;
  let changed = false;

  walkAst(ast.body, (node) => {
    if (isVeryDynamicRequireCall(node)) {
      const callee = toAstRecord(node.callee);
      if (!hasRange(callee)) return;
      output.overwrite(callee.start, callee.end, helperName);
      rewroteRequire = true;
      changed = true;
      return;
    }

    if (isVeryDynamicImportExpression(node)) {
      const source = toAstRecord(node.source);
      if (!hasRange(source)) return;
      if (code.slice(node.start ?? 0, source.start).includes("@vite-ignore")) return;
      output.appendLeft(source.start, "/* @vite-ignore */ ");
      changed = true;
    }
  });

  if (!changed) return null;

  if (rewroteRequire) {
    const insertionPoint = directiveInsertionPoint(ast.body);
    output.appendRight(
      insertionPoint,
      `\nfunction ${helperName}(id) {\n  throw new Error("Cannot find module " + String(id));\n}\n`,
    );
  }

  return {
    code: output.toString(),
    map: output.generateMap({ hires: true, source: id }),
  };
}

export function createIgnoreDynamicRequestsPlugin(): Plugin {
  return {
    name: "vinext:ignore-dynamic-requests",
    enforce: "pre",
    transform(code, id) {
      if (!isTransformableModuleId(id)) return null;
      return ignoreVeryDynamicRequests(code, id);
    },
  };
}
