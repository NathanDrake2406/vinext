import Link from "next/link";

export default function Page() {
  return (
    <div>
      <p id="layout-a">A</p>
      <Link id="to-b" href="/history-write-during-commit/layout-cleanup/b">
        Go to B
      </Link>
    </div>
  );
}
