import type { CloudflareInitOptions } from "./init-platform.js";

function stripJsonComments(code: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < code.length; index++) {
    const char = code[index];
    const next = code[index + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < code.length && code[index] !== "\n") index++;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < code.length && !(code[index] === "*" && code[index + 1] === "/")) {
        output += code[index] === "\n" ? "\n" : " ";
        index++;
      }
      index++;
      continue;
    }
    output += char;
  }
  return output.replace(/,\s*([}\]])/g, "$1");
}

function findTopLevelJsonProperty(
  code: string,
  name: string,
): { valueStart: number; valueEnd: number } | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < code.length; index++) {
    const char = code[index];
    const next = code[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index++;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index++;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index++;
      continue;
    }
    if (char === '"') {
      inString = true;
      let value = "";
      index++;
      for (; index < code.length; index++) {
        const stringChar = code[index];
        if (stringChar === "\\") {
          value += stringChar + (code[++index] ?? "");
        } else if (stringChar === '"') {
          inString = false;
          break;
        } else value += stringChar;
      }
      if (depth !== 1 || value !== name) continue;
      let cursor = index + 1;
      while (/\s/.test(code[cursor] ?? "")) cursor++;
      if (code[cursor] !== ":") continue;
      cursor++;
      while (/\s/.test(code[cursor] ?? "")) cursor++;
      const valueStart = cursor;
      let valueDepth = 0;
      let valueString = false;
      let valueEscaped = false;
      let valueLineComment = false;
      let valueBlockComment = false;
      for (; cursor < code.length; cursor++) {
        const valueChar = code[cursor];
        const valueNext = code[cursor + 1];
        if (valueLineComment) {
          if (valueChar === "\n") valueLineComment = false;
          continue;
        }
        if (valueBlockComment) {
          if (valueChar === "*" && valueNext === "/") {
            valueBlockComment = false;
            cursor++;
          }
          continue;
        }
        if (valueString) {
          if (valueEscaped) valueEscaped = false;
          else if (valueChar === "\\") valueEscaped = true;
          else if (valueChar === '"') valueString = false;
          continue;
        }
        if (valueChar === "/" && valueNext === "/") {
          valueLineComment = true;
          cursor++;
        } else if (valueChar === "/" && valueNext === "*") {
          valueBlockComment = true;
          cursor++;
        } else if (valueChar === '"') valueString = true;
        else if (valueChar === "{" || valueChar === "[") valueDepth++;
        else if (valueChar === "}" || valueChar === "]") {
          if (valueDepth === 0) return { valueStart, valueEnd: cursor };
          valueDepth--;
          if (valueDepth === 0) return { valueStart, valueEnd: cursor + 1 };
        } else if (valueChar === "," && valueDepth === 0) {
          return { valueStart, valueEnd: cursor };
        }
      }
      return { valueStart, valueEnd: cursor };
    }
    if (char === "{") depth++;
    else if (char === "}") depth--;
  }
  return null;
}

function appendTopLevelJsonProperty(code: string, property: string): string {
  const closing = code.lastIndexOf("}");
  if (closing < 0) throw new Error("Could not find the root object in Wrangler config.");
  const before = code.slice(0, closing);
  const structuralBefore = stripJsonComments(before);
  const needsComma = !/,\s*$/.test(structuralBefore) && !/{\s*$/.test(structuralBefore);
  return `${before}${needsComma ? "," : ""}\n${property}\n${code.slice(closing)}`;
}

export function updateWranglerJsonConfigForCloudflare(
  code: string,
  options: CloudflareInitOptions,
): string {
  try {
    JSON.parse(stripJsonComments(code));
  } catch (cause) {
    throw new Error("Could not parse the existing Wrangler JSON/JSONC config.", { cause });
  }
  let output = code;
  if (options.cdnCache === "workers-cache") {
    const cacheProperty = findTopLevelJsonProperty(output, "cache");
    if (!cacheProperty) {
      output = appendTopLevelJsonProperty(output, '  "cache": { "enabled": true }');
    } else {
      const cache = JSON.parse(
        stripJsonComments(output.slice(cacheProperty.valueStart, cacheProperty.valueEnd)),
      ) as Record<string, unknown> | null;
      if (!cache || cache.enabled !== true) {
        const updatedCache = JSON.stringify({ ...cache, enabled: true });
        output = `${output.slice(0, cacheProperty.valueStart)}${updatedCache}${output.slice(cacheProperty.valueEnd)}`;
      }
    }
  }
  if (options.imageOptimization === "cloudflare-images") {
    const imagesProperty = findTopLevelJsonProperty(output, "images");
    if (!imagesProperty) {
      output = appendTopLevelJsonProperty(output, '  "images": { "binding": "IMAGES" }');
    } else {
      const images = JSON.parse(
        stripJsonComments(output.slice(imagesProperty.valueStart, imagesProperty.valueEnd)),
      ) as { binding?: unknown } | null;
      if (!images || typeof images.binding !== "string" || images.binding.length === 0) {
        output = `${output.slice(0, imagesProperty.valueStart)}{ "binding": "IMAGES" }${output.slice(imagesProperty.valueEnd)}`;
      }
    }
  }
  if (options.dataCache === "kv") {
    const kvProperty = findTopLevelJsonProperty(output, "kv_namespaces");
    if (!kvProperty) {
      output = appendTopLevelJsonProperty(
        output,
        '  "kv_namespaces": [{ "binding": "VINEXT_KV_CACHE", "id": "<your-kv-namespace-id>" }]',
      );
    } else {
      const rawValue = output.slice(kvProperty.valueStart, kvProperty.valueEnd);
      const namespaces = JSON.parse(stripJsonComments(rawValue)) as Array<{ binding?: string }>;
      if (!namespaces.some((namespace) => namespace.binding === "VINEXT_KV_CACHE")) {
        const closing = kvProperty.valueEnd - 1;
        const content = output.slice(kvProperty.valueStart + 1, closing);
        const separator = content.trim() ? `${/,\s*$/.test(content) ? "" : ","}\n    ` : "";
        output = `${output.slice(0, closing)}${separator}{ "binding": "VINEXT_KV_CACHE", "id": "<your-kv-namespace-id>" }${output.slice(closing)}`;
      }
    }
  }
  return output;
}

export function getWranglerJsonImagesBinding(code: string): string {
  const property = findTopLevelJsonProperty(code, "images");
  if (!property) return "IMAGES";
  const images = JSON.parse(
    stripJsonComments(code.slice(property.valueStart, property.valueEnd)),
  ) as { binding?: unknown } | null;
  return images && typeof images.binding === "string" && images.binding.length > 0
    ? images.binding
    : "IMAGES";
}

export function wranglerJsonKvNamespaceNeedsId(
  code: string,
  options: CloudflareInitOptions,
): boolean {
  if (options.dataCache !== "kv") return false;

  const finalWranglerConfig = JSON.parse(stripJsonComments(code)) as {
    kv_namespaces?: Array<{ binding?: unknown; id?: unknown }>;
  };
  const kvBinding = finalWranglerConfig.kv_namespaces?.find(
    (namespace) => namespace.binding === "VINEXT_KV_CACHE",
  );
  return (
    !kvBinding ||
    typeof kvBinding.id !== "string" ||
    kvBinding.id.length === 0 ||
    kvBinding.id === "<your-kv-namespace-id>"
  );
}
