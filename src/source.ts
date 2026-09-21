// Finds a Zotero item's extracted text. The text itself always comes from
// disk: Zotero caches it beside each attachment as storage/<key>/.zotero-ft-cache.
// The only question is which attachment, since a literature note names the
// parent item. That is answered, cheapest first, by the attachment this item
// was read from before, by attachment links in the note, and finally by
// Zotero's local API.
import { readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
	attachmentKeys,
	dataDirFromPrefs,
	formatItemRef,
	highlights,
	libraryPath,
	linkedKeys,
	type ApiItem,
	type Highlight,
	type ItemRef,
} from './core/zotero';
import { getJson, getText, type Headers } from './http';
import type { Settings } from './core/settings';

/** A failure to show the user as is. */
export class SourceError extends Error {}

export interface Fulltext {
	attachmentKey: string;
	text: string;
}

function profileDirs(): string[] {
	const home = homedir();
	switch (process.platform) {
		case 'darwin':
			return [join(home, 'Library', 'Application Support', 'Zotero', 'Profiles')];
		case 'win32':
			return [join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Zotero', 'Zotero', 'Profiles')];
		default:
			return [join(home, '.zotero', 'zotero')];
	}
}

/** Zotero records its own data directory, which need not be ~/Zotero. */
export function zoteroDataDir(override: string): string {
	if (override.trim()) return override.trim();
	for (const profiles of profileDirs()) {
		let names: string[];
		try {
			names = readdirSync(profiles);
		} catch {
			continue;
		}
		for (const name of names) {
			try {
				const dir = dataDirFromPrefs(readFileSync(join(profiles, name, 'prefs.js'), 'utf8'));
				if (dir) return dir;
			} catch {
				// Not a profile folder.
			}
		}
	}
	return join(homedir(), 'Zotero');
}

function readCache(dataDir: string, attachmentKey: string): string | null {
	try {
		return readFileSync(join(dataDir, 'storage', attachmentKey, '.zotero-ft-cache'), 'utf8');
	} catch {
		return null;
	}
}

const API_SETTING = '"Allow other applications on this computer to communicate with Zotero" in Zotero\'s Settings > Advanced';

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

async function api<T>(port: number, path: string): Promise<T> {
	return (await answered<T>(port, path)).body;
}

/** The same request, when the caller needs what Zotero said in its headers too. */
async function answered<T>(port: number, path: string): Promise<{ body: T; headers: Headers }> {
	let response;
	try {
		response = await getJson(port, `/api/${path}`);
	} catch (error) {
		console.error('paper-trail: local API request failed', error);
		const reason = `Could not reach Zotero. Is it running, with ${API_SETTING} on?`;
		contact = { reachable: false, reason };
		throw new SourceError(reason);
	}

	if (response.status === 403) {
		const reason = `Zotero refused the request. Turn on ${API_SETTING}.`;
		contact = { reachable: false, reason };
		throw new SourceError(reason);
	}

	// Anything else means Zotero is there and talking, including a 404, which
	// says only that one item is unknown to it.
	contact = { reachable: true };

	if (response.status === 404) throw new SourceError('Zotero does not know this item.');
	if (response.status >= 400) throw new SourceError(`Zotero answered with HTTP ${response.status}.`);
	return { body: response.json as T, headers: response.headers };
}

export function searchItems(port: number, query: string): Promise<ApiItem[]> {
	return api<ApiItem[]>(port, `users/0/items/top?q=${encodeURIComponent(query)}&limit=25`);
}

/**
 * The most recently added items, newest first.
 *
 * For a picker with nothing typed in it. Almost every paper you want a note for
 * is one you saved from the browser a few minutes ago, so an empty box is worth
 * more as a list of those than as an instruction to start typing the title of
 * something you are already looking at.
 */
export function recentItems(port: number, limit: number): Promise<ApiItem[]> {
	return api<ApiItem[]>(port, `users/0/items/top?sort=dateAdded&direction=desc&limit=${limit}`);
}

/** Zotero's maximum, and the fewest requests a library can be read in. */
const PAGE = 100;

/**
 * The extracted text of an item. `body` is the literature note's text, if the
 * item came from one. Remembers which attachment worked in `settings`; the
 * caller persists it.
 */
export async function loadFulltext(settings: Settings, ref: ItemRef, body = ''): Promise<Fulltext> {
	const dataDir = zoteroDataDir(settings.dataDir);
	const id = formatItemRef(ref);

	const tryKeys = (keys: (string | undefined)[]): Fulltext | null => {
		for (const key of keys) {
			const text = key ? readCache(dataDir, key) : null;
			if (key && text !== null) {
				settings.attachments[id] = key;
				return { attachmentKey: key, text };
			}
		}
		return null;
	};

	// The item itself is a candidate too: a standalone PDF is its own attachment.
	const local = tryKeys([settings.attachments[id], ...linkedKeys(body, ref.key), ref.key]);
	if (local) return local;

	const keys = attachmentKeys(await api<ApiItem[]>(settings.apiPort, `${libraryPath(ref)}/items/${ref.key}/children`));
	if (keys.length === 0) throw new SourceError('This item has no file attachment in Zotero.');

	const found = tryKeys(keys);
	if (found) return found;
	throw new SourceError(
		`Zotero has no extracted text for this item in ${join(dataDir, 'storage')}. ` +
			'It indexes attachments in the background: open the file in Zotero once, or check Settings > Search.',
	);
}

/** A paper's metadata, for building or refreshing its note. */
export function itemMetadata(port: number, ref: ItemRef): Promise<ApiItem> {
	return api<ApiItem>(port, `${libraryPath(ref)}/items/${ref.key}`);
}

/**
 * The annotations on an attachment.
 *
 * `?itemType=annotation` is not optional. On the local API a bare `/children`
 * returns an empty list for an attachment that has highlights, which the web
 * API does not do, so code written from its documentation fails silently.
 */
export async function attachmentAnnotations(port: number, ref: ItemRef, attachmentKey: string): Promise<Highlight[]> {
	const children = await api<ApiItem[]>(port, `${libraryPath(ref)}/items/${attachmentKey}/children?itemType=annotation`);
	return highlights(children);
}

/** An item's children: its attachments, and its notes. */
export function itemChildren(port: number, ref: ItemRef): Promise<ApiItem[]> {
	return api<ApiItem[]>(port, `${libraryPath(ref)}/items/${ref.key}/children`);
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
export async function pickCitation(port: number): Promise<string | null> {
	let response;
	try {
		response = await getText(port, '/better-bibtex/cayw?format=pandoc&brackets=true', 0);
	} catch (error) {
		console.error('paper-trail: cite-as-you-write request failed', error);
		throw new SourceError(BBT_MISSING);
	}
	if (response.status === 404) throw new SourceError(BBT_MISSING);
	if (response.status >= 400) throw new SourceError(`Better BibTeX answered with HTTP ${response.status}.`);

	// Cancelling the dialog is an empty body, not an error.
	return response.body.trim() || null;
}


/** What Zotero has changed since a version, and what to ask about next time. */
export interface Changes {
	items: ApiItem[];
	/** The library version this answer reflects. Ask with this next. */
	version: number;
	/** How many top-level items the library holds now, deleted ones already gone. */
	total: number;
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
 * item that is gone simply stops being mentioned. `total` is the way round
 * that, because a count that disagrees with what the caller is holding means
 * something went, even though it does not say what.
 */
export async function changedSince(port: number, since: number): Promise<Changes> {
	const { body, headers } = await answered<ApiItem[]>(port, `users/0/items/top?since=${since}&limit=${PAGE}`);

	// A full read can exceed one page. An update almost never will, but a week
	// away from a busy library is exactly when it would.
	const items = [...body];
	for (let start = PAGE; items.length >= start; start += PAGE) {
		const page = await api<ApiItem[]>(port, `users/0/items/top?since=${since}&limit=${PAGE}&start=${start}`);
		items.push(...page);
		if (page.length < PAGE) break;
	}

	return { items, version: headers.version, total: headers.total };
}
