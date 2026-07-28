import { redirectToBlockedPath } from "./actions";

export default function Page() {
  return (
    <main>
      <h1>Action Redirect Middleware Test</h1>
      <form action={redirectToBlockedPath}>
        <button id="redirect-to-blocked" type="submit">
          Redirect to blocked path
        </button>
      </form>
    </main>
  );
}
