import { describe, expect, it } from 'vitest';
import { pendingOf } from '../src/core/pending';
import type { ApiItem } from '../src/core/zotero';

const item = (key: string, over: Partial<ApiItem['data']> = {}): ApiItem => ({
	key,
	data: {
		itemType: 'journalArticle',
		title: `Paper ${key}`,
		dateAdded: '2026-01-01T00:00:00Z',
		...over,
	},
});

describe('pendingOf', () => {
	it('offers a paper the vault has no note for', () => {
		expect(pendingOf([item('AAAA1111')], []).map((row) => row.key)).toEqual(['AAAA1111']);
	});

	it('leaves out a paper the vault already has, which is the whole subtraction', () => {
		expect(pendingOf([item('AAAA1111'), item('BBBB2222')], ['AAAA1111']).map((row) => row.key)).toEqual(['BBBB2222']);
	});

	it('writes nothing and needs nothing written: a note is not required to appear', () => {
		// The point of the virtual queue. Four hundred imported records are four
		// hundred rows and zero files.
		expect(pendingOf(Array.from({ length: 400 }, (_, n) => item(`K${n}`)), [])).toHaveLength(400);
	});

	it('leaves out attachments, annotations and notes whatever else they are', () => {
		const items = [
			item('AAAA1111', { itemType: 'attachment' }),
			item('BBBB2222', { itemType: 'annotation' }),
			item('CCCC3333', { itemType: 'note' }),
			item('DDDD4444', { itemType: 'book' }),
		];
		expect(pendingOf(items, []).map((row) => row.key)).toEqual(['DDDD4444']);
	});

	it('drains oldest first, like every other stage', () => {
		const items = [
			item('NEW', { dateAdded: '2026-09-01T00:00:00Z' }),
			item('OLD', { dateAdded: '2025-01-01T00:00:00Z' }),
			item('MID', { dateAdded: '2026-03-01T00:00:00Z' }),
		];
		expect(pendingOf(items, []).map((row) => row.key)).toEqual(['OLD', 'MID', 'NEW']);
	});

	it('carries what the cheap depth of triage shows, so opening one costs no request', () => {
		const items = [
			item('AAAA1111', {
				shortTitle: 'Reframing heat pumps',
				title: 'Reframing heat pump transitions: a care perspective',
				abstractNote: '  What home means for energy use.  ',
				publicationTitle: 'Buildings and Cities',
				date: '2026-08-11',
			}),
		];
		expect(pendingOf(items, [])[0]).toMatchObject({
			title: 'Reframing heat pumps',
			abstract: 'What home means for energy use.',
			venue: 'Buildings and Cities',
			year: 2026,
		});
	});

	it('falls back to the key when an item has no title at all', () => {
		expect(pendingOf([item('AAAA1111', { title: undefined })], [])[0]?.title).toBe('AAAA1111');
	});

	it('reads a missing abstract as nothing rather than as an empty string', () => {
		expect(pendingOf([item('AAAA1111', { abstractNote: '   ' })], [])[0]?.abstract).toBeNull();
	});

	it('is empty when Zotero has nothing, rather than throwing', () => {
		expect(pendingOf([], [])).toEqual([]);
	});
});
