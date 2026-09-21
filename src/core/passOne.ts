// The first pass, in Keshav's sense: title, abstract, headings, conclusions,
// references, in five to ten minutes, ending in a decision about whether to read
// the thing at all. Everything here works on the markdown cleanFulltext produces,
// where paragraphs are separated by a blank line and a heading is a `#` line.

export interface Heading {
	level: number;
	text: string;
}

export interface Section {
	heading: Heading | null;
	paragraphs: string[];
}

export interface PassOne {
	/** Every heading, in order. This is the outline the decision is mostly made on. */
	outline: Heading[];
	/** Paragraphs under the abstract heading, empty when the paper has none. */
	abstract: string[];
	/**
	 * Paragraphs under the introduction, empty when the paper has none.
	 *
	 * Keshav's first pass reads the introduction, and it earns the place: an
	 * abstract is written to sell the paper, while the introduction is where the
	 * contribution is actually claimed and where a paper admits what it is
	 * answering.
	 */
	introduction: string[];
	/** Paragraphs under the last conclusion heading, empty when the paper has none. */
	conclusion: string[];
	words: number;
	/** Minutes at 250 wpm, roughly adult silent reading speed for academic prose. */
	minutes: number;
}

const HEADING = /^(#{1,6}) +(.+)$/;
const ABSTRACT = /^(?:abstract|summary)\b/i;
// `promoteHeading` has already taken the number off "1. Introduction", so
// nothing here has to allow for one.
const INTRODUCTION = /^introduction\b/i;
const CONCLUSION = /^(?:conclusions?|concluding remarks|discussion and conclusions?)\b/i;

const WORDS_PER_MINUTE = 250;

/** The document as headed sections. Text before the first heading has a null heading. */
export function sections(markdown: string): Section[] {
	const out: Section[] = [];
	let current: Section = { heading: null, paragraphs: [] };

	for (const block of markdown.split('\n\n')) {
		const match = HEADING.exec(block.trim());
		if (match?.[1] && match[2]) {
			if (current.heading !== null || current.paragraphs.length > 0) out.push(current);
			current = { heading: { level: match[1].length, text: match[2].trim() }, paragraphs: [] };
		} else if (block.trim().length > 0) {
			current.paragraphs.push(block.trim());
		}
	}
	if (current.heading !== null || current.paragraphs.length > 0) out.push(current);
	return out;
}

/**
 * The conclusion is taken from the *last* matching heading rather than the
 * first. "Conclusion" turns up as a subsection of a discussion often enough that
 * the earlier one is usually not the one summarising the paper.
 */
function paragraphsUnder(found: Section[], match: RegExp, last: boolean): string[] {
	const hits = found.filter((section) => section.heading !== null && match.test(section.heading.text));
	const hit = last ? hits[hits.length - 1] : hits[0];
	return hit?.paragraphs ?? [];
}

export function passOne(markdown: string): PassOne {
	const found = sections(markdown);
	const words = markdown
		.split(/\s+/)
		.filter((word) => word.length > 0 && !/^#{1,6}$/.test(word)).length;

	return {
		outline: found.flatMap((section) => (section.heading ? [section.heading] : [])),
		abstract: paragraphsUnder(found, ABSTRACT, false),
		introduction: paragraphsUnder(found, INTRODUCTION, false),
		conclusion: paragraphsUnder(found, CONCLUSION, true),
		words,
		minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
	};
}
