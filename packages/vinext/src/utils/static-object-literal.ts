const INVALID = Symbol("invalid-static-literal");

type InvalidStaticLiteral = typeof INVALID;
type StaticObject = { [key: string]: StaticValue };
type StaticValue = string | number | boolean | null | StaticValue[] | StaticObject;
type ParseResult = StaticValue | InvalidStaticLiteral;

function isStaticObject(value: StaticValue): value is StaticObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIdentifierStart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_$]/.test(char);
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function isHexDigit(char: string | undefined): boolean {
  return char !== undefined && /[0-9A-Fa-f]/.test(char);
}

function isWhitespace(char: string | undefined): boolean {
  return (
    char === " " ||
    char === "\t" ||
    char === "\n" ||
    char === "\r" ||
    char === "\v" ||
    char === "\f" ||
    char === "\u00a0" ||
    char === "\ufeff"
  );
}

class StaticObjectLiteralParser {
  private index = 0;
  private failed = false;

  constructor(private readonly source: string) {}

  parse(): ParseResult {
    const value = this.parseValue();
    if (value === INVALID) return INVALID;
    this.skipTrivia();
    if (this.failed || this.index !== this.source.length) return INVALID;
    return value;
  }

  private current(): string | undefined {
    return this.source[this.index];
  }

  private next(): string | undefined {
    return this.source[this.index + 1];
  }

  private consume(expected: string): boolean {
    if (this.current() !== expected) return false;
    this.index++;
    return true;
  }

  private skipTrivia(): void {
    while (this.index < this.source.length) {
      const char = this.current();
      if (isWhitespace(char)) {
        this.index++;
        continue;
      }

      if (char === "/" && this.next() === "/") {
        this.index += 2;
        while (this.index < this.source.length) {
          const commentChar = this.current();
          if (commentChar === "\n" || commentChar === "\r") break;
          this.index++;
        }
        continue;
      }

      if (char === "/" && this.next() === "*") {
        const end = this.source.indexOf("*/", this.index + 2);
        if (end === -1) {
          this.failed = true;
          this.index = this.source.length;
          return;
        }
        this.index = end + 2;
        continue;
      }

      return;
    }
  }

  private parseValue(): ParseResult {
    this.skipTrivia();
    if (this.failed) return INVALID;

    const char = this.current();
    if (char === "{") return this.parseObject();
    if (char === "[") return this.parseArray();
    if (char === '"' || char === "'") return this.parseString();
    if (char === "-" || char === "." || isDigit(char)) return this.parseNumber();
    if (this.consumeWord("true")) return true;
    if (this.consumeWord("false")) return false;
    if (this.consumeWord("null")) return null;
    return INVALID;
  }

  private parseObject(): ParseResult {
    if (!this.consume("{")) return INVALID;

    const object: StaticObject = {};
    this.skipTrivia();
    if (this.failed) return INVALID;
    if (this.consume("}")) return object;

    while (this.index < this.source.length) {
      const key = this.parseObjectKey();
      if (key === INVALID) return INVALID;

      this.skipTrivia();
      if (this.failed || !this.consume(":")) return INVALID;

      const value = this.parseValue();
      if (value === INVALID) return INVALID;
      object[key] = value;

      this.skipTrivia();
      if (this.failed) return INVALID;
      if (this.consume("}")) return object;
      if (!this.consume(",")) return INVALID;

      this.skipTrivia();
      if (this.failed) return INVALID;
      if (this.consume("}")) return object;
    }

    return INVALID;
  }

  private parseArray(): ParseResult {
    if (!this.consume("[")) return INVALID;

    const array: StaticValue[] = [];
    this.skipTrivia();
    if (this.failed) return INVALID;
    if (this.consume("]")) return array;

    while (this.index < this.source.length) {
      const value = this.parseValue();
      if (value === INVALID) return INVALID;
      array.push(value);

      this.skipTrivia();
      if (this.failed) return INVALID;
      if (this.consume("]")) return array;
      if (!this.consume(",")) return INVALID;

      this.skipTrivia();
      if (this.failed) return INVALID;
      if (this.consume("]")) return array;
    }

    return INVALID;
  }

  private parseObjectKey(): string | InvalidStaticLiteral {
    this.skipTrivia();
    if (this.failed) return INVALID;

    const char = this.current();
    if (char === '"' || char === "'") {
      const key = this.parseString();
      return typeof key === "string" ? key : INVALID;
    }
    if (!isIdentifierStart(char)) return INVALID;

    const start = this.index;
    this.index++;
    while (isIdentifierPart(this.current())) this.index++;
    return this.source.slice(start, this.index);
  }

  private parseString(): string | InvalidStaticLiteral {
    const quote = this.current();
    if (quote !== '"' && quote !== "'") return INVALID;
    this.index++;

    let value = "";
    while (this.index < this.source.length) {
      const char = this.current();
      if (char === quote) {
        this.index++;
        return value;
      }
      if (char === "\n" || char === "\r" || char === undefined) return INVALID;
      if (char !== "\\") {
        value += char;
        this.index++;
        continue;
      }

      this.index++;
      const escaped = this.current();
      if (escaped === undefined) return INVALID;
      const parsedEscape = this.parseEscapeSequence(escaped);
      if (parsedEscape === INVALID) return INVALID;
      value += parsedEscape;
    }

    return INVALID;
  }

  private parseEscapeSequence(escaped: string): string | InvalidStaticLiteral {
    this.index++;

    switch (escaped) {
      case '"':
      case "'":
      case "\\":
        return escaped;
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "v":
        return "\v";
      case "0":
        if (isDigit(this.current())) return INVALID;
        return "\0";
      case "\n":
        return "";
      case "\r":
        if (this.current() === "\n") this.index++;
        return "";
      case "x":
        return this.parseFixedHexEscape(2);
      case "u":
        return this.parseUnicodeEscape();
      default:
        return escaped;
    }
  }

  private parseFixedHexEscape(length: number): string | InvalidStaticLiteral {
    const start = this.index;
    for (let offset = 0; offset < length; offset++) {
      if (!isHexDigit(this.source[start + offset])) return INVALID;
    }
    this.index += length;
    return String.fromCharCode(Number.parseInt(this.source.slice(start, start + length), 16));
  }

  private parseUnicodeEscape(): string | InvalidStaticLiteral {
    if (this.consume("{")) {
      const start = this.index;
      while (isHexDigit(this.current())) this.index++;
      if (this.index === start || !this.consume("}")) return INVALID;

      const codePoint = Number.parseInt(this.source.slice(start, this.index - 1), 16);
      if (!Number.isInteger(codePoint) || codePoint > 0x10ffff) return INVALID;
      return String.fromCodePoint(codePoint);
    }

    return this.parseFixedHexEscape(4);
  }

  private parseNumber(): number | InvalidStaticLiteral {
    const negative = this.consume("-");

    if (this.current() === "0") {
      const radixPrefix = this.next();
      if (radixPrefix === "x" || radixPrefix === "X") return this.parseRadixNumber(16, negative);
      if (radixPrefix === "b" || radixPrefix === "B") return this.parseRadixNumber(2, negative);
      if (radixPrefix === "o" || radixPrefix === "O") return this.parseRadixNumber(8, negative);
    }

    const start = this.index;
    let hasDigits = false;
    if (this.current() === "0") {
      this.index++;
      hasDigits = true;
      if (isDigit(this.current())) return INVALID;
    } else {
      while (isDigit(this.current())) {
        this.index++;
        hasDigits = true;
      }
    }

    if (this.consume(".")) {
      while (isDigit(this.current())) {
        this.index++;
        hasDigits = true;
      }
    }
    if (!hasDigits) return INVALID;

    const exponent = this.current();
    if (exponent === "e" || exponent === "E") {
      this.index++;
      const sign = this.current();
      if (sign === "+" || sign === "-") this.index++;
      if (!isDigit(this.current())) return INVALID;
      while (isDigit(this.current())) this.index++;
    }

    const raw = `${negative ? "-" : ""}${this.source.slice(start, this.index)}`;
    const value = Number(raw);
    return Number.isFinite(value) ? value : INVALID;
  }

  private parseRadixNumber(radix: 2 | 8 | 16, negative: boolean): number | InvalidStaticLiteral {
    this.index += 2;
    const start = this.index;
    while (this.isRadixDigit(this.current(), radix)) this.index++;
    if (this.index === start) return INVALID;

    const value = Number.parseInt(this.source.slice(start, this.index), radix);
    return Number.isFinite(value) ? (negative ? -value : value) : INVALID;
  }

  private isRadixDigit(char: string | undefined, radix: 2 | 8 | 16): boolean {
    if (radix === 2) return char === "0" || char === "1";
    if (radix === 8) return char !== undefined && char >= "0" && char <= "7";
    return isHexDigit(char);
  }

  private consumeWord(word: string): boolean {
    if (!this.source.startsWith(word, this.index)) return false;
    const next = this.source[this.index + word.length];
    if (isIdentifierPart(next)) return false;
    this.index += word.length;
    return true;
  }
}

/**
 * Safely parse a static JS object literal string into a plain object.
 * Returns null if the expression contains anything dynamic.
 *
 * Supports string, number, boolean, and null literals; arrays of those values;
 * nested object literals; comments; and trailing commas.
 */
export function parseStaticObjectLiteral(objectStr: string): Record<string, unknown> | null {
  const parsed = new StaticObjectLiteralParser(objectStr).parse();
  return parsed !== INVALID && isStaticObject(parsed) ? parsed : null;
}
