import { elementBySymbol } from "./elements";
export interface Diagnostic {
  code: string;
  message: string;
  start: number;
  end: number;
}
export interface Species {
  formula: string;
  atoms: Record<string, bigint>;
  charge: bigint;
  start: number;
  end: number;
}
export interface Equation {
  reactants: Species[];
  products: Species[];
  elements: string[];
  hasCharge: boolean;
}
export type ParseResult =
  { ok: true; equation: Equation } | { ok: false; error: Diagnostic };
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
class ParseFailure extends Error {
  constructor(public diagnostic: Diagnostic) {
    super(diagnostic.message);
  }
}
class Parser {
  pos: number;
  constructor(
    private text: string,
    private begin: number,
    private end: number,
  ) {
    this.pos = begin;
  }
  fail(message: string, start = this.pos, code = "SYNTAX"): never {
    throw new ParseFailure({
      code,
      message,
      start,
      end: Math.min(this.text.length, Math.max(start + 1, this.pos)),
    });
  }
  skip() {
    while (this.pos < this.end && /\s/.test(this.text[this.pos])) this.pos++;
  }
  char() {
    return this.pos < this.end ? this.text[this.pos] : "";
  }
  number(): bigint {
    const start = this.pos;
    while (this.pos < this.end && /[0-9]/.test(this.text[this.pos])) this.pos++;
    if (start === this.pos) return 1n;
    const raw = this.text.slice(start, this.pos);
    if (raw[0] === "0")
      this.fail(
        "Numbers must be positive integers without leading zeros.",
        start,
      );
    const value = BigInt(raw);
    if (value > MAX)
      this.fail("This number exceeds the safe integer range.", start, "RANGE");
    return value;
  }
  add(
    target: Record<string, bigint>,
    source: Record<string, bigint>,
    multiple = 1n,
  ) {
    for (const [key, count] of Object.entries(source)) {
      target[key] = (target[key] ?? 0n) + count * multiple;
      if (target[key] > MAX)
        this.fail(
          "The atom count exceeds the safe integer range.",
          this.pos,
          "RANGE",
        );
    }
  }
  group(close = "", depth = 0): Record<string, bigint> {
    if (depth > 32) this.fail("Parentheses are nested too deeply.");
    const atoms: Record<string, bigint> = {};
    let terms = 0;
    while (this.pos < this.end) {
      this.skip();
      const ch = this.char();
      if (
        !ch ||
        ch === "+" ||
        ch === "^" ||
        ch === "·" ||
        ch === ")" ||
        ch === "]"
      )
        break;
      let term: Record<string, bigint>;
      if (ch === "(" || ch === "[") {
        const start = this.pos++;
        const expected = ch === "(" ? ")" : "]";
        term = this.group(expected, depth + 1);
        if (this.char() !== expected)
          this.fail(`Expected "${expected}" to close this group.`, start);
        this.pos++;
      } else if (/[A-Z]/.test(ch)) {
        const start = this.pos++;
        if (this.pos < this.end && /[a-z]/.test(this.char())) this.pos++;
        const symbol = this.text.slice(start, this.pos);
        if (!elementBySymbol.has(symbol))
          this.fail(
            `Unknown element "${symbol}". Element symbols are case-sensitive.`,
            start,
            "ELEMENT",
          );
        term = { [symbol]: 1n };
      } else
        this.fail(
          `Unexpected "${ch}". Use valid element symbols, parentheses and integer subscripts.`,
        );
      this.add(atoms, term, this.number());
      terms++;
    }
    if (!terms)
      this.fail(
        close ? "Groups cannot be empty." : "Expected a chemical formula.",
      );
    return atoms;
  }
  species(): Species {
    this.skip();
    const start = this.pos;
    this.number(); // Existing coefficients are intentionally recalculated.
    this.skip();
    const formulaStart = this.pos;
    let atoms: Record<string, bigint>;
    let charge = 0n;
    if (this.char() === "e") {
      if (this.text.slice(this.pos, this.pos + 3) !== "e^-")
        this.fail("Write an electron as e^-.");
      this.pos += 3;
      atoms = {};
      charge = -1n;
    } else {
      atoms = this.group();
      while (this.char() === "·") {
        this.pos++;
        this.skip();
        const multiplier = this.number();
        this.add(atoms, this.group(), multiplier);
      }
      if (this.char() === "^") {
        this.pos++;
        const magnitude = this.number();
        const sign = this.char();
        if (sign !== "+" && sign !== "-")
          this.fail(
            "A charge must end with + or -, for example Fe^2+ or SO4^2-.",
          );
        charge = sign === "+" ? magnitude : -magnitude;
        this.pos++;
      }
    }
    const end = this.pos;
    this.skip();
    if (this.pos < this.end && this.char() !== "+")
      this.fail(
        "Unexpected text after the formula. Write charges with ^, for example Fe^3+.",
      );
    return {
      formula: this.text.slice(formulaStart, end).replace(/\s/g, ""),
      atoms,
      charge,
      start,
      end,
    };
  }
  side(): Species[] {
    this.skip();
    if (this.pos === this.end)
      this.fail(
        "Both sides of the equation must contain a substance.",
        this.begin,
      );
    const result = [this.species()];
    while (this.pos < this.end) {
      this.pos++;
      result.push(this.species());
    }
    return result;
  }
}
export function parseEquation(input: string): ParseResult {
  try {
    if (input.length > 4000)
      throw new ParseFailure({
        code: "RANGE",
        message: "Keep the equation under 4,000 characters.",
        start: 4000,
        end: input.length,
      });
    const text = input.replace(/[₀-₉]/g, (c) =>
      String("₀₁₂₃₄₅₆₇₈₉".indexOf(c)),
    );
    const separators = [...text.matchAll(/->|→|=/g)];
    if (separators.length !== 1)
      throw new ParseFailure({
        code: "SYNTAX",
        message: "Use exactly one equation separator: =, -> or →.",
        start: separators[1]?.index ?? 0,
        end: separators[1]
          ? separators[1].index! + separators[1][0].length
          : input.length,
      });
    const separator = separators[0];
    const reactants = new Parser(text, 0, separator.index!).side();
    const products = new Parser(
      text,
      separator.index! + separator[0].length,
      text.length,
    ).side();
    const left = new Set(reactants.flatMap((s) => Object.keys(s.atoms)));
    const right = new Set(products.flatMap((s) => Object.keys(s.atoms)));
    const leftMissing = [...right].filter((e) => !left.has(e));
    const rightMissing = [...left].filter((e) => !right.has(e));
    if (leftMissing.length || rightMissing.length)
      throw new ParseFailure({
        code: "ELEMENT_MISMATCH",
        message: [
          leftMissing.length
            ? `Missing on the left: ${leftMissing.join(", ")}.`
            : "",
          rightMissing.length
            ? `Missing on the right: ${rightMissing.join(", ")}.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        start: 0,
        end: input.length,
      });
    if (!left.size)
      throw new ParseFailure({
        code: "SYNTAX",
        message: "Include at least one chemical element on each side.",
        start: 0,
        end: input.length,
      });
    if (reactants.length + products.length > 64)
      throw new ParseFailure({
        code: "RANGE",
        message: "Use no more than 64 substances.",
        start: 0,
        end: input.length,
      });
    return {
      ok: true,
      equation: {
        reactants,
        products,
        elements: [...left].sort(
          (a, b) =>
            elementBySymbol.get(a)!.number - elementBySymbol.get(b)!.number,
        ),
        hasCharge: [...reactants, ...products].some((s) => s.charge !== 0n),
      },
    };
  } catch (e) {
    if (e instanceof ParseFailure) return { ok: false, error: e.diagnostic };
    throw e;
  }
}
