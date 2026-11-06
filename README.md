# Equilibrium

A local chemical equation balancer built with React, TypeScript, Vite, and glpk.js. All parsing and computation happens in your browser; equations are never uploaded to a server.

## Getting started

Requires Node.js 22.12+ (Node.js 24 recommended).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. On Windows PowerShell, use `npm.cmd` instead of `npm` if script execution policy blocks `npm.ps1`.

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

`build` checks TypeScript and produces `dist/`. `preview` serves the production build locally. Serve over HTTP rather than opening `index.html` directly, so the solver's Worker/WASM can load. No backend, account, or deployment configuration is required. No external fonts or CDNs are used.

## Entering equations

Type an equation or click periodic-table elements to insert them at the last cursor position. A selection is replaced. Symbol buttons insert numbers, brackets, separators, and charges. Press Enter or click **Balance equation** to calculate; Shift+Enter inserts a line break.

- Separators: `=`, `->`, or `→`, exactly one per equation.
- Symbols are case-sensitive: `Co` is cobalt; `CO` is carbon and oxygen. The table contains all 118 IUPAC elements, searchable by English name, symbol, or atomic number.
- Subscripts: `H2O` or `H₂O`; positive integers only, with no leading zeros.
- Nested groups: `Ca(OH)2`, `K4[Fe(CN)6]`.
- Hydrates: `CuSO4·5H2O`, using a middle dot, not a decimal point.
- Charges require a caret: `H^+`, `Fe^2+`, `SO4^2-`. Electrons are `e^-`. Write `Fe^3+`, not `Fe3+`.
- Existing positive integer coefficients are accepted and recalculated, not treated as constraints.
- Charges and separators need no spaces: `Fe^2+=Fe^3++e^-` is valid.

Examples:

```text
Fe2O3 + CO = Fe + CO2
CuSO4·5H2O = CuSO4 + H2O
MnO4^- + Fe^2+ + H^+ = Mn^2+ + Fe^3+ + H2O
C + O2 = CO + CO2
```

The formatted result omits coefficients of 1. **Copy equation** copies plain text with explicit caret charges. Expand the conservation check to inspect atom counts and total charge.

## Validation and solver

`parseEquation(input)` returns a structured equation or an English diagnostic with zero-based, end-exclusive source offsets. It checks syntax, known symbols, positive integer counts, brackets, charge notation, and equal element sets on both sides. Errors select the relevant input range. Equations are limited to 4,000 characters, 64 substances, and 32 levels of group nesting; atom counts must fit JavaScript's safe integer range.

`balanceEquation(equation, signal?)` runs the browser solver with cancellation. The shared `solveWith` function constructs `Ax = 0`, adds charge conservation when needed, constrains every coefficient to a positive integer, and minimizes their sum. When several solutions share the same minimum sum, any one may be returned. It preserves the supplied substances and their order; it does not add water, acid, base, or missing products automatically.

glpk.js runs in a Web Worker with a five-second solver limit and a six-second overall watchdog. Only optimal solver results are accepted, with integer validation and exact `BigInt` conservation checks. Infeasible equations, timeouts, loading errors, cancellation, and numerical failures are distinct outcomes. Tests use the `glpk.js/node` adapter with the same model and verification logic.

The tool checks syntax and conservation, not whether a compound exists or a reaction actually occurs. State labels, reaction conditions, isotopes, fractional subscripts, and structural formulas are outside the supported grammar. Two sides can contain identical elements and still have no valid balance, for example `H2O = H2O2`.

## Sources and dependencies

Element names and symbols follow the [IUPAC periodic table](https://iupac.org/what-we-do/periodic-table-of-elements/). Periodic-table colors are broad educational groupings.

The optimizer is [glpk.js](https://github.com/jvail/glpk.js), a GPL-3.0 JavaScript/WebAssembly port of GLPK. Its license and notices are included in the installed dependency; review its license before redistributing this application. React, Vite, TypeScript, and Vitest retain their respective licenses.
