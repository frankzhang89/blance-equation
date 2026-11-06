import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { elements } from "./chemistry/elements";
import {
  parseEquation,
  type Diagnostic,
  type Equation,
} from "./chemistry/parser";
import { balanceEquation } from "./chemistry/browser";
import type { BalanceResult } from "./chemistry/solver";
import "./style.css";

const examples = [
  { name: "Iron reduction", value: "Fe2O3 + CO = Fe + CO2" },
  { name: "Combustion", value: "C2H6 + O2 = CO2 + H2O" },
  { name: "Hydrate", value: "CuSO4·5H2O = CuSO4 + H2O" },
  {
    name: "Ionic reaction",
    value: "MnO4^- + Fe^2+ + H^+ = Mn^2+ + Fe^3+ + H2O",
  },
  { name: "Multiple solutions", value: "C + O2 = CO + CO2" },
];
function Formula({ value }: { value: string }) {
  const [body, charge] = value.split("^");
  return (
    <>
      {body.split("·").map((segment, i) => (
        <React.Fragment key={i}>
          {i > 0 && "·"}
          {segment
            .split(/(\d+)/)
            .map((token, j) =>
              /^\d+$/.test(token) &&
              !(i > 0 && j === 1 && segment.startsWith(token)) ? (
                <sub key={j}>{token}</sub>
              ) : (
                token
              ),
            )}
        </React.Fragment>
      ))}
      {charge && (
        <sup>
          {charge === "1+"
            ? "+"
            : charge === "1-"
              ? "−"
              : charge.replace("-", "−")}
        </sup>
      )}
    </>
  );
}
function EquationView({
  equation,
  coefficients,
}: {
  equation: Equation;
  coefficients?: number[];
}) {
  const side = (species: Equation["reactants"], offset: number) =>
    species.map((s, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span className="operator"> + </span>}
        <span className="substance">
          {coefficients && coefficients[offset + i] !== 1 && (
            <span className="coefficient">{coefficients[offset + i]}</span>
          )}
          <Formula value={s.formula} />
        </span>
      </React.Fragment>
    ));
  return (
    <>
      {side(equation.reactants, 0)}
      <span className="operator arrow"> → </span>
      {side(equation.products, equation.reactants.length)}
    </>
  );
}
function App() {
  const [input, setInput] = useState(examples[0].value);
  const [error, setError] = useState<Diagnostic | null>(null);
  const [result, setResult] = useState<BalanceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: input.length, end: input.length });
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const parsed = useMemo(() => parseEquation(input), [input]);
  useEffect(() => () => controller.current?.abort(), []);
  function change(value: string) {
    generation.current++;
    controller.current?.abort();
    setInput(value);
    setResult(null);
    setError(null);
    setBusy(false);
    setCopied(false);
    setCopyError(false);
  }
  function insert(value: string) {
    const { start, end } = selection.current;
    flushSync(() => change(input.slice(0, start) + value + input.slice(end)));
    const cursor = start + value.length;
    selection.current = { start: cursor, end: cursor };
    editor.current?.focus();
    editor.current?.setSelectionRange(cursor, cursor);
  }
  async function balance() {
    if (!parsed.ok) {
      setError(parsed.error);
      setResult(null);
      editor.current?.focus();
      editor.current?.setSelectionRange(parsed.error.start, parsed.error.end);
      return;
    }
    const id = ++generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy(true);
    setError(null);
    setResult(null);
    const next = await balanceEquation(
      parsed.equation,
      controller.current.signal,
    );
    if (generation.current !== id) return;
    setResult(next);
    setBusy(false);
  }
  async function copy() {
    if (!result?.ok) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  const categories = [
    ["nonmetal", "Nonmetals & halogens"],
    ["noble", "Noble gases"],
    ["metal", "Other metals"],
    ["transition", "Transition metals"],
    ["metalloid", "Metalloids"],
    ["inner", "Lanthanides & actinides"],
  ];
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            ⇌
          </span>
          <span>
            Equilibrium<span className="brand-sub">THE CHEMISTRY TOOLKIT</span>
          </span>
        </div>
        <span className="local-badge">
          <i /> Calculated on your device
        </span>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span /> A MATTER OF CONSERVATION
            </div>
            <h1>
              A little balance.
              <br />
              <em>A lot of chemistry.</em>
            </h1>
            <p>
              From a simple reaction to a complex ionic equation.
              <br className="desktop-break" /> Find the smallest coefficients.
              See every atom accounted for.
            </p>
          </div>
          <div className="intro-note">
            <span className="note-mark">Σ</span>
            <span>
              Nothing lost.
              <br />
              Nothing gained.
              <br />
              <strong>Everything balanced.</strong>
            </span>
          </div>
        </section>
        <section className="card editor-card" aria-labelledby="editor-title">
          <div className="section-heading">
            <div>
              <span className="step">01</span>
              <h2 id="editor-title">Build your equation</h2>
            </div>
            <span className="quiet">TYPE IT. OR BUILD IT BELOW.</span>
          </div>
          <div className="examples">
            <span>Try an example</span>
            {examples.map((e) => (
              <button
                key={e.name}
                className={input === e.value ? "example active" : "example"}
                onClick={() => {
                  change(e.value);
                  selection.current = {
                    start: e.value.length,
                    end: e.value.length,
                  };
                }}
              >
                {e.name}
              </button>
            ))}
          </div>
          <label htmlFor="equation" className="input-label">
            CHEMICAL EQUATION
          </label>
          <div className={"input-wrap" + (error ? " invalid" : "")}>
            <textarea
              id="equation"
              ref={editor}
              value={input}
              spellCheck={false}
              rows={2}
              aria-invalid={!!error}
              aria-describedby={error ? "input-error" : "input-help"}
              placeholder="e.g. H2 + O2 = H2O"
              onChange={(e) => {
                change(e.target.value);
                selection.current = {
                  start: e.target.selectionStart,
                  end: e.target.selectionEnd,
                };
              }}
              onSelect={(e) => {
                selection.current = {
                  start: e.currentTarget.selectionStart,
                  end: e.currentTarget.selectionEnd,
                };
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void balance();
                }
              }}
            />
            <span className="input-corner" aria-hidden="true">
              ↵
            </span>
          </div>
          <div className="toolbar" aria-label="Equation symbols">
            {[
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              "0",
              "(",
              ")",
              "[",
              "]",
              "+",
              "=",
              "·",
              "^+",
              "^-",
              "^2+",
              "^2-",
              "e^-",
            ].map((t) => (
              <button
                key={t}
                aria-label={`Insert ${t}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <p id="input-help" className="help">
            Use <code>=</code>, <code>-&gt;</code> or <code>→</code> between
            sides. Charges: <code>Fe^2+</code>, <code>SO4^2-</code>. Electrons:{" "}
            <code>e^-</code>.
          </p>
          {error && (
            <div className="error" id="input-error" role="alert">
              <strong>Check your equation</strong>
              <span>
                {error.message}{" "}
                <small>
                  Position {error.start + 1}
                  {error.end > error.start + 1 ? `–${error.end}` : ""}
                </small>
              </span>
            </div>
          )}
          <div className="editor-bottom">
            <div className="preview">
              <span className="input-label">FORMULA PREVIEW</span>
              <div className="formula">
                {parsed.ok ? (
                  <EquationView equation={parsed.equation} />
                ) : (
                  <span className="preview-empty">
                    Your equation will appear here
                  </span>
                )}
              </div>
            </div>
            <div className="actions">
              <button
                className="text-button"
                onClick={() => {
                  change("");
                  selection.current = { start: 0, end: 0 };
                  editor.current?.focus();
                }}
              >
                Clear
              </button>
              {busy ? (
                <button
                  className="primary"
                  onClick={() => {
                    generation.current++;
                    controller.current?.abort();
                    setBusy(false);
                  }}
                >
                  Cancel calculation <span className="spinner" />
                </button>
              ) : (
                <button className="primary" onClick={() => void balance()}>
                  Balance equation <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </div>
        </section>
        <div aria-live="polite" aria-atomic="true">
          {busy && (
            <p className="working">
              Finding the smallest positive integer coefficients…
            </p>
          )}
          {result && !result.ok && (
            <div className="error result-error" role="alert">
              <strong>
                {result.code === "INFEASIBLE"
                  ? "This equation cannot be balanced"
                  : "Calculation interrupted"}
              </strong>
              <span>{result.message}</span>
            </div>
          )}
        </div>
        {result?.ok && parsed.ok && (
          <section className="card result-card" aria-labelledby="result-title">
            <div className="result-top">
              <div>
                <span className="step">✓</span>
                <h2 id="result-title">Everything adds up.</h2>
              </div>
              <span className="verified">EXACTLY VERIFIED</span>
            </div>
            <div className="result-equation formula">
              <EquationView
                equation={parsed.equation}
                coefficients={result.coefficients}
              />
            </div>
            <div className="result-meta">
              <span>
                Smallest coefficient sum:{" "}
                <strong>
                  {result.coefficients.reduce((a, b) => a + b, 0)}
                </strong>{" "}
                · Positive integers · Atoms &amp; charge conserved
              </span>
              <button className="copy" onClick={() => void copy()}>
                {copied ? "Copied ✓" : "Copy equation ↗"}
              </button>
            </div>
            {copyError && (
              <p className="help" role="alert">
                Clipboard is unavailable. Select and copy this equation:{" "}
                <code>{result.text}</code>
              </p>
            )}
            <details>
              <summary>
                Inspect the conservation check <span>Reactants = Products</span>
              </summary>
              <table>
                <thead>
                  <tr>
                    <th>Element / charge</th>
                    <th>Reactants</th>
                    <th>Products</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.conservation.map((row) => (
                    <tr key={row.label}>
                      <th>{row.label}</th>
                      <td>{row.left.toString()}</td>
                      <td>{row.right.toString()}</td>
                      <td className="matched">✓ Conserved</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        )}
        <section
          className="card periodic-card"
          aria-labelledby="periodic-title"
        >
          <div className="section-heading">
            <div>
              <span className="step">02</span>
              <h2 id="periodic-title">The building blocks</h2>
            </div>
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                aria-label="Search elements"
                placeholder="Find an element…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <p className="periodic-help">
            118 elements. Endless possibilities. Click an element to insert it
            at your cursor.
          </p>
          <div className="periodic-scroll">
            <div className="periodic-table">
              <div className="table-note">
                <span>THE PERIODIC TABLE</span>
                <strong>Choose your elements.</strong>
                <small>
                  Element symbols are case-sensitive.
                  <br />
                  <b>Co</b> is cobalt. <b>CO</b> is carbon monoxide.
                </small>
              </div>
              {Array.from({ length: 18 }, (_, i) => (
                <span
                  key={`g${i}`}
                  className="group-label"
                  style={{ gridRow: 1, gridColumn: i + 1 }}
                >
                  {i + 1}
                </span>
              ))}
              {elements.map((e) => {
                const match =
                  !query ||
                  `${e.symbol} ${e.name} ${e.number}`
                    .toLowerCase()
                    .includes(query.toLowerCase().trim());
                return (
                  <button
                    key={e.symbol}
                    className={`element ${e.category}${match ? "" : " dimmed"}`}
                    style={{ gridRow: e.row + 1, gridColumn: e.column }}
                    title={`${e.number} · ${e.name} (${e.symbol})`}
                    aria-label={`Insert ${e.name} (${e.symbol})`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insert(e.symbol)}
                  >
                    <span className="atomic-number">{e.number}</span>
                    <strong>{e.symbol}</strong>
                    <span className="element-name">{e.name}</span>
                  </button>
                );
              })}
              <span
                className="series-placeholder"
                style={{ gridRow: 7, gridColumn: 3 }}
              >
                57–71
                <br />
                La–Lu ↙
              </span>
              <span
                className="series-placeholder"
                style={{ gridRow: 8, gridColumn: 3 }}
              >
                89–103
                <br />
                Ac–Lr ↙
              </span>
            </div>
          </div>
          {query && (
            <p className="search-count" role="status">
              {
                elements.filter((e) =>
                  `${e.symbol} ${e.name} ${e.number}`
                    .toLowerCase()
                    .includes(query.toLowerCase().trim()),
                ).length
              }{" "}
              matching elements
            </p>
          )}
          <div className="legend">
            {categories.map(([key, label]) => (
              <span key={key}>
                <i className={key} />
                {label}
              </span>
            ))}
          </div>
        </section>
        <aside className="footnote">
          <span aria-hidden="true">ⓘ</span>
          <p>
            <strong>Balance is a starting point.</strong> This tool checks
            element symbols, formula syntax, and atom and charge conservation.
            It does not predict whether a reaction occurs. Include every
            reactant and product yourself.
          </p>
        </aside>
      </main>
      <footer>
        <span>
          Equilibrium <span className="footer-dot">/</span> A small tool for big
          reactions.
        </span>
        <span>No accounts. No equation uploads.</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
