import { describe, expect, it } from 'vitest';
import { adoptionSummary, planAdoption, type Candidate } from '../src/core/adoption';
import type { ApiItem } from '../src/core/zotero';

const paper = (key: string, citationKey: string | undefined, over: Partial<ApiItem['data']> = {}): ApiItem => ({
	key,
	data: { itemType: 'journalArticle', title: `A paper called ${key}`, citationKey, ...over },
});

const note = (path: string, frontmatter?: Record<string, unknown>): Candidate => ({
	path,
	basename: path.replace(/^.*\//, '').replace(/\.md$/, ''),
	frontmatter,
});

const items = [paper('AAAAAAAA', 'smith2020'), paper('BBBBBBBB', 'jones2021'), paper('CCCCCCCC', 'lee2019')];

describe('planAdoption', () => {
	it('matches a note by its citekey property', () => {
		const plan = planAdoption([note('Lit/Smith on care.md', { citekey: 'smith2020' })], items, 'zotero-key');
		expect(plan.adopt).toEqual([expect.objectContaining({ path: 'Lit/Smith on care.md', key: 'AAAAAAAA' })]);
	});

	it('matches a note named for its citation key, with or without an @', () => {
		const plan = planAdoption([note('Lit/@smith2020.md'), note('Lit/jones2021.md')], items, 'zotero-key');
		expect(plan.adopt.map((entry) => entry.key)).toEqual(['AAAAAAAA', 'BBBBBBBB']);
	});

	it('prefers the property to the name', () => {
		const plan = planAdoption([note('Lit/@smith2020.md', { citekey: 'jones2021' })], items, 'zotero-key');
		expect(plan.adopt[0]?.key).toBe('BBBBBBBB');
	});

	it('falls back to the name when the property names nothing Zotero has', () => {
		const plan = planAdoption([note('Lit/@smith2020.md', { citekey: 'typo2020' })], items, 'zotero-key');
		expect(plan.adopt[0]?.key).toBe('AAAAAAAA');
	});

	it('says nothing at all about notes that match nothing', () => {
		// Most of a vault is not literature notes, and a list of every daily note
		// that is not a paper would bury the answer.
		const plan = planAdoption([note('Daily/2026-10-03.md'), note('Ideas.md', { citekey: 'unknown' })], items, 'zotero-key');
		expect(plan).toEqual({ adopt: [], taken: [], shared: [], keyed: true });
	});

	it('leaves a note that is already a paper alone', () => {
		const plan = planAdoption([note('Lit/smith2020.md', { 'zotero-key': 'AAAAAAAA' })], items, 'zotero-key');
		expect(plan.adopt).toEqual([]);
		expect(plan.taken).toEqual([]);
	});

	it('leaves a note alone whose item key property holds something else', () => {
		// Not a paper, since the value is not text, but not ours to overwrite either.
		const plan = planAdoption([note('Lit/smith2020.md', { 'zotero-key': 42 })], items, 'zotero-key');
		expect(plan.adopt).toEqual([]);
	});

	it('leaves a note alone when its paper already has a note', () => {
		const plan = planAdoption(
			[note('Literature/smith2020.md', { 'zotero-key': 'AAAAAAAA' }), note('Old/@smith2020.md')],
			items,
			'zotero-key',
		);
		expect(plan.adopt).toEqual([]);
		expect(plan.taken).toEqual(['Old/@smith2020.md']);
	});

	it('leaves every note alone when two were made for the same paper', () => {
		// Linking both would make two notes for one paper, and choosing between
		// them is a judgement about which one holds your writing.
		const plan = planAdoption([note('Old/@smith2020.md'), note('Older/Smith.md', { citekey: 'smith2020' }), note('Lit/lee2019.md')], items, 'zotero-key');
		expect(plan.adopt.map((entry) => entry.key)).toEqual(['CCCCCCCC']);
		expect(plan.shared).toEqual(['smith2020']);
	});

	it('does not guess between two Zotero items with the same citation key', () => {
		const twins = [...items, paper('DDDDDDDD', 'smith2020')];
		expect(planAdoption([note('Lit/@smith2020.md')], twins, 'zotero-key').adopt).toEqual([]);
	});

	it('matches papers only, not attachments or notes', () => {
		const odd = [paper('EEEEEEEE', 'smith2020', { itemType: 'note' })];
		expect(planAdoption([note('Lit/@smith2020.md')], odd, 'zotero-key').adopt).toEqual([]);
	});

	it('says which properties the first sync will replace', () => {
		const plan = planAdoption([note('Lit/@lee2019.md', { title: 'My own title', citekey: 'lee2019', tags: ['x'] })], items, 'zotero-key');
		expect(plan.adopt[0]?.replaced).toEqual(['title']);
	});

	it('knows when Zotero has no citation keys at all', () => {
		const bare = [paper('AAAAAAAA', undefined)];
		expect(planAdoption([note('Lit/@smith2020.md')], bare, 'zotero-key').keyed).toBe(false);
	});
});

describe('adoptionSummary', () => {
	const plan = (over: Partial<ReturnType<typeof planAdoption>> = {}) => ({ adopt: [], taken: [], shared: [], keyed: true, ...over });
	const one = { path: 'Lit/@smith2020.md', key: 'AAAAAAAA', replaced: [] };

	it('says what is written, under which property', () => {
		const text = adoptionSummary(plan({ adopt: [one] }), 'zotero-key').join('\n');
		expect(text).toMatch(/1 note in your vault is about a paper/);
		expect(text).toMatch(/zotero-key/);
		expect(text).toMatch(/Triage/);
	});

	it('warns before replacing values, and names them', () => {
		const text = adoptionSummary(plan({ adopt: [{ ...one, replaced: ['authors', 'title'] }, one] }), 'zotero-key').join('\n');
		expect(text).toMatch(/⚠ 1 note already has authors and title with other values/);
	});

	it('does not warn when nothing is replaced', () => {
		expect(adoptionSummary(plan({ adopt: [one] }), 'zotero-key').join('\n')).not.toMatch(/⚠/);
	});

	it('says what was left alone, and why', () => {
		const text = adoptionSummary(plan({ adopt: [one], taken: ['a.md', 'b.md'], shared: ['lee2019'] }), 'zotero-key').join('\n');
		expect(text).toMatch(/2 notes are about papers that already have a paper note/);
		expect(text).toMatch(/lee2019/);
	});

	it('says how matching works when nothing matched', () => {
		const text = adoptionSummary(plan(), 'zotero-key').join('\n');
		expect(text).toMatch(/citekey property/);
		expect(text).toMatch(/@/);
	});

	it('points at Better BibTeX when Zotero has no citation keys', () => {
		expect(adoptionSummary(plan({ keyed: false }), 'zotero-key').join('\n')).toMatch(/Better BibTeX/);
	});
});
