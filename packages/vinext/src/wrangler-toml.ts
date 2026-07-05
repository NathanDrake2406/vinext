import type { CloudflareInitOptions } from "./init-platform.js";

type TomlAssignment = {
  key: string;
  valueStart: number;
  valueEnd: number;
  value: string;
};

type TomlSection = {
  name: string;
  isArray: boolean;
  bodyStart: number;
  bodyEnd: number;
};

export type WranglerTomlConfigUpdate = {
  code: string;
  imagesBinding: string;
  needsKvNamespaceId: boolean;
};

// Source-preserving Wrangler TOML edits are intentionally narrow. Supported
// owned shapes are inline tables, normal tables, and KV array tables; other
// valid TOML shapes are rejected before mutation so init does not duplicate
// fields it does not understand.
function stripTomlLineComment(line: string): string {
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = undefined;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#") return line.slice(0, index);
  }
  return line;
}

function parseTomlHeader(line: string): { name: string; isArray: boolean } | undefined {
  const trimmed = stripTomlLineComment(line).trim();
  const match = trimmed.match(/^(\[\[?)\s*([^[\]]+?)\s*(\]\]?)$/);
  if (!match) return undefined;
  const isArray = match[1] === "[[";
  if (isArray !== (match[3] === "]]")) return undefined;
  return { name: match[2].trim(), isArray };
}

function forEachTomlLine(
  code: string,
  callback: (line: string, lineStart: number, lineEnd: number) => void,
): void {
  let lineStart = 0;
  while (lineStart <= code.length) {
    const newline = code.indexOf("\n", lineStart);
    const lineEndWithoutNewline = newline === -1 ? code.length : newline;
    const lineEnd = newline === -1 ? code.length : newline + 1;
    callback(code.slice(lineStart, lineEndWithoutNewline), lineStart, lineEnd);
    if (newline === -1) break;
    lineStart = newline + 1;
  }
}

function findFirstTomlSectionStart(code: string): number | undefined {
  let firstSectionStart: number | undefined;
  forEachTomlLine(code, (line, lineStart) => {
    if (firstSectionStart !== undefined) return;
    if (parseTomlHeader(line)) firstSectionStart = lineStart;
  });
  return firstSectionStart;
}

function findTomlSections(code: string, name: string, isArray: boolean): TomlSection[] {
  const sections: TomlSection[] = [];
  let current: TomlSection | undefined;
  forEachTomlLine(code, (line, lineStart, lineEnd) => {
    const header = parseTomlHeader(line);
    if (!header) return;
    if (current) {
      current.bodyEnd = lineStart;
      sections.push(current);
    }
    current = {
      name: header.name,
      isArray: header.isArray,
      bodyStart: lineEnd,
      bodyEnd: code.length,
    };
  });
  if (current) sections.push(current);
  return sections.filter((section) => section.name === name && section.isArray === isArray);
}

function findUnquotedEquals(line: string): number | undefined {
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = undefined;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "=") return index;
  }
  return undefined;
}

function parseTomlKeyPart(part: string): string | undefined {
  const trimmed = part.trim();
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return undefined;
}

function parseTomlKeyPath(key: string): string[] | undefined {
  const parts: string[] = [];
  let partStart = 0;
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (let index = 0; index <= key.length; index++) {
    const char = key[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = undefined;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char !== "." && index !== key.length) continue;

    const part = parseTomlKeyPart(key.slice(partStart, index));
    if (part === undefined) return undefined;
    parts.push(part);
    partStart = index + 1;
  }
  return quote ? undefined : parts;
}

function parseTomlAssignmentLine(line: string):
  | {
      key: string;
      valueStart: number;
      valueEnd: number;
      value: string;
    }
  | undefined {
  const uncommented = stripTomlLineComment(line);
  const equalsIndex = findUnquotedEquals(uncommented);
  if (equalsIndex === undefined) return undefined;

  const key = uncommented.slice(0, equalsIndex).trim();
  if (!key) return undefined;

  let valueStart = equalsIndex + 1;
  while (/\s/.test(uncommented[valueStart] ?? "")) valueStart++;
  let valueEnd = uncommented.length;
  while (valueEnd > valueStart && /\s/.test(uncommented[valueEnd - 1])) valueEnd--;

  return {
    key,
    valueStart,
    valueEnd,
    value: uncommented.slice(valueStart, valueEnd),
  };
}

function findTomlAssignmentInRange(
  code: string,
  name: string,
  start: number,
  end: number,
): TomlAssignment | undefined {
  let match: TomlAssignment | undefined;
  forEachTomlLine(code.slice(start, end), (line, relativeLineStart) => {
    if (match) return;
    const assignment = parseTomlAssignmentLine(line);
    if (!assignment) return;
    const keyPath = parseTomlKeyPath(assignment.key);
    if (!keyPath || keyPath.length !== 1 || keyPath[0] !== name) return;

    match = {
      key: assignment.key,
      valueStart: start + relativeLineStart + assignment.valueStart,
      valueEnd: start + relativeLineStart + assignment.valueEnd,
      value: assignment.value,
    };
  });
  return match;
}

function findTopLevelTomlAssignment(code: string, name: string): TomlAssignment | undefined {
  return findTomlAssignmentInRange(code, name, 0, findFirstTomlSectionStart(code) ?? code.length);
}

function findTopLevelTomlDottedAssignment(
  code: string,
  rootName: string,
): TomlAssignment | undefined {
  let match: TomlAssignment | undefined;
  const end = findFirstTomlSectionStart(code) ?? code.length;
  forEachTomlLine(code.slice(0, end), (line, relativeLineStart) => {
    if (match) return;
    const assignment = parseTomlAssignmentLine(line);
    if (!assignment) return;
    const keyPath = parseTomlKeyPath(assignment.key);
    if (!keyPath || keyPath.length < 2 || keyPath[0] !== rootName) return;

    match = {
      key: assignment.key,
      valueStart: relativeLineStart + assignment.valueStart,
      valueEnd: relativeLineStart + assignment.valueEnd,
      value: assignment.value,
    };
  });
  return match;
}

function parseTomlString(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return undefined;
}

function parseTomlBoolean(value: string): boolean | undefined {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return undefined;
}

function isInlineTomlObject(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
}

function findInlineTomlProperty(
  value: string,
  name: string,
): { valueStart: number; valueEnd: number; value: string } | undefined {
  const open = value.indexOf("{");
  const close = value.lastIndexOf("}");
  if (open < 0 || close < open) return undefined;

  let cursor = open + 1;
  while (cursor < close) {
    while (/[\s,]/.test(value[cursor] ?? "") && cursor < close) cursor++;
    if (cursor >= close) break;

    const keyStart = cursor;
    while (/[A-Za-z0-9_-]/.test(value[cursor] ?? "")) cursor++;
    const key = value.slice(keyStart, cursor);
    while (/\s/.test(value[cursor] ?? "") && cursor < close) cursor++;
    if (value[cursor] !== "=") return undefined;
    cursor++;
    while (/\s/.test(value[cursor] ?? "") && cursor < close) cursor++;

    const valueStart = cursor;
    let quote: "'" | '"' | undefined;
    let escaped = false;
    let nestedDepth = 0;
    for (; cursor < close; cursor++) {
      const char = value[cursor];
      if (quote === '"') {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quote = undefined;
        continue;
      }
      if (quote === "'") {
        if (char === "'") quote = undefined;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
      } else if (char === "{" || char === "[") {
        nestedDepth++;
      } else if (char === "}" || char === "]") {
        if (nestedDepth > 0) nestedDepth--;
      } else if (char === "," && nestedDepth === 0) {
        break;
      }
    }
    let valueEnd = cursor;
    while (valueEnd > valueStart && /\s/.test(value[valueEnd - 1])) valueEnd--;
    if (key === name) {
      return {
        valueStart,
        valueEnd,
        value: value.slice(valueStart, valueEnd),
      };
    }
    if (value[cursor] === ",") cursor++;
  }
  return undefined;
}

function addInlineTomlProperty(value: string, property: string): string {
  const close = value.lastIndexOf("}");
  if (close < 0) throw new Error("Expected an inline TOML object.");
  const open = value.indexOf("{");
  const content = value.slice(open + 1, close);
  const separator =
    content.trim().length > 0 ? `${content.trimEnd().endsWith(",") ? "" : ","} ` : " ";
  return `${value.slice(0, close)}${separator}${property} ${value.slice(close)}`;
}

function replaceTomlAssignmentValue(
  code: string,
  assignment: TomlAssignment,
  value: string,
): string {
  return `${code.slice(0, assignment.valueStart)}${value}${code.slice(assignment.valueEnd)}`;
}

function appendTomlTopLevelAssignment(code: string, assignment: string): string {
  const firstSectionStart = findFirstTomlSectionStart(code);
  if (firstSectionStart === undefined) {
    const separator = code.length === 0 || code.endsWith("\n") ? "" : "\n";
    return `${code}${separator}${assignment}\n`;
  }

  let before = code.slice(0, firstSectionStart);
  const after = code.slice(firstSectionStart);
  if (before.length > 0 && !before.endsWith("\n")) before += "\n";
  const separatorBefore = before.trim().length > 0 && !before.endsWith("\n\n") ? "\n" : "";
  const separatorAfter = after.length > 0 ? "\n" : "";
  return `${before}${separatorBefore}${assignment}\n${separatorAfter}${after}`;
}

function appendTomlArrayTable(code: string, table: string): string {
  const separator =
    code.length === 0 ? "" : code.endsWith("\n\n") ? "" : code.endsWith("\n") ? "\n" : "\n\n";
  return `${code}${separator}${table}\n`;
}

function setInlineTomlPropertyValue(
  code: string,
  assignment: TomlAssignment,
  name: string,
  value: string,
): string {
  const property = findInlineTomlProperty(assignment.value, name);
  if (property) {
    return `${code.slice(0, assignment.valueStart + property.valueStart)}${value}${code.slice(
      assignment.valueStart + property.valueEnd,
    )}`;
  }
  return replaceTomlAssignmentValue(
    code,
    assignment,
    addInlineTomlProperty(assignment.value, `${name} = ${value}`),
  );
}

function setTomlTableAssignmentValue(
  code: string,
  section: TomlSection,
  name: string,
  value: string,
): string {
  const assignment = findTomlAssignmentInRange(code, name, section.bodyStart, section.bodyEnd);
  if (assignment) return replaceTomlAssignmentValue(code, assignment, value);

  const insertion = `${name} = ${value}\n`;
  return `${code.slice(0, section.bodyEnd)}${code[section.bodyEnd - 1] === "\n" ? "" : "\n"}${insertion}${code.slice(section.bodyEnd)}`;
}

function ensureTomlCacheEnabled(code: string): string {
  if (findTopLevelTomlDottedAssignment(code, "cache")) {
    throw new Error("Wrangler TOML uses unsupported dotted cache keys.");
  }

  const inlineCache = findTopLevelTomlAssignment(code, "cache");
  const tableCache = findTomlSections(code, "cache", false)[0];
  if (inlineCache && tableCache) throw new Error("Wrangler TOML defines cache twice.");

  if (inlineCache) {
    if (!isInlineTomlObject(inlineCache.value)) {
      throw new Error("Expected top-level cache to be a TOML object.");
    }
    const enabled = findInlineTomlProperty(inlineCache.value, "enabled");
    if (enabled && parseTomlBoolean(enabled.value) === true) return code;
    return setInlineTomlPropertyValue(code, inlineCache, "enabled", "true");
  }

  if (tableCache) {
    const enabled = findTomlAssignmentInRange(
      code,
      "enabled",
      tableCache.bodyStart,
      tableCache.bodyEnd,
    );
    if (enabled && parseTomlBoolean(enabled.value) === true) return code;
    return setTomlTableAssignmentValue(code, tableCache, "enabled", "true");
  }

  return appendTomlTopLevelAssignment(code, "cache = { enabled = true }");
}

function getWranglerTomlImagesBinding(code: string): string {
  const inlineImages = findTopLevelTomlAssignment(code, "images");
  if (inlineImages && isInlineTomlObject(inlineImages.value)) {
    const binding = findInlineTomlProperty(inlineImages.value, "binding");
    const value = binding ? parseTomlString(binding.value) : undefined;
    if (value) return value;
  }

  const tableImages = findTomlSections(code, "images", false)[0];
  if (tableImages) {
    const binding = findTomlAssignmentInRange(
      code,
      "binding",
      tableImages.bodyStart,
      tableImages.bodyEnd,
    );
    const value = binding ? parseTomlString(binding.value) : undefined;
    if (value) return value;
  }

  return "IMAGES";
}

function ensureTomlImagesBinding(code: string): string {
  if (findTopLevelTomlDottedAssignment(code, "images")) {
    throw new Error("Wrangler TOML uses unsupported dotted images keys.");
  }

  const inlineImages = findTopLevelTomlAssignment(code, "images");
  const tableImages = findTomlSections(code, "images", false)[0];
  if (inlineImages && tableImages) throw new Error("Wrangler TOML defines images twice.");

  if (inlineImages) {
    if (!isInlineTomlObject(inlineImages.value)) {
      throw new Error("Expected top-level images to be a TOML object.");
    }
    const binding = findInlineTomlProperty(inlineImages.value, "binding");
    const value = binding ? parseTomlString(binding.value) : undefined;
    if (value) return code;
    return setInlineTomlPropertyValue(code, inlineImages, "binding", '"IMAGES"');
  }

  if (tableImages) {
    const binding = findTomlAssignmentInRange(
      code,
      "binding",
      tableImages.bodyStart,
      tableImages.bodyEnd,
    );
    const value = binding ? parseTomlString(binding.value) : undefined;
    if (value) return code;
    return setTomlTableAssignmentValue(code, tableImages, "binding", '"IMAGES"');
  }

  return appendTomlTopLevelAssignment(code, 'images = { binding = "IMAGES" }');
}

function findTomlKvNamespaceSection(code: string): TomlSection | undefined {
  return findTomlSections(code, "kv_namespaces", true).find((section) => {
    const binding = findTomlAssignmentInRange(code, "binding", section.bodyStart, section.bodyEnd);
    return binding ? parseTomlString(binding.value) === "VINEXT_KV_CACHE" : false;
  });
}

function ensureTomlKvNamespace(code: string): string {
  if (findTopLevelTomlAssignment(code, "kv_namespaces")) {
    throw new Error("Wrangler TOML uses unsupported inline kv_namespaces.");
  }
  if (findTopLevelTomlDottedAssignment(code, "kv_namespaces")) {
    throw new Error("Wrangler TOML uses unsupported dotted kv_namespaces keys.");
  }
  if (findTomlKvNamespaceSection(code)) return code;
  return appendTomlArrayTable(
    code,
    '[[kv_namespaces]]\nbinding = "VINEXT_KV_CACHE"\nid = "<your-kv-namespace-id>"',
  );
}

function tomlKvNamespaceNeedsId(code: string): boolean {
  const section = findTomlKvNamespaceSection(code);
  if (!section) return true;
  const id = findTomlAssignmentInRange(code, "id", section.bodyStart, section.bodyEnd);
  const value = id ? parseTomlString(id.value) : undefined;
  return !value || value === "<your-kv-namespace-id>";
}

export function updateWranglerTomlConfigForCloudflare(
  code: string,
  options: CloudflareInitOptions,
): WranglerTomlConfigUpdate {
  let output = code;
  if (options.cdnCache === "workers-cache") {
    output = ensureTomlCacheEnabled(output);
  }
  if (options.imageOptimization === "cloudflare-images") {
    output = ensureTomlImagesBinding(output);
  }
  if (options.dataCache === "kv") {
    output = ensureTomlKvNamespace(output);
  }
  return {
    code: output,
    imagesBinding: getWranglerTomlImagesBinding(output),
    needsKvNamespaceId: options.dataCache === "kv" && tomlKvNamespaceNeedsId(output),
  };
}
