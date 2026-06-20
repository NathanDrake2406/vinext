export type ReactNodeEnv = "development" | "production";

export function getReactNodeEnv(createElement: unknown): ReactNodeEnv {
  return Function.prototype.toString.call(createElement).includes("getOwner")
    ? "development"
    : "production";
}

export async function importWithReactNodeEnv<T>(
  reactNodeEnv: ReactNodeEnv,
  load: () => Promise<T>,
): Promise<T> {
  const env = typeof process !== "undefined" && process.env ? process.env : null;
  const previousNodeEnv = env?.NODE_ENV;
  if (env && previousNodeEnv !== reactNodeEnv) {
    env.NODE_ENV = reactNodeEnv;
  }

  try {
    return await load();
  } finally {
    if (env) {
      if (previousNodeEnv === undefined) {
        delete env.NODE_ENV;
      } else {
        env.NODE_ENV = previousNodeEnv;
      }
    }
  }
}
