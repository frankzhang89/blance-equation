import type { GLPK } from "glpk.js";
import type { Equation } from "./parser";
export type Solver = Pick<
  GLPK,
  | "solve"
  | "GLP_MIN"
  | "GLP_FX"
  | "GLP_LO"
  | "GLP_OPT"
  | "GLP_NOFEAS"
  | "GLP_MSG_OFF"
>;
export interface Conservation {
  label: string;
  left: bigint;
  right: bigint;
}
export type BalanceResult =
  | {
      ok: true;
      coefficients: number[];
      text: string;
      conservation: Conservation[];
    }
  | {
      ok: false;
      code: "INFEASIBLE" | "TIMEOUT" | "LOAD" | "NUMERIC" | "CANCELLED";
      message: string;
    };
export function buildMatrix(equation: Equation): bigint[][] {
  const all = [...equation.reactants, ...equation.products];
  return [...equation.elements, ...(equation.hasCharge ? ["Charge"] : [])].map(
    (label) =>
      all.map(
        (s, i) =>
          (label === "Charge" ? s.charge : (s.atoms[label] ?? 0n)) *
          (i < equation.reactants.length ? 1n : -1n),
      ),
  );
}
export async function solveWith(
  equation: Equation,
  solver: Solver,
): Promise<BalanceResult> {
  const matrix = buildMatrix(equation);
  const variables = [...equation.reactants, ...equation.products].map(
    (_, i) => `x${i}`,
  );
  const model = {
    name: "chemical_balance",
    objective: {
      direction: solver.GLP_MIN,
      name: "coefficient_sum",
      vars: variables.map((name) => ({ name, coef: 1 })),
    },
    subjectTo: matrix.map((row, i) => ({
      name: `conservation_${i}`,
      vars: row.flatMap((coef, j) =>
        coef === 0n ? [] : [{ name: variables[j], coef: Number(coef) }],
      ),
      bnds: { type: solver.GLP_FX, lb: 0, ub: 0 },
    })),
    bounds: variables.map((name) => ({
      name,
      type: solver.GLP_LO,
      lb: 1,
      ub: 0,
    })),
    generals: variables,
  };
  // GLPK 5's MIP presolver can abort on contradictory homogeneous rows.
  // An LP feasibility pass without presolve detects these before MIP setup.
  const started = performance.now();
  const relaxation = await solver.solve(
    { ...model, generals: [] },
    { tmlim: 5, presol: false, msglev: solver.GLP_MSG_OFF },
  );
  if (relaxation.result.status === solver.GLP_NOFEAS)
    return {
      ok: false,
      code: "INFEASIBLE",
      message:
        "No positive integer balance exists for these substances. Check the formulas and charges.",
    };
  const remaining = 5 - (performance.now() - started) / 1000;
  if (relaxation.result.status !== solver.GLP_OPT || remaining <= 0)
    return {
      ok: false,
      code: "TIMEOUT",
      message:
        "An optimal balance could not be established within the time limit. Try a simpler equation.",
    };
  const result = await solver.solve(model, {
    mipgap: 0,
    tmlim: remaining,
    presol: true,
    msglev: solver.GLP_MSG_OFF,
  });
  if (result.result.status === solver.GLP_NOFEAS)
    return {
      ok: false,
      code: "INFEASIBLE",
      message:
        "No positive integer balance exists for these substances. Check the formulas and charges.",
    };
  if (result.result.status !== solver.GLP_OPT)
    return {
      ok: false,
      code: "TIMEOUT",
      message:
        "An optimal balance could not be established within the time limit. Try a simpler equation.",
    };
  const values = variables.map((v) => result.result.vars[v]);
  const coefficients = values.map(Math.round);
  if (
    values.some(
      (v, i) =>
        !Number.isSafeInteger(coefficients[i]) ||
        coefficients[i] < 1 ||
        Math.abs(v - coefficients[i]) > 1e-6,
    ) ||
    matrix.some(
      (row) =>
        row.reduce(
          (sum, count, i) => sum + count * BigInt(coefficients[i]),
          0n,
        ) !== 0n,
    )
  )
    return {
      ok: false,
      code: "NUMERIC",
      message:
        "The result failed exact integer verification. Reduce the size of the equation.",
    };
  const render = (side: Equation["reactants"], offset: number) =>
    side
      .map(
        (s, i) =>
          `${coefficients[offset + i] === 1 ? "" : coefficients[offset + i]}${s.formula}`,
      )
      .join(" + ");
  const conservation = matrix.map((row, i) => ({
    label: [...equation.elements, "Charge"][i],
    left: row
      .slice(0, equation.reactants.length)
      .reduce((s, v, j) => s + v * BigInt(coefficients[j]), 0n),
    right: row
      .slice(equation.reactants.length)
      .reduce(
        (s, v, j) =>
          s - v * BigInt(coefficients[equation.reactants.length + j]),
        0n,
      ),
  }));
  return {
    ok: true,
    coefficients,
    conservation,
    text: `${render(equation.reactants, 0)} = ${render(equation.products, equation.reactants.length)}`,
  };
}
