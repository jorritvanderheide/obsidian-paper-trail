import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiItem } from '../src/core/zotero';

const changedSince = vi.fn<(since: number) => Promise<unknown>>();
vi.mock('../src/source', () => ({
	changedSince: (since: number) => changedSince(since),
}));

const { forgetLibrary, library, refreshLibrary } = await import('../src/library');

const item = (key: string, title = key): ApiItem => ({ key, data: { itemType: 'journalArticle', title } });
const changes = (items: ApiItem[], version: number, total = items.length) => ({ items, version, total });

beforeEach(() => {
	changedSince.mockReset();
	forgetLibrary();
});

describe('refreshLibrary', () => {
	it('reads everything the first time, because a first read is an update from nothing', async () => {
		changedSince.mockResolvedValue(changes([item('A'), item('B')], 10));
		await refreshLibrary();

		expect(changedSince).toHaveBeenCalledWith(0);
		expect(library().map((entry) => entry.key)).toEqual(['A', 'B']);
	});

	it('asks from the version Zotero last reported after that', async () => {
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary();

		changedSince.mockResolvedValue(changes([], 10, 1));
		await refreshLibrary();
		expect(changedSince).toHaveBeenLastCalledWith(10);
	});

	it('adds what is new without rereading what is not', async () => {
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary();

		changedSince.mockResolvedValue(changes([item('B')], 11, 2));
		await refreshLibrary();
		expect(library().map((entry) => entry.key)).toEqual(['A', 'B']);
	});

	it('replaces an item that changed rather than holding two of it', async () => {
		changedSince.mockResolvedValue(changes([item('A', 'old title')], 10));
		await refreshLibrary();

		changedSince.mockResolvedValue(changes([item('A', 'new title')], 11, 1));
		await refreshLibrary();
		expect(library()).toHaveLength(1);
		expect(library()[0]?.data.title).toBe('new title');
	});

	it('rereads everything when the count says something was deleted', async () => {
		// Zotero cannot report a deletion: the item simply stops being mentioned.
		// A total that disagrees with what we hold is the only sign there is.
		changedSince.mockResolvedValue(changes([item('A'), item('B')], 10));
		await refreshLibrary();

		changedSince.mockResolvedValueOnce(changes([], 11, 1)).mockResolvedValueOnce(changes([item('A')], 11, 1));
		await refreshLibrary();

		expect(changedSince).toHaveBeenLastCalledWith(0);
		expect(library().map((entry) => entry.key)).toEqual(['A']);
	});

	it('does not reread when the count agrees, which is almost always', async () => {
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary();

		changedSince.mockResolvedValue(changes([], 10, 1));
		await refreshLibrary();
		expect(changedSince).toHaveBeenCalledTimes(2);
	});

	it('says whether anything moved, so a caller can skip a redraw', async () => {
		changedSince.mockResolvedValue(changes([item('A')], 10));
		expect(await refreshLibrary()).toBe(true);

		changedSince.mockResolvedValue(changes([], 10, 1));
		expect(await refreshLibrary()).toBe(false);
	});

	it('keeps what it had when Zotero cannot be reached', async () => {
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary();

		changedSince.mockRejectedValue(new Error('ECONNREFUSED'));
		expect(await refreshLibrary()).toBe(false);
		// A closed Zotero is not evidence that your library is empty.
		expect(library().map((entry) => entry.key)).toEqual(['A']);
	});

	it('reads afresh after a failed first attempt rather than treating it as read', async () => {
		changedSince.mockRejectedValue(new Error('ECONNREFUSED'));
		await refreshLibrary();

		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary();
		expect(changedSince).toHaveBeenLastCalledWith(0);
	});
});
