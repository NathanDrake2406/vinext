import Link from "next/link";
import { ClientShell } from "./client-shell";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;

  return (
    <main>
      <ClientShell serverProject={pid} />
      <nav>
        <Link href={`/navigation-debug/projects/${pid}`}>Project index</Link>
        <Link href={`/navigation-debug/projects/${pid}/child`} data-testid="project-child-link">
          Project child
        </Link>
      </nav>
      {children}
    </main>
  );
}
