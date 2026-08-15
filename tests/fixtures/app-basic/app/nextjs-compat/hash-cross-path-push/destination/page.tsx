import Link from "next/link";
import { HashCrossPathPushDestinationActions } from "./push-actions";

export default function HashCrossPathPushDestinationPage() {
  return (
    <main>
      <h1>Hash Cross Path Push Destination</h1>
      <Link href="/nextjs-compat/hash-cross-path-push/destination#baz" id="link-to-target-baz">
        Link to destination#baz
      </Link>
      <HashCrossPathPushDestinationActions />
      <div style={{ height: 1200 }} />
      <section id="foo">Foo target</section>
      <div style={{ height: 1200 }} />
      <section id="baz">Baz target</section>
    </main>
  );
}
