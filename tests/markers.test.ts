// The marker rule, checked against CommonMark's reference parser on thousands
// of generated notes.
//
// Every bug in how the region was found came from a line that looked like a
// marker and was something else: quoted, in a list, in a code block, joined to
// a sentence. Each one was found by somebody trying the next shape by hand.
// This tries all of the shapes at once, in every order, against a parser that
// knows what each line really is.
//
// Two kinds of note are left out, because Paper Trail doesn't read what
// would decide them. One holds raw HTML: a marker alone on its line inside
// somebody's `<div>` block or open `<!--` comment still counts. The other has a
// code block inside a list item: one closed by a fence at the start of the
// line is, to CommonMark, closed by the list ending, and that fence opens a
// new one. Both are known limits, and narrow ones: each needs a marker-shaped
// line written into that shape as well as a real marker deleted.
//
// Only one direction is checked, the one that loses text. A marker counted
// where CommonMark sees something else can pair with the real one and have a
// sync replace the person's writing between them. A marker CommonMark sees
// and Paper Trail doesn't count only leaves the note alone with a message.
import { Parser } from 'commonmark';
import { describe, expect, it } from 'vitest';
import { REGION_END, REGION_START, regionRange, regionStart } from '../src/core/paper-note';

/** The lines CommonMark reads as one marker and nothing else, top level, 0-based. */
function standalone(lines: readonly string[], marker: string): Set<number> {
	const found = new Set<number>();
	for (let node = parse(lines).firstChild; node; node = node.next) {
		if (node.type === 'html_block' && node.literal?.trim() === marker) found.add(node.sourcepos[0][0] - 1);
	}
	return found;
}

function parse(lines: readonly string[]) {
	return new Parser().parse(lines.join('\n'));
}

/** Whether a note has raw HTML of its own, or a code block in a list item. */
function leftOut(lines: readonly string[]): boolean {
	const walker = parse(lines).walker();
	for (let step = walker.next(); step; step = walker.next()) {
		const { node } = step;
		if (!step.entering) continue;
		if (node.type === 'code_block' && node.parent?.type === 'item') return true;
		if (node.type !== 'html_block' && node.type !== 'html_inline') continue;
		if (!markers.includes(node.literal?.trim() ?? '')) return true;
	}
	return false;
}

/** A fixed sequence of numbers, so a failure is the same failure every run. */
function random(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const markers = [REGION_START, REGION_END];
const prefixes = ['', '', '', ' ', '   ', '    ', '\t', '- ', '1. ', '> ', '> > ', '  ', '>'];
const suffixes = ['', '', '', ' ', '  ', ' x', '\t'];
const pieces = [
	'Some text.',
	'',
	'',
	'',
	'## Annotations',
	'```',
	'```js',
	'````',
	'~~~',
	' ```',
	'    ```',
	'> ```',
	'- ```',
	'  ```',
	'- item',
	'1. item',
	'  - nested',
	'  continuation',
	'    indented code',
	'> quote',
	'> [!note] A callout',
	'<div>',
	'</div>',
	'<!-- an open comment',
	'a close -->',
	'<details>',
	'---',
	'| a | b |',
	'$$',
	'%%',
];

/**
 * A note with a title line, then a mix of pieces and marker-looking lines, and
 * most of the time a real pair of markers somewhere among them, so the rule
 * has a region to find and decoys to tell it from.
 */
function note(next: () => number): string[] {
	const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
	const lines: string[] = [];
	const length = 2 + Math.floor(next() * 12);
	for (let at = 0; at < length; at++) {
		lines.push(next() < 0.15 ? `${pick(prefixes)}${pick(markers)}${pick(suffixes)}` : pick(pieces));
	}
	if (next() < 0.8) {
		const start = Math.floor(next() * (lines.length + 1));
		lines.splice(start, 0, REGION_START);
		lines.splice(start + 1 + Math.floor(next() * (lines.length - start)), 0, REGION_END);
	}
	// The title keeps the first line from being `---`, which would make the
	// lines below it the note's properties: Obsidian's, not CommonMark's.
	return ['# A paper', ...lines];
}

describe('the marker rule, against CommonMark', () => {
	it('never counts a marker CommonMark reads as part of something else', () => {
		const next = random(20261030);
		const wrong: string[] = [];
		let regions = 0;
		for (let run = 0; run < 20000 && wrong.length < 5; run++) {
			const lines = note(next);
			if (leftOut(lines)) continue;
			const starts = standalone(lines, REGION_START);
			const ends = standalone(lines, REGION_END);

			const region = regionRange(lines);
			if (region) regions++;
			if (region && !(starts.has(region.start) && ends.has(region.end))) wrong.push(JSON.stringify(lines));
			const first = regionStart(lines);
			if (first !== -1 && !starts.has(first)) wrong.push(JSON.stringify(lines));
		}
		expect(wrong).toEqual([]);
		// Enough notes had a region for the check to mean something.
		expect(regions).toBeGreaterThan(500);
	});
});
