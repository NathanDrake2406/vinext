import { describe, expect, it } from "vite-plus/test";
import { parseStaticObjectLiteral } from "../packages/vinext/src/utils/static-object-literal.js";

describe("parseStaticObjectLiteral", () => {
  it("parses simple object with string values", () => {
    const result = parseStaticObjectLiteral(`{ weight: '400', display: 'swap' }`);
    expect(result).toEqual({ weight: "400", display: "swap" });
  });

  it("parses object with array of strings", () => {
    const result = parseStaticObjectLiteral(`{ weight: ['400', '700'], subsets: ['latin'] }`);
    expect(result).toEqual({ weight: ["400", "700"], subsets: ["latin"] });
  });

  it("parses object with double-quoted strings", () => {
    const result = parseStaticObjectLiteral(`{ weight: "400" }`);
    expect(result).toEqual({ weight: "400" });
  });

  it("parses object with trailing comma", () => {
    const result = parseStaticObjectLiteral(`{ weight: '400', }`);
    expect(result).toEqual({ weight: "400" });
  });

  it("parses object with comments", () => {
    const result = parseStaticObjectLiteral(`
      {
        // tsconfig-style line comment
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"], /* trailing block comment */
          },
        },
      }
    `);
    expect(result).toEqual({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["src/*"],
        },
      },
    });
  });

  it("treats a leading BOM as whitespace", () => {
    const result = parseStaticObjectLiteral(`\ufeff{ weight: '400' }`);
    expect(result).toEqual({ weight: "400" });
  });

  it("parses object with numeric values", () => {
    const result = parseStaticObjectLiteral(
      `{ size: 16, offset: -1, ratio: 1.5e2, half: .5, mask: 0xff }`,
    );
    expect(result).toEqual({ size: 16, offset: -1, ratio: 150, half: 0.5, mask: 255 });
  });

  it("parses object with boolean and null values", () => {
    const result = parseStaticObjectLiteral(`{ preload: true, fallback: null }`);
    expect(result).toEqual({ preload: true, fallback: null });
  });

  it("parses quoted keys", () => {
    const result = parseStaticObjectLiteral(`{ 'weight': '400' }`);
    expect(result).toEqual({ weight: "400" });
  });

  it("parses escaped string values", () => {
    const result = parseStaticObjectLiteral(`{ family: "A\\nB", axis: "\\u0077ght" }`);
    expect(result).toEqual({ family: "A\nB", axis: "wght" });
  });

  it("parses empty object", () => {
    const result = parseStaticObjectLiteral(`{}`);
    expect(result).toEqual({});
  });

  it("parses nested objects", () => {
    const result = parseStaticObjectLiteral(`{ axes: { wght: 400 } }`);
    expect(result).toEqual({ axes: { wght: 400 } });
  });

  it("rejects function calls (code execution)", () => {
    const result = parseStaticObjectLiteral(
      `{ weight: require('child_process').execSync('whoami') }`,
    );
    expect(result).toBeNull();
  });

  it("rejects template literals", () => {
    const result = parseStaticObjectLiteral("{ weight: `${process.env.HOME}` }");
    expect(result).toBeNull();
  });

  it("rejects identifier references", () => {
    const result = parseStaticObjectLiteral(`{ weight: myVar }`);
    expect(result).toBeNull();
  });

  it("rejects computed property keys", () => {
    const result = parseStaticObjectLiteral(`{ [Symbol.toPrimitive]: '400' }`);
    expect(result).toBeNull();
  });

  it("rejects spread elements", () => {
    const result = parseStaticObjectLiteral(`{ ...evil }`);
    expect(result).toBeNull();
  });

  it("rejects sparse arrays", () => {
    const result = parseStaticObjectLiteral(`{ weight: ['400', , '700'] }`);
    expect(result).toBeNull();
  });

  it("rejects new expressions", () => {
    const result = parseStaticObjectLiteral(`{ weight: new Function('return 1')() }`);
    expect(result).toBeNull();
  });

  it("rejects IIFE in values", () => {
    const result = parseStaticObjectLiteral(`{ weight: (() => { process.exit(1) })() }`);
    expect(result).toBeNull();
  });

  it("rejects import() expressions", () => {
    const result = parseStaticObjectLiteral(`{ weight: import('fs') }`);
    expect(result).toBeNull();
  });

  it("returns null for invalid syntax", () => {
    const result = parseStaticObjectLiteral(`{ not valid javascript `);
    expect(result).toBeNull();
  });

  it("returns null for non-object expressions", () => {
    const result = parseStaticObjectLiteral(`"just a string"`);
    expect(result).toBeNull();
  });
});
