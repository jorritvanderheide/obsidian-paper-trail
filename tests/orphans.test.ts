import { describe, expect, it } from 'vitest';
import { byValue, orphans, type TaggedNote } from '../src/core/orphans';
import { DEFAULT_VOCABULARY, type Vocabulary } from '../src/core/vocabulary';

const note = (path: string, tags: string[]): TaggedNote => ({ path, title: path, tags });

/** A vault that has renamed its inbox and dropped a domain. */
const renamed: Vocabulary = {
	domains: ['research'],
	types: { inbox: 'new', filed: 'sorted', living: 'evergreen' },
};

describe('orphans', () => {
	it('finds nothing when every value is known', () => {
		const notes = [note('a.md', ['domain/research', 'type/inbox'])];
		expect(orphans(notes, DEFAULT_VOCABULARY)).toEqual([]);
	});

	it('finds a value that was removed from an axis', () => {
		const notes = [note('a.md', ['domain/teaching'])];
		expect(orphans(notes, renamed)).toMatchObject([{ path: 'a.md', axis: 'domain', value: 'teaching' }]);
	});

	it('finds a type value left behind by a rename', () => {
		const notes = [note('a.md', ['type/inbox'])];
		expect(orphans(notes, renamed)).toMatchObject([{ axis: 'type', value: 'inbox' }]);
	});

	it('accepts the renamed value', () => {
		expect(orphans([note('a.md', ['type/new'])], renamed)).toEqual([]);
	});

	it('reports a note once per broken axis, because each is its own fix', () => {
		const notes = [note('a.md', ['domain/teaching', 'type/inbox'])];
		expect(orphans(notes, renamed)).toHaveLength(2);
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
			note('c.md', ['type/inbox']),
		];
		const groups = byValue(orphans(notes, renamed));
		expect(groups.map((group) => group.tag)).toEqual(['domain/teaching', 'type/inbox']);
		expect(groups[0]?.notes).toHaveLength(2);
	});

	it('is empty for no orphans', () => {
		expect(byValue([])).toEqual([]);
	});
});
