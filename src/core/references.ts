// The fourth thing Keshav's first pass does: glance at the reference list and
// see which of it you already know.
//
// The useful form of that is not the list, which nobody reads, but one number.
// "Nine of these are papers you already have, and you dropped two of them" says
// whether you are inside a literature you know or outside one, which is most of
// what the first pass is trying to work out, and it is the year-three
// re-encounter the record exists for, arriving on purpose instead of by luck.
//
// Pure: the caller hands over the back matter and what the vault already holds.

/** Where the list starts. Everything after this line is a candidate. */
const REFERENCES =
	/^#*\s*(?:references?(?: list| cited)?|bibliography|works cited|literature cited|(?:notes and references|references and notes))\b[\s.:]*$/i;

/** No year, no reference. Four digits back to the seventeenth century, because the humanities cite that far back. */
const YEAR = /\b(?:1[6-9]|20)[0-9]{2}[a-z]?\b/;

/** Shorter than this and it is a page number, a column break or a stray initial. */
const MIN_ENTRY = 20;

/**
 * A paper the vault already holds, as the glance needs to see it.
 *
 * `titles` is the note's title and its aliases together, because a note titled
 * with Zotero's short title has the full one in an alias, and it is the full
 * one that appears in somebody else's reference list.
 */
export interface KnownPaper {
	path: string;
	titles: string[];
	reading: string | null;
}

export interface Glance {
	/** Entries found in the reference list. */
	total: number;
	/** The ones you already have, most surprising first. */
	known: KnownPaper[];
}

/**
 * Everything but letters and digits removed, including the spaces.
 *
 * Extracted PDF text breaks words across a line ("frame- work"), spaces them
 * oddly and loses accents, and a reference list styles the same title
 * differently from Zotero. Comparing what survives all of that matches far more
 * than comparing words would, and for strings this long the collisions it lets
 * through are not worth guarding against.
 */
function squash(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Squashed length a title needs before matching it proves anything. */
const MIN_TITLE = 14;

/**
 * The titles distinctive enough to search for. A three-word title is a real
 * title; "Notes", "Energy" or "Home" is a false positive waiting to happen, and
 * one wrong "you already have this" costs more than a missed one.
 */
function usable(paper: KnownPaper): string[] {
	return paper.titles
		.filter((title) => title.trim().split(/\s+/).length >= 3)
		.map(squash)
		.filter((title) => title.length >= MIN_TITLE);
}

/**
 * The reference list, one entry per line, as far as the extracted text allows.
 *
 * Journals disagree about what comes first in the back matter, so this looks
 * for the references heading rather than assuming the back matter opens with
 * it, and keeps only lines carrying a year: that drops the acknowledgements, an
 * ORCID block and a data availability statement without having to name them.
 */
export function referenceLines(backMatter: string[]): string[] {
	const start = backMatter.findIndex((line) => REFERENCES.test(line));
	if (start === -1) return [];

	return backMatter
		.slice(start + 1)
		// A short numbered entry may have been promoted to a heading on the way
		// through the cleaner. Take the hash off rather than lose the entry.
		.map((line) => line.replace(/^#+\s*/, '').trim())
		.filter((line) => line.length >= MIN_ENTRY && YEAR.test(line));
}

/** Least expected first: a paper you dropped, then one you parked. */
const SURPRISE = ['dropped', 'deferred', 'queued', 'untriaged'];

function rank(paper: KnownPaper): number {
	const index = SURPRISE.indexOf(paper.reading ?? 'untriaged');
	return index === -1 ? SURPRISE.length : index;
}

/**
 * How much of this paper's bibliography you already have.
 *
 * Matched on title rather than on author and year, which sounds backwards and
 * is not: a surname is mangled by extraction and shared by hundreds of people,
 * while a title is long, unusual and reproduced verbatim by whoever cited it.
 *
 * The entries are joined into one haystack so each title is searched for once
 * instead of once per reference. Squashing leaves no separators behind, so the
 * bar cannot be crossed by a match that spans two entries.
 */
export function glance(lines: string[], known: KnownPaper[]): Glance {
	const haystack = lines.map(squash).join('|');

	const found = known.filter((paper) => usable(paper).some((title) => haystack.includes(title)));
	found.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));

	return { total: lines.length, known: found };
}
