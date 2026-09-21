import { describe, expect, it } from 'vitest';
import {
	TEMPLATES,
	PAPER,
	PAPER_TEMPLATE,
	type Template,
} from '../src/core/templates';
import { DEFAULT_VOCABULARY, isValid, readTags, type Vocabulary } from '../src/core/vocabulary';
import { fill } from '../src/core/paper-note';

/** The tag list out of a template's frontmatter, without a YAML parser. */
function tagsOf(template: Template): string[] {
	const block = /^---\n([\s\S]*?)\n---/.exec(template.content)?.[1] ?? '';
	return readTags(
		block
			.split('\n')
			.filter((line) => line.startsWith('  - '))
			.map((line) => line.slice(4).trim()),
	);
}

const all = TEMPLATES;

/** A template as a command would write it, for a given vocabulary. */
function filled(template: Template, vocabulary: Vocabulary): Template {
	return {
		...template,
		content: fill(template.content, {
			TITLE: 'A note',
		}),
	};
}

describe.each(all)('$label', (template) => {
	it('has the only placeholder there is', () => {
		expect(template.content).toContain('{{TITLE}}');
	});

	it('opens with frontmatter', () => {
		expect(template.content.startsWith('---\n')).toBe(true);
	});

	it('carries only values the vocabulary knows, once filled', () => {
		for (const tag of tagsOf(filled(template, DEFAULT_VOCABULARY))) {
			const [axis, value] = tag.split('/');
			expect(axis).toBe('domain');
			expect(isValid('domain', value ?? '')).toBe(true);
		}
	});

	it('follows a renamed vocabulary instead of hardcoding one', () => {
		// The point of the placeholders: rename the inbox and the templates
		// follow, rather than writing a value that no longer exists.
		const mine = { ...DEFAULT_VOCABULARY, types: { inbox: 'new', filed: 'sorted', living: 'evergreen' } };
		const tags = tagsOf(filled(template, mine));
		expect(tags.some((tag) => tag === 'type/inbox' || tag === 'type/living')).toBe(false);
	});

	it('ends with a newline, as a file on disk would', () => {
		expect(template.content.endsWith('\n')).toBe(true);
	});
});

describe('the one list', () => {
	// The filing loop is gone, so a template stamps no type tag and no note
	// joins a loop it then has to be let out of.
	it('puts no type tag on anything it makes', () => {
		for (const template of TEMPLATES) {
			expect(tagsOf(filled(template, DEFAULT_VOCABULARY)).filter((tag) => tag.startsWith('type/'))).toHaveLength(0);
		}
	});

	it('has no two templates writing the same file', () => {
		const files = all.map((template) => template.file);
		expect(new Set(files).size).toBe(files.length);
	});
});

describe('no shipped template names a domain', () => {
	it.each(all)('$label', (template) => {
		// The domain values are the user's, so a template cannot know one: a
		// template naming domain/phd stops naming anything that exists the moment
		// someone edits the list.
		expect(template.content).not.toMatch(/domain\//);
	});
});

describe('nothing shipped is in Dutch', () => {
	// "Everything shipped is English" was recorded as a decision and marked
	// done, while three templates were still Dutch. A test is harder to lie to.
	const DUTCH = /\b(wat|waarom|deze|notities|zodra|bestand|hoort|volgorde|het|een|niet|voor|zelf)\b/i;

	it.each(TEMPLATES)('$label', (template) => {
		const prose = template.content.replace(/\{\{[A-Z_]+\}\}/g, '');
		expect(prose).not.toMatch(DUTCH);
	});

	it('covers the paper template too', () => {
		expect(PAPER.replace(/\{\{[A-Z_]+\}\}/g, '')).not.toMatch(DUTCH);
	});
});

describe('nothing starts with an empty line', () => {
	const all = [...TEMPLATES, PAPER_TEMPLATE];

	it.each(all)('$label opens on content, not a blank', (template) => {
		expect(template.content.split('\n')[0]).not.toBe('');
	});

	it.each(all)('$label has no blank line under its frontmatter', (template) => {
		// Obsidian renders frontmatter as a panel, so a blank line after the
		// closing marker is an empty first line in the visible note.
		expect(template.content).not.toContain('---\n\n');
	});
});
