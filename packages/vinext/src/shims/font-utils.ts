export type FontStyle = {
  fontFamily: string;
  fontWeight?: number;
  fontStyle?: string;
};

export type FontFaceStyleInput = {
  fontFamily: string;
  weight?: string | string[];
  style?: string | string[];
  internalWeight?: number;
  internalStyle?: string;
  google?: boolean;
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
  if (style === undefined) return "normal";
  const value = singleFontOptionValue(style);
  if (!value) return undefined;
  if (value === "normal" || value === "italic") return value;
  return undefined;
}

export function resolveSingleFaceStyle(input: FontFaceStyleInput): FontStyle {
  const fontWeight = input.internalWeight ?? resolveFontWeight(input.weight);
  const internalStyle = input.internalStyle
    ? sanitizeFontDescriptorValue(input.internalStyle)
    : undefined;
  const fontStyle =
    internalStyle ??
    (input.google ? resolveGoogleFontStyle(input.style) : resolveFontStyle(input.style));

  return {
    fontFamily: input.fontFamily,
    ...(fontWeight !== undefined ? { fontWeight } : {}),
    ...(fontStyle ? { fontStyle } : {}),
  };
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
