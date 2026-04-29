import { describe, expect, it } from "vite-plus/test";
import { makeThenableParams } from "../packages/vinext/src/shims/thenable-params.js";

describe("makeThenableParams", () => {
  it("keeps Promise methods usable when params contain Promise method names", async () => {
    const source: Record<string, string> = { slug: "post" };
    Reflect.set(source, "catch", "catch-param");
    Reflect.set(source, "finally", "finally-param");
    Reflect.set(source, "then", "then-param");
    const params = makeThenableParams(source);

    expect(Reflect.get(params, "slug")).toBe("post");
    expect(typeof Reflect.get(params, "then")).toBe("function");
    expect(typeof Reflect.get(params, "catch")).toBe("function");
    expect(typeof Reflect.get(params, "finally")).toBe("function");
    expect(Object.keys(params)).toEqual(["slug"]);

    const awaited = await params;
    expect(awaited).toEqual(source);
    expect(Reflect.get(awaited, "then")).toBe("then-param");
  });
});
