import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
	backMatter,
	cleanFulltext,
	cutBackMatter,
	dropFrontMatter,
	dropFurniture,
	looksLikeCitation,
	promoteHeading,
	stripCitations,
} from '../src/core/clean';

const article = readFileSync(new URL('./fixtures/article.zotero-ft-cache', import.meta.url), 'utf8');

/** A body paragraph and a reference entry, at the lengths they really come in. */
const body = (n: number) => `Body paragraph ${n}. `.repeat(30);
const ref = (n: number) => `Author${n}, A., 2019. A title about subject ${n}. Journal of Things ${n}, 1-10.`;

describe('cutBackMatter', () => {
	/** Two body paragraphs, so a heading after them sits in the back half by weight. */
	const front = [body(1), body(2)];

	it('cuts at a references heading in the back half', () => {
		expect(cutBackMatter([...front, 'References', ref(1)])).toEqual(front);
	});

	it('ignores a references heading in the front half', () => {
		const lines = ['References', ...front];
		expect(cutBackMatter(lines)).toEqual(lines);
	});

	it('cuts a bibliography that has more lines than the body', () => {
		const lines = [...Array.from({ length: 60 }, (_, i) => body(i)), 'References', ...Array.from({ length: 200 }, (_, i) => ref(i))];
		expect(cutBackMatter(lines)).toHaveLength(60);
	});

	it('cuts at a numbered references heading', () => {
		expect(cutBackMatter([...front, '7. References', ref(1)])).toEqual(front);
	});

	it.each([
		'Literature Cited',
		'Works Cited',
		'Bibliography',
		'Acknowledgements',
		'Acknowledgments',
		'Funding',
		'Data availability',
		'Competing interests',
		'Author affiliations',
	])('cuts at %s', (heading) => {
		expect(cutBackMatter([...front, heading, 'Something after.'])).toEqual(front);
	});

	it('cuts at the first back-matter heading, not the references', () => {
		expect(cutBackMatter([...front, 'Acknowledgements', 'Thanks.', 'References', ref(1)])).toEqual(front);
	});

	it('leaves a reference to the word alone', () => {
		const lines = [...front, 'We give references for this.', body(3)];
		expect(cutBackMatter(lines)).toEqual(lines);
	});
});

describe('dropFurniture', () => {
	it('drops lines that recur with only the digits changed', () => {
		const header = (n: number) => `Journal 12 (2016) ${n}`;
		const lines = ['One.', header(1), 'Two.', header(2), 'Three.', header(3)];
		expect(dropFurniture(lines)).toEqual(['One.', 'Two.', 'Three.']);
	});

	it('glues a paragraph cut by a page break', () => {
		const lines = ['It was', 'Head 1', 'cut.', 'Head 2', 'Next.', 'Head 3'];
		expect(dropFurniture(lines)).toEqual(['It was cut.', 'Next.']);
	});

	it('keeps a finished sentence before a page break apart', () => {
		const lines = ['Done.', 'Head 1', 'New.', 'Head 2', 'x', 'Head 3'];
		expect(dropFurniture(lines)).toEqual(['Done.', 'New.', 'x']);
	});
});

describe('looksLikeCitation', () => {
	it.each(['Day & Hitchings 2011; Devine-Wright et al. 2014', 'IEA 2022', 'Tronto 1993: 103', 'e.g. Smith 2019', 'Smith, 2019', '2015', '2015: 103'])(
		'reads %s as a citation',
		(inner) => {
			expect(looksLikeCitation(inner)).toBe(true);
		},
	);

	it.each(['from 1990 to 2020', 'baseline year 2005', 'born 2001', 'see Directive 2010/31/EU', 'not light'])(
		'reads %s as prose',
		(inner) => {
			expect(looksLikeCitation(inner)).toBe(false);
		},
	);
});

describe('stripCitations', () => {
	it('drops a parenthetical citation and the space before punctuation', () => {
		expect(stripCitations('Use matters (Day & Hitchings 2011; Devine-Wright et al. 2014).')).toBe('Use matters.');
	});

	it('turns a narrative citation into prose', () => {
		expect(stripCitations('Ellsworth-Krebs et al. (2015) draw it')).toBe('Ellsworth-Krebs et al. draw it');
	});

	it('keeps a parenthetical without a year', () => {
		expect(stripCitations('Heat (not light) matters')).toBe('Heat (not light) matters');
	});

	it('keeps a year that is not an attribution', () => {
		expect(stripCitations('We sampled households (from 1990 to 2020) in three cities.')).toBe(
			'We sampled households (from 1990 to 2020) in three cities.',
		);
		expect(stripCitations('The policy (see Directive 2010/31/EU) applies.')).toBe('The policy (see Directive 2010/31/EU) applies.');
	});

	it('drops bracketed numeric citations', () => {
		expect(stripCitations('Prior work [1], [2] shows that transformers scale [3]-[5].')).toBe(
			'Prior work shows that transformers scale.',
		);
		expect(stripCitations('As shown [12,13].')).toBe('As shown.');
	});
});

describe('promoteHeading', () => {
	it('takes the depth from the numbering', () => {
		expect(promoteHeading('1. Introduction')).toBe('# Introduction');
		expect(promoteHeading('4.2.1 Technologism')).toBe('### Technologism');
	});

	it('treats a short shouted line as a section', () => {
		expect(promoteHeading('CONCLUSIONS')).toBe('# CONCLUSIONS');
	});

	it('treats a title-case section name as a section', () => {
		expect(promoteHeading('Abstract')).toBe('# Abstract');
		expect(promoteHeading('Materials and Methods')).toBe('# Materials and Methods');
	});

	it('leaves prose alone', () => {
		expect(promoteHeading('Households are more than that.')).toBe('Households are more than that.');
		expect(promoteHeading('NASA said so.')).toBe('NASA said so.');
		expect(promoteHeading('Introduction of the heat pump was slow.')).toBe('Introduction of the heat pump was slow.');
	});
});

describe('dropFrontMatter', () => {
	it('starts at the abstract', () => {
		expect(dropFrontMatter(['Journal', '# ABSTRACT', 'Text'])).toEqual(['# ABSTRACT', 'Text']);
	});

	it('starts at a title-case abstract', () => {
		expect(dropFrontMatter(['Journal', '# Abstract', 'Text'])).toEqual(['# Abstract', 'Text']);
	});

	it('keeps everything without an abstract', () => {
		expect(dropFrontMatter(['a', 'b'])).toEqual(['a', 'b']);
	});
});

describe('backMatter', () => {
	// Long enough in the body that the references heading falls in the back half,
	// which is the only place cutBackMatter will look for one.
	const body = 'Birds are nice, and this sentence is here to give the article enough weight that its back matter is actually at the back. '.repeat(4);
	const paper = ['Abstract', 'We counted birds.', '1. Introduction', body, '7. References', ref(1), ref(2)].join('\n');

	it('hands back exactly what cleanFulltext throws away', () => {
		expect(backMatter(paper)).toEqual(['# References', ref(1), ref(2)]);
	});

	it('agrees with cleanFulltext about where the article stops', () => {
		expect(cleanFulltext(paper)).not.toContain('Journal of Things');
	});

	it('is empty when the document has no back matter', () => {
		expect(backMatter(['Abstract', 'We counted birds.'].join('\n'))).toEqual([]);
	});

	it('has the headings promoted, so the reference list can be found in it', () => {
		expect(backMatter(paper)[0]).toBe('# References');
	});
});

describe('cleanFulltext', () => {
	it('reduces an article to its readable body', () => {
		expect(cleanFulltext(article).split('\n\n')).toEqual([
			'# ABSTRACT',
			'This paper asks what home means for energy use.',
			'# Introduction',
			'Households are more than sites of consumption. Ellsworth-Krebs et al. draw the distinction between house and home, and the distinction matters for policy.',
			'It also matters for method.',
			'## Scope',
			'We limit ourselves to heating (see the long aside here, which is a genuine remark that goes on and on for well over the length that any citation would reasonably reach in a normal paper, and only then mentions the year 2015).',
			'# CONCLUSIONS',
			'Home matters.',
		]);
	});

	it('starts at a title-case abstract and stops at a numbered references heading', () => {
		const out = cleanFulltext(
			['J. Ecol. 2020', 'Corresponding author: someone@example.org', 'Abstract', 'We counted birds [1].', '1. Introduction', 'Birds are nice.', '7. References', ref(1)].join(
				'\n',
			),
		);
		expect(out.split('\n\n')).toEqual(['# Abstract', 'We counted birds.', '# Introduction', 'Birds are nice.']);
	});
});
