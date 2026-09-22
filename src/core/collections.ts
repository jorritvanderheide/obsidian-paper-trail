// Zotero collections, as the scope setting needs to see them.
//
// One collection is an address: the name of a thing outside the plugin that
// says which part of a library this vault is about. A Zotero built up over a
// masters and two side projects is not the corpus of one thesis, and a Triage
// list that opens with three thousand rows is not a queue, it is a reason to
// uninstall.
//
// Pure: the caller hands over what Zotero said.

/**
 * A collection as the local API returns it.
 *
 * `parentCollection` is the parent's key, or `false` at the top level, which is
 * Zotero's own spelling rather than a choice made here.
 */
export interface ApiCollection {
	key: string;
	data: {
		name?: string;
		parentCollection?: string | false;
	};
}

/** One collection, as the picker offers it. */
export interface CollectionChoice {
	key: string;
	/** The name, with its ancestors, so two called Papers can be told apart. */
	path: string;
}

/**
 * What separates a collection from its parent in a path.
 *
 * Spaces around it on purpose: without them "Thesis/WP1" reads as one name
 * containing a slash, which is a thing Zotero allows, and a picker that cannot
 * be read unambiguously is worse than one that is a little wide.
 */
const SEPARATOR = ' / ';

/**
 * Every collection, named by its full path, alphabetically.
 *
 * The path rather than the name because collections nest, people reuse names
 * inside different parents, and the setting stores an opaque eight-character
 * key. A list of bare names is a list in which the wrong choice looks exactly
 * like the right one.
 *
 * Alphabetical by path, which groups each parent with its children for free.
 */
export function collectionPaths(collections: ApiCollection[]): CollectionChoice[] {
	const byKey = new Map(collections.map((entry) => [entry.key, entry]));

	const pathOf = (from: ApiCollection): string => {
		const names: string[] = [];
		// `seen` is not defensive tidying. A parent pointing at its own
		// descendant is a malformed answer rather than an impossible one, and
		// the alternative to noticing is a loop that never ends inside a redraw.
		const seen = new Set<string>();

		let current: ApiCollection | undefined = from;
		while (current && !seen.has(current.key)) {
			seen.add(current.key);
			// An unnamed collection falls back to its key, which is ugly and
			// findable. Falling back to nothing would give two blank rows.
			names.unshift(current.data.name?.trim() || current.key);
			const parent: string | false | undefined = current.data.parentCollection;
			current = typeof parent === 'string' ? byKey.get(parent) : undefined;
		}

		return names.join(SEPARATOR);
	};

	return collections
		.map((entry) => ({ key: entry.key, path: pathOf(entry) }))
		.sort((a, b) => a.path.localeCompare(b.path) || a.key.localeCompare(b.key));
}

/**
 * Why the configured scope cannot be used, or null when it can.
 *
 * This exists because of how the local API fails. Asking for the items of a
 * collection that is not there does not 404 and does not come back empty: it
 * answers 200 with the entire library. So a collection renamed away in Zotero
 * would not break the scope, it would silently remove it, and the first sign
 * would be a morning of triaging papers from a project finished two years ago.
 *
 * Checked against the collection list instead, which does report a missing key
 * honestly, and refusing to read is the right answer: showing nothing with a
 * reason beats showing everything with none.
 */
export function missingScope(collection: string, known: ApiCollection[]): string | null {
	if (collection === '' || known.some((entry) => entry.key === collection)) return null;
	return 'The Zotero collection this vault is scoped to is gone. Pick another in settings, or clear it for the whole library.';
}
