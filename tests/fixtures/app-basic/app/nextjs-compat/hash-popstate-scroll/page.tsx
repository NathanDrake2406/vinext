import Link from "next/link";

export default function HashPopstateScrollPage() {
  return (
    <main style={{ minHeight: "3200px", padding: 24 }}>
      <h1>Hash Popstate Scroll</h1>
      <Link href="#content" id="hash-link">
        Go to content
      </Link>
      <div style={{ height: 1800 }} />
      <section id="content" style={{ minHeight: 400 }}>
        <h2>Anchored Content</h2>
        <p>This content should be restored into view on forward traversal.</p>
      </section>
    </main>
  );
}
