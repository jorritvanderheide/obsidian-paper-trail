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
	annotations,
	libraryPath,
	type ApiItem,
	type Annotation,
	type ItemRef,
} from './core/zotero';
import type { ApiCollection } from './core/collections';
import type { ApiGroup } from './core/sources';
import type { BetterBibtex, Contact } from './core/connection';
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
 * Neither quotes the checkbox in full. It is sixty characters, and Settings →
 * Advanced has one thing in it about other applications, which the refusal
 * names in Zotero's words. The exact label is in the README and the FAQ.
 */
const UNREACHABLE = 'Zotero is not answering. Is it running?';
const REFUSED = 'Zotero said no. Allow other applications in its Settings → Advanced.';

let contact: Contact = null;

/**
 * The last thing Zotero did, so a pane can say so without asking again.
 *
 * Recorded rather than polled. Everything the plugin does goes through `api`
 * below, so the answer is a by-product of work already happening and costs
 * nothing. A plugin whose whole value depends on another program being open
 * should be able to say whether it is, and until now nothing could: the sync on
 * open is silent by design, so a closed Zotero looked exactly like a paper with
 * no annotations.
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

	if (response.status === 404) throw new SourceError("Zotero doesn't have this item anymore.");
	if (response.status >= 400) throw new SourceError(`Zotero answered with an error (HTTP ${response.status}). Try again, and if it keeps happening, restart Zotero.`);
	return { body: response.json as T, headers: response.headers };
}

/** The groups this Zotero is in, for the source picker and to notice one you have left. */
export function allGroups(): Promise<ApiGroup[]> {
	return api<ApiGroup[]>('users/0/groups');
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
 * returns an empty list for an attachment that has annotations, which the web
 * API does not do, so code written from its documentation fails silently.
 */
export async function attachmentAnnotations(ref: ItemRef, attachmentKey: string, underlines: boolean): Promise<Annotation[]> {
	const children = await api<ApiItem[]>(`${libraryPath(ref)}/items/${attachmentKey}/children?itemType=annotation`);
	return annotations(children, underlines);
}

/** An item's children: its attachments, and its notes. */
export function itemChildren(ref: ItemRef): Promise<ApiItem[]> {
	return api<ApiItem[]>(`${libraryPath(ref)}/items/${ref.key}/children`);
}

/**
 * Whether Better BibTeX is installed, without opening anything.
 *
 * `probe` makes the cite-as-you-write endpoint answer `ready`, or `starting`
 * while Zotero is still loading it, instead of raising its dialog. Without
 * Better BibTeX the endpoint does not exist and Zotero answers 404. Null when
 * Zotero itself is not there to ask.
 */
export async function probeBetterBibtex(): Promise<BetterBibtex> {
	let response;
	try {
		response = await getText('/better-bibtex/cayw?probe=true');
	} catch {
		return null;
	}
	if (response.status === 404) return 'missing';
	if (response.status !== 200) return null;
	return response.body.trim() === 'starting' ? 'starting' : 'ready';
}

/**
 * A library's path: your own, or a group's.
 *
 * Whole libraries only. Which collections a source reads from is decided
 * from what each item says it is filed in, because Zotero has no request for
 * a collection with its subcollections and answers one for a collection that
 * is gone with the entire library.
 */
function libraryOf(group: number | null): string {
	return libraryPath({ key: '', groupID: group });
}

/**
 * Every collection in a library, for the source picker, for subcollections,
 * and for checking that a source still exists.
 *
 * Paged like the items are. Nobody has a thousand collections, but the loop
 * costs one comparison and the alternative is a library that silently stops at
 * a hundred for the one person who does.
 */
export async function allCollections(group: number | null): Promise<ApiCollection[]> {
	const out: ApiCollection[] = [];
	for (let start = 0; ; start += PAGE) {
		const page = await api<ApiCollection[]>(`${libraryOf(group)}/collections?limit=${PAGE}&start=${start}`);
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
export async function changedSince(since: number, group: number | null): Promise<Changes> {
	const path = `${libraryOf(group)}/items/top`;
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
	 * It moves for changes to anything in the library, collections included,
	 * which is what tells a look that the collection list wants reading again.
	 */
	version: number;
	/** How many top-level items the library holds, deleted ones already gone. */
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
export async function libraryState(group: number | null): Promise<LibraryState> {
	const { headers } = await answered<ApiItem[]>(`${libraryOf(group)}/items/top?limit=1`);
	return { version: headers.version, total: headers.total };
}
