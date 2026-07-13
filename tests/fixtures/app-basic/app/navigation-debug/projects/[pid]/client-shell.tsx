"use client";

import { useParams, usePathname } from "next/navigation";

export function ClientShell({ serverProject }: { serverProject: string }) {
  const params = useParams<{ pid: string }>();
  const pathname = usePathname();

  return (
    <section>
      <p data-testid="server-project">server project: {serverProject}</p>
      <p data-testid="client-project">client project: {params.pid}</p>
      <p data-testid="client-pathname">client pathname: {pathname}</p>
    </section>
  );
}
