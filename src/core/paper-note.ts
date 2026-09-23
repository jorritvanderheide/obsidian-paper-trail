// The shape of a literature note: what the plugin owns in it, and what it must
// never touch.
//
// The ownership model is the whole safety story here. A sync may rewrite the
// frontmatter keys listed below and the region between the markers. Everything
// else in the file belongs to whoever wrote it, and losing a word of that is
// the one unforgivable failure for a plugin like this.
import { applyStatusTag, NO_STATUS_TAGS, type Reading, type StatusTags } from './triage';
import { authorNames, itemYear, readerUrl, type ApiItem, type Annotation, type ItemRef } from './zotero';
import { sortKeys } from './frontmatter';

/**
 * Wraps the only part of the body a sync is allowed to replace.
 *
 * An HTML comment rather than Obsidian's `%%`. Both are invisible in a
 * rendered note, but only `html` is a section type Obsidian documents;
 * `comment` appears nowhere in its API, so the metadata cache calls a `%%` line
 * prose. Nothing reads the prose any more, but a delimiter the editor is
 * documented to understand is still the one to have.
 */
export const REGION_START = '<!--paper-trail-->';
export const REGION_END = '<!--/paper-trail-->';

/** Whether a line opens the managed region. */
export function isRegionStart(line: string): boolean {
	return line.includes(REGION_START);
}

/**
 * Frontmatter keys the plugin writes. Every other key in the file is the
 * user's, including everything you answered: `reading`, `reading-progress`,
 * `reading-date`, `triaged-date` and `reading-reason` are answers a person
 * gave, and a refresh from Zotero has no business resetting them.
 */
export const MANAGED_KEYS = ['title', 'aliases', 'authors', 'year', 'citekey', 'zotero'] as const;

export interface PaperFrontmatter {
	title: string;
	aliases: string[];
	authors: string;
	year: number | null;
	citekey: string | null;
	zotero: string;
	/** Written under whichever property name identifies a paper in this vault. */
	itemKey: string;
}

/**
 * Whether a note is a paper, which is the one test everything agrees on: it
 * names a Zotero item. Not its folder, not its tags, not its template.
 *
 * Written down once because six places ask it, and a seventh that asked it
 * slightly differently would be a note the workflow could see but the pane
 * could not, or the other way round.
 */
export function isPaper(
	frontmatter: Record<string, unknown> | undefined,
	keyField: string,
	// A predicate rather than a plain boolean: a note that is a paper has
	// frontmatter by definition, and saying so keeps every caller from having to
	// re-check it on the next line.
): frontmatter is Record<string, unknown> {
	return typeof frontmatter?.[keyField] === 'string';
}

/** The select link, which shows the item in Zotero's library. */
export function selectUrl(ref: ItemRef): string {
	const library = ref.groupID === null ? 'library' : `groups/${ref.groupID}`;
	return `zotero://select/${library}/items/${ref.key}`;
}

/**
 * `basename` is what the note is actually called, which is not always what a
 * note for this item would be called today. It decides one thing: whether the
 * citation key is worth aliasing.
 */
export function paperFrontmatter(item: ApiItem, ref: ItemRef, basename: string): PaperFrontmatter {
	const full = item.data.title ?? item.key;
	const short = item.data.shortTitle?.trim();
	const key = item.data.citationKey?.trim();

	return {
		title: short || full,
		// One way to reach a paper: its citation key, which is its filename.
		//
		// The full title used to be aliased here, so that a paper stayed findable
		// by the words on its cover. It only appeared when Zotero's short title
		// differed from its long one, which is a field nobody sets deliberately,
		// so it split the library in two arbitrary halves: the papers you could
		// find by title were exactly the ones whose link came out a hundred
		// characters long, and the ones that inserted cleanly could not be found
		// that way at all.
		//
		// Removing it makes typing `[[` and running Insert citation produce the
		// same text, which is worth more than fuzzy-matching the back half of a
		// title. The title is still on the note, in `title` and in its heading,
		// and still found by search.
		aliases:
			// The exception, and the only one: a note made before Better BibTeX was
			// installed keeps the author-title-year name it was born with and learns
			// its key later from a sync. Without this, a citation to one of those
			// would quietly not resolve. Aliasing a file to its own name would list
			// it twice in the suggester, so this asks first.
			key && key !== basename ? [key] : [],
		authors: authorNames(item).join(', '),
		year: itemYear(item),
		citekey: key || null,
		zotero: selectUrl(ref),
		itemKey: ref.key,
	};
}

/** One annotation as markdown, with an id derived from its key. */
export function renderAnnotation(annotation: Annotation): string {
	const lines: string[] = [];
	if (annotation.text) {
		const page = annotation.page ? ` (p. ${annotation.page})` : '';
		// The id is derived, not generated, so it survives every re-sync and a
		// link to one passage keeps resolving.
		lines.push(`> ${annotation.text}${page} ^zt-${annotation.key}`);
	}
	if (annotation.comment) {
		if (lines.length > 0) lines.push('');
		lines.push(annotation.comment);
	}
	return lines.join('\n');
}

export function renderAnnotations(list: Annotation[]): string {
	if (list.length === 0) return '## Annotations\n\n*No annotations in Zotero yet.*';
	return ['## Annotations', ...list.map((annotation) => `\n${renderAnnotation(annotation)}`)].join('\n');
}

/**
 * Replace the managed region, leaving every other byte alone. A body with no
 * region gets one appended rather than being rearranged: the user may have
 * removed it, and rebuilding the file around their prose would be exactly the
 * overreach this model exists to prevent.
 */
export function replaceRegion(body: string, contents: string): string {
	// A blank line inside each marker, for source view, where the markers are
	// text you can see and a heading pressed against one reads as belonging to
	// it. Neither line does anything in reading view: a blank line separates
	// markdown blocks and adds no rendered height, and the gap above the
	// Annotations heading is set by CSS, which is where it is fixed. See the last
	// rule in `styles.css` for why that needed fixing at all.
	const region = `${REGION_START}\n\n${contents}\n\n${REGION_END}`;

	const from = body.indexOf(REGION_START);
	const to = body.indexOf(REGION_END);
	if (from === -1 || to === -1 || to < from) {
		return `${body.replace(/\s*$/, '')}\n\n${region}\n`;
	}

	return body.slice(0, from) + region + body.slice(to + REGION_END.length);
}

/**
 * Fill a template's `{{PLACEHOLDER}}` slots. Anything the caller does not
 * supply is left standing rather than blanked, so a typo in a user-edited
 * template shows itself instead of quietly deleting a line.
 */
export function fill(template: string, values: Record<string, string>): string {
	return template.replace(/\{\{([A-Z_]+)\}\}/g, (whole, name: string) => values[name] ?? whole);
}

/** The links line: the item in Zotero, and the PDF when there is one. */
export function paperLinks(ref: ItemRef, attachmentKey: string | null): string {
	const links = [`[Zotero](${selectUrl(ref)})`];
	if (attachmentKey) links.push(`[PDF](${readerUrl(ref, attachmentKey)})`);
	return links.join(' · ');
}

/**
 * Whether writing the managed frontmatter would change anything.
 *
 * Opening a note is what syncs it, so a paper nobody has touched in Zotero has
 * to come back byte for byte untouched. Rewriting identical frontmatter every
 * time a note is opened would move every paper's modified time, wake every file
 * watcher, and hand a conflict to anyone whose vault is synced between two
 * machines, all to write down what was already there.
 *
 * Only the keys the plugin owns are compared, and order is not one of them: a
 * note whose keys happen to be in a different order is not out of date, it is
 * just sorted differently, and rewriting it to say so would be the same churn.
 */
export function managedDiffers(current: Record<string, unknown> | undefined, managed: PaperFrontmatter, keyField: string): boolean {
	const before = current ?? {};

	// What the keys would be afterwards, worked out on a throwaway object so
	// that asking the question cannot answer it.
	const after: Record<string, unknown> = {};
	applyPaperFrontmatter(after, managed, null, keyField);

	const same = (key: string) => JSON.stringify(before[key]) === JSON.stringify(after[key]);

	return !same(keyField) || MANAGED_KEYS.some((key) => !same(key));
}

/**
 * Apply the managed frontmatter in place, which is the shape
 * `processFrontMatter` wants.
 *
 * This is the frontmatter half of the ownership boundary, and it lives here
 * rather than in the command because it is the part that can destroy something.
 * Managed keys are written or removed; every other key is left exactly as it
 * was found, including the reading decision.
 *
 * `arriving` is the state a brand new note is stamped with, and null says
 * this is a sync rather than a creation. A parameter rather than something
 * inferred: stamping the reading state on a sync would silently discard a
 * judgement, and that is too important to leave to a heuristic about whether a
 * field happens to be absent.
 *
 * Which state that is depends on what putting an item in Zotero means to you,
 * which is the one thing the plugin cannot work out: `untriaged` when the
 * queue is to ask first, `queued` when saving it to Zotero already was the
 * first pass.
 *
 * It gets no tags at all beyond the status mirror, and only when a namespace
 * has been named. A paper's lifecycle is `reading`, in the frontmatter, and
 * how somebody files their notes is theirs.
 */
export function applyPaperFrontmatter(
	frontmatter: Record<string, unknown>,
	managed: PaperFrontmatter,
	arriving: Reading | null,
	keyField: string,
	tags: StatusTags = NO_STATUS_TAGS,
): void {
	for (const key of MANAGED_KEYS) {
		const value = managed[key];
		// An absent citation key leaves nothing behind rather than a null, which
		// would read as "known to be nothing".
		if (value === null || (Array.isArray(value) && value.length === 0)) delete frontmatter[key];
		else frontmatter[key] = value;
	}

	// The one managed key whose name is not fixed. Everything that decides
	// whether a note is a paper reads this property, so the writer has to use
	// the same name or a vault stops recognising its own notes.
	frontmatter[keyField] = managed.itemKey;

	// A new paper says where it arrived in both places at once. Without the tag
	// it would be the one thing a tag explorer cannot see, which is exactly the
	// pile the queue exists to work through.
	if (arriving !== null) {
		frontmatter.reading = arriving;
		applyStatusTag(frontmatter, { reading: arriving, progress: null }, tags);
	}

	sortKeys(frontmatter);
}

/**
 * Why a note is not a paper, in the one wording every caller uses.
 *
 * There were two sentences for this, differing only in politeness, written
 * three months apart by the same person. The check is already shared; the
 * sentence explaining a failed check is part of the check.
 */
export function notAPaper(name: string, keyField: string): string {
	return `${name} is not a paper: it has no ${keyField} property.`;
}
