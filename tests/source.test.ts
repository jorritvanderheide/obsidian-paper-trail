import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings } from '../src/core/settings';

const getJson = vi.fn<(path: string) => Promise<unknown>>();
const getText = vi.fn<(path: string, timeout?: number) => Promise<unknown>>();
vi.mock('../src/http', () => ({
	getJson: (path: string) => getJson(path),
	getText: (path: string, timeout?: number) => getText(path, timeout),
}));

const {
	attachmentAnnotations,
	changedSince,
	itemMetadata,
	lastContact,
	loadFulltext,
	pickCitation,
	recentItems,
	searchItems,
	SourceError,
} = await import('../src/source');

/** Zotero stamps every response with the library version and the size of the set. */
const answer = (json: unknown, over: { version?: number; total?: number } = {}) => ({
	status: 200,
	json,
	headers: { version: over.version ?? 1, total: over.total ?? (Array.isArray(json) ? json.length : 0) },
});

let dataDir: string;

function cache(key: string, text: string) {
	mkdirSync(join(dataDir, 'storage', key), { recursive: true });
	writeFileSync(join(dataDir, 'storage', key, '.zotero-ft-cache'), text);
}

function settings() {
	return loadSettings({ dataDir });
}

const parent = { key: 'PARENT23', groupID: null };

beforeEach(() => {
	dataDir = mkdtempSync(join(tmpdir(), 'zsr-'));
	getJson.mockReset();
	getText.mockReset();
});

afterEach(() => {
	rmSync(dataDir, { recursive: true, force: true });
});

describe('loadFulltext', () => {
	it('reads an attachment linked from the note without asking Zotero', async () => {
		cache('ATTACH23', 'linked text');
		const s = settings();
		const result = await loadFulltext(s, parent, '[pdf](zotero://open/library/items/ATTACH23)');
		expect(result).toEqual({ attachmentKey: 'ATTACH23', text: 'linked text' });
		expect(s.attachments.PARENT23).toBe('ATTACH23');
		expect(getJson).not.toHaveBeenCalled();
	});

	it('asks the local API for attachments, and remembers the answer', async () => {
		cache('PDF23456', 'api text');
		getJson.mockResolvedValue({
			status: 200,
			json: [{ key: 'PDF23456', data: { itemType: 'attachment', contentType: 'application/pdf', linkMode: 'imported_file' } }],
		});
		const s = settings();
		expect(await loadFulltext(s, parent)).toEqual({ attachmentKey: 'PDF23456', text: 'api text' });
		expect(getJson).toHaveBeenCalledWith('/api/users/0/items/PARENT23/children');

		getJson.mockClear();
		await loadFulltext(s, parent);
		expect(getJson).not.toHaveBeenCalled();
	});

	it('uses the group library path for group items', async () => {
		getJson.mockResolvedValue(answer([]));
		await expect(loadFulltext(settings(), { key: 'PARENT23', groupID: 9 })).rejects.toThrow('no file attachment');
		expect(getJson).toHaveBeenCalledWith('/api/groups/9/items/PARENT23/children');
	});

	it('reads a standalone attachment as its own item', async () => {
		cache('PARENT23', 'standalone');
		expect((await loadFulltext(settings(), parent)).text).toBe('standalone');
	});

	it('explains an unreachable Zotero', async () => {
		getJson.mockRejectedValue(new Error('ECONNREFUSED'));
		await expect(loadFulltext(settings(), parent)).rejects.toThrow(/Could not reach Zotero/);
	});

	it('explains a disabled local API', async () => {
		getJson.mockResolvedValue({ status: 403, json: null });
		await expect(loadFulltext(settings(), parent)).rejects.toBeInstanceOf(SourceError);
	});

	it('explains an attachment Zotero has not indexed yet', async () => {
		getJson.mockResolvedValue({
			status: 200,
			json: [{ key: 'PDF23456', data: { itemType: 'attachment', contentType: 'application/pdf' } }],
		});
		await expect(loadFulltext(settings(), parent)).rejects.toThrow(/no extracted text/);
	});
});

describe('attachmentAnnotations', () => {
	it('asks for annotations explicitly, because a bare /children omits them', async () => {
		getJson.mockResolvedValue(answer([]));
		await attachmentAnnotations(parent, 'ATTACH23');

		// Verified against a real highlight: /children returned 0 and this
		// returned 1. Dropping the query drops every annotation, silently.
		expect(getJson).toHaveBeenCalledWith('/api/users/0/items/ATTACH23/children?itemType=annotation');
	});

	it('uses the group library path for a group item', async () => {
		getJson.mockResolvedValue(answer([]));
		await attachmentAnnotations({ key: 'PARENT23', groupID: 9 }, 'ATTACH23');
		expect(getJson).toHaveBeenCalledWith('/api/groups/9/items/ATTACH23/children?itemType=annotation');
	});
});

describe('itemMetadata', () => {
	it('fetches the item itself, where the citation key lives', async () => {
		getJson.mockResolvedValue({ status: 200, json: { key: 'PARENT23', data: {} } });
		await itemMetadata(parent);
		expect(getJson).toHaveBeenCalledWith('/api/users/0/items/PARENT23');
	});
});


describe('browsing the library', () => {
	it('asks for the newest items first, which is what an empty picker shows', async () => {
		getJson.mockResolvedValue(answer([]));
		await recentItems(15);
		const path = getJson.mock.calls[0]?.[0] ?? '';
		expect(path).toContain('sort=dateAdded');
		expect(path).toContain('direction=desc');
		expect(path).toContain('limit=15');
	});

	it('asks only for top-level items, so attachments and annotations never appear', async () => {
		getJson.mockResolvedValue(answer([]));
		await recentItems(15);
		await searchItems('heat pump');
		for (const call of getJson.mock.calls) expect(call[0]).toContain('/items/top');
	});

	it('escapes what was typed, so a query with an ampersand still searches', async () => {
		getJson.mockResolvedValue(answer([]));
		await searchItems('comfort & convenience');
		expect(getJson.mock.calls[0]?.[0]).toContain('q=comfort%20%26%20convenience');
	});

	it('explains an unreachable Zotero rather than throwing a socket error', async () => {
		getJson.mockRejectedValue(new Error('ECONNREFUSED'));
		await expect(recentItems(15)).rejects.toBeInstanceOf(SourceError);
	});
});

/**
 * The escape hatch behind the picker: Better BibTeX's own dialog, for the
 * citations a bare key cannot express.
 */
describe('pickCitation', () => {
	it('returns what the dialog gave back', async () => {
		getText.mockResolvedValue({ status: 200, body: '[@vanderhaerReframingHeatPump2026, p. 45]\n' });
		expect(await pickCitation()).toBe('[@vanderhaerReframingHeatPump2026, p. 45]');
	});

	it('runs without a timeout, because the dialog waits on a person', async () => {
		getText.mockResolvedValue({ status: 200, body: '[@x]' });
		await pickCitation();
		// The five seconds that suit a database read would cancel it under them.
		expect(getText).toHaveBeenCalledWith('/better-bibtex/cayw?format=pandoc&brackets=true', 0);
	});

	it('reads an empty answer as a cancelled dialog, not a failure', async () => {
		getText.mockResolvedValue({ status: 200, body: '  \n' });
		expect(await pickCitation()).toBeNull();
	});

	it('says what is missing when Better BibTeX is not there', async () => {
		getText.mockResolvedValue({ status: 404, body: 'No endpoint found' });
		await expect(pickCitation()).rejects.toThrow(/Better BibTeX/);
	});

	it('explains an unreachable Zotero rather than throwing a socket error', async () => {
		getText.mockRejectedValue(new Error('ECONNREFUSED'));
		await expect(pickCitation()).rejects.toBeInstanceOf(SourceError);
	});
});

/**
 * Whether Zotero answered, recorded as a by-product of work already happening
 * rather than polled. The queue reads this to explain a plugin that has
 * apparently stopped doing anything.
 */
describe('lastContact', () => {
	it('records that Zotero is there when it answers', async () => {
		getJson.mockResolvedValue(answer({}));
		await itemMetadata({ key: 'ABCD2345', groupID: null });
		expect(lastContact()).toEqual({ reachable: true });
	});

	it('records that it is not when the socket refuses', async () => {
		getJson.mockRejectedValue(new Error('ECONNREFUSED'));
		await expect(itemMetadata({ key: 'ABCD2345', groupID: null })).rejects.toBeInstanceOf(SourceError);
		expect(lastContact()).toMatchObject({ reachable: false });
	});

	it('says which setting to turn on when Zotero refuses the request', async () => {
		getJson.mockResolvedValue({ status: 403, json: null, headers: { version: 0, total: 0 } });
		await expect(itemMetadata({ key: 'ABCD2345', groupID: null })).rejects.toThrow(/Allow other applications/);
		const contact = lastContact();
		expect(contact).toMatchObject({ reachable: false });
	});

	it('counts a 404 as reachable, because only the item is unknown', async () => {
		getJson.mockResolvedValue({ status: 404, json: null });
		await expect(itemMetadata({ key: 'ABCD2345', groupID: null })).rejects.toThrow(/does not know/);
		expect(lastContact()).toEqual({ reachable: true });
	});

	it('is updated by ordinary work, not only by asking on purpose', async () => {
		getJson.mockRejectedValue(new Error('ECONNREFUSED'));
		await expect(itemMetadata({ key: 'ABCD2345', groupID: null })).rejects.toBeInstanceOf(SourceError);
		expect(lastContact()).toMatchObject({ reachable: false });

		getJson.mockResolvedValue(answer({}));
		await itemMetadata({ key: 'ABCD2345', groupID: null });
		expect(lastContact()).toEqual({ reachable: true });
	});
});

/**
 * Asking Zotero only what has changed. One request that usually answers with
 * nothing, which is what makes it cheap enough to ask on every window focus.
 */
describe('changedSince', () => {
	const item = (key: string) => ({ key, data: { itemType: 'journalArticle', title: key } });

	it('asks from the version it was given', async () => {
		getJson.mockResolvedValue(answer([]));
		await changedSince(79);
		expect(getJson.mock.calls[0]?.[0]).toContain('since=79');
	});

	it('hands back the version to ask with next time', async () => {
		getJson.mockResolvedValue(answer([], { version: 80 }));
		expect((await changedSince(79)).version).toBe(80);
	});

	it('answers with nothing when nothing has changed, which is the usual case', async () => {
		getJson.mockResolvedValue(answer([], { version: 79, total: 6 }));
		const changes = await changedSince(79);
		expect(changes.items).toEqual([]);
		expect(changes.total).toBe(6);
	});

	it('reads the whole library when asked from nothing', async () => {
		getJson.mockResolvedValue(answer([item('AAAA1111'), item('BBBB2222')]));
		expect((await changedSince(0)).items).toHaveLength(2);
		expect(getJson.mock.calls[0]?.[0]).toContain('since=0');
	});

	it('asks only top-level items, so attachments never reach the queue', async () => {
		getJson.mockResolvedValue(answer([]));
		await changedSince(0);
		expect(getJson.mock.calls[0]?.[0]).toContain('/items/top');
	});

	it('pages when a full page comes back, because one is not always enough', async () => {
		const full = Array.from({ length: 100 }, (_, n) => item(`K${n}`));
		getJson.mockResolvedValueOnce(answer(full)).mockResolvedValueOnce(answer([item('LAST')]));
		expect((await changedSince(0)).items).toHaveLength(101);
		expect(getJson.mock.calls[1]?.[0]).toContain('start=100');
	});

	it('stops after one page when that page was short', async () => {
		getJson.mockResolvedValue(answer([item('AAAA1111')]));
		await changedSince(0);
		expect(getJson).toHaveBeenCalledTimes(1);
	});

	it('reports an unreachable Zotero rather than an empty library', async () => {
		getJson.mockRejectedValue(new Error('ECONNREFUSED'));
		await expect(changedSince(0)).rejects.toBeInstanceOf(SourceError);
	});
});
