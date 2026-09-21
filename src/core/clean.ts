// Turns Zotero's extracted text of a paper into something worth reading. Zotero
// reflows attachment text for its search index and caches it as
// .zotero-ft-cache: one paragraph per line, with running headers and footers
// left in wherever a page broke.
//
// The output is markdown, because that is what the reader parses: headings
// become `#` lines, which give the outline a pass-one view is built from, and
// paragraphs are separated by a blank line.

/**
 * Headings that mean the article is over. References come first in most
 * journals, but not all: Buildings and Cities puts acknowledgements, ORCIDs,
 * funding and data availability ahead of them, and none of it is reading
 * material. Numbered forms count, because "7. References" is how Elsevier and
 * IEEE style a back-matter heading.
 */
const BACK_MATTER =
	/^#*\s*(?:[0-9]+(?:\.[0-9]+)*\.?\s+)?(?:references?(?: list)?|bibliography|works cited|literature cited|(?:notes and references|references and notes)|acknowledge?ments?|funding|competing interests|conflicts? of interest|declarations? of competing interest|author contributions|author affiliations|data availability|supplementary material|supporting information)\b[\s.:]*$/i;

/**
 * Cut the back matter. Weight the document by characters rather than lines when
 * deciding what counts as the back: a body paragraph is one long line while a
 * reference is one short line, so a review article with 150 references has more
 * than half its *lines* in the bibliography, and a line-counted halfway mark
 * lands inside it. Characters put the mark where a reader would put it.
 */
export function cutBackMatter(lines: string[]): string[] {
	const total = lines.reduce((sum, line) => sum + line.length, 0);
	let seen = 0;
	for (const [index, line] of lines.entries()) {
		if (seen >= total / 2 && BACK_MATTER.test(line)) return lines.slice(0, index);
		seen += line.length;
	}
	return lines;
}

/**
 * Drop running headers and footers, and undo the pagination they mark.
 * Headers repeat on every page but carry the page number, so compare lines
 * with their digits removed: a short line whose digit-stripped form recurs
 * three times or more is furniture. A page break can cut a paragraph in half,
 * which is exactly where a header sat, so when the text before a header did
 * not end a sentence, glue it back to what follows.
 */
export function dropFurniture(lines: string[]): string[] {
	const key = (line: string) => line.replace(/[0-9]/g, '');
	const short = (line: string) => line.length > 0 && line.length < 150;

	const seen = new Map<string, number>();
	for (const line of lines) {
		if (short(line)) seen.set(key(line), (seen.get(key(line)) ?? 0) + 1);
	}

	const out: string[] = [];
	let paged = false;
	for (const line of lines) {
		if (line.trim().length === 0) continue;
		if (short(line) && (seen.get(key(line)) ?? 0) >= 3) {
			paged = true;
			continue;
		}
		const last = out.length - 1;
		if (paged && last >= 0 && !/[.!?:][)"'’”]*$/.test(out[last] ?? '')) {
			out[last] = `${out[last]} ${line}`;
		} else {
			out.push(line);
		}
		paged = false;
	}
	return out;
}

/** The token immediately before a match, without its trailing comma. */
const BEFORE = /([^\s(]+)\s+$/;

/**
 * Whether a parenthetical is a citation rather than an aside that happens to
 * carry a year. The discriminator is what sits directly in front of the year:
 * a citation has an author there, so a capitalised word, an `&` or an `et al.`
 * "(Day & Hitchings 2011)" qualifies and "(baseline year 2005)" does not. A
 * bare "(2015)" is the narrative form, where the author is already in the
 * sentence. A year followed by a slash is an identifier, not a date, which is
 * what keeps "(see Directive 2010/31/EU)" intact.
 */
export function looksLikeCitation(inner: string): boolean {
	const year = /(?:19|20)[0-9]{2}[a-z]?/.exec(inner);
	if (!year) return false;
	if (inner.slice(year.index + year[0].length).startsWith('/')) return false;

	const before = inner.slice(0, year.index);
	if (before.trim().length === 0) return true;

	const token = (BEFORE.exec(before)?.[1] ?? '').replace(/[,;]$/, '');
	return token === 'al.' || token === '&' || /^[A-Z]/.test(token);
}

/**
 * Strip in-text citations. A reader who is scanning for the argument pays for
 * every token, and "(Day & Hitchings 2011; Devine-Wright et al. 2014)" costs as
 * much attention as a sentence. Both conventions go: the author-year
 * parenthetical, and the bracketed numbers most of STEM uses. Dropping the
 * narrative form's year also turns "Ellsworth-Krebs et al. (2015) draw the
 * distinction" back into prose. The length bound keeps a long genuine aside.
 */
export function stripCitations(line: string): string {
	return line
		.replace(/\([^()]{0,150}\)/g, (match) => (looksLikeCitation(match.slice(1, -1)) ? '' : match))
		.replace(/\[[0-9]+(?:\s*[–—,-]\s*[0-9]+)*\](?:\s*[,;–—-]?\s*\[[0-9]+(?:\s*[–—,-]\s*[0-9]+)*\])*/g, '')
		.replace(/\s+([,.;:])/g, '$1')
		.replace(/ {2,}/g, ' ')
		.trim();
}

/**
 * Section names a journal sets in title case, where the shouted-line rule below
 * cannot see them. Most LaTeX templates, Springer and Wiley all write
 * "Abstract" rather than "ABSTRACT", and without this the front matter survives
 * and the outline comes out empty.
 */
const SECTION_WORD =
	/^(?:abstract|introduction|background|related work|literature review|materials and methods|methodology|methods?|approach|results|findings|discussion|conclusions?|limitations|future work|implications|references|bibliography|acknowledge?ments?|funding|appendix)[\s.:]*$/i;

/**
 * Words a title-cased heading is allowed to leave in lowercase. Every style
 * guide keeps articles, conjunctions and short prepositions down, so requiring
 * every word to be capitalised would reject "Learning to Be".
 */
// Articles, conjunctions and short prepositions only. Not `is`, `are` or `be`:
// a style guide capitalises a verb however short it is, and treating them as
// minor lost "Learning to Be", whose only other word is the one carrying it.
const MINOR_WORD =
	/^(?:a|an|the|and|or|nor|but|for|so|yet|of|in|on|at|to|from|by|as|with|into|over|under|via|per|vs\.?|about|between|through|during|after|before|toward|towards|upon|within|without)$/i;

/**
 * Whether a line looks like a heading set in title case.
 *
 * This exists because the two rules below between them see only shouted
 * headings and about twenty section names, which is the convention in computing
 * and almost nowhere else. A social science journal writes "Conceptualising
 * Care" and a magazine writes "The Brewing Perfect Storm of Opportunity", and
 * without this both come through as body text: no outline, and no introduction
 * or conclusion to show, because there is no heading to find them under.
 *
 * Capitalisation is the only signal left once a PDF has been flattened to text.
 * The font is gone, and so is the blank line, because an extractor puts one
 * paragraph on one line and a heading on one line and marks neither.
 *
 * Deliberately loose. A short capitalised line of body text promoted by mistake
 * costs one junk row in the outline, which you can see and skip. A heading
 * missed costs the whole section under it.
 */
function titleCased(line: string): boolean {
	// A question is a heading often enough to allow, in a review especially:
	// "How Are Scientists Working with the Literature?". A full stop is not: a
	// sentence that happened to be short is still a sentence.
	if (/[.,;:!]$/.test(line)) return false;
	if (!/^[A-Z]/.test(line)) return false;

	const words = line.split(/\s+/).filter((word) => word.length > 0);
	// Two words at least, so an initial or a drop cap cannot qualify, and not so
	// many that a whole sentence could.
	if (words.length < 2 || words.length > 12) return false;

	const carrying = words.filter((word) => /[A-Za-z]/.test(word) && !MINOR_WORD.test(word));
	return carrying.length >= 2 && carrying.every((word) => /^[^a-zA-Z]*[A-Z]/.test(word));
}

/**
 * Promote section headings to markdown. Numbered headings carry their own
 * depth: "4.2.1 Technologism" is three levels down. Unnumbered ones are either
 * shouted, the kind a journal uses for its back matter, or title cased, which
 * is what most of the world outside computing writes.
 */
export function promoteHeading(line: string): string {
	// Section numbers run to double figures and no further. Without that bound
	// the rule read a figure's axis labels as a heading: "1970 1980 1990 2000
	// Year" is a line starting with a number, and nothing else about it is.
	const numbered = /^([0-9]{1,2}(?:\.[0-9]{1,2})*)\.? +(\S.*)$/.exec(line);
	if (line.length < 100 && numbered?.[1] && numbered[2]) {
		const depth = numbered[1].split('.').length;
		return `${'#'.repeat(Math.min(depth, 6))} ${numbered[2]}`;
	}
	// Three letters at least. A drop cap is a single capital on its own line,
	// and "T" was being promoted at the top of every article that has one.
	if (line.length < 60 && (line.match(/[A-Z]/g) ?? []).length >= 3 && !/[a-z]/.test(line) && !/[.?!]$/.test(line)) {
		return `# ${line}`;
	}
	if (line.length < 60 && SECTION_WORD.test(line)) {
		return `# ${line.replace(/[\s.:]+$/, '')}`;
	}
	if (line.length < 80 && titleCased(line)) {
		return `# ${line}`;
	}
	return line;
}

/**
 * Drop the front matter. Journals put the running head, corresponding author,
 * keywords and citation block ahead of the article, none of which is reading
 * material. The abstract is the first thing worth reading, so start there. If
 * a document has no abstract heading, keep everything rather than guess.
 */
export function dropFrontMatter(lines: string[]): string[] {
	const start = lines.findIndex((line) => /^#*\s*abstract\b/i.test(line));
	return start === -1 ? lines : lines.slice(start);
}

/**
 * The pipeline up to the point where the back matter is still attached:
 * de-paginated, with headings promoted. Both halves of the document are taken
 * from here, so the reading text and the reference list agree about where one
 * ends and the other starts.
 */
function promoted(text: string): string[] {
	return dropFurniture(text.split(/\r?\n/)).map(promoteHeading);
}

/**
 * Everything the article proper does not include: references, and whatever
 * acknowledgements and declarations a journal puts around them.
 *
 * `cleanFulltext` throws this away, correctly, because none of it is reading
 * material. It is kept reachable because the reference list answers a question
 * the article cannot: how much of what this paper builds on do you already
 * have. Empty when the document has no back matter at all.
 */
export function backMatter(text: string): string[] {
	const lines = promoted(text);
	return lines.slice(cutBackMatter(lines).length);
}

export function cleanFulltext(text: string): string {
	let lines = promoted(text);
	lines = cutBackMatter(lines);
	lines = lines.map(stripCitations).filter((line) => line.length > 0);
	lines = dropFrontMatter(lines);
	return lines.join('\n\n');
}
