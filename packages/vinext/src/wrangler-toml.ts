import type { CloudflareInitOptions } from "./init-platform.js";

type TomlAssignment = {
  valueStart: number;
  valueEnd: number;
  value: string;
};

type TomlSection = {
  bodyStart: number;
  bodyEnd: number;
};

export type WranglerTomlConfigUpdate = {
  code: string;
  imagesBinding: string;
  needsKvNamespaceId: boolean;
};

// This is not a general TOML editor. It only patches Wrangler fields owned by
// vinext init when their syntax can be updated in place without rewriting the
// user's config. Other owned shapes are rejected before mutation.
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

function parseTomlHeader(line: string): { name: string; isArray: boolean } | undefined {
  const trimmed = stripTomlLineComment(line).trim();
  const match = trimmed.match(/^(\[\[?)\s*([^[\]]+?)\s*(\]\]?)$/);
  if (!match) return undefined;
  const isArray = match[1] === "[[";
  if (isArray !== (match[3] === "]]")) return undefined;
  return { name: match[2].trim(), isArray };
}

function findFirstTomlSectionStart(code: string): number | undefined {
  let firstSectionStart: number | undefined;
  forEachTomlLine(code, (line, lineStart) => {
    if (firstSectionStart !== undefined) return;
    if (parseTomlHeader(line)) firstSectionStart = lineStart;
  });
  return firstSectionStart;
}

function findTopLevelTomlAssignment(code: string, name: string): TomlAssignment | undefined {
  const topLevelEnd = findFirstTomlSectionStart(code) ?? code.length;
  let match: TomlAssignment | undefined;
  const pattern = new RegExp(`^\\s*${name}\\s*=`);
  forEachTomlLine(code.slice(0, topLevelEnd), (line, lineStart) => {
    if (match) return;
    const uncommented = stripTomlLineComment(line);
    if (!pattern.test(uncommented)) return;
    const equals = uncommented.indexOf("=");
    let valueStart = equals + 1;
    while (/\s/.test(uncommented[valueStart] ?? "")) valueStart++;
    let valueEnd = uncommented.length;
    while (valueEnd > valueStart && /\s/.test(uncommented[valueEnd - 1])) valueEnd--;
    match = {
      valueStart: lineStart + valueStart,
      valueEnd: lineStart + valueEnd,
      value: uncommented.slice(valueStart, valueEnd),
    };
  });
  return match;
}

function hasTopLevelDottedKey(code: string, name: string): boolean {
  const topLevelEnd = findFirstTomlSectionStart(code) ?? code.length;
  const pattern = new RegExp(`^\\s*${name}\\s*\\.`);
  let found = false;
  forEachTomlLine(code.slice(0, topLevelEnd), (line) => {
    if (found) return;
    found = pattern.test(stripTomlLineComment(line));
  });
  return found;
}

function findTomlSections(code: string, name: string, isArray: boolean): TomlSection[] {
  const sections: Array<TomlSection & { name: string; isArray: boolean }> = [];
  let current: (TomlSection & { name: string; isArray: boolean }) | undefined;
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

function findTomlAssignmentInSection(
  code: string,
  section: TomlSection,
  name: string,
): TomlAssignment | undefined {
  let match: TomlAssignment | undefined;
  const pattern = new RegExp(`^\\s*${name}\\s*=`);
  forEachTomlLine(code.slice(section.bodyStart, section.bodyEnd), (line, lineStart) => {
    if (match) return;
    const uncommented = stripTomlLineComment(line);
    if (!pattern.test(uncommented)) return;
    const equals = uncommented.indexOf("=");
    let valueStart = equals + 1;
    while (/\s/.test(uncommented[valueStart] ?? "")) valueStart++;
    let valueEnd = uncommented.length;
    while (valueEnd > valueStart && /\s/.test(uncommented[valueEnd - 1])) valueEnd--;
    match = {
      valueStart: section.bodyStart + lineStart + valueStart,
      valueEnd: section.bodyStart + lineStart + valueEnd,
      value: uncommented.slice(valueStart, valueEnd),
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

function findInlineTomlProperty(
  value: string,
  name: string,
): { valueStart: number; valueEnd: number; value: string } | undefined {
  const open = value.indexOf("{");
  const close = value.lastIndexOf("}");
  if (open < 0 || close < open) return undefined;

  const pattern = new RegExp(
    `(?:^|,)\\s*${name}\\s*=\\s*("[^"\\\\]*(?:\\\\.[^"\\\\]*)*"|'[^']*'|true|false)`,
    "g",
  );
  const inner = value.slice(open + 1, close);
  const match = pattern.exec(inner);
  if (!match || match.index === undefined) return undefined;

  const rawValue = match[1];
  const propertyValueStart = open + 1 + match.index + match[0].lastIndexOf(rawValue);
  return {
    valueStart: propertyValueStart,
    valueEnd: propertyValueStart + rawValue.length,
    value: rawValue,
  };
}

function isInlineTomlObject(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
}

function replaceTomlAssignmentValue(
  code: string,
  assignment: TomlAssignment,
  value: string,
): string {
  return `${code.slice(0, assignment.valueStart)}${value}${code.slice(assignment.valueEnd)}`;
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

  const close = assignment.value.lastIndexOf("}");
  if (close < 0) throw new Error("Expected an inline TOML object.");
  const beforeClose = assignment.value.slice(0, close);
  const separator = beforeClose.trim().endsWith("{") ? " " : ", ";
  return replaceTomlAssignmentValue(
    code,
    assignment,
    `${beforeClose}${separator}${name} = ${value} }`,
  );
}

function setTomlTableAssignmentValue(
  code: string,
  section: TomlSection,
  name: string,
  value: string,
): string {
  const assignment = findTomlAssignmentInSection(code, section, name);
  if (assignment) return replaceTomlAssignmentValue(code, assignment, value);

  const insertion = `${name} = ${value}\n`;
  return `${code.slice(0, section.bodyEnd)}${code[section.bodyEnd - 1] === "\n" ? "" : "\n"}${insertion}${code.slice(section.bodyEnd)}`;
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

function singleTomlTable(code: string, name: string): TomlSection | undefined {
  const sections = findTomlSections(code, name, false);
  if (sections.length > 1) throw new Error(`Wrangler TOML defines ${name} twice.`);
  return sections[0];
}

function ensureTomlCacheEnabled(code: string): string {
  if (hasTopLevelDottedKey(code, "cache")) {
    throw new Error("Wrangler TOML uses unsupported dotted cache keys.");
  }

  const inlineCache = findTopLevelTomlAssignment(code, "cache");
  const tableCache = singleTomlTable(code, "cache");
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
    const enabled = findTomlAssignmentInSection(code, tableCache, "enabled");
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

  const tableImages = singleTomlTable(code, "images");
  if (tableImages) {
    const binding = findTomlAssignmentInSection(code, tableImages, "binding");
    const value = binding ? parseTomlString(binding.value) : undefined;
    if (value) return value;
  }

  return "IMAGES";
}

function ensureTomlImagesBinding(code: string): string {
  if (hasTopLevelDottedKey(code, "images")) {
    throw new Error("Wrangler TOML uses unsupported dotted images keys.");
  }

  const inlineImages = findTopLevelTomlAssignment(code, "images");
  const tableImages = singleTomlTable(code, "images");
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
    const binding = findTomlAssignmentInSection(code, tableImages, "binding");
    const value = binding ? parseTomlString(binding.value) : undefined;
    if (value) return code;
    return setTomlTableAssignmentValue(code, tableImages, "binding", '"IMAGES"');
  }

  return appendTomlTopLevelAssignment(code, 'images = { binding = "IMAGES" }');
}

function findTomlKvNamespaceSection(code: string): TomlSection | undefined {
  return findTomlSections(code, "kv_namespaces", true).find((section) => {
    const binding = findTomlAssignmentInSection(code, section, "binding");
    return binding ? parseTomlString(binding.value) === "VINEXT_KV_CACHE" : false;
  });
}

function ensureTomlKvNamespace(code: string): string {
  if (findTopLevelTomlAssignment(code, "kv_namespaces")) {
    throw new Error("Wrangler TOML uses unsupported inline kv_namespaces.");
  }
  if (hasTopLevelDottedKey(code, "kv_namespaces")) {
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
  const id = findTomlAssignmentInSection(code, section, "id");
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
