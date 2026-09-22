// What Zotero holds, kept for as long as a session runs.
//
// The queue needs the whole library to work out what has no note yet, and the
// whole library is ten requests for a thousand items. Cheap on localhost, but
// not once per redraw: the queue redraws whenever any note in the vault
// changes, which during a sync is once per file.
//
// So it is read once and then kept current by asking Zotero only what has
// changed, which is one request that almost always answers with nothing. That
// is what makes it cheap enough to ask every time you come back to Obsidian,
// which is the moment you have just clipped something in the browser and want
// to see it in the queue without asking.
//
// Nothing here is written to disk. This caches Zotero's state, never the
// vault's, and the worst a stale copy costs is a paper missing from Triage
// until the next look.
import { allCollections, changedSince, libraryState } from './source';
import { missingScope, type ApiCollection } from './core/collections';
import type { ApiItem } from './core/zotero';

let items: ApiItem[] = [];
let version = 0;
let read = false;

/** The collection everything above was read from, or empty for the whole library. */
let scope = '';
let known: ApiCollection[] = [];
let problem: string | null = null;

/** What was last fetched. Empty until something has asked. */
export function library(): ApiItem[] {
	return items;
}

/** Every collection Zotero has, for the scope picker. Empty until something has asked. */
export function collections(): ApiCollection[] {
	return known;
}

/**
 * Why the configured scope could not be used, or null when it could.
 *
 * Read by the queue, which is the only place that can say so: a scope that has
 * gone means the list you are looking at is not the list you asked for, and
 * that is worth a line rather than a silence.
 */
export function scopeProblem(): string | null {
	return problem;
}

/**
 * Forget everything, so the next look reads the library afresh.
 *
 * For a change of scope, where what is held is not stale but simply the wrong
 * set: a collection's items are not the library's, and merging one into the
 * other would answer a question nobody asked.
 */
export function forgetLibrary(): void {
	items = [];
	version = 0;
	read = false;
	known = [];
	problem = null;
}

/** Read the collection list again, for a settings tab that has just opened. */
export async function refreshCollections(): Promise<void> {
	try {
		known = await allCollections();
	} catch {
		// `source` has already recorded why, and the settings tab says so.
	}
}

/**
 * Bring the cached library up to date, and say whether anything moved.
 *
 * Three requests in the worst case and one in the usual one. The usual one is
 * what matters, because this is asked every time you come back to Obsidian.
 *
 * It opens by asking Zotero what state it is in rather than what has changed.
 * That answer is two numbers out of the headers of a one-item response, and
 * when both agree with what is held there is nothing to fetch and nothing to
 * redraw. Only when one of them has moved is the delta worth asking for.
 *
 * Both numbers, not just the version. The version catches everything Zotero
 * admits to; the count catches the one thing it might not, which is an item
 * that has gone. Between them this is correct whether or not a deletion moves
 * the library version, which is not a thing to leave resting on a guess.
 *
 * Failure leaves the previous answer in place rather than emptying it: Zotero
 * being closed is not evidence that your library is empty, and a Triage count
 * that collapsed to nothing every time you quit Zotero would be worse than one
 * that is briefly out of date.
 */
export async function refreshLibrary(collection: string): Promise<boolean> {
	// A change of scope invalidates every answer given under the last one, so
	// this starts over rather than merging one collection's items into another's.
	if (collection !== scope) {
		forgetLibrary();
		scope = collection;
	}

	try {
		// Only when a scope is set. With none there is nothing to check, and
		// fetching the collection list to prove that would be a request per
		// refresh bought for the majority who never scope anything.
		if (collection !== '') {
			if (known.length === 0) known = await allCollections();
			problem = missingScope(collection, known);
			// Nothing is read at all, which is the point. Asking Zotero for the
			// items of a collection that is gone answers with the entire library,
			// so carrying on here would quietly replace the queue with every paper
			// the vault has ever heard of.
			if (problem !== null) return false;
		} else {
			problem = null;
		}

		const state = await libraryState(collection);
		if (read && state.version === version && state.total === items.length) return false;

		// `since: 0` means everything, so a first read and an update are the same
		// call and there is no separate path to get wrong.
		const changes = await changedSince(read ? version : 0, collection);
		const before = items.length;

		merge(changes.items);
		version = changes.version;
		read = true;

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
		if (state.total !== items.length) {
			items = (await changedSince(0, collection)).items;
		}

		return changes.items.length > 0 || items.length !== before;
	} catch {
		// `source` has already recorded why, and the queue says so.
		return false;
	}
}

/** Replace what changed, keep the rest, and do not reorder for the sake of it. */
function merge(changed: ApiItem[]): void {
	if (changed.length === 0) return;

	const byKey = new Map(items.map((item) => [item.key, item]));
	for (const item of changed) byKey.set(item.key, item);
	items = [...byKey.values()];
}
