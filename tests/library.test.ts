import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiItem } from '../src/core/zotero';

const changedSince = vi.fn<(since: number, collection: string) => Promise<unknown>>();
const libraryState = vi.fn<(collection: string) => Promise<unknown>>();
const allCollections = vi.fn<() => Promise<unknown>>();
vi.mock('../src/source', () => ({
	changedSince: (since: number, collection: string) => changedSince(since, collection),
	libraryState: (collection: string) => libraryState(collection),
	allCollections: () => allCollections(),
}));

const { collections, forgetLibrary, library, refreshLibrary, scopeProblem } = await import('../src/library');

const item = (key: string, title = key): ApiItem => ({ key, data: { itemType: 'journalArticle', title } });
const changes = (items: ApiItem[], version: number) => ({ items, version });

/**
 * What Zotero says it is holding.
 *
 * Its own mock and not a field on `changes`, which is the whole point of this
 * fix: the count of what exists and the count of what changed come from two
 * different requests, and reading one as the other meant every refresh decided
 * something had been deleted and read the library again to find out what.
 */
const state = (version: number, total: number) => ({ version, total });

beforeEach(() => {
	changedSince.mockReset();
	libraryState.mockReset();
	allCollections.mockReset();
	allCollections.mockResolvedValue([]);
	forgetLibrary();
});

describe('refreshLibrary', () => {
	it('reads everything the first time, because a first read is an update from nothing', async () => {
		libraryState.mockResolvedValue(state(10, 2));
		changedSince.mockResolvedValue(changes([item('A'), item('B')], 10));
		await refreshLibrary('');

		expect(changedSince).toHaveBeenCalledWith(0, '');
		expect(library().map((entry) => entry.key)).toEqual(['A', 'B']);
	});

	it('asks from the version Zotero last reported after that', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary('');

		libraryState.mockResolvedValue(state(11, 1));
		changedSince.mockResolvedValue(changes([item('A', 'renamed')], 11));
		await refreshLibrary('');
		expect(changedSince).toHaveBeenLastCalledWith(10, '');
	});

	it('asks nothing at all when the version and the count both agree', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary('');

		expect(await refreshLibrary('')).toBe(false);
		// Once, for the first read. The second look settled on the state alone.
		expect(changedSince).toHaveBeenCalledTimes(1);
	});

	it('adds what is new without rereading what is not', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary('');

		libraryState.mockResolvedValue(state(11, 2));
		changedSince.mockResolvedValue(changes([item('B')], 11));
		await refreshLibrary('');
		expect(library().map((entry) => entry.key)).toEqual(['A', 'B']);
		expect(changedSince).toHaveBeenLastCalledWith(10, '');
	});

	it('replaces an item that changed rather than holding two of it', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A', 'old title')], 10));
		await refreshLibrary('');

		libraryState.mockResolvedValue(state(11, 1));
		changedSince.mockResolvedValue(changes([item('A', 'new title')], 11));
		await refreshLibrary('');
		expect(library()).toHaveLength(1);
		expect(library()[0]?.data.title).toBe('new title');
	});

	it('rereads everything when the count says something was deleted', async () => {
		// Zotero cannot report a deletion: the item simply stops being mentioned.
		// A count that disagrees with what we hold is the only sign there is.
		libraryState.mockResolvedValue(state(10, 2));
		changedSince.mockResolvedValue(changes([item('A'), item('B')], 10));
		await refreshLibrary('');

		libraryState.mockResolvedValue(state(11, 1));
		changedSince.mockResolvedValueOnce(changes([], 11)).mockResolvedValueOnce(changes([item('A')], 11));
		await refreshLibrary('');

		expect(changedSince).toHaveBeenLastCalledWith(0, '');
		expect(library().map((entry) => entry.key)).toEqual(['A']);
	});

	it('catches a deletion that did not move the library version', async () => {
		// Whether removing an item bumps the version is Zotero's business, and
		// not something worth resting on. The count answers either way.
		libraryState.mockResolvedValue(state(10, 2));
		changedSince.mockResolvedValue(changes([item('A'), item('B')], 10));
		await refreshLibrary('');

		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValueOnce(changes([], 10)).mockResolvedValueOnce(changes([item('A')], 10));
		await refreshLibrary('');

		expect(library().map((entry) => entry.key)).toEqual(['A']);
	});

	it('does not reread when the count agrees, which is almost always', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary('');

		// A version that moved with no deletion behind it: one delta, no reread.
		libraryState.mockResolvedValue(state(11, 1));
		changedSince.mockResolvedValue(changes([item('A', 'renamed')], 11));
		await refreshLibrary('');
		expect(changedSince).toHaveBeenCalledTimes(2);
	});

	it('says whether anything moved, so a caller can skip a redraw', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		expect(await refreshLibrary('')).toBe(true);

		expect(await refreshLibrary('')).toBe(false);
	});

	it('keeps what it had when Zotero cannot be reached', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary('');

		libraryState.mockRejectedValue(new Error('ECONNREFUSED'));
		expect(await refreshLibrary('')).toBe(false);
		// A closed Zotero is not evidence that your library is empty.
		expect(library().map((entry) => entry.key)).toEqual(['A']);
	});

	it('reads afresh after a failed first attempt rather than treating it as read', async () => {
		libraryState.mockRejectedValue(new Error('ECONNREFUSED'));
		await refreshLibrary('');

		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary('');
		expect(changedSince).toHaveBeenLastCalledWith(0, '');
	});
});

/**
 * Reading one collection instead of the whole library.
 *
 * The scope is passed in on every call rather than held here, because it is a
 * setting and settings change under a running session.
 */
describe('scope', () => {
	const collection = (key: string, name: string) => ({ key, data: { name, parentCollection: false as const } });

	it('asks Zotero for the collection it was given', async () => {
		allCollections.mockResolvedValue([collection('AAAA1111', 'Thesis')]);
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));

		await refreshLibrary('AAAA1111');
		expect(changedSince).toHaveBeenCalledWith(0, 'AAAA1111');
		expect(library().map((entry) => entry.key)).toEqual(['A']);
	});

	it('starts over when the scope changes, rather than merging two collections', async () => {
		allCollections.mockResolvedValue([collection('AAAA1111', 'One'), collection('BBBB2222', 'Two')]);
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary('AAAA1111');

		changedSince.mockResolvedValue(changes([item('B')], 10));
		await refreshLibrary('BBBB2222');

		expect(changedSince).toHaveBeenLastCalledWith(0, 'BBBB2222');
		expect(library().map((entry) => entry.key)).toEqual(['B']);
	});

	// The whole reason `missingScope` exists: asking for a gone collection's
	// items answers 200 with everything, so carrying on would quietly replace
	// the queue with every paper in the library.
	it('reads nothing at all when the collection is gone', async () => {
		allCollections.mockResolvedValue([collection('AAAA1111', 'Thesis')]);
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));

		expect(await refreshLibrary('GONE0000')).toBe(false);
		expect(changedSince).not.toHaveBeenCalled();
		expect(libraryState).not.toHaveBeenCalled();
		expect(library()).toEqual([]);
	});

	it('says why, so the queue can explain itself', async () => {
		allCollections.mockResolvedValue([collection('AAAA1111', 'Thesis')]);
		await refreshLibrary('GONE0000');
		expect(scopeProblem()).toMatch(/gone/i);

		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary('AAAA1111');
		expect(scopeProblem()).toBeNull();
	});

	it('does not ask for the collection list when nothing is scoped', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));

		await refreshLibrary('');
		// One request per refresh bought for the majority who never scope.
		expect(allCollections).not.toHaveBeenCalled();
		expect(scopeProblem()).toBeNull();
	});

	it('keeps the collection list for the picker', async () => {
		allCollections.mockResolvedValue([collection('AAAA1111', 'Thesis')]);
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));

		await refreshLibrary('AAAA1111');
		expect(collections().map((entry) => entry.key)).toEqual(['AAAA1111']);
	});
});
