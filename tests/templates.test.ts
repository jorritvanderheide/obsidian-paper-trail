import { describe, expect, it } from 'vitest';
import { PAPER, PAPER_TEMPLATE } from '../src/core/templates';
import { readTags } from '../src/core/triage';
import { TASKS } from '../src/core/stages';

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
		for (const slot of ['TITLE', 'LINKS', 'CLAIM', 'ASSESSMENT']) {
			expect(PAPER, slot).toContain(`{{${slot}}}`);
		}
	});

	it('carries the managed region, or a sync has nowhere to put highlights', () => {
		expect(PAPER).toContain('%%paper-trail%%');
		expect(PAPER).toContain('%%/paper-trail%%');
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

	it('opens on content, not a blank', () => {
		expect(PAPER.split('\n')[0]).not.toBe('');
	});

	it('ends with a newline', () => {
		expect(PAPER.endsWith('\n')).toBe(true);
	});
});

describe('what the template does not carry', () => {
	// Every heading here is one the plugin watches: Claim and Assessment each
	// end a stage and each has a setting naming it. "What this changes" had
	// neither, so it was a prompt in every note, including every dropped one,
	// for work nothing would ever ask about.
	it('has only the two headings a stage ends at', () => {
		const headings = PAPER.split('\n').filter((line) => line.startsWith('## '));
		expect(headings).toEqual(['## {{CLAIM}}', '## {{ASSESSMENT}}']);
	});
});

/**
 * The prompts moved out of the note and into the moment.
 *
 * They were HTML comments under each heading, which was the only way to ask at
 * the point of use back when reaching the point of use meant scrolling. The
 * queue now puts the cursor under the heading and asks there.
 */
describe('the prompts the template no longer carries', () => {
	it('leaves both headings empty, so nothing has to be deleted before writing', () => {
		expect(PAPER).not.toContain('<!--');
	});

	// `hasContentUnder` ignores comments, so they never satisfied the gate. The
	// cost was elsewhere: one in every paper ever made, including the dropped
	// ones, going stale the moment the wording changed anywhere else.
	it('puts nothing between the two headings but a blank line', () => {
		const lines = PAPER.split('\n');
		const claim = lines.indexOf('## {{CLAIM}}');
		const assessment = lines.indexOf('## {{ASSESSMENT}}');
		expect(lines.slice(claim + 1, assessment).every((line) => line.trim() === '')).toBe(true);
	});

	it('is asked by the task instead, which is where it can be kept current', () => {
		expect(TASKS.claim.prompt).toBeTruthy();
		expect(TASKS.assessment.prompt).toBeTruthy();
	});

	it('asks nothing of the tasks that are not answered by typing under a heading', () => {
		expect(TASKS.triage.prompt).toBeUndefined();
		expect(TASKS.read.prompt).toBeUndefined();
	});
});
