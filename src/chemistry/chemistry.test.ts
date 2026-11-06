import { describe, it, expect, beforeAll } from "vitest";
import GLPK from "glpk.js/node";
import { elements } from "./elements";
import { parseEquation } from "./parser";
import { buildMatrix, solveWith, type Solver } from "./solver";
let glpk: Awaited<ReturnType<typeof GLPK>>;
beforeAll(async () => {
  glpk = await GLPK();
});
function equation(input: string) {
  const parsed = parseEquation(input);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.equation;
}
describe("periodic table", () => {
  it("has 118 unique, positioned elements in atomic-number order", () => {
    expect(elements).toHaveLength(118);
    expect(new Set(elements.map((e) => e.symbol)).size).toBe(118);
    expect(new Set(elements.map((e) => `${e.row}:${e.column}`)).size).toBe(118);
    expect(
      elements.every(
        (e, i) => e.number === i + 1 && e.column >= 1 && e.column <= 18,
      ),
    ).toBe(true);
    for (const e of elements)
      expect(parseEquation(`${e.symbol}=${e.symbol}`).ok).toBe(true);
  });
});
describe("parser", () => {
  it.each(["=", "->", "→"])(
    "accepts separator %s and existing coefficients",
    (sep) => {
      expect(equation(`2H₂ + O₂ ${sep} 2H₂O`).reactants[0].atoms).toEqual({
        H: 2n,
      });
    },
  );
  it("parses nested groups exactly", () => {
    expect(equation("K4[Fe(CN)6] = K4[Fe(CN)6]").reactants[0].atoms).toEqual({
      K: 4n,
      Fe: 1n,
      C: 6n,
      N: 6n,
    });
  });
  it("expands all hydrate components", () => {
    expect(equation("CuSO4·5H2O = CuSO4 + H2O").reactants[0].atoms).toEqual({
      Cu: 1n,
      S: 1n,
      O: 9n,
      H: 10n,
    });
  });
  it("distinguishes cobalt from carbon monoxide", () => {
    expect(equation("Co=Co").elements).toEqual(["Co"]);
    expect(equation("CO=CO").elements).toEqual(["C", "O"]);
  });
  it("parses contiguous charge signs and electrons", () => {
    const eq = equation("Fe^2+=Fe^3++e^-");
    expect(eq.reactants[0].charge).toBe(2n);
    expect(eq.products[1].atoms).toEqual({});
    expect(eq.products[1].charge).toBe(-1n);
    expect(buildMatrix(eq)).toEqual([
      [1n, -1n, 0n],
      [2n, -3n, 1n],
    ]);
  });
  it("reports the original source location for an unknown symbol", () => {
    expect(parseEquation("H₂ + Xx = H₂")).toEqual({
      ok: false,
      error: {
        code: "ELEMENT",
        message: 'Unknown element "Xx". Element symbols are case-sensitive.',
        start: 5,
        end: 7,
      },
    });
  });
  it("reports missing elements on both sides", () => {
    const result = parseEquation("H2 + O2 = NaCl");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ELEMENT_MISMATCH");
      expect(result.error.message).toContain("Missing on the left: Na, Cl");
      expect(result.error.message).toContain("Missing on the right: H, O");
    }
  });
  it.each([
    "",
    "H2",
    "=H2",
    "H2=",
    "H2==H2",
    "H2 + = H2",
    "H0=H0",
    "H01=H01",
    "0H2=H2",
    "H2.5=H2",
    "H-2=H2",
    "co=Co",
    "Xx=Xx",
    "Ca(OH]=CaOH",
    "()=H2",
    "H2)=H2",
    "Fe^2=Fe",
    "Fe^0+=Fe",
    "Fe3+=Fe",
    "e^-=e^-",
    "H2(aq)=H2",
    "H9007199254740992=H",
    "(H9007199254740991)2=H",
  ])("rejects malformed or unsupported input: %s", (text) => {
    expect(parseEquation(text).ok).toBe(false);
  });
});
describe("integer optimization and exact verification", () => {
  it.each([
    ["Fe2O3 + CO = Fe + CO2", [1, 3, 2, 3]],
    ["C + O2 = CO + CO2", [3, 2, 2, 1]],
    ["CuSO4·5H2O = CuSO4 + H2O", [1, 1, 5]],
    ["MnO4^- + Fe^2+ + H^+ = Mn^2+ + Fe^3+ + H2O", [1, 5, 8, 1, 5, 4]],
    ["Fe^2+=Fe^3++e^-", [1, 1, 1]],
    ["7H2+8O2=9H2O", [2, 1, 2]],
    ["C2H6+O2=CO2+H2O", [2, 7, 4, 6]],
    ["Ca(OH)2+HCl=CaCl2+H2O", [1, 2, 1, 2]],
  ])("balances %s", async (input, expected) => {
    const result = await solveWith(equation(input), glpk as unknown as Solver);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.coefficients).toEqual(expected);
      expect(result.conservation.every((r) => r.left === r.right)).toBe(true);
      expect(result.text).not.toMatch(/(?:^| \+ | = )1[A-Z]/);
    }
  });
  it.each(["H2O=H2O2", "Fe^2+=Fe^3+"])(
    "rejects an infeasible equation: %s",
    async (text) => {
      expect(
        await solveWith(equation(text), glpk as unknown as Solver),
      ).toMatchObject({ ok: false, code: "INFEASIBLE" });
    },
  );
  it("rejects an integer-looking result that violates exact conservation", async () => {
    const fake = {
      ...glpk,
      solve: async () => ({
        result: { status: glpk.GLP_OPT, vars: { x0: 1, x1: 1, x2: 1 } },
      }),
    } as unknown as Solver;
    expect(await solveWith(equation("H2+O2=H2O"), fake)).toMatchObject({
      ok: false,
      code: "NUMERIC",
    });
  });
  it("never accepts a merely feasible solution as optimal", async () => {
    const fake = {
      ...glpk,
      solve: async () => ({ result: { status: glpk.GLP_FEAS, vars: {} } }),
    } as unknown as Solver;
    expect(await solveWith(equation("H2+O2=H2O"), fake)).toMatchObject({
      ok: false,
      code: "TIMEOUT",
    });
  });
});
