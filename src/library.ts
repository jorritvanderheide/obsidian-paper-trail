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
import { changedSince } from './source';
import type { ApiItem } from './core/zotero';

let items: ApiItem[] = [];
let version = 0;
let read = false;

/** What was last fetched. Empty until something has asked. */
export function library(): ApiItem[] {
	return items;
}

/**
 * Forget everything, so the next look reads the library afresh.
 *
 * For when the address changes: what is cached came from whichever Zotero was
 * answering on the old port, and nothing about it is true of the new one.
 */
export function forgetLibrary(): void {
	items = [];
	version = 0;
	read = false;
}

/**
 * Bring the cached library up to date, and say whether anything moved.
 *
 * The first call reads everything, because `since: 0` means everything and a
 * first read is only an update from nothing. Later calls ask what has changed
 * since the version Zotero last reported, and usually get an empty list back.
 *
 * Failure leaves the previous answer in place rather than emptying it: Zotero
 * being closed is not evidence that your library is empty, and a Triage count
 * that collapsed to nothing every time you quit Zotero would be worse than one
 * that is briefly out of date.
 */
export async function refreshLibrary(): Promise<boolean> {
	try {
		const changes = await changedSince(read ? version : 0);
		const before = items.length;

		merge(changes.items);
		version = changes.version;
		read = true;

		// Zotero cannot say what was deleted: the local API has no endpoint for
		// it, and an item that is gone simply stops being mentioned. It does say
		// how many it has, so a count that disagrees with ours means something
		// went, and reading again is the only way to find out which.
		if (changes.total !== items.length) {
			items = (await changedSince(0)).items;
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
