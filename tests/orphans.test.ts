import { describe, expect, it } from 'vitest';
import { byValue, orphans, type TaggedNote } from '../src/core/orphans';
import { DEFAULT_VOCABULARY, type Vocabulary } from '../src/core/vocabulary';

const note = (path: string, tags: string[]): TaggedNote => ({ path, title: path, tags });

/** A vault that has dropped a domain. */
const renamed: Vocabulary = { domains: ['research'] };

describe('orphans', () => {
	it('finds nothing when every value is known', () => {
		const notes = [note('a.md', ['domain/research', 'type/inbox'])];
		expect(orphans(notes, DEFAULT_VOCABULARY)).toEqual([]);
	});

	it('finds a value that was removed from an axis', () => {
		const notes = [note('a.md', ['domain/teaching'])];
		expect(orphans(notes, renamed)).toMatchObject([{ path: 'a.md', axis: 'domain', value: 'teaching' }]);
	});

	it('finds a domain left behind by a rename', () => {
		expect(orphans([note('a.md', ['domain/teaching'])], renamed)).toMatchObject([{ axis: 'domain', value: 'teaching' }]);
	});

	it('accepts a value the vocabulary still knows', () => {
		expect(orphans([note('a.md', ['domain/research'])], renamed)).toEqual([]);
	});

	// A type tag is now just a tag someone put there, on no axis the plugin owns.
	it('leaves a leftover type tag alone, because that axis is gone', () => {
		expect(orphans([note('a.md', ['type/inbox'])], renamed)).toEqual([]);
	});

	it('ignores tags that are not on one of the axes', () => {
		const notes = [note('a.md', ['project/thesis', 'reading', 'nested/deep/tag'])];
		expect(orphans(notes, DEFAULT_VOCABULARY)).toEqual([]);
	});

	it('treats a nested value as the orphan it is', () => {
		// `domain/research/wp1` is not `domain/research`, and never was.
		expect(orphans([note('a.md', ['domain/research/wp1'])], DEFAULT_VOCABULARY)).toMatchObject([
			{ axis: 'domain', value: 'research/wp1' },
		]);
	});
});

describe('byValue', () => {
	it('groups by the tag that caused them, commonest first', () => {
		const notes = [
			note('a.md', ['domain/teaching']),
			note('b.md', ['domain/teaching']),
			note('c.md', ['domain/admin']),
		];
		const groups = byValue(orphans(notes, renamed));
		expect(groups.map((group) => group.tag)).toEqual(['domain/teaching', 'domain/admin']);
		expect(groups[0]?.notes).toHaveLength(2);
	});

	it('is empty for no orphans', () => {
		expect(byValue([])).toEqual([]);
	});
});
