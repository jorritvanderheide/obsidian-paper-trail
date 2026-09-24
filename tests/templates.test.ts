import { describe, expect, it } from 'vitest';
import { PAPER, PAPER_TEMPLATE } from '../src/core/templates';
import { REGION_END, REGION_START } from '../src/core/paper-note';
import { readTags } from '../src/core/triage';
import { DEFAULT_SETTINGS } from '../src/core/settings';

/** The tag list out of a template's frontmatter, without a YAML parser. */
function tagsOf(content: string): string[] {
	const block = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] ?? '';
	return readTags(
		block
			.split('\n')
			.filter((line) => line.startsWith('  - '))
			.map((line) => line.slice(4).trim()),
	);
}

// One template ships now. The note templates went with `Add note`: a file made
// from a template in a folder is what Obsidian's own Templates core plugin is
// for, and this one stays only because the plugin has to know where the claim
// and the assessment headings are.
describe('the paper template', () => {
	it('is the only one shipped', () => {
		expect(PAPER_TEMPLATE.content).toBe(PAPER);
	});

	it('has the only placeholders the writer supplies', () => {
		for (const slot of ['TITLE', 'LINKS']) {
			expect(PAPER, slot).toContain(`{{${slot}}}`);
		}
	});

	// Every note ever created used to carry an empty Claim and an empty
	// Assessment: an outline of work that, for a paper dropped on its abstract,
	// was never going to happen. They arrive when you go to write under one.
	it('carries no heading of its own but the title', () => {
		const headings = PAPER.split('\n').filter((line) => line.startsWith('#'));
		expect(headings).toEqual(['# {{TITLE}}']);
	});

	it('is short enough that a dropped paper is not an outline of what it is not', () => {
		expect(PAPER.split('\n').filter((line) => line.trim() !== '')).toHaveLength(4);
	});

	it('carries the managed region, or a sync has nowhere to put annotations', () => {
		expect(PAPER).toContain(REGION_START);
		expect(PAPER).toContain(REGION_END);
	});

	// The markers are HTML comments because the metadata cache has to call them
	// something the stage rules ignore, and `html` is a type Obsidian documents.
	it('delimits the region with something the heading check will not read as prose', () => {
		expect(REGION_START.startsWith('<!--')).toBe(true);
		expect(REGION_END.startsWith('<!--')).toBe(true);
		expect(PAPER).not.toContain('%%');
	});

	// How somebody files their notes is theirs. A template that arrived with a
	// tag on it would put the plugin's filing in every paper you ever made.
	it('names no tag at all', () => {
		expect(tagsOf(PAPER)).toEqual([]);
		expect(PAPER).not.toContain('tags:');
	});

	// "Everything shipped is English" was recorded as done while three templates
	// were still Dutch. A test is harder to lie to.
	it('is in English', () => {
		const DUTCH = /\b(wat|waarom|deze|notities|zodra|bestand|hoort|volgorde|het|een|niet|voor|zelf)\b/i;
		expect(PAPER.replace(/\{\{[A-Z_]+\}\}/g, '')).not.toMatch(DUTCH);
	});

	// A note is the template written under its frontmatter, so the first line
	// is the one between the closing `---` and the title. One, not two.
	it('leaves one blank line between the frontmatter and the title', () => {
		expect(PAPER.split('\n').slice(0, 2)).toEqual(['', '# {{TITLE}}']);
	});

	it('ends with a newline', () => {
		expect(PAPER.endsWith('\n')).toBe(true);
	});
});

/**
 * The prompts are drawn by the editor, not written by the template.
 *
 * They were HTML comments under each heading, which sat in every paper ever
 * made and went stale when the wording changed. Then a notice, which repeated
 * them at somebody who knew them. Now faint text on the empty line itself,
 * which is in no file at all.
 */
describe('the prompts the template does not carry', () => {
	it('writes neither question into a new paper', () => {
		expect(PAPER).not.toContain(DEFAULT_SETTINGS.claimPrompt);
		expect(PAPER).not.toContain(DEFAULT_SETTINGS.assessmentPrompt);
	});
});
