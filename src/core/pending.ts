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
import type { ApiItem } from './zotero';
import { abstractOf, isPaperItem, itemYear, venueOf } from './zotero';

/** A paper in Zotero with no note here yet, as the queue needs to show it. */
export interface Pending {
	key: string;
	title: string;
	/** Enough to settle most papers without opening anything. */
	abstract: string | null;
	venue: string | null;
	year: number | null;
	/** Zotero's own `dateAdded`, so the queue drains in the order things arrived. */
	added: string;
}

export function pendingOf(items: ApiItem[], known: Iterable<string>): Pending[] {
	const have = new Set(known);

	return items
		.filter((item) => isPaperItem(item) && !have.has(item.key))
		.map((item) => ({
			key: item.key,
			title: item.data.shortTitle?.trim() || item.data.title?.trim() || item.key,
			abstract: abstractOf(item),
			venue: venueOf(item),
			year: itemYear(item),
			added: item.data.dateAdded ?? '',
		}))
		// Oldest first, like every other stage: the pile drains in the order it
		// arrived rather than showing you the most recent thing you clipped.
		.sort((a, b) => a.added.localeCompare(b.added) || a.title.localeCompare(b.title));
}
