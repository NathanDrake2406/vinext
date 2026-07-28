import { redirectToBlockedPath, redirectToEncodedBlockedPath } from "./actions";

export default function Page() {
  return (
    <main>
      <h1>Action Redirect Middleware Test</h1>
      <form action={redirectToBlockedPath}>
        <button id="redirect-to-blocked" type="submit">
          Redirect to blocked path
        </button>
      </form>
      <form action={redirectToEncodedBlockedPath}>
        <button id="redirect-to-encoded-blocked" type="submit">
          Redirect to encoded blocked path
        </button>
      </form>
    </main>
  );
}
