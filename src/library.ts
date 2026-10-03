// What Zotero holds, kept for as long as a session runs.
//
// The queue needs whole libraries to work out what has no note yet, and a
// library is ten requests for a thousand items. Cheap on localhost, but not
// once per redraw: the queue redraws whenever any note in the vault changes,
// which during a sync is once per file.
//
// So each library is read once and then kept current by asking Zotero only
// what has changed, which is one request that almost always answers with
// nothing. That is what makes it cheap enough to ask every time you come back
// to Obsidian, which is the moment you have just clipped something in the
// browser and want to see it in the queue without asking.
//
// Whole libraries, never one collection. Which papers a source brings in is
// worked out in `core/sources.ts` from what each item says it is filed in, so
// a change of sources needs nothing read again.
//
// Nothing here is written to disk. This caches Zotero's state, never the
// vault's, and the worst a stale copy costs is a paper missing from the queue
// until the next look.
import { allCollections, changedSince, libraryState } from './source';
import type { ApiCollection } from './core/collections';
import type { Contents, Source } from './core/sources';
import type { ApiItem } from './core/zotero';

/** One library, as far as it has been read. */
interface Held {
	items: ApiItem[];
	version: number;
	read: boolean;
	collections: ApiCollection[];
	/** The library version the collection list was read at, or null before it was. */
	collectionsAt: number | null;
}

/** Your own library under null, and each group under its id. */
const held = new Map<number | null, Held>();

/** Whether the last look got an answer, or null before the first. */
let reached: boolean | null = null;

/** The look under way, so a second asker waits on it rather than asking again. */
let pending: { asked: string; answer: Promise<boolean> } | null = null;

/**
 * Everything that draws the library and wants to know when it changes.
 *
 * The sidebar and a block in a note both draw from what is held here, and only
 * the one that asked used to redraw. Remove a paper in Zotero with both on
 * screen and the sidebar dropped it while the block went on offering it.
 */
const listeners = new Set<() => void>();

/** Be told when the library changes. Returns the way to stop being told. */
export function onLibraryChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** What was last fetched of one library. Empty until something has asked. */
export function library(group: number | null = null): ApiItem[] {
	return held.get(group)?.items ?? [];
}

/** Every library that has been read, as `place` wants them. */
export function contents(): Contents[] {
	return [...held].flatMap(([group, entry]) =>
		entry.read ? [{ group, items: entry.items, collections: entry.collections }] : [],
	);
}

/** Every collection in a library, for the source picker. Empty until something has asked. */
export function collections(group: number | null = null): ApiCollection[] {
	return held.get(group)?.collections ?? [];
}

/** Forget everything, so the next look reads every library afresh. */
export function forgetLibrary(): void {
	held.clear();
	reached = null;
}

/**
 * Read a library's collection list again, for a settings tab that has just
 * opened. Held at no version, so the next look reads it again too.
 */
export async function refreshCollections(group: number | null = null): Promise<void> {
	try {
		const entry = entryOf(group);
		entry.collections = await allCollections(group);
		entry.collectionsAt = null;
	} catch {
		// `source` has already recorded why, and the settings tab says so.
	}
}

function entryOf(group: number | null): Held {
	let entry = held.get(group);
	if (!entry) {
		entry = { items: [], version: 0, read: false, collections: [], collectionsAt: null };
		held.set(group, entry);
	}
	return entry;
}

/**
 * Bring every library the sources read from up to date, and say whether
 * anything moved.
 *
 * Per library, one request in the usual case and four in the worst. The usual
 * one is what matters, because this is asked every time you come back to
 * Obsidian.
 *
 * Failure leaves the previous answer in place rather than emptying it: Zotero
 * being closed is not evidence that your library is empty, and a queue that
 * collapsed to nothing every time you quit Zotero would be worse than one that
 * is briefly out of date.
 */
export function refreshLibrary(sources: Source[]): Promise<boolean> {
	// Which libraries to read, and in which of them a collection is named, since
	// only those need the collection list.
	const wanted = new Map<number | null, boolean>();
	for (const source of sources) wanted.set(source.group, (wanted.get(source.group) ?? false) || source.collection !== '');

	const asked = JSON.stringify([...wanted]);
	if (pending?.asked === asked) return pending.answer;

	const was = reached;
	const answer = Promise.all([...wanted].map(([group, scoped]) => look(group, scoped)))
		.then(
			(moved) => {
				reached = true;
				return moved.some(Boolean);
			},
			// `source` has already recorded why, and the queue says so. What was
			// held stays held.
			() => {
				reached = false;
				return false;
			},
		)
		.then((moved) => {
			// Told when something moved, and also when Zotero came or went, because
			// that changes what the queue has to say. Telling on "moved" alone meant
			// quitting Zotero with the queue open changed nothing on screen: the
			// failure was recorded and never drawn.
			if (moved || reached !== was) {
				for (const listener of listeners) listener();
			}
			return moved;
		})
		.finally(() => {
			pending = null;
		});

	pending = { asked, answer };
	return answer;
}

/**
 * One library. Throws when Zotero cannot be reached.
 *
 * It opens by asking Zotero what state the library is in rather than what has
 * changed. That answer is two numbers out of the headers of a one-item
 * response, and when both agree with what is held there is nothing to fetch.
 *
 * Both numbers, not just the version. The version catches everything Zotero
 * admits to; the count catches the one thing it might not, which is an item
 * that has gone. Between them this is correct whether or not a deletion moves
 * the library version, which is not a thing to leave resting on a guess.
 */
async function look(group: number | null, scoped: boolean): Promise<boolean> {
	const entry = entryOf(group);
	const state = await libraryState(group);
	let moved = false;

	// The collection list, only where a source names a collection, and again
	// whenever the library has moved: a collection made, renamed or deleted
	// moves the version as an item does. A change to it counts as movement,
	// because it can change which papers a source brings in.
	if (scoped && entry.collectionsAt !== state.version) {
		const before = JSON.stringify(entry.collections);
		entry.collections = await allCollections(group);
		entry.collectionsAt = state.version;
		moved = JSON.stringify(entry.collections) !== before;
	}

	if (entry.read && state.version === entry.version && state.total === entry.items.length) return moved;

	// `since: 0` means everything, so a first read and an update are the same
	// call and there is no separate path to get wrong.
	const changes = await changedSince(entry.read ? entry.version : 0, group);
	const before = entry.items.length;

	merge(entry, changes.items);
	entry.version = changes.version;
	entry.read = true;

	// Zotero cannot say what was deleted: the local API has no `/deleted`
	// endpoint, and an item that is gone simply stops being mentioned. So a
	// count that still disagrees once the changes are in means something
	// went, and reading again is the only way to find out which.
	//
	// The count is from before the delta was fetched, so an item added in
	// between reads as a disagreement and buys one wasted re-read. It
	// settles on the next look, which is the right way round: a library
	// briefly re-read costs a moment, and a library quietly holding a paper
	// that no longer exists offers it to you in the queue.
	if (state.total !== entry.items.length) {
		entry.items = (await changedSince(0, group)).items;
	}

	return moved || changes.items.length > 0 || entry.items.length !== before;
}

/** Replace what changed, keep the rest, and do not reorder for the sake of it. */
function merge(entry: Held, changed: ApiItem[]): void {
	if (changed.length === 0) return;

	const byKey = new Map(entry.items.map((item) => [item.key, item]));
	for (const item of changed) byKey.set(item.key, item);
	entry.items = [...byKey.values()];
}
