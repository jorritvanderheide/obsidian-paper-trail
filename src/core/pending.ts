// Papers you have not ruled on yet.
//
// Triage is what Zotero holds that the vault has no note for, worked out rather
// than stored. Nothing is written until you decide something, and the decision
// is what makes the note.
//
// That matters because a library does not carry uniform intent. One item was a
// deliberate click in the browser; the next four hundred matched a search
// string and you have decided nothing about any of them. A note apiece would be
// four hundred files standing for judgements nobody has made.
//
// Pure: the caller hands over what Zotero said and what the vault holds.
import { abstractOf, itemYear, parseItemRef, venueOf, type ItemRef } from './zotero';
import type { Placed } from './sources';

/** A paper in Zotero with no note here yet, as the queue needs to show it. */
export interface Pending {
	/** What its note will store under the item key property, which `parseItemRef` reads. */
	key: string;
	title: string;
	/** Enough to settle most papers without opening anything. */
	abstract: string | null;
	venue: string | null;
	year: number | null;
	/** Zotero's own `dateAdded`, so the queue drains in the order things arrived. */
	added: string;
	/** Whether it goes to Triage first, which the source it came from decides. */
	triage: boolean;
}

/**
 * Where a pending paper is in Zotero, read back out of its key. A key that
 * came from Zotero always reads; the fallback is for one that somehow did not,
 * which is then looked for in your own library.
 */
export function pendingRef(item: Pick<Pending, 'key'>): ItemRef {
	return parseItemRef(item.key) ?? { key: item.key, groupID: null };
}

/** What the sources bring in, less what the vault already has a note for. */
export function pendingOf(placed: Placed[], known: Iterable<string>): Pending[] {
	const have = new Set(known);

	return placed
		.filter(({ ref }) => !have.has(ref))
		.map(({ item, ref, triage }) => ({
			key: ref,
			title: item.data.shortTitle?.trim() || item.data.title?.trim() || item.key,
			abstract: abstractOf(item),
			venue: venueOf(item),
			year: itemYear(item),
			added: item.data.dateAdded ?? '',
			triage,
		}))
		// Oldest first, like every other stage: the pile drains in the order it
		// arrived rather than showing you the most recent thing you clipped.
		.sort((a, b) => a.added.localeCompare(b.added) || a.title.localeCompare(b.title));
}
