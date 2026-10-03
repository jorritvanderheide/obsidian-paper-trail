// Reading a Zotero item: what it is, who wrote it, where it appeared, and how
// to link back to it. No Obsidian, no fs: the callers in src/source.ts do the
// I/O and hand over what Zotero said.

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
 * The reader at one annotation: Zotero turns to its page and selects it.
 *
 * `annotation` is read by Zotero's own `open-pdf` handler, next to `page`.
 * The link needs the attachment the annotation was made on, which a note does
 * not record, so whoever builds it asks Zotero first.
 */
export function annotationUrl(ref: ItemRef, attachmentKey: string, annotationKey: string): string {
	return `${readerUrl(ref, attachmentKey)}?annotation=${annotationKey}`;
}

/**
 * The fields of a Zotero API item that are read here, and only those.
 *
 * Zotero sends a great deal more. Declaring a field nothing reads makes the
 * type a worse copy of Zotero's documentation than Zotero's documentation, and
 * gives the next person a list of things to wonder whether they can rely on.
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
		dateAdded?: string;
		annotationType?: string;
		annotationText?: string;
		annotationComment?: string;
		annotationPageLabel?: string;
		annotationSortIndex?: string;
		annotationPosition?: string;
		annotationColor?: string;
		/** On an annotation, the attachment it was made on. */
		parentItem?: string;
	};
	meta?: {
		parsedDate?: string;
	};
}

/**
 * Item types that are never a paper, whatever else they are.
 *
 * Two places subtract them and neither may do it differently: the pending
 * list, which is what Zotero holds minus what the vault has, and the picker,
 * which searches the library directly. A search returns notes and annotations
 * along with everything else, and an attachment is a file rather than a work.
 */
const NOT_A_PAPER = new Set(['attachment', 'annotation', 'note']);

export function isPaperItem(item: ApiItem): boolean {
	return !NOT_A_PAPER.has(item.data.itemType ?? '');
}

export interface Creator {
	creatorType?: string;
	firstName?: string;
	lastName?: string;
	/** Institutions come as a single name rather than a split one. */
	name?: string;
}

/** A creator's full name, however Zotero happens to store it. */
function creatorName(creator: Creator): string {
	if (creator.name) return creator.name;
	return [creator.firstName, creator.lastName].filter(Boolean).join(' ');
}

/** The authors, in order, skipping editors and translators. */
function authors(item: ApiItem): Creator[] {
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
 * tussenvoegsels and all, so "van der Lind" arrives intact and must not be
 * split: taking the last word of a joined name turns it into "Lind" and does
 * the same to every compound Dutch, German, Spanish and Portuguese surname.
 */
function familyName(creator: Creator): string {
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
 * Null rather than the string, because the two read differently in the dialog:
 * "Zotero has no abstract for this item" is a fact about the record you can
 * act on, and a paper with no abstract is still assessable from its title and
 * venue. A fake one is a sentence that answers nothing and looks like it
 * answered.
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

/**
 * One source as Better BibTeX's cite-as-you-write dialog hands it back with
 * `format=json`, and only the fields read here.
 *
 * `label` is a CSL locator type, `page` or `chapter`, and Better BibTeX fills
 * in `page` when a locator was typed without one. A Zotero note picked in the
 * dialog comes back too, with no citation key. `uri` is Zotero's for the
 * item, which is how its note is found.
 */
export interface CitedSource {
	citationKey?: string;
	locator?: string;
	label?: string;
	prefix?: string;
	suffix?: string;
	/** The author is named in the sentence, so the citation leaves them out. */
	suppressAuthor?: boolean;
	uri?: string;
}

/**
 * The item a Zotero URI names, as `zotero-key` stores it:
 * `http://zotero.org/users/local/abc/items/ABCD1234` is ABCD1234, and
 * `http://zotero.org/groups/5/items/ABCD1234` is ABCD1234 in group 5.
 */
export function itemRefOfUri(uri: string): ItemRef | null {
	const match = /\/(?:groups\/(\d+)|users\/(?:local\/)?[^/]+)\/items\/([A-Z0-9]{8})$/.exec(uri.trim());
	if (!match?.[2] || !KEY.test(match[2])) return null;
	return { key: match[2], groupID: match[1] ? Number(match[1]) : null };
}

/** Better BibTeX's abbreviations, so a locator reads as its pandoc citation did. */
export const LOCATOR_LABELS: Record<string, string> = {
	article: 'art.',
	chapter: 'ch.',
	subchapter: 'subch.',
	column: 'col.',
	figure: 'fig.',
	line: 'l.',
	note: 'n.',
	issue: 'no.',
	opus: 'op.',
	page: 'p.',
	paragraph: 'para.',
	subparagraph: 'subpara.',
	part: 'pt.',
	rule: 'r.',
	section: 'sec.',
	subsection: 'subsec.',
	'sub-verbo': 'sv.',
	schedule: 'sch.',
	title: 'tit.',
	verse: 'vrs.',
	volume: 'vol.',
};

/**
 * Every term that starts a locator: all of Better BibTeX's abbreviations, the
 * plurals, and the full words someone might type. Due Credit's pandoc filter
 * reads a locator by the same words and keeps its own copy of this list, since
 * it is Lua and cannot import this one. A change to either is a change to both:
 * a term only this side knows is a page the export drops.
 */
export const LOCATOR_TERMS = new Set(
	`p. pp. page pages
	ch. chap. chapter subch. subchapter
	sec. section subsec. subsection
	para. paragraph subpara. subparagraph
	fig. figure col. column l. ll. line
	n. note vol. volume no. issue
	art. article op. opus pt. part r. rule
	vrs. verse sv. sch. schedule tit. title
	book folio`.split(/\s+/),
);

/** Whether the text reads as a locator: a number, `§`, or a locator term first. */
function isLocator(text: string): boolean {
	const ref = text.trim();
	if (/^\d/.test(ref) || ref.startsWith('§')) return true;
	const term = /^\p{L}+\.?/u.exec(ref)?.[0];
	return term !== undefined && LOCATOR_TERMS.has(term.toLowerCase());
}

/**
 * A citation as a link to the paper, rather than as pandoc syntax.
 *
 * `[@key]` is inert in Obsidian: the right thing to hand a bibliography
 * processor and nothing at all to the vault. A wikilink is both. It resolves,
 * because a paper is named for its citation key; it opens the paper; it shows
 * the paper on hover, status and all; and every place you cited something
 * turns up in that paper's backlinks, which is the question a thesis actually
 * asks of its own corpus.
 *
 * The target is the paper's note when there is one, by its name, which is the
 * citation key unless Better BibTeX changed the key after the note was named.
 * Linking to the name is what makes it resolve either way; Due Credit, which
 * exports, points a link to a paper note at its key. Without a note the target
 * is the key, which exports but does not resolve until the paper has a note.
 *
 * Everything else goes in the label, around the name, the way pandoc writes it
 * around the key: `[[a|see a, p. 4, emphasis added]]` is
 * `[see @a, p. 4, emphasis added]`, and a `-` against the name leaves the
 * author out, as it does before `@a`: `[[a|-a, p. 4]]` is `[-@a, p. 4]`.
 * That is the form the filter reads. Not a page after `#`: Obsidian takes
 * `[[a#p. 4]]` for a heading, and hovering it says the section is not in the
 * note instead of showing the paper.
 *
 * `noteOf` names a source's note, or says it has none.
 */
export function citation(sources: CitedSource[], noteOf: (source: CitedSource) => string | null = () => null): string {
	return sources
		.flatMap((source) => {
			const key = source.citationKey?.trim();
			if (!key) return [];
			const locator = source.locator?.trim();
			const label = source.label ? (LOCATOR_LABELS[source.label] ?? source.label) : '';
			const at = locator ? [label, locator].filter(Boolean).join(' ') : '';
			return [citationLink(noteOf(source) ?? key, at, source.prefix, source.suffix, source.suppressAuthor === true)];
		})
		.join('; ');
}

/**
 * One link: `[[a]]` when there is nothing to say around the name, and
 * otherwise `[[a|prefix a, locator suffix]]`, with `-a` when the author is
 * left out. A suffix that starts with punctuation, ", emphasis added", closes
 * up to what comes before it.
 */
function citationLink(target: string, at: string, prefix = '', suffix = '', withoutAuthor = false): string {
	const before = prefix.trim();
	const after = suffix.trim();
	if (!at && !before && !after && !withoutAuthor) return `[[${target}]]`;
	let label = [before, withoutAuthor ? `-${target}` : target].filter(Boolean).join(' ');
	if (at) label += `, ${at}`;
	if (after) label += /^[,.;:)]/.test(after) ? after : ` ${after}`;
	return `[[${target}|${label}]]`;
}

/**
 * What someone typed for a page, as a locator. A bare number is a page, "4"
 * or "12-14", because that is nearly always what it is; anything else, "ch. 3"
 * or "§ 2", is already a locator and stays as typed.
 */
export function typedLocator(typed: string): string {
	const text = typed.trim();
	return /^\d/.test(text) ? `p. ${text}` : text;
}

/** A citation to one paper, by its note's name or its key, with the page someone typed. */
export function pageCitation(target: string, typed: string): string {
	return citationLink(target, typedLocator(typed));
}

/**
 * A passage quoted, with the citation that says where it is from.
 *
 * The page is a page label from Zotero, so it is always a page: "iv" gets its
 * "p." as much as "7" does, where `pageCitation` would leave a typed "iv" as
 * a locator of its own that the export does not know.
 *
 * Written as its own paragraph, with blank lines between it and whatever the
 * cursor was in the middle of, because a quote that starts halfway along a line
 * of prose is not a quote.
 */
export function quotation(text: string, target: string, page: string | null, before: string, after: string): string {
	const cited = page ? pageCitation(target, `p. ${page}`) : `[[${target}]]`;
	const quote = `> ${text} ${cited}`;
	return (before.trim() ? '\n\n' : '') + quote + (after.trim() ? '\n\n' : '');
}

/** A wikilink in a line of text, and where it sits. */
export interface LinkSpan {
	from: number;
	to: number;
	target: string;
	label: string | null;
}

/**
 * The wikilink the cursor is on, or has just finished typing.
 *
 * Just after `]]` counts, because that is where the cursor is when Obsidian's
 * own `[[` suggester has written the link, and moving back into it first is
 * the step this is here to save. An embed is not a citation, so `![[` is left.
 */
export function linkAt(line: string, ch: number): LinkSpan | null {
	for (const match of line.matchAll(/(!?)\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/g)) {
		const from = match.index;
		const to = from + match[0].length;
		if (ch < from || ch > to) continue;
		if (match[1] || match[2] === undefined) return null;
		return { from, to, target: match[2], label: match[3] ?? null };
	}
	return null;
}

/** The name a link cites by: its target without a folder or a heading. */
export function linkName(link: LinkSpan): string {
	const target = link.target.replace(/#.*$/, '').trim();
	return target.split('/').pop() ?? target;
}

/**
 * Where a label repeats the name as a word, the way the filter's `spelled`
 * finds it: the index just past it, or -1. A `-` against the name, which
 * leaves the author out, still counts as the name standing alone.
 */
function pastName(label: string, name: string): number {
	for (let at = label.indexOf(name); at !== -1; at = label.indexOf(name, at + 1)) {
		const end = at + name.length;
		const start = label[at - 1] === '-' ? at - 1 : at;
		const before = start === 0 || /\s/.test(label[start - 1] ?? '');
		const after = end === label.length || /[\s,;]/.test(label[end] ?? '');
		if (before && after) return end;
	}
	return -1;
}

/**
 * The link rewritten to cite a page, read the way the filter reads it.
 *
 * A label that repeats the name keeps everything around it and has its page
 * replaced: `[[a|see a, p. 3, emphasis added]]` becomes `see a, p. 4, emphasis
 * added`. Any other label is yours, so it stays and the page goes after a
 * comma, which the filter reads too: `[[a|Marsh]]` becomes `Marsh, p. 4`, and
 * a page it had is replaced. Without a label the name is it. A heading after
 * `#` goes, because a citation with a page is not a link to a section.
 */
export function withPage(link: LinkSpan, typed: string): string {
	const target = link.target.replace(/#.*$/, '').trim();
	const name = linkName(link);
	const label = link.label ?? name;
	const at = typedLocator(typed);

	const end = pastName(label, name);
	if (end !== -1) {
		// A page already after the name goes, with any bare numbers that continue
		// it, "pp. 4, 6"; what follows that is the suffix, and stays.
		const rest = label.slice(end).replace(/^,\s*([^,]*)((?:,\s*\d[^,]*)*)/, (whole: string, first: string) => (isLocator(first) ? '' : whole));
		return `[[${target}|${label.slice(0, end)}, ${at}${rest}]]`;
	}

	const comma = label.indexOf(',');
	const own = comma !== -1 && isLocator(label.slice(comma + 1)) ? label.slice(0, comma) : label;
	return `[[${target}|${own.trim()}, ${at}]]`;
}

/**
 * One Zotero annotation, flattened to what a note needs.
 *
 * Highlights, underlines and notes alike, which is why it is not called a
 * highlight: a note stuck to a page has no highlighted passage at all, and
 * Zotero calls every one of them an annotation.
 */
export interface Annotation {
	key: string;
	/** The selected passage. Empty for a standalone note with no selection. */
	text: string;
	comment: string;
	page: string | null;
	/** Zotero's own ordering string. Sorts as text, not as a number. */
	sortIndex: string;
	/** The name of its colour in Zotero's palette, or null for any other colour. */
	color: AnnotationColor | null;
}

/**
 * The eight colours Zotero's reader offers, by the names it gives them.
 *
 * Kept by hand, like `LOCATOR_TERMS`, and the same list is in `styles.css`:
 * a colour added here and not there is drawn as a plain quote callout.
 */
export const ANNOTATION_COLORS = {
	'#ffd400': 'yellow',
	'#ff6666': 'red',
	'#5fb236': 'green',
	'#2ea8e5': 'blue',
	'#a28ae5': 'purple',
	'#e56eee': 'magenta',
	'#f19837': 'orange',
	'#aaaaaa': 'gray',
} as const;

export type AnnotationColor = (typeof ANNOTATION_COLORS)[keyof typeof ANNOTATION_COLORS];

const COLOR_NAMES = new Map<string, AnnotationColor>(Object.entries(ANNOTATION_COLORS));

/**
 * A colour's name, or null when it is not one of Zotero's.
 *
 * Only the reader's own colours have a name. Annotations that came inside the
 * PDF keep whatever colour the program that made them used, `#facd5a` on one
 * paper, and guessing the nearest of the eight would show a colour you never
 * picked.
 */
export function colorName(hex: string | undefined): AnnotationColor | null {
	return COLOR_NAMES.get((hex ?? '').trim().toLowerCase()) ?? null;
}

/**
 * A selected passage as the one line it is.
 *
 * Zotero extracts the selection from the PDF as laid out, so a passage that
 * crosses a column or a page arrives with a line break, often a blank line,
 * wherever it crossed: one sentence came through as "authenticity of written",
 * an empty line, and "information uses a handwritten signature". Nothing in
 * the text tells a column break from a paragraph break, and a highlight is a
 * sentence or two far more often than it spans paragraphs, so every run of
 * whitespace becomes one space.
 *
 * Except after a hyphen joined to a word, which closes up instead: a word
 * hyphenated at the break reads "well-known" rather than "well- known". It
 * keeps the hyphen, because a real compound needs it and a split word is still
 * readable with it.
 */
export function passage(text: string): string {
	return text.replace(/(\p{L})-[ \t]*\r?\n\s*/gu, '$1-').replace(/\s+/g, ' ').trim();
}

/**
 * Annotations, in the order they appear in the document.
 *
 * Zotero sorts by `annotationSortIndex`, a string of pipe-separated numbers
 * like "00003|001234|00567". Comparing it as text gives document order because
 * every field is zero-padded, which is the whole point of the format. Except
 * where Zotero could not work it out: see `inReadingOrder`.
 *
 * `underlines` off leaves out underlines with no comment, for whoever
 * underlines terms to find their way back and highlights the passages worth
 * keeping. One with a comment still comes through, because you wrote something
 * about it.
 */
export function annotations(items: ApiItem[], underlines: boolean): Annotation[] {
	const kept = items
		.filter((item) => item.data.itemType === 'annotation')
		.filter((item) => underlines || item.data.annotationType !== 'underline' || (item.data.annotationComment ?? '').trim().length > 0)
		.map((item) => ({
			annotation: {
				key: item.key,
				text: passage(item.data.annotationText ?? ''),
				comment: (item.data.annotationComment ?? '').trim(),
				page: item.data.annotationPageLabel?.trim() || null,
				sortIndex: item.data.annotationSortIndex ?? '',
				color: colorName(item.data.annotationColor),
			},
			box: pdfBox(item.data.annotationPosition),
		}))
		.filter(({ annotation }) => annotation.text.length > 0 || annotation.comment.length > 0);
	return inReadingOrder(kept).map(({ annotation }) => annotation);
}

/** Left, bottom, right, top, in PDF points with y counting up from the bottom of the page. */
type Box = [number, number, number, number];

interface Placed {
	annotation: Annotation;
	box: Box | null;
}

/**
 * The rectangle around a PDF annotation, from the position Zotero stores as a
 * JSON string. Null for anything else: an EPUB or snapshot position has no
 * rectangles, and neither does a drawing.
 */
export function pdfBox(position: string | undefined): Box | null {
	let rects: unknown;
	try {
		rects = (JSON.parse(position ?? '') as { rects?: unknown }).rects;
	} catch {
		return null;
	}
	if (!Array.isArray(rects)) return null;
	const valid = rects.filter((rect): rect is Box => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite));
	if (valid.length === 0) return null;
	return [
		Math.min(...valid.map((rect) => rect[0])),
		Math.min(...valid.map((rect) => rect[1])),
		Math.max(...valid.map((rect) => rect[2])),
		Math.max(...valid.map((rect) => rect[3])),
	];
}

/**
 * A sort index with the page and nothing else: offset and top both zero.
 *
 * Zotero writes one when it makes an annotation on a page whose text it has not
 * loaded, which Reading Mode in Zotero 10 does: two highlights at the foot of a
 * page came through as "00002|000000|00000" and sorted above everything else on
 * it, in Zotero's sidebar as much as here.
 */
function unplaced(sortIndex: string): boolean {
	return /^\d{5}\|0{6}\|0{5}$/.test(sortIndex);
}

/**
 * Sort by `sortIndex`, then put each annotation whose index says only the page
 * where its rectangle is on that page.
 *
 * It goes after the last annotation on the page that starts above it in the
 * same column, which is what overlapping horizontally stands in for, or before
 * the first one below it in that column when none is above. Comparing heights
 * alone would get a two-column page wrong: the top of the right column is
 * higher than the foot of the left, and comes after it.
 */
function inReadingOrder(list: Placed[]): Placed[] {
	const bySortIndex = (a: Placed, b: Placed) => a.annotation.sortIndex.localeCompare(b.annotation.sortIndex);
	const order = list.filter((entry) => !(entry.box && unplaced(entry.annotation.sortIndex))).sort(bySortIndex);
	const late = list
		.filter((entry) => entry.box && unplaced(entry.annotation.sortIndex))
		.sort((a, b) => bySortIndex(a, b) || (b.box?.[3] ?? 0) - (a.box?.[3] ?? 0));

	for (const entry of late) {
		const box = entry.box as Box;
		const page = entry.annotation.sortIndex.slice(0, 5);
		const onPage = order.flatMap((other, index) => (other.annotation.sortIndex.startsWith(page) ? [index] : []));
		const column = onPage.filter((index) => {
			const other = order[index]?.box;
			return other !== null && other !== undefined && other[0] < box[2] && box[0] < other[2];
		});
		const above = column.filter((index) => (order[index]?.box?.[3] ?? 0) >= box[3]);

		// With nothing in its column, height on the page is all there is to go on.
		const lower = onPage.find((index) => (order[index]?.box?.[3] ?? 0) < box[3]);
		const next = order.findIndex((other) => bySortIndex(other, entry) > 0);

		let at: number;
		if (above.length > 0) at = (above.at(-1) ?? 0) + 1;
		else if (column.length > 0) at = column[0] ?? 0;
		else if (lower !== undefined) at = lower;
		else if (onPage.length > 0) at = (onPage.at(-1) ?? 0) + 1;
		else at = next === -1 ? order.length : next;
		order.splice(at, 0, entry);
	}
	return order;
}

const CONTENT_PRIORITY = ['application/pdf', 'application/epub+zip', 'text/html'];

/**
 * Attachment keys from an item's children, most readable first. Linked URLs
 * are a bookmark rather than a file, so there is nothing to open in the reader
 * and nothing to carry annotations.
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
