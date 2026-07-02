const NEXT_REDIRECT_PREFIX = "NEXT_REDIRECT;";

export type RedirectDigest = {
  status: number;
  type: string | null;
  url: string;
};

export function parseRedirectDigest(digest: string): RedirectDigest | null {
  if (!digest.startsWith(NEXT_REDIRECT_PREFIX)) return null;

  const firstSemi = digest.indexOf(";", NEXT_REDIRECT_PREFIX.length);
  if (firstSemi === -1) return null;

  const rest = digest.slice(firstSemi + 1);
  const statusMatch = rest.match(/;(303|307|308);?$/);
  const target = statusMatch
    ? rest.slice(0, -statusMatch[0].length)
    : /;\d[^;]*;$/.test(rest)
      ? rest.slice(0, -1)
      : rest;
  if (!target) return null;

  return {
    status: statusMatch ? Number(statusMatch[1]) : 307,
    type: digest.slice(NEXT_REDIRECT_PREFIX.length, firstSemi) || null,
    url: decodeURIComponent(target),
  };
}
