import { describe, expect, it } from 'vitest';
import { decidedOf, excluded, isReport, renderReport, type Decided } from '../src/core/record';

const paper = (over: Partial<Decided> = {}): Decided => ({
	title: 'Reframing heat pump transitions',
	authors: 'Jeltje Van Der Haer',
	year: 2026,
	reading: 'dropped',
	triaged: '2026-03-14',
	reason: 'a review, not empirical',
	path: 'Literature/vanderhaer2026.md',
	...over,
});

describe('excluded', () => {
	it('keeps the papers ruled out and leaves the rest alone', () => {
		const papers = [
			paper({ title: 'dropped one', reading: 'dropped' }),
			paper({ title: 'deferred one', reading: 'deferred' }),
			paper({ title: 'queued one', reading: 'queued' }),
			paper({ title: 'finished one', reading: 'finished' }),
			paper({ title: 'promoted one', reading: 'pass-three' }),
		];
		expect(excluded(papers).rows.map((row) => row.title).sort()).toEqual(['deferred one', 'dropped one']);
	});

	it('counts a deferral as ruled out, because it is off the list too', () => {
		expect(excluded([paper({ reading: 'deferred' })]).rows).toHaveLength(1);
	});

	it('counts everything assessed as the denominator, not just the exclusions', () => {
		const papers = [paper({ reading: 'dropped' }), paper({ reading: 'queued' }), paper({ reading: 'untriaged' })];
		const report = excluded(papers);
		expect(report.rows).toHaveLength(1);
		expect(report.assessed).toBe(2);
	});

	it('reads forwards, because that is how a corpus narrowing reads', () => {
		const papers = [
			paper({ title: 'third', triaged: '2026-09-01' }),
			paper({ title: 'first', triaged: '2025-01-01' }),
			paper({ title: 'second', triaged: '2026-03-14' }),
		];
		expect(excluded(papers).rows.map((row) => row.title)).toEqual(['first', 'second', 'third']);
	});

	it('keeps an undated decision rather than hiding it, sorted last', () => {
		const papers = [paper({ title: 'undated', triaged: null }), paper({ title: 'dated', triaged: '2026-03-14' })];
		expect(excluded(papers).rows.map((row) => row.title)).toEqual(['dated', 'undated']);
	});

	it('is empty and honest on a vault that has ruled nothing out', () => {
		expect(excluded([])).toEqual({ rows: [], assessed: 0 });
	});
});

describe('renderReport', () => {
	const of = (papers: Decided[]) => renderReport(excluded(papers), '2026-09-21');

	it('says how many of how many, so the number has a denominator', () => {
		const out = of([paper(), paper({ reading: 'queued' })]);
		expect(out).toContain('1 of 2 assessed papers have been ruled out');
	});

	it('writes one row per paper, with the reason in it', () => {
		expect(of([paper()])).toContain('a review, not empirical');
	});

	it('links each row back into the vault rather than only naming it', () => {
		expect(of([paper()])).toContain('[[Literature/vanderhaer2026\\|Reframing heat pump transitions]]');
	});

	it('escapes a pipe in a title, which would otherwise shift every later column', () => {
		const out = of([paper({ title: 'Care | repair' })]);
		expect(out).toContain('Care \\| repair');
	});

	it('flattens a reason someone typed over several lines', () => {
		const out = of([paper({ reason: 'not empirical\nand out of scope' })]);
		expect(out).toContain('not empirical and out of scope');
		expect(out.split('\n').filter((line) => line.startsWith('|'))).toHaveLength(3);
	});

	it('leaves an empty cell rather than the word null', () => {
		const out = of([paper({ reason: null, year: null, triaged: null })]);
		expect(out).not.toContain('null');
	});

	it('says so plainly when nothing has been ruled out', () => {
		expect(of([])).toContain('Nothing has been dropped or deferred yet.');
	});

	it('writes no table at all when there are no rows', () => {
		expect(of([])).not.toContain('| --- |');
	});

	it('is stable: the same record renders the same document', () => {
		const papers = [paper(), paper({ title: 'another', triaged: '2026-04-01' })];
		expect(of(papers)).toBe(of(papers));
	});

	it('stamps the marker, so the writer can tell its own file from somebody else’s', () => {
		expect(of([paper()]).startsWith('---\npaper-trail: excluded-papers\n---\n')).toBe(true);
	});

	it('stamps it on an empty record too, or the first run would refuse the second', () => {
		expect(of([])).toContain('paper-trail: excluded-papers');
	});
});

/**
 * The guard on overwriting. A report is written to a fixed path and replaced
 * every run, so the only thing standing between that and someone's own
 * "Excluded papers" note is this test being right.
 */
describe('isReport', () => {
	it('recognises what renderReport wrote', () => {
		expect(isReport({ 'paper-trail': 'excluded-papers' })).toBe(true);
	});

	it('refuses a note with no frontmatter at all', () => {
		expect(isReport(undefined)).toBe(false);
		expect(isReport({})).toBe(false);
	});

	it('refuses a paper, which carries plenty of frontmatter and none of it this', () => {
		expect(isReport({ 'zotero-key': 'ABCD2345', reading: 'dropped', title: 'Excluded papers' })).toBe(false);
	});

	it('refuses the key carrying some other value, rather than taking the key alone as consent', () => {
		expect(isReport({ 'paper-trail': true })).toBe(false);
		expect(isReport({ 'paper-trail': 'something else' })).toBe(false);
	});
});

/**
 * Reading a paper's frontmatter. Every line of this is an interpretation the
 * queue also makes, and the two agreeing is what keeps the record from being a
 * table of papers the queue never showed you.
 */
describe('decidedOf', () => {
	const file = { path: 'Literature/vanderhaer2026.md', basename: 'vanderhaer2026' };
	const of = (frontmatter: Record<string, unknown> | undefined) => decidedOf(frontmatter, file, 'zotero-key');

	it('reads a paper off its frontmatter', () => {
		expect(
			of({
				'zotero-key': 'ABCD2345',
				title: 'Reframing heat pump transitions',
				authors: 'Jeltje Van Der Haer',
				year: 2026,
							reading: 'dropped',
				'triaged-date': '2026-03-14',
				'reading-reason': 'a review, not empirical',
			}),
		).toEqual({
			title: 'Reframing heat pump transitions',
			authors: 'Jeltje Van Der Haer',
			year: 2026,
					reading: 'dropped',
			triaged: '2026-03-14',
			reason: 'a review, not empirical',
			path: 'Literature/vanderhaer2026.md',
		});
	});

	it('is nothing at all for a note that names no Zotero item', () => {
		expect(of({ title: 'my own thinking' })).toBeNull();
		expect(of(undefined)).toBeNull();
	});

	it('is nothing under a different key field, which is what makes the setting mean anything', () => {
		expect(decidedOf({ 'zotero-key': 'ABCD2345' }, file, 'citekey')).toBeNull();
	});

	// The same call `noteState` makes. A paper nobody has ruled on is untriaged,
	// not absent from the denominator.
	it('reads a missing reading field as untriaged', () => {
		expect(of({ 'zotero-key': 'ABCD2345' })?.reading).toBe('untriaged');
	});


	it('falls back to the filename when a paper has no title', () => {
		expect(of({ 'zotero-key': 'ABCD2345' })?.title).toBe('vanderhaer2026');
	});

	// A cell the table can print. An empty authors field is an empty cell; a
	// year that is not a number is no year rather than the word it was typed as.
	it('leaves an unusable field empty rather than printing what was typed', () => {
		const row = of({ 'zotero-key': 'ABCD2345', authors: 42, year: 'in press' });
		expect(row).toMatchObject({ authors: '', year: null });
	});
});
