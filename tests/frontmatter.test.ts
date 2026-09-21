import { describe, expect, it } from 'vitest';
import { sortKeys } from '../src/core/frontmatter';

describe('sortKeys', () => {
	it('puts the keys in order', () => {
		const fm: Record<string, unknown> = { year: 2026, aliases: [], title: 'A paper' };
		sortKeys(fm);
		expect(Object.keys(fm)).toEqual(['aliases', 'title', 'year']);
	});

	it('mutates in place, because processFrontMatter writes the object it gave you', () => {
		const fm: Record<string, unknown> = { b: 2, a: 1 };
		const same = fm;
		sortKeys(fm);
		expect(same).toBe(fm);
		expect(Object.keys(same)).toEqual(['a', 'b']);
	});

	it('keeps every value exactly as it was', () => {
		const tags = ['domain/research', 'type/filed'];
		const fm: Record<string, unknown> = { tags, year: 2026, reading: null };
		sortKeys(fm);
		expect(fm.tags).toBe(tags);
		expect(fm.year).toBe(2026);
		expect(fm.reading).toBeNull();
	});

	it('sorts the hyphenated keys where you would look for them', () => {
		const fm: Record<string, unknown> = { 'zotero-key': 'X', zotero: 'Y', reading: 'finished', 'reading-date': '2026-09-21' };
		sortKeys(fm);
		expect(Object.keys(fm)).toEqual(['reading', 'reading-date', 'zotero', 'zotero-key']);
	});

	it('leaves an already sorted object alone, so a sync is still a no-op', () => {
		const fm: Record<string, unknown> = { a: 1, b: 2, c: 3 };
		sortKeys(fm);
		expect(Object.keys(fm)).toEqual(['a', 'b', 'c']);
	});

	it('copes with nothing', () => {
		const fm: Record<string, unknown> = {};
		sortKeys(fm);
		expect(Object.keys(fm)).toEqual([]);
	});
});
