import Link from "next/link";

export default function Page() {
  return (
    <div>
      <p id="source">Source</p>
      <Link id="to-dest" href="/history-write-during-commit/push-in-layout-effect/dest">
        Go to dest
      </Link>
    </div>
  );
}
