import { describe, expect, it } from 'vitest';
import { collectionPaths, descendants, type ApiCollection } from '../src/core/collections';

const collection = (key: string, name: string, parentCollection: string | false = false): ApiCollection => ({
	key,
	data: { name, parentCollection },
});

describe('collectionPaths', () => {
	it('names a top-level collection by itself', () => {
		expect(collectionPaths([collection('AAAA1111', 'Thesis')])).toEqual([{ key: 'AAAA1111', path: 'Thesis' }]);
	});

	it('names a nested one for its ancestors, so two called the same are distinguishable', () => {
		const paths = collectionPaths([
			collection('AAAA1111', 'Thesis'),
			collection('BBBB2222', 'Papers', 'AAAA1111'),
			collection('CCCC3333', 'Teaching'),
			collection('DDDD4444', 'Papers', 'CCCC3333'),
		]);
		expect(paths.map((entry) => entry.path)).toEqual(['Teaching', 'Teaching / Papers', 'Thesis', 'Thesis / Papers']);
	});

	it('sorts by path, which groups each parent with its children', () => {
		const paths = collectionPaths([
			collection('BBBB2222', 'Zebra'),
			collection('AAAA1111', 'Alpha'),
			collection('CCCC3333', 'Beta', 'AAAA1111'),
		]);
		expect(paths.map((entry) => entry.path)).toEqual(['Alpha', 'Alpha / Beta', 'Zebra']);
	});

	it('falls back to the key for an unnamed collection, which is ugly and findable', () => {
		expect(collectionPaths([collection('AAAA1111', '   ')])[0]?.path).toBe('AAAA1111');
	});

	// A parent pointing at its own descendant is a malformed answer rather than
	// an impossible one, and the alternative to noticing is a redraw that hangs.
	it('does not loop forever on a collection that is its own ancestor', () => {
		const paths = collectionPaths([
			collection('AAAA1111', 'One', 'BBBB2222'),
			collection('BBBB2222', 'Two', 'AAAA1111'),
		]);
		expect(paths).toHaveLength(2);
		for (const entry of paths) expect(entry.path).toContain('One');
	});

	it('keeps a collection whose parent Zotero did not send', () => {
		expect(collectionPaths([collection('AAAA1111', 'Orphan', 'GONE0000')])).toEqual([
			{ key: 'AAAA1111', path: 'Orphan' },
		]);
	});
});

describe('descendants', () => {
	const tree = [
		collection('THESIS00', 'Thesis'),
		collection('CHAPTER1', 'Chapter 1', 'THESIS00'),
		collection('CHAPTER2', 'Chapter 2', 'THESIS00'),
		collection('METHODS0', 'Methods', 'CHAPTER2'),
		collection('ELSEWHER', 'Side project'),
	];

	it('finds every collection under one, at any depth', () => {
		expect(descendants('THESIS00', tree).sort()).toEqual(['CHAPTER1', 'CHAPTER2', 'METHODS0']);
	});

	it('finds nothing under a collection with no children', () => {
		expect(descendants('METHODS0', tree)).toEqual([]);
	});

	it('stops at a loop rather than going round it forever', () => {
		const looped = [collection('AAAAAAAA', 'A', 'BBBBBBBB'), collection('BBBBBBBB', 'B', 'AAAAAAAA')];
		expect(descendants('AAAAAAAA', looped)).toEqual(['BBBBBBBB']);
	});
});
