// Pure helpers for finding a Zotero item's extracted text. No Obsidian, no fs:
// the callers in src/source.ts do the I/O.

/** A Zotero item, as written into `zotero-key`: `ABCD1234`, or `ABCD1234g5` in group 5. */
export interface ItemRef {
	key: string;
	groupID: number | null;
}

const KEY = /^[23456789ABCDEFGHIJKLMNPQRSTUVWXYZ]{8}$/;

export function parseItemRef(value: unknown): ItemRef | null {
	if (typeof value !== 'string') return null;
	const match = /^([A-Z0-9]{8})(?:g(\d+))?$/.exec(value.trim());
	if (!match?.[1] || !KEY.test(match[1])) return null;
	return { key: match[1], groupID: match[2] ? Number(match[2]) : null };
}

/** Path prefix of the library in the Zotero API. */
export function libraryPath(ref: ItemRef): string {
	return ref.groupID === null ? 'users/0' : `groups/${ref.groupID}`;
}

/**
 * The link that opens an attachment in Zotero's reader.
 *
 * `open-pdf`, not the `open` some note bodies carry: that one only selects the
 * item in the library, which is what `select` already does. It needs
 * the attachment's own key rather than the parent item's, and it takes `?page=`,
 * which is the hook if a passage ever needs to open where it sits.
 */
export function readerUrl(ref: ItemRef, attachmentKey: string): string {
	const library = ref.groupID === null ? 'library' : `groups/${ref.groupID}`;
	return `zotero://open-pdf/${library}/items/${attachmentKey}`;
}

/**
 * The fields of a Zotero API item that are used here.
 *
 * `citationKey` is written into the item by Better BibTeX and handed over by
 * the local API, so the citation key needs no second request and no Better
 * BibTeX client. It is absent when Better BibTeX is not installed, which is why
 * everything downstream treats it as optional.
 */
export interface ApiItem {
	key: string;
	data: {
		itemType?: string;
		title?: string;
		shortTitle?: string;
		abstractNote?: string;
		date?: string;
		DOI?: string;
		url?: string;
		publicationTitle?: string;
		proceedingsTitle?: string;
		bookTitle?: string;
		publisher?: string;
		university?: string;
		institution?: string;
		repository?: string;
		citationKey?: string;
		creators?: Creator[];
		contentType?: string;
		linkMode?: string;
		filename?: string;
		parentItem?: string;
		dateAdded?: string;
		annotationType?: string;
		annotationText?: string;
		annotationComment?: string;
		annotationColor?: string;
		annotationPageLabel?: string;
		annotationSortIndex?: string;
	};
	meta?: {
		creatorSummary?: string;
		parsedDate?: string;
		numChildren?: number;
	};
}

export interface Creator {
	creatorType?: string;
	firstName?: string;
	lastName?: string;
	/** Institutions come as a single name rather than a split one. */
	name?: string;
}

/** A creator's full name, however Zotero happens to store it. */
export function creatorName(creator: Creator): string {
	if (creator.name) return creator.name;
	return [creator.firstName, creator.lastName].filter(Boolean).join(' ');
}

/** The authors, in order, skipping editors and translators. */
export function authors(item: ApiItem): Creator[] {
	return (item.data.creators ?? []).filter((creator) => creator.creatorType === undefined || creator.creatorType === 'author');
}

/** Authors, in order, as full names. */
export function authorNames(item: ApiItem): string[] {
	return authors(item)
		.map(creatorName)
		.filter((name) => name.length > 0);
}

/**
 * A creator's family name. Zotero puts the whole surname in `lastName`,
 * tussenvoegsels and all, so "van der Haer" arrives intact and must not be
 * split: taking the last word of a joined name turns it into "Haer" and does
 * the same to every compound Dutch, German, Spanish and Portuguese surname.
 */
export function familyName(creator: Creator): string {
	return (creator.lastName ?? creator.name ?? '').trim();
}

/**
 * The year, from `meta.parsedDate` where Zotero has resolved one and from the
 * raw date otherwise. `date` is free text: "2026-08-11", "August 2026" and
 * "in press, 2026" are all things people really have in their libraries.
 */
export function itemYear(item: ApiItem): number | null {
	// Any four-digit year, not just 19xx and 20xx: a thesis citing an 1867
	// source is not an edge case in the humanities.
	const parsed = /\b[0-9]{4}\b/.exec(item.meta?.parsedDate ?? item.data.date ?? '');
	return parsed ? Number(parsed[0]) : null;
}

/**
 * Where a work appeared, whatever Zotero calls that for its type.
 *
 * A journal keeps it in `publicationTitle`, a conference paper in
 * `proceedingsTitle`, a chapter in `bookTitle`, a thesis in `university`, a
 * preprint in `repository`. Reading only the first would leave every item that
 * is not a journal article with no venue at all, and the venue is half of what
 * makes a title worth eight minutes.
 *
 * Ordered most specific first, so a book chapter reads as the book it is in
 * rather than as the publisher who printed it.
 */
const VENUE = ['publicationTitle', 'proceedingsTitle', 'bookTitle', 'repository', 'university', 'institution', 'publisher'] as const;

/**
 * Page descriptions that a browser connector saves as an abstract, and which
 * are not one.
 *
 * Zotero fills `abstractNote` from whatever the page it saved offers, and an
 * indexing site offers a description of its own page. Save a paper from
 * Semantic Scholar and every item comes back with `Semantic Scholar extracted
 * view of "<title>" by <authors>`, which is the title handed back.
 *
 * Only patterns actually seen in the wild belong here. A rule that guessed
 * would eventually throw away a real abstract, which is worse than showing a
 * bad one.
 */
const NOT_AN_ABSTRACT = [/^semantic scholar extracted view of\b/i];

/**
 * The abstract, or null when what Zotero holds is not one.
 *
 * Null rather than the string, because null has somewhere to go: the triage
 * pane falls back to the abstract it can find in the paper's own extracted
 * text. A paper with no abstract is still assessable. A paper with a fake one
 * shows a sentence that answers nothing and looks like it answered.
 */
export function abstractOf(item: ApiItem): string | null {
	const abstract = item.data.abstractNote?.trim();
	if (!abstract) return null;
	return NOT_AN_ABSTRACT.some((pattern) => pattern.test(abstract)) ? null : abstract;
}

export function venueOf(item: ApiItem): string | null {
	for (const field of VENUE) {
		const value = item.data[field]?.trim();
		if (value) return value;
	}
	return null;
}

/**
 * The filename for a paper's note. Better BibTeX's key when there is one,
 * because that single string ties Zotero, the note, `[@cite]` and pandoc
 * together. Without Better BibTeX, something stable and readable: nothing else
 * in the plugin depends on the shape, only on it not changing between runs.
 */
export function noteName(item: ApiItem): string {
	const key = item.data.citationKey?.trim();
	if (key) return key;

	const first = authors(item).map(familyName).find((name) => name.length > 0) ?? 'unknown';
	const year = itemYear(item);
	const slug = (item.data.shortTitle || item.data.title || 'untitled')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.split('-')
		.slice(0, 4)
		.join('-');
	return [first.toLowerCase().replace(/[^a-z0-9]/g, ''), slug, year].filter(Boolean).join('-');
}

/** One Zotero annotation, flattened to what a note needs. */
export interface Highlight {
	key: string;
	/** The selected passage. Empty for a standalone note with no selection. */
	text: string;
	comment: string;
	page: string | null;
	color: string | null;
	/** Zotero's own ordering string. Sorts as text, not as a number. */
	sortIndex: string;
}

/**
 * Annotations, in the order they appear in the document.
 *
 * Zotero sorts by `annotationSortIndex`, a string of space-separated numbers
 * like "00003|001234|00567". Comparing it as text gives document order because
 * every field is zero-padded, which is the whole point of the format.
 */
export function highlights(items: ApiItem[]): Highlight[] {
	return items
		.filter((item) => item.data.itemType === 'annotation')
		.map((item) => ({
			key: item.key,
			text: (item.data.annotationText ?? '').trim(),
			comment: (item.data.annotationComment ?? '').trim(),
			page: item.data.annotationPageLabel?.trim() || null,
			color: item.data.annotationColor?.trim() || null,
			sortIndex: item.data.annotationSortIndex ?? '',
		}))
		.filter((highlight) => highlight.text.length > 0 || highlight.comment.length > 0)
		.sort((a, b) => a.sortIndex.localeCompare(b.sortIndex));
}

const CONTENT_PRIORITY = ['application/pdf', 'application/epub+zip', 'text/html'];

/**
 * Attachment keys from an item's children, most readable first. Linked URLs
 * have no file, so no extracted text.
 */
export function attachmentKeys(children: ApiItem[]): string[] {
	const rank = (item: ApiItem) => {
		const index = CONTENT_PRIORITY.indexOf(item.data.contentType ?? '');
		return index === -1 ? CONTENT_PRIORITY.length : index;
	};
	return children
		.filter((item) => item.data.itemType === 'attachment' && item.data.linkMode !== 'linked_url')
		.sort((a, b) => rank(a) - rank(b))
		.map((item) => item.key);
}
