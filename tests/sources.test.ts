import { describe, expect, it } from 'vitest';
import { place, sameSource, sourceChoices, sourceLabel, sourceProblem, type Contents, type LibraryChoice, type Source } from '../src/core/sources';
import type { ApiCollection } from '../src/core/collections';
import type { ApiItem } from '../src/core/zotero';

const paper = (key: string, collections: string[] = [], over: Partial<ApiItem['data']> = {}): ApiItem => ({
	key,
	data: { itemType: 'journalArticle', title: `Paper ${key}`, collections, ...over },
});

const collection = (key: string, parentCollection: string | false = false): ApiCollection => ({
	key,
	data: { name: key, parentCollection },
});

const source = (over: Partial<Source> = {}): Source => ({ group: null, collection: '', triage: false, ...over });

/** A thesis collection with a chapter under it, and a side project beside it. */
const mine: Contents = {
	group: null,
	collections: [collection('THESIS00'), collection('CHAPTER1', 'THESIS00'), collection('SIDEPROJ')],
	items: [
		paper('AAAAAAAA', ['THESIS00']),
		paper('BBBBBBBB', ['CHAPTER1']),
		paper('CCCCCCCC', ['SIDEPROJ']),
		paper('DDDDDDDD'),
		paper('EEEEEEEE', [], { itemType: 'attachment' }),
	],
};

const keys = (contents: Contents[], sources: Source[], subcollections = true) =>
	place(contents, sources, subcollections).map((entry) => entry.ref);

describe('place', () => {
	it('brings in every paper in the library for a source that is the whole library', () => {
		expect(keys([mine], [source()])).toEqual(['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD']);
	});

	it('brings in a collection and its subcollections', () => {
		expect(keys([mine], [source({ collection: 'THESIS00' })])).toEqual(['AAAAAAAA', 'BBBBBBBB']);
	});

	it('leaves the subcollections out when asked to', () => {
		expect(keys([mine], [source({ collection: 'THESIS00' })], false)).toEqual(['AAAAAAAA']);
	});

	it('brings in nothing from a collection Zotero no longer has', () => {
		// Never the whole library, which is what Zotero answers when asked for the
		// items of a collection it does not have.
		expect(keys([mine], [source({ collection: 'GONE0000' })])).toEqual([]);
	});

	it('still brings in the other sources when one is gone', () => {
		expect(keys([mine], [source({ collection: 'GONE0000' }), source({ collection: 'SIDEPROJ' })])).toEqual(['CCCCCCCC']);
	});

	it('brings in a paper once, from the first source it is in', () => {
		const placed = place([mine], [source({ collection: 'CHAPTER1', triage: true }), source({ collection: 'THESIS00' })], true);
		expect(placed.map((entry) => [entry.ref, entry.triage])).toEqual([
			['BBBBBBBB', true],
			['AAAAAAAA', false],
		]);
	});

	it('says whether a paper arrives to be triaged, by its source', () => {
		const placed = place([mine], [source({ collection: 'SIDEPROJ', triage: true }), source()], true);
		expect(Object.fromEntries(placed.map((entry) => [entry.ref, entry.triage]))).toEqual({
			CCCCCCCC: true,
			AAAAAAAA: false,
			BBBBBBBB: false,
			DDDDDDDD: false,
		});
	});

	it('brings in nothing from a library that has not been read', () => {
		expect(keys([mine], [source({ group: 5 })])).toEqual([]);
	});

	it('knows a group paper by its key and its group, as its note will', () => {
		const lab: Contents = { group: 5, collections: [], items: [paper('AAAAAAAA')] };
		expect(keys([mine, lab], [source({ group: 5 })])).toEqual(['AAAAAAAAg5']);
	});

	it('brings in nothing when there are no sources', () => {
		expect(keys([mine], [])).toEqual([]);
	});
});

/**
 * The same paper in your library and a group's is two Zotero items, and would
 * be two rows and two notes. Shown once, from the first source it is in.
 */
describe('place, with the same paper in two libraries', () => {
	const doi = '10.1145/1273445.1273458';
	const own: Contents = { group: null, collections: [], items: [paper('MINE0000', [], { DOI: doi, citationKey: 'keshavHowReadPaper2007', title: 'How to read a paper' })] };
	const lab: Contents = { group: 5, collections: [], items: [paper('LABCOPY0', [], { DOI: `https://doi.org/${doi.toUpperCase()}`, title: 'How to Read a Paper' })] };

	it('shows it once, from the first source, and knows the other copy', () => {
		const placed = place([own, lab], [source({ group: 5, triage: true }), source()], true);
		expect(placed.map((entry) => [entry.ref, entry.triage, entry.copies])).toEqual([['LABCOPY0g5', true, ['MINE0000']]]);
	});

	it('matches by citation key and title when there is no DOI', () => {
		const a: Contents = { group: null, collections: [], items: [paper('MINE0000', [], { citationKey: 'smith2020', title: 'Care' })] };
		const b: Contents = { group: 5, collections: [], items: [paper('LABCOPY0', [], { citationKey: 'smith2020', title: 'care' })] };
		expect(keys([a, b], [source(), source({ group: 5 })])).toEqual(['MINE0000']);
	});

	it('keeps two papers that only share a citation key, since keys are unique per library', () => {
		const a: Contents = { group: null, collections: [], items: [paper('MINE0000', [], { citationKey: 'smith2020', title: 'Care' })] };
		const b: Contents = { group: 5, collections: [], items: [paper('LABCOPY0', [], { citationKey: 'smith2020', title: 'Repair' })] };
		expect(keys([a, b], [source(), source({ group: 5 })])).toEqual(['MINE0000', 'LABCOPY0g5']);
	});

	it('leaves duplicates inside one library alone, which are Zotero\'s to merge', () => {
		const twice: Contents = { group: null, collections: [], items: [paper('AAAAAAAA', [], { DOI: doi }), paper('BBBBBBBB', [], { DOI: doi })] };
		expect(keys([twice], [source()])).toEqual(['AAAAAAAA', 'BBBBBBBB']);
	});
});

describe('sourceProblem', () => {
	it('is quiet when every source can be read', () => {
		expect(sourceProblem([source(), source({ collection: 'THESIS00' })], [mine])).toBeNull();
	});

	it('says when a collection is gone, and where to fix it', () => {
		expect(sourceProblem([source({ collection: 'GONE0000' })], [mine])).toMatch(/isn't in Zotero anymore.*settings/);
	});

	it('says nothing about a library it has not heard from', () => {
		expect(sourceProblem([source({ group: 5, collection: 'GONE0000' })], [mine])).toBeNull();
	});

	it('says why the queue has nothing from Zotero when nothing is chosen', () => {
		expect(sourceProblem([], [mine])).toMatch(/Nothing is chosen under Papers from/);
	});

	it('says when a group is gone, or you are no longer in it', () => {
		expect(sourceProblem([source({ group: 5 })], [mine], [{ id: 6 }])).toMatch(/group under Papers from/);
		expect(sourceProblem([source({ group: 5 })], [mine], [{ id: 5 }])).toBeNull();
	});

	it('says nothing about a group before the list of groups is in', () => {
		expect(sourceProblem([source({ group: 5 })], [mine], null)).toBeNull();
	});
});

describe('sameSource', () => {
	it('compares the place, not what it says about triage', () => {
		expect(sameSource(source({ triage: true }), source())).toBe(true);
		expect(sameSource(source({ collection: 'THESIS00' }), source())).toBe(false);
		expect(sameSource(source({ group: 5 }), source())).toBe(false);
	});
});

describe('the source picker', () => {
	const libraries: LibraryChoice[] = [
		{ group: null, name: 'My library', collections: [collection('THESIS00'), collection('CHAPTER1', 'THESIS00')] },
		{ group: 5, name: 'Lab', collections: [collection('READING0')] },
	];

	it('offers each library and each collection in it, by path', () => {
		expect(sourceChoices(libraries, []).map((choice) => choice.label)).toEqual([
			'My library',
			'My library / THESIS00',
			'My library / THESIS00 / CHAPTER1',
			'Lab',
			'Lab / READING0',
		]);
	});

	it('leaves out what is already chosen', () => {
		expect(sourceChoices(libraries, [source(), source({ group: 5, collection: 'READING0', triage: true })]).map((choice) => choice.label)).toEqual([
			'My library / THESIS00',
			'My library / THESIS00 / CHAPTER1',
			'Lab',
		]);
	});

	it('starts triage on for a group and off for your own library', () => {
		const triage = Object.fromEntries(sourceChoices(libraries, []).map((choice) => [choice.label, choice.source.triage]));
		expect(triage).toMatchObject({ 'My library': false, 'My library / THESIS00': false, Lab: true, 'Lab / READING0': true });
	});

	it('names a chosen source the way the picker did', () => {
		expect(sourceLabel(source({ group: 5, collection: 'READING0' }), libraries)).toBe('Lab / READING0');
		expect(sourceLabel(source({ collection: 'CHAPTER1' }), libraries)).toBe('My library / THESIS00 / CHAPTER1');
		expect(sourceLabel(source({ group: 5 }), libraries)).toBe('Lab');
	});

	it('cannot name a collection Zotero no longer has', () => {
		expect(sourceLabel(source({ collection: 'GONE0000' }), libraries)).toBeNull();
	});
});
