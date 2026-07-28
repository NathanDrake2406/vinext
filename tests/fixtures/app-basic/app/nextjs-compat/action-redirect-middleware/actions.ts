"use server";

import { redirect } from "next/navigation";

/**
 * Redirects to `/admin`, which this fixture's middleware blocks with a 403.
 * A redirecting action renders its target inline, so the target's middleware
 * has to run before that render or the blocked page's payload leaks into the
 * action response.
 */
export async function redirectToBlockedPath(): Promise<void> {
  redirect("/admin");
}
