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
  // Only canonical redirect statuses (303, 307, 308) are recognized;
  // anything else is treated as URL content.
  const statusMatch = rest.match(/;(303|307|308);?$/);
  const isCanonical = rest !== "" && digest.endsWith(";");
  if (isCanonical && !statusMatch) return null;

  const target = statusMatch ? rest.slice(0, -statusMatch[0].length) : rest;

  let url = target;
  if (!isCanonical) {
    try {
      url = decodeURIComponent(target);
    } catch {
      return null;
    }
  }

  return {
    status: statusMatch ? Number(statusMatch[1]) : 307,
    type: digest.slice(NEXT_REDIRECT_PREFIX.length, firstSemi) || null,
    url,
  };
}
