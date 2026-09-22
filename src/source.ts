// Talking to Zotero, over the local API on port 23119 and nothing else.
//
// This used to read Zotero's storage folder from disk as well, to find the
// text it extracts beside each attachment for the triage pane's first pass.
// The pane is gone and so is that: no filesystem, no data-directory setting,
// no hunting through prefs.js for a profile, and nothing that can fail because
// Zotero keeps its library somewhere this did not guess.
//
// What is left is one shape of request. Everything goes through `answered`,
// which is also what records whether Zotero is there at all.
import {
	highlights,
	libraryPath,
	type ApiItem,
	type Highlight,
	type ItemRef,
} from './core/zotero';
import type { ApiCollection } from './core/collections';
import { getJson, getText, type Headers } from './http';

/** A failure to show the user as is. */
export class SourceError extends Error {}


/**
 * These are read in a sidebar banner about as wide as a sentence, so they are
 * one line each.
 *
 * They also say different things, which the old wording did not: a Zotero that
 * is not answering is almost always one that is not running, and naming a
 * checkbox does not help you when nothing is there to have it. A refusal is the
 * opposite case, and the only one where the setting is the answer.
 *
 * Neither quotes the checkbox in full. It is sixty characters, and Settings >
 * Advanced has one thing in it about other applications. The exact wording is
 * in the README, which is where you read sentences.
 */
const UNREACHABLE = 'Zotero is not answering. Is it running?';
const REFUSED = 'Zotero refused. Turn on its local API in Settings > Advanced.';

/**
 * Whether Zotero answered the last time anything asked it something, and what
 * it said if it did not. Null until something has asked.
 */
export type Contact = { reachable: true } | { reachable: false; reason: string } | null;

let contact: Contact = null;

/**
 * The last thing Zotero did, so a pane can say so without asking again.
 *
 * Recorded rather than polled. Everything the plugin does goes through `api`
 * below, so the answer is a by-product of work already happening and costs
 * nothing. A plugin whose whole value depends on another program being open
 * should be able to say whether it is, and until now nothing could: the sync on
 * open is silent by design, so a closed Zotero looked exactly like a paper with
 * no highlights.
 */
export function lastContact(): Contact {
	return contact;
}

async function api<T>(path: string): Promise<T> {
	return (await answered<T>(path)).body;
}

/** The same request, when the caller needs what Zotero said in its headers too. */
async function answered<T>(path: string): Promise<{ body: T; headers: Headers }> {
	let response;
	try {
		response = await getJson(`/api/${path}`);
	} catch (error) {
		console.error('paper-trail: local API request failed', error);
		contact = { reachable: false, reason: UNREACHABLE };
		throw new SourceError(UNREACHABLE);
	}

	if (response.status === 403) {
		contact = { reachable: false, reason: REFUSED };
		throw new SourceError(REFUSED);
	}

	// Anything else means Zotero is there and talking, including a 404, which
	// says only that one item is unknown to it.
	contact = { reachable: true };

	if (response.status === 404) throw new SourceError('Zotero does not know this item.');
	if (response.status >= 400) throw new SourceError(`Zotero answered with HTTP ${response.status}.`);
	return { body: response.json as T, headers: response.headers };
}

export function searchItems(query: string): Promise<ApiItem[]> {
	return api<ApiItem[]>(`users/0/items/top?q=${encodeURIComponent(query)}&limit=25`);
}

/**
 * The most recently added items, newest first.
 *
 * For a picker with nothing typed in it. Almost every paper you want a note for
 * is one you saved from the browser a few minutes ago, so an empty box is worth
 * more as a list of those than as an instruction to start typing the title of
 * something you are already looking at.
 */
export function recentItems(limit: number): Promise<ApiItem[]> {
	return api<ApiItem[]>(`users/0/items/top?sort=dateAdded&direction=desc&limit=${limit}`);
}

/** Zotero's maximum, and the fewest requests a library can be read in. */
const PAGE = 100;

/** A paper's metadata, for building or refreshing its note. */
export function itemMetadata(ref: ItemRef): Promise<ApiItem> {
	return api<ApiItem>(`${libraryPath(ref)}/items/${ref.key}`);
}

/**
 * The annotations on an attachment.
 *
 * `?itemType=annotation` is not optional. On the local API a bare `/children`
 * returns an empty list for an attachment that has highlights, which the web
 * API does not do, so code written from its documentation fails silently.
 */
export async function attachmentAnnotations(ref: ItemRef, attachmentKey: string): Promise<Highlight[]> {
	const children = await api<ApiItem[]>(`${libraryPath(ref)}/items/${attachmentKey}/children?itemType=annotation`);
	return highlights(children);
}

/** An item's children: its attachments, and its notes. */
export function itemChildren(ref: ItemRef): Promise<ApiItem[]> {
	return api<ApiItem[]>(`${libraryPath(ref)}/items/${ref.key}/children`);
}

const BBT_MISSING = 'Could not reach Better BibTeX. Is it installed in Zotero?';

/**
 * Better BibTeX's cite-as-you-write picker. One GET opens Zotero's own citation
 * dialog and returns what was chosen, already formatted.
 *
 * Kept as the escape hatch behind the picker here, not as the way in. It raises
 * Zotero over whatever you were writing, which is the thing to avoid, but it is
 * the only way to get locators, prefixes and several sources in one citation,
 * and reimplementing that syntax would be worse than borrowing it.
 *
 * The request blocks until the dialog is answered, which may be a minute of
 * someone searching their library, so it runs without a timeout. The five
 * seconds that suit a database read would cancel the dialog under them.
 */
export async function pickCitation(): Promise<string | null> {
	let response;
	try {
		response = await getText('/better-bibtex/cayw?format=pandoc&brackets=true', 0);
	} catch (error) {
		console.error('paper-trail: cite-as-you-write request failed', error);
		throw new SourceError(BBT_MISSING);
	}
	if (response.status === 404) throw new SourceError(BBT_MISSING);
	if (response.status >= 400) throw new SourceError(`Better BibTeX answered with HTTP ${response.status}.`);

	// Cancelling the dialog is an empty body, not an error.
	return response.body.trim() || null;
}


/**
 * Where to read top-level items from: one collection, or the whole library.
 *
 * An empty scope is the whole library, which is both the default and the only
 * honest reading of "no collection chosen". The key is escaped because it
 * arrives from a setting, and a setting is a place a person can type.
 */
function itemsPath(collection: string): string {
	if (collection === '') return 'users/0/items/top';
	return `users/0/collections/${encodeURIComponent(collection)}/items/top`;
}

/**
 * Every collection in the library, for the scope picker and for checking that
 * the scope still exists.
 *
 * Paged like the items are. Nobody has a thousand collections, but the loop
 * costs one comparison and the alternative is a library that silently stops at
 * a hundred for the one person who does.
 */
export async function allCollections(): Promise<ApiCollection[]> {
	const out: ApiCollection[] = [];
	for (let start = 0; ; start += PAGE) {
		const page = await api<ApiCollection[]>(`users/0/collections?limit=${PAGE}&start=${start}`);
		out.push(...page);
		if (page.length < PAGE) break;
	}
	return out;
}

/** What Zotero has changed since a version, and what to ask about next time. */
export interface Changes {
	items: ApiItem[];
	/** The library version this answer reflects. Ask with this next. */
	version: number;
}

/**
 * Only what has changed since a given library version.
 *
 * Zotero versions every object and stamps the library's current version on
 * every response, so "what is new" is one request that almost always answers
 * with an empty list. That is what makes it cheap enough to ask whenever you
 * come back to Obsidian, which is the moment you have just clipped something.
 *
 * `since: 0` means everything, so a first read and an update are the same call.
 *
 * It cannot report deletions: the local API has no `/deleted` endpoint, and an
 * item that is gone simply stops being mentioned. `libraryState` is the way
 * round that, and it has to be asked separately: the count on this response is
 * the count of what changed, not of what exists.
 */
export async function changedSince(since: number, collection: string): Promise<Changes> {
	const path = itemsPath(collection);
	const { body, headers } = await answered<ApiItem[]>(`${path}?since=${since}&limit=${PAGE}`);

	// A full read can exceed one page. An update almost never will, but a week
	// away from a busy library is exactly when it would.
	const items = [...body];
	for (let start = PAGE; items.length >= start; start += PAGE) {
		const page = await api<ApiItem[]>(`${path}?since=${since}&limit=${PAGE}&start=${start}`);
		items.push(...page);
		if (page.length < PAGE) break;
	}

	return { items, version: headers.version };
}

/** What state Zotero's library is in, without reading it. */
export interface LibraryState {
	/**
	 * The library's current version, which moves whenever anything in it does.
	 *
	 * The library's and not the collection's: Zotero versions the library as a
	 * whole, so under a scope this moves for changes outside it too. That costs
	 * a delta request that comes back empty, and it is the safe way round.
	 */
	version: number;
	/** How many top-level items are in scope, deleted ones already gone. */
	total: number;
}

/**
 * Both of those numbers, for the price of one item.
 *
 * `limit=1` because neither answer is in the body: Zotero puts the version and
 * the size of the result set in headers, so this costs the same on a library of
 * four and a library of four thousand. Asked with no `since`, so the count is
 * of the library rather than of a delta, which is the whole point of it.
 *
 * This exists because that distinction was got wrong once, and expensively.
 * `Total-Results` on a `?since=` query counts what changed: comparing it
 * against a cached library said "something was deleted" on every refresh where
 * nothing had, so the incremental path never once took effect and every look
 * read the whole library twice.
 */
export async function libraryState(collection: string): Promise<LibraryState> {
	const { headers } = await answered<ApiItem[]>(`${itemsPath(collection)}?limit=1`);
	return { version: headers.version, total: headers.total };
}
