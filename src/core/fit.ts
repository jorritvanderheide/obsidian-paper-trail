// How many rows of each section the queue shows.
//
// The cap used to be three, everywhere, always. That was right about the
// failure it was guarding: four hundred untriaged papers in a sidebar is not a
// list, it is a wall, and a queue you scroll past is one you stop reading.
//
// It was wrong about everything else. A pane is eight hundred pixels tall and
// three rows a section fills a third of it, so the common case was a mostly
// empty panel insisting there was more it would not show you.
//
// So the cap is the pane. Fill the space, then stop.
//
// Pure: the caller measures and hands over the numbers.

/** What a section shows when there is nothing to measure against. */
export const DEFAULT_ROWS = 3;

/**
 * What one section occupies: its rows, plus the line saying what it is holding
 * back.
 *
 * That line is the whole reason this counts rather than sums. It is a row's
 * height, so a section hiding one paper takes exactly as much room as a section
 * hiding none and showing it, while telling you less. Counting its cost is what
 * makes "and 1 more" impossible to produce: giving that row away is free, so
 * the loop below always gives it.
 */
function cost(shown: number, count: number): number {
	return shown + (shown < count ? 1 : 0);
}

/**
 * How many rows each section gets, given what each holds and how many will fit.
 *
 * A null budget means nothing could be measured: the queue is in a note rather
 * than the sidebar, where the block is as tall as its contents and there is no
 * space to fill, or the pane has not been laid out yet. Both fall back to the
 * fixed cap, which is the right answer when the question cannot be asked. The
 * free row is not part of the question, so it is given away there too.
 *
 * Handed out one row at a time, round by round, so a section with two papers is
 * not starved by one with four hundred. That is the whole of the fairness rule,
 * and it avoids having to decide what a fair share is in fractions.
 */
export function fit(counts: readonly number[], budget: number | null): number[] {
	// The cap counts space, not papers, and the line standing in for what it
	// hides takes a row like any other. A section holding one more than the cap
	// spends four lines to show three papers, where four lines would show four.
	// Nothing about that depends on having measured a pane, and leaving it out
	// of this branch is what left the block still saying "and 1 more".
	if (budget === null) return counts.map((count) => (count <= DEFAULT_ROWS + 1 ? count : DEFAULT_ROWS));

	const shown = counts.map(() => 0);
	const total = () => shown.reduce((sum, n, i) => sum + cost(n, counts[i] ?? 0), 0);

	let gave = true;
	while (gave) {
		gave = false;
		for (let i = 0; i < counts.length; i++) {
			if (shown[i]! >= (counts[i] ?? 0)) continue;

			const before = total();
			shown[i]!++;
			const after = total();

			// Worth it when there is room, and worth it regardless when it costs
			// nothing. The second is not a nicety: giving a section its last row
			// deletes the line that was standing in for it, so the section takes
			// exactly the same space and says more. Comparing only against the
			// budget missed that whenever the budget was already overspent, which
			// is how a pane too short for its own headers still managed to
			// produce "and 1 more".
			if (after <= budget || after <= before) gave = true;
			else shown[i]!--;
		}
	}

	return shown;
}
