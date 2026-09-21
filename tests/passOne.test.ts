import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { cleanFulltext } from '../src/core/clean';
import { passOne, sections } from '../src/core/passOne';

const article = readFileSync(new URL('./fixtures/article.zotero-ft-cache', import.meta.url), 'utf8');

const doc = ['# Abstract', 'We ask a question.', '# Introduction', 'Some background.', 'More background.', '## Conclusion', 'A subsection.', '# Conclusions', 'The answer.'].join(
	'\n\n',
);

describe('introduction', () => {
	it('takes the paragraphs under the introduction heading', () => {
		expect(passOne(doc).introduction).toEqual(['Some background.', 'More background.']);
	});

	it('is empty when the paper has no introduction heading', () => {
		expect(passOne('# Abstract\n\nWe ask a question.').introduction).toEqual([]);
	});

	it('takes the first introduction, not a later one, unlike the conclusion', () => {
		const two = ['# Introduction', 'The real one.', '# Method', 'Something.', '# Introduction', 'A running header that survived.'].join('\n\n');
		expect(passOne(two).introduction).toEqual(['The real one.']);
	});

	it('reads the introduction off a real article', () => {
		expect(passOne(cleanFulltext(article)).introduction[0]).toContain('Households are more than sites of consumption');
	});
});

describe('sections', () => {
	it('groups paragraphs under their heading', () => {
		expect(sections('# One\n\na\n\nb\n\n## Two\n\nc')).toEqual([
			{ heading: { level: 1, text: 'One' }, paragraphs: ['a', 'b'] },
			{ heading: { level: 2, text: 'Two' }, paragraphs: ['c'] },
		]);
	});

	it('keeps text before the first heading', () => {
		expect(sections('loose\n\n# One\n\na')).toEqual([
			{ heading: null, paragraphs: ['loose'] },
			{ heading: { level: 1, text: 'One' }, paragraphs: ['a'] },
		]);
	});

	it('is empty for empty input', () => {
		expect(sections('')).toEqual([]);
	});
});

describe('passOne', () => {
	it('takes the abstract from the first matching heading', () => {
		expect(passOne(doc).abstract).toEqual(['We ask a question.']);
	});

	it('takes the conclusion from the last matching heading', () => {
		expect(passOne(doc).conclusion).toEqual(['The answer.']);
	});

	it('lists every heading with its depth', () => {
		expect(passOne(doc).outline).toEqual([
			{ level: 1, text: 'Abstract' },
			{ level: 1, text: 'Introduction' },
			{ level: 2, text: 'Conclusion' },
			{ level: 1, text: 'Conclusions' },
		]);
	});

	it('leaves the sections empty rather than guessing', () => {
		const result = passOne('# Introduction\n\nText.');
		expect(result.abstract).toEqual([]);
		expect(result.conclusion).toEqual([]);
	});

	it('estimates a reading time from the word count', () => {
		const result = passOne(['# One', 'word '.repeat(500).trim()].join('\n\n'));
		expect(result.words).toBe(501);
		expect(result.minutes).toBe(2);
	});

	it('reads a real article', () => {
		const result = passOne(cleanFulltext(article));
		expect(result.outline.map((heading) => heading.text)).toEqual(['ABSTRACT', 'Introduction', 'Scope', 'CONCLUSIONS']);
		expect(result.abstract).toEqual(['This paper asks what home means for energy use.']);
		expect(result.conclusion).toEqual(['Home matters.']);
	});
});
