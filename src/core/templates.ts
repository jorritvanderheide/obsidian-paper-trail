// The literature note template the plugin ships with.
//
// The file on disk wins when it exists, and is written from here when it does
// not. Edits to it stick; delete one and it comes back. It is a seed, not the
// source of truth.
//
// Content only. The seeding lives in commands/seed.ts, so this file stays
// free of Obsidian and the tests can read it.
import { REGION_END, REGION_START } from './paper-note';

/**
 * The managed region, and nothing else.
 *
 * The Claim and Assessment headings were here, which meant every note ever
 * created carried two empty sections: an outline of work that, for every paper
 * dropped on its abstract, was never going to happen. They arrive when you go
 * to write under one, put in above the region by `insertHeading`, so a paper
 * you drop stays three lines long and a paper's outline is what has actually
 * been written.
 *
 * Each of them used to carry an HTML comment asking for what goes under it,
 * which was the only way to ask at the point of use back when arriving at the
 * point of use was something you did by scrolling. Now the queue puts the cursor
 * under the heading and asks there, so the question is asked once, is always
 * the current wording, and disappears when it is answered.
 *
 * In the note it could do none of those things. It was duplicated into every
 * paper ever made, including every one dropped on its abstract; it went stale
 * the moment the wording changed anywhere else; and once the claim was written
 * it sat underneath as a prompt for work already done, invisible in reading
 * view and in the way in every other.
 */
export const PAPER = `# {{TITLE}}

{{LINKS}}

${REGION_START}
${REGION_END}
`;

export interface Template {
	file: string;
	content: string;
}

/**
 * The one template shipped, because it is the one note the plugin owns.
 *
 * There were others, for the notes you write yourself, and they went with the
 * notes folder. What a reading note should look like is a method, and shipping
 * one would be shipping a discipline's method to everyone; Obsidian's own
 * Templates plugin is for those. This one is here only because the workflow
 * has to know where the claim and the assessment headings are.
 */
export const PAPER_TEMPLATE: Template = { file: 'Paper.md', content: PAPER };
