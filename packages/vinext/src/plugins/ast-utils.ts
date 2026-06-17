export type AstRecord = {
  type: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
};

export type AstRange = AstRecord & {
  start: number;
  end: number;
};

const SKIP_CHILD_KEYS = new Set(["type", "parent", "loc", "start", "end"]);

function getObjectProperty(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return null;
  return Reflect.get(value, key);
}

export function isAstRecord(value: unknown): value is AstRecord {
  return typeof getObjectProperty(value, "type") === "string";
}

function toAstRecord(value: unknown): AstRecord | null {
  return isAstRecord(value) ? value : null;
}

export function nodeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function hasRange(node: AstRecord | null): node is AstRange {
  return node !== null && typeof node.start === "number" && typeof node.end === "number";
}

export function isIdentifierNamed(value: unknown, name: string): boolean {
  return isAstRecord(value) && value.type === "Identifier" && value.name === name;
}

export function getAstName(value: unknown): string | null {
  const node = toAstRecord(value);
  if (!node) return null;
  if (node.type === "Identifier" && typeof node.name === "string") return node.name;
  if (typeof node.value === "string") return node.value;
  return null;
}

export function forEachAstChild(node: AstRecord, callback: (child: AstRecord) => void): void {
  for (const [key, value] of Object.entries(node)) {
    if (SKIP_CHILD_KEYS.has(key)) continue;
    const child = toAstRecord(value);
    if (child) {
      callback(child);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const itemNode = toAstRecord(item);
        if (itemNode) callback(itemNode);
      }
    }
  }
}

export function collectBindingNames(pattern: unknown, target: Set<string>): void {
  const node = toAstRecord(pattern);
  if (!node) return;

  switch (node.type) {
    case "Identifier":
      if (typeof node.name === "string") target.add(node.name);
      return;
    case "RestElement":
      collectBindingNames(node.argument, target);
      return;
    case "AssignmentPattern":
      collectBindingNames(node.left, target);
      return;
    case "ArrayPattern":
      for (const element of nodeArray(node.elements)) collectBindingNames(element, target);
      return;
    case "ObjectPattern":
      for (const property of nodeArray(node.properties)) {
        const propertyNode = toAstRecord(property);
        if (!propertyNode) continue;
        collectBindingNames(
          propertyNode.type === "Property" ? propertyNode.value : propertyNode.argument,
          target,
        );
      }
      return;
    case "Property":
      collectBindingNames(node.value, target);
      return;
  }
}

export function getBindingsInScope(scopeNode: AstRecord): Set<string> {
  const bindings = new Set<string>();

  // 1. Collect parameters if scopeNode is a function
  if (
    scopeNode.type === "FunctionDeclaration" ||
    scopeNode.type === "FunctionExpression" ||
    scopeNode.type === "ArrowFunctionExpression"
  ) {
    if (scopeNode.id && scopeNode.type === "FunctionExpression") {
      const name = getAstName(scopeNode.id);
      if (name) bindings.add(name);
    }
    for (const param of nodeArray(scopeNode.params)) {
      collectBindingNames(param, bindings);
    }
  }

  // 2. Collect catch param if scopeNode is a CatchClause
  if (scopeNode.type === "CatchClause") {
    if (scopeNode.param) {
      collectBindingNames(scopeNode.param, bindings);
    }
  }

  // 3. Collect loop variables if scopeNode is a loop
  if (scopeNode.type === "ForStatement") {
    const init = scopeNode.init as AstRecord | null;
    if (init && init.type === "VariableDeclaration") {
      for (const decl of nodeArray(init.declarations)) {
        if (isAstRecord(decl)) collectBindingNames(decl.id, bindings);
      }
    }
  }
  if (scopeNode.type === "ForInStatement" || scopeNode.type === "ForOfStatement") {
    const left = scopeNode.left as AstRecord | null;
    if (left && left.type === "VariableDeclaration") {
      for (const decl of nodeArray(left.declarations)) {
        if (isAstRecord(decl)) collectBindingNames(decl.id, bindings);
      }
    }
  }

  // 4. Traverse the scopeNode's body to collect declared variables/functions/classes,
  // but do NOT cross nested scope boundaries (like nested functions, classes).
  function walk(node: AstRecord) {
    if (node.type === "FunctionDeclaration") {
      const name = getAstName(node.id);
      if (name) bindings.add(name);
      return; // Do not traverse inside nested function
    }
    if (node.type === "ClassDeclaration") {
      const name = getAstName(node.id);
      if (name) bindings.add(name);
      return; // Do not traverse inside nested class
    }
    if (
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression" ||
      node.type === "ClassExpression"
    ) {
      return; // Expression bindings do not declare anything in the outer scope.
    }

    if (node.type === "VariableDeclaration") {
      for (const decl of nodeArray(node.declarations)) {
        if (isAstRecord(decl)) {
          collectBindingNames(decl.id, bindings);
        }
      }
    }

    forEachAstChild(node, walk);
  }

  if (
    scopeNode.type === "FunctionDeclaration" ||
    scopeNode.type === "FunctionExpression" ||
    scopeNode.type === "ArrowFunctionExpression"
  ) {
    if (isAstRecord(scopeNode.body)) {
      walk(scopeNode.body);
    }
  } else if (scopeNode.type === "BlockStatement") {
    for (const stmt of nodeArray(scopeNode.body)) {
      if (isAstRecord(stmt)) walk(stmt);
    }
  } else if (scopeNode.type === "CatchClause") {
    if (isAstRecord(scopeNode.body)) walk(scopeNode.body);
  } else {
    forEachAstChild(scopeNode, walk);
  }

  return bindings;
}
