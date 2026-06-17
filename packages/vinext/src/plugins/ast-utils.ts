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

// Add every name bound by a VariableDeclaration's declarators (handles
// destructuring patterns) to the target set.
function addDeclarationBindings(declaration: AstRecord, target: Set<string>): void {
  for (const decl of nodeArray(declaration.declarations)) {
    if (isAstRecord(decl)) collectBindingNames(decl.id, target);
  }
}

function isFunctionScopeNode(node: AstRecord): boolean {
  switch (node.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "Program":
      return true;
    default:
      return false;
  }
}

// `var` is function-scoped: a `var` declared inside nested blocks/loops/switch/
// catch belongs to the nearest enclosing function (or the module/program), not
// the block. Collect those hoisted `var` names without crossing into nested
// function scopes (whose own `var`s belong to them) or claiming block-scoped
// `let`/`const`/`class`.
function collectHoistedVars(node: AstRecord, target: Set<string>): void {
  switch (node.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "ClassDeclaration":
    case "ClassExpression":
      return;
    case "VariableDeclaration":
      if (node.kind === "var") addDeclarationBindings(node, target);
      return;
    default:
      forEachAstChild(node, (child) => collectHoistedVars(child, target));
  }
}

export function getBindingsInScope(scopeNode: AstRecord): Set<string> {
  const bindings = new Set<string>();

  // Only function/program scopes own hoisted `var`s. A block scope leaves its
  // nested `var`s to the enclosing function.
  const isFunctionScope = isFunctionScopeNode(scopeNode);

  // 1. Collect the bindings the scope node itself introduces: function params,
  //    a named function expression, a catch param, or loop-header variables.
  switch (scopeNode.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression": {
      if (scopeNode.type === "FunctionExpression" && scopeNode.id) {
        const name = getAstName(scopeNode.id);
        if (name) bindings.add(name);
      }
      for (const param of nodeArray(scopeNode.params)) {
        collectBindingNames(param, bindings);
      }
      break;
    }
    case "CatchClause":
      if (scopeNode.param) collectBindingNames(scopeNode.param, bindings);
      break;
    case "ForStatement": {
      const init = scopeNode.init as AstRecord | null;
      if (init && init.type === "VariableDeclaration") addDeclarationBindings(init, bindings);
      break;
    }
    case "ForInStatement":
    case "ForOfStatement": {
      const left = scopeNode.left as AstRecord | null;
      if (left && left.type === "VariableDeclaration") addDeclarationBindings(left, bindings);
      break;
    }
  }

  // 2. Traverse the scopeNode's body to collect declared variables/functions/
  //    classes, but do NOT cross nested scope boundaries.
  function walk(node: AstRecord) {
    switch (node.type) {
      case "FunctionDeclaration":
      case "ClassDeclaration": {
        // The name binds the outer scope; the body is a nested scope we skip.
        const name = getAstName(node.id);
        if (name) bindings.add(name);
        return;
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression":
      case "ClassExpression":
        return; // Expression bindings declare nothing in the outer scope.
      case "BlockStatement":
      case "CatchClause":
      case "ForStatement":
      case "ForInStatement":
      case "ForOfStatement":
      case "SwitchStatement":
        // Separate lexical scopes: their `let`/`const`/`class`/function
        // declarations stay local. But `var` is function-scoped, so a
        // function/program scope still hoists nested `var`s out of them.
        if (isFunctionScope) collectHoistedVars(node, bindings);
        return;
      case "VariableDeclaration":
        addDeclarationBindings(node, bindings);
        return;
      default:
        forEachAstChild(node, walk);
    }
  }

  const body = scopeNode.body;
  if (isAstRecord(body) && body.type === "BlockStatement") {
    for (const stmt of nodeArray(body.body)) {
      if (isAstRecord(stmt)) walk(stmt);
    }
  } else if (Array.isArray(body)) {
    for (const stmt of body) {
      if (isAstRecord(stmt)) walk(stmt);
    }
  } else if (isAstRecord(body)) {
    walk(body);
  } else {
    forEachAstChild(scopeNode, walk);
  }

  return bindings;
}
