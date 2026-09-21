// The shape of a literature note: what the plugin owns in it, and what it must
// never touch.
//
// The ownership model is the whole safety story here. A sync may rewrite the
// frontmatter keys listed below and the region between the markers. Everything
// else in the file belongs to whoever wrote it, and losing a word of that is
// the one unforgivable failure for a plugin like this.
import { authorNames, itemYear, readerUrl, type ApiItem, type Highlight, type ItemRef } from './zotero';
import { sortKeys } from './frontmatter';

/** Wraps the only part of the body a sync is allowed to replace. */
export const REGION_START = '%%paper-trail%%';
export const REGION_END = '%%/paper-trail%%';

/**
 * Frontmatter keys the plugin writes. Every other key in the file is the
 * user's, including the reading decision: `reading`, `reading-date`,
 * `triaged-date` and `reading-reason` are answers a person gave, and a refresh
 * from Zotero has no business resetting them.
 */
export const MANAGED_KEYS = ['title', 'aliases', 'authors', 'year', 'citekey', 'zotero'] as const;

/**
 * Keys the plugin writes no more and takes back out, so a note made under an
 * older version tidies itself on its next sync rather than carrying a dead
 * field for the rest of its life.
 *
 * `attachment` held a Zotero attachment key: an opaque identifier in every
 * note's properties panel, saving one request, and preferred over whatever
 * Zotero offered now, so replacing a PDF left the note reading annotations off
 * an attachment that had gone.
 */
const RETIRED_KEYS = ['attachment'] as const;

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

export function paperFrontmatter(item: ApiItem, ref: ItemRef): PaperFrontmatter {
	const full = item.data.title ?? item.key;
	const short = item.data.shortTitle?.trim();
	return {
		title: short || full,
		// The full title stays reachable by search even when a short one is shown.
		aliases: short && short !== full ? [full] : [],
		authors: authorNames(item).join(', '),
		year: itemYear(item),
		citekey: item.data.citationKey?.trim() || null,
		zotero: selectUrl(ref),
		itemKey: ref.key,
	};
}

/** One highlight as markdown, with an id derived from the annotation key. */
export function renderHighlight(highlight: Highlight): string {
	const lines: string[] = [];
	if (highlight.text) {
		const page = highlight.page ? ` (p. ${highlight.page})` : '';
		// The id is derived, not generated, so it survives every re-sync and a
		// link to one passage keeps resolving.
		lines.push(`> ${highlight.text}${page} ^zt-${highlight.key}`);
	}
	if (highlight.comment) {
		if (lines.length > 0) lines.push('');
		lines.push(highlight.comment);
	}
	return lines.join('\n');
}

export function renderHighlights(list: Highlight[]): string {
	if (list.length === 0) return '## Highlights\n\n*Nothing highlighted in Zotero yet.*';
	return ['## Highlights', ...list.map((highlight) => `\n${renderHighlight(highlight)}`)].join('\n');
}

/**
 * Replace the managed region, leaving every other byte alone. A body with no
 * region gets one appended rather than being rearranged: the user may have
 * removed it, and rebuilding the file around their prose would be exactly the
 * overreach this model exists to prevent.
 */
export function replaceRegion(body: string, contents: string): string {
	// A blank line before the closing marker and none after the opening one.
	// The markers are invisible in preview but the blank lines around them are
	// not, and a leading one pushes the Highlights heading down a line for no
	// reason. The trailing one still earns its place: without it the last quote
	// sits flush against the marker in source view.
	const region = `${REGION_START}\n${contents}\n\n${REGION_END}`;
	const start = body.indexOf(REGION_START);
	const end = body.indexOf(REGION_END);

	if (start === -1 || end === -1 || end < start) {
		return `${body.replace(/\s*$/, '')}\n\n${region}\n`;
	}
	return body.slice(0, start) + region + body.slice(end + REGION_END.length);
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
	applyPaperFrontmatter(after, managed, false, keyField);

	const same = (key: string) => JSON.stringify(before[key]) === JSON.stringify(after[key]);

	// A retired key still on the note counts as a difference, or the sync that
	// would remove it is the sync that decides nothing needs doing.
	if (RETIRED_KEYS.some((key) => key in before)) return true;

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
 * `fresh` says this is a new note rather than a sync. A parameter rather than
 * something inferred: stamping the reading state on a sync instead of a
 * creation would silently discard a judgement, and that is too important to
 * leave to a heuristic about whether a field happens to be absent.
 *
 * A new paper gets `reading: untriaged` and no tags at all. No value on the
 * type axis is right for one: `inbox` would claim it is waiting to be filed
 * when `stageOf` never sends it to File, `filed` describes a loop it was never
 * in, and `living` is wrong for one you dropped. A paper's lifecycle is
 * `reading`, and the inbox loop is for notes you write.
 */
export function applyPaperFrontmatter(
	frontmatter: Record<string, unknown>,
	managed: PaperFrontmatter,
	fresh: boolean,
	keyField: string,
): void {
	for (const key of MANAGED_KEYS) {
		const value = managed[key];
		// An absent citation key leaves nothing behind rather than a null, which
		// would read as "known to be nothing".
		if (value === null || (Array.isArray(value) && value.length === 0)) delete frontmatter[key];
		else frontmatter[key] = value;
	}

	// Anything the plugin has stopped writing goes on being removed, so a note
	// made under an older version catches up the next time it is synced.
	for (const key of RETIRED_KEYS) delete frontmatter[key];

	// The one managed key whose name is not fixed. Everything that decides
	// whether a note is a paper reads this property, so the writer has to use
	// the same name or a vault stops recognising its own notes.
	frontmatter[keyField] = managed.itemKey;

	if (fresh) frontmatter.reading = 'untriaged';

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
