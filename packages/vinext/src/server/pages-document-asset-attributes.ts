import { escapeRegExp } from "../utils/regex.js";
import { escapeHtmlAttr } from "./html.js";

export type PagesDocumentAssetAttributes = {
  nonce?: string;
  crossOrigin?: string;
};

const HEAD_MARKER_ATTR = "data-vinext-document-head";
const HEAD_NONCE_ATTR = "data-vinext-document-head-nonce";
const HEAD_CROSS_ORIGIN_ATTR = "data-vinext-document-head-crossorigin";
const NEXT_SCRIPT_MARKER_ATTR = "data-vinext-next-script";
const NEXT_SCRIPT_NONCE_ATTR = "data-vinext-next-script-nonce";
const NEXT_SCRIPT_CROSS_ORIGIN_ATTR = "data-vinext-next-script-crossorigin";
const NEXT_MAIN_PLACEHOLDER = "__NEXT_MAIN__";
const NEXT_SCRIPT_PLACEHOLDER = "<!-- __NEXT_SCRIPTS__ -->";
const PROTECTED_ASSET_ATTRS_START = "<!--VINEXT_DOCUMENT_ASSET_ATTRS_PROTECTED_START-->";
const PROTECTED_ASSET_ATTRS_END = "<!--VINEXT_DOCUMENT_ASSET_ATTRS_PROTECTED_END-->";
const BODY_PLACEHOLDER_PATTERN = new RegExp(
  `(${escapeRegExp(NEXT_MAIN_PLACEHOLDER)}|${escapeRegExp(NEXT_SCRIPT_PLACEHOLDER)})`,
);
const NEXT_SCRIPT_MARKER_PATTERN = new RegExp(
  `<span\\b(?=[^>]*\\b${escapeRegExp(NEXT_SCRIPT_MARKER_ATTR)}(?:\\s|=|>|\\/))[^>]*>\\s*${escapeRegExp(NEXT_SCRIPT_PLACEHOLDER)}\\s*<\\/span>`,
  "i",
);

function getHtmlAttribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(
    `\\s${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const match = tag.match(pattern);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decodeHtmlAttribute(value);
}

function hasHtmlAttribute(tag: string, name: string): boolean {
  return new RegExp(
    `\\s${escapeRegExp(name)}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?(?=\\s|/?>)`,
    "i",
  ).test(tag);
}

function removeHtmlAttribute(tag: string, name: string): string {
  return tag.replace(
    new RegExp(
      `\\s${escapeRegExp(name)}(?=\\s*=|\\s|/?>)(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`,
      "gi",
    ),
    "",
  );
}

function setHtmlAttribute(tag: string, name: string, value: string): string {
  const withoutExisting = removeHtmlAttribute(tag, name);
  const attr = ` ${name}="${escapeHtmlAttr(value)}"`;
  return withoutExisting.replace(/\s*\/?>$/, (closing) =>
    closing.endsWith("/>") ? `${attr} />` : `${attr}>`,
  );
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&#60;/g, "<")
    .replace(/&#x3c;/gi, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#62;/g, ">")
    .replace(/&#x3e;/gi, ">")
    .replace(/&amp;/g, "&");
}

function normalizeCrossOrigin(value: string | undefined): string | undefined {
  return value === "anonymous" || value === "use-credentials" ? value : undefined;
}

function readAssetAttributes(
  tag: string,
  nonceAttr: string,
  crossOriginAttr: string,
): PagesDocumentAssetAttributes {
  return {
    nonce: getHtmlAttribute(tag, nonceAttr),
    crossOrigin: normalizeCrossOrigin(getHtmlAttribute(tag, crossOriginAttr)),
  };
}

function cleanMarkerAttributes(tag: string, names: string[]): string {
  return names.reduce((current, name) => removeHtmlAttribute(current, name), tag);
}

export function protectPagesDocumentAssetAttributes(html: string): string {
  if (!html) return html;
  return `${PROTECTED_ASSET_ATTRS_START}${html}${PROTECTED_ASSET_ATTRS_END}`;
}

function protectPagesDocumentHeadContent(html: string): string {
  return html.replace(
    /(<head\b[^>]*>)([\s\S]*?)(<\/head>)/i,
    (_match: string, open: string, content: string, close: string) => {
      if (!content) return `${open}${close}`;
      return `${open}${protectPagesDocumentAssetAttributes(content)}${close}`;
    },
  );
}

function protectPagesDocumentBodyContent(html: string): string {
  return html.replace(
    /(<body\b[^>]*>)([\s\S]*?)(<\/body>)/i,
    (_match: string, open: string, content: string, close: string) => {
      const parts = content.split(BODY_PLACEHOLDER_PATTERN);
      const protectedContent = parts
        .map((part) =>
          part === NEXT_MAIN_PLACEHOLDER || part === NEXT_SCRIPT_PLACEHOLDER
            ? part
            : protectPagesDocumentAssetAttributes(part),
        )
        .join("");
      return `${open}${protectedContent}${close}`;
    },
  );
}

export function protectPagesDocumentUserContent(html: string): string {
  return protectPagesDocumentBodyContent(protectPagesDocumentHeadContent(html));
}

function stripPagesDocumentAssetAttributeProtection(html: string): string {
  return html.replaceAll(PROTECTED_ASSET_ATTRS_START, "").replaceAll(PROTECTED_ASSET_ATTRS_END, "");
}

export function extractPagesDocumentAssetAttributes(html: string): {
  html: string;
  head: PagesDocumentAssetAttributes;
  nextScript: PagesDocumentAssetAttributes;
} {
  let head: PagesDocumentAssetAttributes = {};
  let nextScript: PagesDocumentAssetAttributes = {};

  let cleaned = html.replace(/<head\b[^>]*>/i, (tag) => {
    if (!hasHtmlAttribute(tag, HEAD_MARKER_ATTR)) return tag;

    head = readAssetAttributes(tag, HEAD_NONCE_ATTR, HEAD_CROSS_ORIGIN_ATTR);
    return cleanMarkerAttributes(tag, [HEAD_MARKER_ATTR, HEAD_NONCE_ATTR, HEAD_CROSS_ORIGIN_ATTR]);
  });

  cleaned = cleaned.replace(NEXT_SCRIPT_MARKER_PATTERN, (tag) => {
    nextScript = readAssetAttributes(tag, NEXT_SCRIPT_NONCE_ATTR, NEXT_SCRIPT_CROSS_ORIGIN_ATTR);
    return NEXT_SCRIPT_PLACEHOLDER;
  });

  return { html: cleaned, head, nextScript };
}

export function mergePagesDocumentAssetAttributes(
  documentAttrs: PagesDocumentAssetAttributes,
  fallbackAttrs: PagesDocumentAssetAttributes,
): PagesDocumentAssetAttributes {
  return {
    nonce: documentAttrs.nonce ?? fallbackAttrs.nonce,
    crossOrigin: documentAttrs.crossOrigin ?? fallbackAttrs.crossOrigin,
  };
}

export function applyPagesDocumentAssetAttributes(
  html: string,
  attrs: PagesDocumentAssetAttributes,
): string {
  if (!attrs.nonce && attrs.crossOrigin === undefined) {
    return stripPagesDocumentAssetAttributeProtection(html);
  }

  const applyToSegment = (segment: string) =>
    segment.replace(/<(script|link)\b[^>]*>/gi, (tag, tagName: string) => {
      if (tagName.toLowerCase() === "link") {
        const rel = getHtmlAttribute(tag, "rel")?.toLowerCase();
        if (rel !== "preload" && rel !== "modulepreload" && rel !== "stylesheet") {
          return tag;
        }
      }

      let next = tag;
      if (attrs.nonce) {
        next = setHtmlAttribute(next, "nonce", attrs.nonce);
      }
      if (attrs.crossOrigin !== undefined) {
        next = setHtmlAttribute(next, "crossorigin", attrs.crossOrigin);
      }
      return next;
    });

  let output = "";
  let index = 0;
  for (;;) {
    const start = html.indexOf(PROTECTED_ASSET_ATTRS_START, index);
    if (start === -1) {
      output += applyToSegment(html.slice(index));
      break;
    }

    output += applyToSegment(html.slice(index, start));
    const protectedStart = start + PROTECTED_ASSET_ATTRS_START.length;
    const end = html.indexOf(PROTECTED_ASSET_ATTRS_END, protectedStart);
    if (end === -1) {
      output += stripPagesDocumentAssetAttributeProtection(html.slice(start));
      break;
    }

    output += html.slice(protectedStart, end);
    index = end + PROTECTED_ASSET_ATTRS_END.length;
  }

  return output;
}
