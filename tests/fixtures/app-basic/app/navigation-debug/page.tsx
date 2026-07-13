import Link from "next/link";

export default function NavigationDebugDashboard() {
  return (
    <main>
      <h1>Navigation debug dashboard</h1>
      <Link href="/navigation-debug/projects/A" data-testid="project-a-link">
        Project A
      </Link>
      <Link href="/navigation-debug/projects/B" data-testid="project-b-link">
        Project B
      </Link>
    </main>
  );
}
