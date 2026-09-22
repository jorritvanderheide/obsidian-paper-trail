import { describe, expect, it } from 'vitest';
import { collectionPaths, missingScope, type ApiCollection } from '../src/core/collections';

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

/**
 * The local API answers a request for a missing collection's items with the
 * whole library and HTTP 200, so a scope that has gone does not fail, it
 * silently stops being a scope. This is the check that catches that.
 */
describe('missingScope', () => {
	const known = [collection('AAAA1111', 'Thesis')];

	it('is happy with no scope at all, which is the default', () => {
		expect(missingScope('', [])).toBeNull();
	});

	it('is happy with a collection Zotero still has', () => {
		expect(missingScope('AAAA1111', known)).toBeNull();
	});

	it('complains about one it does not', () => {
		expect(missingScope('GONE0000', known)).toMatch(/gone/i);
	});

	it('says what to do about it, since the answer is in settings', () => {
		expect(missingScope('GONE0000', known)).toMatch(/settings/i);
	});
});
