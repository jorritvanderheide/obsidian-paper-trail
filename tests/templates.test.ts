import { describe, expect, it } from 'vitest';
import { PAPER, PAPER_TEMPLATE } from '../src/core/templates';
import { readTags } from '../src/core/vocabulary';

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

	// The values on an axis are the user's, so a template cannot know one: naming
	// domain/phd stops naming anything real the moment someone edits the list.
	it('names no tag at all', () => {
		expect(tagsOf(PAPER)).toEqual([]);
		expect(PAPER).not.toMatch(/domain\//);
		expect(PAPER).not.toMatch(/type\//);
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
