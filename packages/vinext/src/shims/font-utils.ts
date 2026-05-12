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

export function resolveFontWeight(weight: string | string[] | undefined): number | undefined {
  const value = singleFontOptionValue(weight);
  if (!value || value.includes(" ")) return undefined;
  const numericWeight = Number(value);
  return Number.isNaN(numericWeight) ? undefined : numericWeight;
}

export function resolveFontStyle(style: string | string[] | undefined): string | undefined {
  const value = singleFontOptionValue(style);
  if (!value || value.includes(" ")) return undefined;
  return value;
}

export function formatFontClassRule(className: string, style: FontStyle): string {
  const declarations = [
    `font-family: ${style.fontFamily}`,
    ...(style.fontWeight !== undefined ? [`font-weight: ${style.fontWeight}`] : []),
    ...(style.fontStyle ? [`font-style: ${style.fontStyle}`] : []),
  ];
  return `.${className} { ${declarations.join("; ")}; }\n`;
}
