// Name of the header used to probe the guard. Never emitted, and never removed
// from a response that already carries it — see ensureMutableResponse.
const MUTABILITY_PROBE_HEADER = "x-vinext-header-guard-probe";

function hasWritableHeaders(headers: Headers): boolean {
  try {
    // Deleting an absent header is a no-op on a writable Headers, and throws
    // under the "immutable" guard, which validates before it does any work.
    headers.delete(MUTABILITY_PROBE_HEADER);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return a Response the framework may write headers to.
 *
 * A Response userland returns verbatim — most commonly
 * `export async function GET() { return fetch(upstream) }`, but also
 * `Response.redirect()` — carries the Fetch spec's "immutable" headers guard,
 * where every `set`/`append`/`delete` throws `TypeError: immutable`. Next.js
 * copies into a fresh `Headers` instead of mutating what userland returned;
 * mirror that, but only pay for the copy when the guard is actually set.
 */
export function ensureMutableResponse(response: Response): Response {
  // The probe deletes, so it may only run when the name is absent. A response
  // that carries it — from userland or echoed by an upstream — skips the probe
  // and takes the copy, which preserves the header verbatim. Returning it
  // stripped would be the same not-ours-to-touch bug this function exists for.
  if (!response.headers.has(MUTABILITY_PROBE_HEADER) && hasWritableHeaders(response.headers)) {
    return response;
  }

  // `Response.error()` and opaque responses report status 0, which the Response
  // constructor rejects. Nothing can take ownership of those, so hand the
  // original back and let the caller's own error path handle it.
  if (response.status < 200 || response.status > 599) return response;

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}
