import GLPK from "glpk.js";
import type { Equation } from "./parser";
import { solveWith, type BalanceResult } from "./solver";
export async function balanceEquation(
  equation: Equation,
  signal?: AbortSignal,
): Promise<BalanceResult> {
  let solver: Awaited<ReturnType<typeof GLPK>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  let finished = false;
  const stopped = new Promise<BalanceResult>((resolve) => {
    abort = () => {
      solver?.terminate();
      resolve({
        ok: false,
        code: "CANCELLED",
        message: "Calculation cancelled.",
      });
    };
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      solver?.terminate();
      resolve({
        ok: false,
        code: "TIMEOUT",
        message: "Calculation timed out. Try a simpler equation.",
      });
    }, 6000);
  });
  try {
    if (signal?.aborted)
      return {
        ok: false,
        code: "CANCELLED",
        message: "Calculation cancelled.",
      };
    return await Promise.race([
      stopped,
      (async (): Promise<BalanceResult> => {
        try {
          solver = await GLPK();
        } catch {
          return {
            ok: false,
            code: "LOAD",
            message:
              "Could not load the solver. Reload the page and try again.",
          };
        }
        if (finished || signal?.aborted) {
          solver.terminate();
          return {
            ok: false,
            code: "CANCELLED",
            message: "Calculation cancelled.",
          };
        }
        try {
          return await solveWith(equation, solver);
        } catch {
          return {
            ok: false,
            code: "NUMERIC",
            message:
              "The solver could not verify a balance. Check the equation and try again.",
          };
        }
      })(),
    ]);
  } finally {
    finished = true;
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
    solver?.terminate();
  }
}
