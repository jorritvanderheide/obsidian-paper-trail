// Where the queue's papers come from: the sources under Papers from, and which
// of Zotero's items each of them brings in.
//
// A source is an address, a whole library or one collection in it, plus the
// one thing only you can say about it: whether a paper arriving from there has
// been decided on. Your own saves usually have, because the connector button
// was the decision. A lab's reading list has not, because somebody else put it
// there. That is why triage is a switch per source rather than one for the
// vault.
//
// Sources are read top to bottom and a paper belongs to the first one it is
// in, so the order is the one rule for every overlap.
//
// Pure: the caller hands over what Zotero said, library by library.
import { collectionPaths, descendants, type ApiCollection } from './collections';
import { isPaperItem, storedKey, type ApiItem } from './zotero';

export interface Source {
	/** Null for your own library, or the id of a Zotero group. */
	group: number | null;
	/** A collection key in that library, or empty for all of it. */
	collection: string;
	/** Whether a paper from here with no note goes to Triage first, rather than straight to Reading. */
	triage: boolean;
}

/** What Zotero holds in one library, as the cache keeps it. */
export interface Contents {
	group: number | null;
	items: ApiItem[];
	collections: ApiCollection[];
}

/** A paper in scope, and what the source that brought it in says about it. */
export interface Placed {
	item: ApiItem;
	/** What its note holds under the item key property, which is how the vault knows it. */
	ref: string;
	triage: boolean;
}

/** Whether two sources name the same place, whatever each says about triage. */
export function sameSource(a: Pick<Source, 'group' | 'collection'>, b: Pick<Source, 'group' | 'collection'>): boolean {
	return a.group === b.group && a.collection === b.collection;
}

/**
 * The collections a source reads from, or null for its whole library.
 *
 * A collection that is gone reads from nothing. Asking Zotero for its items
 * would answer with the entire library, which is why this filters what is
 * already held rather than asking.
 */
function scopeOf(source: Source, collections: ApiCollection[], subcollections: boolean): Set<string> | null {
	if (source.collection === '') return null;
	if (!collections.some((entry) => entry.key === source.collection)) return new Set();
	return new Set([source.collection, ...(subcollections ? descendants(source.collection, collections) : [])]);
}

/**
 * Every paper the sources bring in, each once, with the first source it is in.
 *
 * Read from whole libraries and filtered here, on the collections Zotero lists
 * on each item. Zotero has no way to ask for a collection with its
 * subcollections, and asking once per subcollection would cost a request each
 * on every look; a library already held answers both for nothing.
 */
export function place(contents: Contents[], sources: Source[], subcollections: boolean): Placed[] {
	const placed = new Map<string, Placed>();
	for (const source of sources) {
		const library = contents.find((entry) => entry.group === source.group);
		if (!library) continue;

		const scope = scopeOf(source, library.collections, subcollections);
		for (const item of library.items) {
			if (!isPaperItem(item)) continue;
			if (scope && !(item.data.collections ?? []).some((key) => scope.has(key))) continue;

			const ref = storedKey({ key: item.key, groupID: source.group });
			if (!placed.has(ref)) placed.set(ref, { item, ref, triage: source.triage });
		}
	}
	return [...placed.values()];
}

/**
 * Why the queue is not showing everything it was asked to, or null.
 *
 * A source that cannot be read leaves the others alone: one collection deleted
 * in Zotero is a reason to say so, not to empty a queue the other sources still
 * fill. Only checked against libraries that have been read, since a library
 * Zotero has not answered for says nothing either way.
 */
export function sourceProblem(sources: Source[], contents: Contents[]): string | null {
	if (sources.length === 0) {
		return "Nothing is chosen under Papers from, so no papers come in from Zotero. Add your library or a collection in the settings.";
	}

	const gone = sources.some((source) => {
		const library = contents.find((entry) => entry.group === source.group);
		return library !== undefined && source.collection !== '' && !library.collections.some((entry) => entry.key === source.collection);
	});
	return gone
		? "A collection under Papers from isn't in Zotero anymore, so no papers come from it. Remove it in the settings, or add the one you meant."
		: null;
}

/** A library as the source picker shows it. */
export interface LibraryChoice {
	group: number | null;
	name: string;
	collections: ApiCollection[];
}

/** One thing the picker offers, and what to call it. */
export interface SourceChoice {
	source: Source;
	label: string;
}

/**
 * Every library and every collection in it, each named by its path from the
 * library down, so two collections called Papers can be told apart.
 *
 * Triage starts on for a group and off for your own library. What you save
 * yourself you have usually decided on, since the connector button was the
 * decision; what lands in a group somebody else may have put there.
 */
function choicesIn(libraries: LibraryChoice[]): SourceChoice[] {
	return libraries.flatMap(({ group, name, collections }) => [
		{ source: { group, collection: '', triage: group !== null }, label: name },
		...collectionPaths(collections).map(({ key, path }) => ({
			source: { group, collection: key, triage: group !== null },
			label: `${name} / ${path}`,
		})),
	]);
}

/** What the picker offers: everything not already under Papers from. */
export function sourceChoices(libraries: LibraryChoice[], chosen: Source[]): SourceChoice[] {
	return choicesIn(libraries).filter((choice) => !chosen.some((source) => sameSource(source, choice.source)));
}

/** What to call a source, or null when its library or collection is not among those given. */
export function sourceLabel(source: Source, libraries: LibraryChoice[]): string | null {
	return choicesIn(libraries).find((choice) => sameSource(choice.source, source))?.label ?? null;
}
