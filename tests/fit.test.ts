import { describe, expect, it } from 'vitest';
import { DEFAULT_ROWS, fit } from '../src/core/fit';

/** What a section actually occupies: its rows, plus the line hiding the rest. */
const used = (shown: number[], counts: number[]) =>
	shown.reduce((sum, n, i) => sum + n + (n < (counts[i] ?? 0) ? 1 : 0), 0);

describe('fit, with nothing to measure', () => {
	// A block in a note is as tall as what it holds, so there is no space to
	// fill and filling it would pour four hundred papers onto a dashboard.
	it('falls back to the fixed cap', () => {
		expect(fit([400, 2, 0, 1], null)).toEqual([DEFAULT_ROWS, 2, 0, 1]);
	});

	// The bug this was written for: the block took this branch every time, and
	// this branch was the one place the free row was never given away.
	it('still gives away the last row', () => {
		const counts = [DEFAULT_ROWS + 1];
		const shown = fit(counts, null);

		expect(shown).toEqual(counts);
		expect(used(shown, counts)).toBe(used([DEFAULT_ROWS], counts));
	});

	it('keeps the cap once hiding one row buys something', () => {
		expect(fit([DEFAULT_ROWS + 2], null)).toEqual([DEFAULT_ROWS]);
	});
});

describe('fit, within a budget', () => {
	it('shows everything when everything fits', () => {
		expect(fit([2, 3, 1], 20)).toEqual([2, 3, 1]);
	});

	it('fills the space rather than stopping at three', () => {
		// The whole complaint: a pane with room for twenty rows showing nine.
		expect(fit([400], 20).reduce((a, b) => a + b, 0)).toBe(19);
	});

	// Bounded by the budget, or by the one line each section owes when it is
	// holding something back, whichever is larger. That floor is not optional:
	// a pane too short for its own headers still has to say what is behind them.
	it('never spends more than the budget it can help', () => {
		for (const counts of [[400, 9, 4, 2], [1, 1, 1, 1], [0, 0, 50, 0], [7, 7, 7, 7]]) {
			const floor = counts.filter((count) => count > 0).length;
			for (const budget of [0, 1, 2, 5, 12, 40]) {
				expect(used(fit(counts, budget), counts), `${counts.join()} in ${budget}`).toBeLessThanOrEqual(
					Math.max(budget, floor),
				);
			}
		}
	});

	it('never shows more of a section than it holds', () => {
		const counts = [3, 0, 9];
		for (const budget of [0, 1, 4, 100]) {
			fit(counts, budget).forEach((shown, i) => expect(shown).toBeLessThanOrEqual(counts[i]!));
		}
	});
});

/**
 * The line reading "and 1 more" is a row's height, so it costs exactly what
 * showing the paper would and tells you less. `fit` counts that cost, which is
 * what makes the line impossible to produce rather than merely discouraged.
 */
describe('fit never hides exactly one', () => {
	it('gives the last row away, because holding it back is not cheaper', () => {
		for (const counts of [[4], [2], [10, 4], [3, 3, 3, 3], [400, 5, 2, 1]]) {
			for (let budget = 0; budget <= 30; budget++) {
				const shown = fit(counts, budget);
				shown.forEach((n, i) => {
					expect(counts[i]! - n, `${counts.join()} in ${budget}`).not.toBe(1);
				});
			}
		}
	});
});

/**
 * Round-robin, so a section with two papers is not starved by one with four
 * hundred. It is the whole of the fairness rule and needs no fractions.
 */
describe('fit shares between sections', () => {
	it('does not let a huge section crowd out a small one', () => {
		const [big, small] = fit([400, 2], 10);
		expect(small).toBe(2);
		expect(big).toBeGreaterThan(0);
	});

	it('gives a section with nothing in it nothing, and keeps its budget', () => {
		expect(fit([0, 6], 7)).toEqual([0, 6]);
	});

	it('copes with a budget of nothing at all', () => {
		expect(fit([5, 5], 0)).toEqual([0, 0]);
	});

	it('copes with no sections', () => {
		expect(fit([], 10)).toEqual([]);
	});
});
