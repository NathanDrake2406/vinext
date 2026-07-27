import type { NextRewrite, ResolvedNextConfig } from "../config/next-config.js";
import { isExternalUrl } from "../utils/external-url.js";

type ClientRewriteFields = Pick<NextRewrite, "basePath" | "has" | "locale" | "source">;

/**
 * Rewrite data that is safe to publish in a browser bundle.
 *
 * Rules that require server-only data deliberately omit both the destination
 * and the data that made server evaluation necessary. The client can still
 * match their public source/has fields, then hand the navigation to the server.
 */
export type ClientRewrite =
  | (ClientRewriteFields & {
      destination: string;
      requiresServerEvaluation?: never;
    })
  | (ClientRewriteFields & {
      destination?: never;
      requiresServerEvaluation: true;
    });

export type ClientRewrites = {
  afterFiles: ClientRewrite[];
  beforeFiles: ClientRewrite[];
  fallback: ClientRewrite[];
};

function toClientRewrite(rewrite: NextRewrite): ClientRewrite {
  const common = {
    source: rewrite.source,
    has: rewrite.has,
    locale: rewrite.locale,
    basePath: rewrite.basePath,
  };

  if (isExternalUrl(rewrite.destination) || (rewrite.missing?.length ?? 0) > 0) {
    return {
      ...common,
      requiresServerEvaluation: true,
    };
  }

  return {
    source: rewrite.source,
    destination: rewrite.destination,
    has: rewrite.has,
    locale: rewrite.locale,
    basePath: rewrite.basePath,
  };
}

export function toClientRewrites(rewrites: ResolvedNextConfig["rewrites"]): ClientRewrites {
  return {
    beforeFiles: rewrites.beforeFiles.map(toClientRewrite),
    afterFiles: rewrites.afterFiles.map(toClientRewrite),
    fallback: rewrites.fallback.map(toClientRewrite),
  };
}
