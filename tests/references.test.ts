import { describe, expect, it } from 'vitest';
import { glance, referenceLines, type KnownPaper } from '../src/core/references';

const known = (over: Partial<KnownPaper> = {}): KnownPaper => ({
	path: 'Literature/a.md',
	titles: ['What home means for energy use'],
	reading: 'finished',
	...over,
});

describe('referenceLines', () => {
	it('takes everything after the references heading', () => {
		const back = [
			'# References',
			'Day, R., Hitchings, R., 2011. Only old ladies would do that. Health & Place 17, 885-894.',
			'Shove, E., 2003. Comfort, Cleanliness and Convenience. Berg, Oxford.',
		];
		expect(referenceLines(back)).toHaveLength(2);
	});

	it('finds the list when the journal puts other back matter first', () => {
		const back = [
			'# Acknowledgements',
			'This work was funded by a grant from somewhere, number 1234, which we are grateful for.',
			'# References',
			'Day, R., Hitchings, R., 2011. Only old ladies would do that. Health & Place 17, 885-894.',
		];
		expect(referenceLines(back)).toEqual([
			'Day, R., Hitchings, R., 2011. Only old ladies would do that. Health & Place 17, 885-894.',
		]);
	});

	it('drops the lines around the list that carry no year', () => {
		const back = [
			'# References',
			'Day, R., Hitchings, R., 2011. Only old ladies would do that. Health & Place 17, 885-894.',
			'Author contributions: all authors contributed equally to the writing of this manuscript.',
		];
		expect(referenceLines(back)).toHaveLength(1);
	});

	it('keeps a short numbered entry the cleaner promoted to a heading', () => {
		const back = ['# References', '# Shove, E., 2003. Comfort, Cleanliness and Convenience. Berg.'];
		expect(referenceLines(back)).toEqual(['Shove, E., 2003. Comfort, Cleanliness and Convenience. Berg.']);
	});

	it('takes a nineteenth century date, because the humanities cite that far back', () => {
		const back = ['# Bibliography', 'Ruskin, J., 1867. Time and Tide by Weare and Tyne. Smith, Elder and Co.'];
		expect(referenceLines(back)).toHaveLength(1);
	});

	it('is empty when there is no references heading at all', () => {
		expect(referenceLines(['# Acknowledgements', 'Thanks to everyone involved in this work, 2016.'])).toEqual([]);
	});

	it('is empty on a document with no back matter', () => {
		expect(referenceLines([])).toEqual([]);
	});
});

describe('glance', () => {
	const lines = [
		'Day, R., Hitchings, R., 2011. What home means for energy use. Health & Place 17, 885-894.',
		'Shove, E., 2003. Comfort, Cleanliness and Convenience. Berg, Oxford.',
	];

	it('counts the entries whether or not any of them are known', () => {
		expect(glance(lines, []).total).toBe(2);
		expect(glance(lines, []).known).toEqual([]);
	});

	it('matches a paper by its title', () => {
		expect(glance(lines, [known()]).known).toHaveLength(1);
	});

	it('matches through the spacing and punctuation a reference list changes', () => {
		expect(glance(['Day 2011. What Home Means, for Energy Use. Health & Place.'], [known()]).known).toHaveLength(1);
	});

	it('matches through a word broken across a line by the extractor', () => {
		const paper = known({ titles: ['A framework for domestic comfort'] });
		expect(glance(['Shove, E., 2003. A frame- work for domestic comfort. Berg.'], [paper]).known).toHaveLength(1);
	});

	it('matches on an alias, because the note is titled with the short title', () => {
		const paper = known({ titles: ['Only old ladies', 'What home means for energy use'] });
		expect(glance(lines, [paper]).known).toHaveLength(1);
	});

	it('counts a paper once however many of its titles match', () => {
		const paper = known({ titles: ['What home means for energy use', 'What home means for energy use'] });
		expect(glance(lines, [paper]).known).toHaveLength(1);
	});

	it('will not match on a title too short to prove anything', () => {
		expect(glance(lines, [known({ titles: ['Home'] })]).known).toEqual([]);
		expect(glance(lines, [known({ titles: ['Energy use'] })]).known).toEqual([]);
	});

	it('will not let a match span two entries', () => {
		// Runs off the end of the first entry and into the start of the second,
		// which is a match only if the two were squashed together.
		const paper = known({ titles: ['885 894 Shove E 2003 Comfort'] });
		expect(glance(lines, [paper]).known).toEqual([]);
	});

	it('puts the papers you dropped first, because those are the ones worth seeing', () => {
		const papers = [
			known({ path: 'a.md', titles: ['What home means for energy use'], reading: 'finished' }),
			known({ path: 'b.md', titles: ['Comfort, Cleanliness and Convenience'], reading: 'dropped' }),
		];
		expect(glance(lines, papers).known.map((paper) => paper.path)).toEqual(['b.md', 'a.md']);
	});

	it('ranks a deferred paper behind a dropped one and ahead of a read one', () => {
		const papers = [
			known({ path: 'read.md', titles: ['What home means for energy use'], reading: 'finished' }),
			known({ path: 'deferred.md', titles: ['Comfort, Cleanliness and Convenience'], reading: 'deferred' }),
		];
		expect(glance(lines, papers).known.map((paper) => paper.path)).toEqual(['deferred.md', 'read.md']);
	});

	it('treats a paper with no reading field as untriaged rather than dropping it', () => {
		expect(glance(lines, [known({ reading: null })]).known).toHaveLength(1);
	});
});
