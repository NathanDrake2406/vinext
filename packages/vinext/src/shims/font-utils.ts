export type FontStyle = {
  fontFamily: string;
  fontWeight?: number;
  fontStyle?: string;
};

export function singleFontOptionValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    const values = new Set(value);
    return values.size === 1 ? value[0] : undefined;
  }
  return value;
}

export function sanitizeFontDescriptorValue(value: string): string | undefined {
  if (/[{};]|\/\*|\*\/|<\//i.test(value)) return undefined;
  return value;
}

export function resolveFontWeight(weight: string | string[] | undefined): number | undefined {
  const value = singleFontOptionValue(weight);
  if (!value || value.includes(" ")) return undefined;
  const numericWeight = Number(value);
  return Number.isFinite(numericWeight) ? numericWeight : undefined;
}

export function resolveFontStyle(style: string | string[] | undefined): string | undefined {
  const value = singleFontOptionValue(style);
  if (!value || value.includes(" ")) return undefined;
  return sanitizeFontDescriptorValue(value);
}

export function resolveGoogleFontStyle(style: string | string[] | undefined): string | undefined {
  const value = singleFontOptionValue(style);
  if (!value) return "normal";
  if (value === "normal" || value === "italic") return value;
  return undefined;
}

export function formatFontClassRule(className: string, style: FontStyle): string {
  const fontStyle = style.fontStyle ? sanitizeFontDescriptorValue(style.fontStyle) : undefined;
  const declarations = [
    `font-family: ${style.fontFamily}`,
    ...(style.fontWeight !== undefined ? [`font-weight: ${style.fontWeight}`] : []),
    ...(fontStyle ? [`font-style: ${fontStyle}`] : []),
  ];
  return `.${className} { ${declarations.join("; ")}; }\n`;
}
