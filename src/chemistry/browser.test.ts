import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GLPK from 'glpk.js';
import { solveWith } from './solver';
import { balanceEquation } from './browser';
import { parseEquation } from './parser';

vi.mock('glpk.js', () => ({ default: vi.fn() }));
vi.mock('./solver', () => ({ solveWith: vi.fn() }));
const parsed = parseEquation('H2+O2=H2O');
if (!parsed.ok) throw new Error('Invalid test fixture');
const equation = parsed.equation;
const terminate = vi.fn();
const solver = { terminate } as unknown as Awaited<ReturnType<typeof GLPK>>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(GLPK).mockResolvedValue(solver);
});
afterEach(() => vi.useRealTimers());

describe('browser solver lifecycle', () => {
  it('releases its worker after success', async () => {
    vi.mocked(solveWith).mockResolvedValue({ ok: true, coefficients: [2,1,2], text: '2H2 + O2 = 2H2O', conservation: [] });
    expect(await balanceEquation(equation)).toMatchObject({ ok: true });
    expect(terminate).toHaveBeenCalledOnce();
  });
  it('distinguishes a loading failure', async () => {
    vi.mocked(GLPK).mockRejectedValue(new Error('WASM unavailable'));
    expect(await balanceEquation(equation)).toMatchObject({ ok: false, code: 'LOAD' });
  });
  it('distinguishes a runtime failure and releases the worker', async () => {
    vi.mocked(solveWith).mockRejectedValue(new Error('Aborted'));
    expect(await balanceEquation(equation)).toMatchObject({ ok: false, code: 'NUMERIC' });
    expect(terminate).toHaveBeenCalledOnce();
  });
  it('does not load a worker for an already aborted request', async () => {
    const controller = new AbortController(); controller.abort();
    expect(await balanceEquation(equation, controller.signal)).toMatchObject({ code: 'CANCELLED' });
    expect(GLPK).not.toHaveBeenCalled();
  });
  it('cancels an in-flight solve', async () => {
    vi.mocked(solveWith).mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const pending = balanceEquation(equation, controller.signal);
    await Promise.resolve(); controller.abort();
    expect(await pending).toMatchObject({ code: 'CANCELLED' });
    expect(terminate).toHaveBeenCalled();
  });
  it('times out and terminates a stuck solve', async () => {
    vi.useFakeTimers();
    vi.mocked(solveWith).mockReturnValue(new Promise(() => {}));
    const pending = balanceEquation(equation);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toMatchObject({ code: 'TIMEOUT' });
    expect(terminate).toHaveBeenCalled();
  });
  it('cleans up a worker whose initialization finishes after timeout', async () => {
    vi.useFakeTimers();
    let finish!: (value: typeof solver) => void;
    vi.mocked(GLPK).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = balanceEquation(equation);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toMatchObject({ code: 'TIMEOUT' });
    finish(solver); await Promise.resolve();
    expect(terminate).toHaveBeenCalledOnce();
    expect(solveWith).not.toHaveBeenCalled();
  });
});
