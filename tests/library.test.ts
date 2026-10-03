import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiItem } from '../src/core/zotero';

const changedSince = vi.fn<(since: number, group: number | null) => Promise<unknown>>();
const libraryState = vi.fn<(group: number | null) => Promise<unknown>>();
const allCollections = vi.fn<(group: number | null) => Promise<unknown>>();
const allGroups = vi.fn<() => Promise<unknown>>();
vi.mock('../src/source', () => ({
	allGroups: () => allGroups(),
	changedSince: (since: number, group: number | null) => changedSince(since, group),
	libraryState: (group: number | null) => libraryState(group),
	allCollections: (group: number | null) => allCollections(group),
}));

const { collections, contents, forgetLibrary, groups, library, onLibraryChange, refreshLibrary } = await import('../src/library');

/** The default: your whole library, and nothing else. */
const MINE = [{ group: null, collection: '', triage: false }];

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
	allGroups.mockReset();
	allGroups.mockResolvedValue([{ id: 5, data: { name: 'Lab' } }]);
	forgetLibrary();
});

describe('refreshLibrary', () => {
	it('reads everything the first time, because a first read is an update from nothing', async () => {
		libraryState.mockResolvedValue(state(10, 2));
		changedSince.mockResolvedValue(changes([item('A'), item('B')], 10));
		await refreshLibrary(MINE);

		expect(changedSince).toHaveBeenCalledWith(0, null);
		expect(library().map((entry) => entry.key)).toEqual(['A', 'B']);
	});

	it('asks from the version Zotero last reported after that', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);

		libraryState.mockResolvedValue(state(11, 1));
		changedSince.mockResolvedValue(changes([item('A', 'renamed')], 11));
		await refreshLibrary(MINE);
		expect(changedSince).toHaveBeenLastCalledWith(10, null);
	});

	it('asks nothing at all when the version and the count both agree', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);

		expect(await refreshLibrary(MINE)).toBe(false);
		// Once, for the first read. The second look settled on the state alone.
		expect(changedSince).toHaveBeenCalledTimes(1);
	});

	it('adds what is new without rereading what is not', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);

		libraryState.mockResolvedValue(state(11, 2));
		changedSince.mockResolvedValue(changes([item('B')], 11));
		await refreshLibrary(MINE);
		expect(library().map((entry) => entry.key)).toEqual(['A', 'B']);
		expect(changedSince).toHaveBeenLastCalledWith(10, null);
	});

	it('replaces an item that changed rather than holding two of it', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A', 'old title')], 10));
		await refreshLibrary(MINE);

		libraryState.mockResolvedValue(state(11, 1));
		changedSince.mockResolvedValue(changes([item('A', 'new title')], 11));
		await refreshLibrary(MINE);
		expect(library()).toHaveLength(1);
		expect(library()[0]?.data.title).toBe('new title');
	});

	it('rereads everything when the count says something was deleted', async () => {
		// Zotero cannot report a deletion: the item simply stops being mentioned.
		// A count that disagrees with what we hold is the only sign there is.
		libraryState.mockResolvedValue(state(10, 2));
		changedSince.mockResolvedValue(changes([item('A'), item('B')], 10));
		await refreshLibrary(MINE);

		libraryState.mockResolvedValue(state(11, 1));
		changedSince.mockResolvedValueOnce(changes([], 11)).mockResolvedValueOnce(changes([item('A')], 11));
		await refreshLibrary(MINE);

		expect(changedSince).toHaveBeenLastCalledWith(0, null);
		expect(library().map((entry) => entry.key)).toEqual(['A']);
	});

	it('catches a deletion that did not move the library version', async () => {
		// Whether removing an item bumps the version is Zotero's business, and
		// not something worth resting on. The count answers either way.
		libraryState.mockResolvedValue(state(10, 2));
		changedSince.mockResolvedValue(changes([item('A'), item('B')], 10));
		await refreshLibrary(MINE);

		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValueOnce(changes([], 10)).mockResolvedValueOnce(changes([item('A')], 10));
		await refreshLibrary(MINE);

		expect(library().map((entry) => entry.key)).toEqual(['A']);
	});

	it('does not reread when the count agrees, which is almost always', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);

		// A version that moved with no deletion behind it: one delta, no reread.
		libraryState.mockResolvedValue(state(11, 1));
		changedSince.mockResolvedValue(changes([item('A', 'renamed')], 11));
		await refreshLibrary(MINE);
		expect(changedSince).toHaveBeenCalledTimes(2);
	});

	it('says whether anything moved, so a caller can skip a redraw', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		expect(await refreshLibrary(MINE)).toBe(true);

		expect(await refreshLibrary(MINE)).toBe(false);
	});

	it('keeps what it had when Zotero cannot be reached', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);

		libraryState.mockRejectedValue(new Error('ECONNREFUSED'));
		expect(await refreshLibrary(MINE)).toBe(false);
		// A closed Zotero is not evidence that your library is empty.
		expect(library().map((entry) => entry.key)).toEqual(['A']);
	});

	it('reads afresh after a failed first attempt rather than treating it as read', async () => {
		libraryState.mockRejectedValue(new Error('ECONNREFUSED'));
		await refreshLibrary(MINE);

		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);
		expect(changedSince).toHaveBeenLastCalledWith(0, null);
	});
});

/**
 * Sources name collections, but libraries are what is read: which papers a
 * collection brings in is worked out from the items, in `core/sources.ts`.
 */
describe('sources', () => {
	const collection = (key: string) => ({ key, data: { name: key, parentCollection: false as const } });
	const thesis = [{ group: null, collection: 'THESIS00', triage: false }];

	it('reads the whole library for a source that is one collection', async () => {
		allCollections.mockResolvedValue([collection('THESIS00')]);
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));

		await refreshLibrary(thesis);
		expect(changedSince).toHaveBeenCalledWith(0, null);
		expect(contents()).toEqual([{ group: null, items: [item('A')], collections: [collection('THESIS00')] }]);
	});

	it('reads nothing again when the sources change and the library has not', async () => {
		allCollections.mockResolvedValue([collection('THESIS00')]);
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);
		await refreshLibrary(thesis);
		expect(changedSince).toHaveBeenCalledTimes(1);
	});

	it('asks for the collection list only when a source names a collection', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);
		expect(allCollections).not.toHaveBeenCalled();
	});

	it('reads the collection list again once the library has moved, and only then', async () => {
		allCollections.mockResolvedValue([collection('THESIS00')]);
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(thesis);
		await refreshLibrary(thesis);
		expect(allCollections).toHaveBeenCalledTimes(1);

		libraryState.mockResolvedValue(state(11, 1));
		changedSince.mockResolvedValue(changes([], 11));
		await refreshLibrary(thesis);
		expect(allCollections).toHaveBeenCalledTimes(2);
	});

	it('counts a changed collection list as movement, since it changes what a source brings in', async () => {
		allCollections.mockResolvedValue([collection('THESIS00')]);
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(thesis);

		allCollections.mockResolvedValue([]);
		libraryState.mockResolvedValue(state(11, 1));
		changedSince.mockResolvedValue(changes([], 11));
		expect(await refreshLibrary(thesis)).toBe(true);
	});

	it('keeps the collection list for the picker', async () => {
		allCollections.mockResolvedValue([collection('THESIS00')]);
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(thesis);
		expect(collections().map((entry) => entry.key)).toEqual(['THESIS00']);
	});

	it('reads each library a source names, once, and keeps them apart', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockImplementation((_since, group) => Promise.resolve(changes([item(group === null ? 'MINE' : 'LAB')], 10)));
		await refreshLibrary([...MINE, { group: 5, collection: '', triage: true }]);

		expect(library(null).map((entry) => entry.key)).toEqual(['MINE']);
		expect(library(5).map((entry) => entry.key)).toEqual(['LAB']);
		expect(contents().map((entry) => entry.group)).toEqual([null, 5]);
	});

	it('asks which groups you are in once, and only when a source names one', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);
		expect(allGroups).not.toHaveBeenCalled();

		const both = [...MINE, { group: 5, collection: '', triage: true }];
		await refreshLibrary(both);
		await refreshLibrary(both);
		expect(allGroups).toHaveBeenCalledTimes(1);
		expect(groups()).toEqual([{ id: 5, data: { name: 'Lab' } }]);
	});

	it('does not read a group you are no longer in', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary([...MINE, { group: 9, collection: '', triage: true }]);
		expect(libraryState.mock.calls.map((call) => call[0])).toEqual([null]);
	});

	it('still reads the other libraries when one fails', async () => {
		libraryState.mockImplementation((group) => (group === 5 ? Promise.reject(new Error('gone')) : Promise.resolve(state(10, 1))));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		expect(await refreshLibrary([...MINE, { group: 5, collection: '', triage: true }])).toBe(true);
		expect(library(null).map((entry) => entry.key)).toEqual(['A']);
	});

	it('reads nothing at all when there are no sources', async () => {
		await refreshLibrary([]);
		expect(libraryState).not.toHaveBeenCalled();
		expect(contents()).toEqual([]);
	});
});

/**
 * Telling every view, not only the one that asked. A paper removed in Zotero
 * left the sidebar and stayed in a block on the note beside it, because only
 * the sidebar asked and only the asker redrew.
 */
describe('onLibraryChange', () => {
	const listening = () => {
		const heard = vi.fn();
		const stop = onLibraryChange(heard);
		return { heard, stop };
	};

	it('tells everyone listening when the library moved', async () => {
		const a = listening();
		const b = listening();
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);
		expect(a.heard).toHaveBeenCalledTimes(1);
		expect(b.heard).toHaveBeenCalledTimes(1);
		a.stop();
		b.stop();
	});

	// The usual answer, and the reason a redraw is worth skipping.
	it('says nothing when nothing moved', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);
		const { heard, stop } = listening();
		await refreshLibrary(MINE);
		expect(heard).not.toHaveBeenCalled();
		stop();
	});

	it('tells when a paper was removed', async () => {
		libraryState.mockResolvedValue(state(10, 2));
		changedSince.mockResolvedValue(changes([item('A'), item('B')], 10));
		await refreshLibrary(MINE);
		const { heard, stop } = listening();
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);
		expect(library().map((entry) => entry.key)).toEqual(['A']);
		expect(heard).toHaveBeenCalledTimes(1);
		stop();
	});

	// Nothing moved, but what the queue has to say did: that Zotero is gone.
	it('tells when Zotero stops answering, and again when it comes back', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);
		const { heard, stop } = listening();
		libraryState.mockRejectedValue(new Error('closed'));
		await refreshLibrary(MINE);
		expect(heard).toHaveBeenCalledTimes(1);
		libraryState.mockResolvedValue(state(10, 1));
		await refreshLibrary(MINE);
		expect(heard).toHaveBeenCalledTimes(2);
		stop();
	});

	it('stops telling a listener that has stopped listening', async () => {
		const { heard, stop } = listening();
		stop();
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		await refreshLibrary(MINE);
		expect(heard).not.toHaveBeenCalled();
	});

	// The sidebar and a block both ask when you come back to Obsidian.
	it('shares a look already under way rather than asking twice', async () => {
		libraryState.mockResolvedValue(state(10, 1));
		changedSince.mockResolvedValue(changes([item('A')], 10));
		const [first, second] = await Promise.all([refreshLibrary(MINE), refreshLibrary(MINE)]);
		expect(libraryState).toHaveBeenCalledTimes(1);
		expect(first).toBe(second);
	});
});
