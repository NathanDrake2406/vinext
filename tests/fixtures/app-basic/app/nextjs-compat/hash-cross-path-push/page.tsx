import Link from "next/link";
import { HashCrossPathPushActions } from "./push-actions";

export default function HashCrossPathPushPage() {
  return (
    <main>
      <h1>Hash Cross Path Push Start</h1>
      <Link href="/nextjs-compat/hash-cross-path-push/destination#foo" id="link-to-target-foo">
        Link to destination#foo
      </Link>
      <HashCrossPathPushActions />
    </main>
  );
}
