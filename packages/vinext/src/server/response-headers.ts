// Header name that is never emitted, only probed for. Deleting a header that is
// absent is a no-op on a mutable Headers and throws on an immutable one.
const MUTABILITY_PROBE_HEADER = "x-vinext-header-guard-probe";

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
  try {
    response.headers.delete(MUTABILITY_PROBE_HEADER);
    return response;
  } catch {
    // `Response.error()` and opaque responses report status 0, which the
    // Response constructor rejects. Nothing can take ownership of those, so
    // hand the original back and let the caller's own error path handle it.
    if (response.status < 200 || response.status > 599) return response;
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
  }
}
