// The note templates the plugin ships with.
//
// The file on disk wins when it exists, and is written from here when it does
// not. Edits to it stick; delete one and it comes back, which is right, since
// the picker offers whatever is in the folder either way. These are seeds, not
// the source of truth.
//
// Content only. The seeding lives in commands/notes.ts, so this file stays
// free of Obsidian and the tests can read it.
/** The fence that renders the queue block. One constant, so the command that inserts it and the processor that renders it cannot drift. */
export const WORKFLOW_BLOCK = 'paper-trail';

export const PAPER = `# {{TITLE}}

{{LINKS}}

## {{CLAIM}}

<!-- The second pass ends here. What does this paper argue? One or two
     sentences, in your words: enough that you could tell someone else. -->

## {{ASSESSMENT}}

<!-- The third pass ends here, and only papers you promote to one get this far.
     Where does it strain? What is it assuming? What is the evidence actually
     doing, as opposed to what it is said to be doing? -->

%%paper-trail%%
%%/paper-trail%%
`;

export interface Template {
	label: string;
	file: string;
	content: string;
}

/**
 * The notes you write yourself, in one list.
 *
 * There were two, split by whether a note goes round the filing loop, and two
 * commands to match. That put a tag value into a command name: rename `living`
 * to `evergreen` and "Add living note" was still called living. Which loop a
 * note joins is written in its own frontmatter, so the template can say it and
 * the command need not.
 *
 * Both are the kind of note anyone takes, whatever they study. Anything more
 * specific than that belongs in your template folder rather than in the
 * plugin, where it would be one discipline's method shipped to everyone.
 */
export const PAPER_TEMPLATE: Template = { label: 'Paper', file: 'Paper.md', content: PAPER };
