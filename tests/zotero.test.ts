import { describe, expect, it } from 'vitest';
import {
	abstractOf,
	venueOf,
	attachmentKeys,
	dataDirFromPrefs,
	formatItemRef,
	libraryPath,
	linkedKeys,
	authorNames,
	highlights,
	itemYear,
	noteName,
	parseItemRef,
	readerUrl,
	type ApiItem,
} from '../src/core/zotero';
describe('parseItemRef', () => {
	it('reads a personal library key', () => {
		expect(parseItemRef('ABCD2345')).toEqual({ key: 'ABCD2345', groupID: null });
	});
	it('reads a group library key', () => {
		expect(parseItemRef('ABCD2345g12')).toEqual({ key: 'ABCD2345', groupID: 12 });
	});
	it('rejects anything else', () => {
		expect(parseItemRef('abcd2345')).toBeNull();
		expect(parseItemRef('ABCD234')).toBeNull();
		expect(parseItemRef('ABCD2340')).toBeNull();
		expect(parseItemRef(42)).toBeNull();
		expect(parseItemRef(undefined)).toBeNull();
	});
	it('round-trips', () => {
		for (const value of ['ABCD2345', 'ABCD2345g12']) {
			const ref = parseItemRef(value);
			expect(ref && formatItemRef(ref)).toBe(value);
		}
	});
});
describe('libraryPath', () => {
	it('maps the personal library to users/0', () => {
		expect(libraryPath({ key: 'ABCD2345', groupID: null })).toBe('users/0');
		expect(libraryPath({ key: 'ABCD2345', groupID: 7 })).toBe('groups/7');
	});
});
describe('linkedKeys', () => {
	it('collects linked keys in order, without the item itself or duplicates', () => {
		const body = [
			'[Zotero](zotero://select/library/items/PARENT23)',
			'[paper.pdf](zotero://open/library/items/ATTACH23)',
			'[again](zotero://open-pdf/library/items/ATTACH23?page=2)',
			'[group](zotero://open/groups/5/items/GROUP234)',
		].join(' ');
		expect(linkedKeys(body, 'PARENT23')).toEqual(['ATTACH23', 'GROUP234']);
	});
});
describe('dataDirFromPrefs', () => {
	it('reads the data directory', () => {
		const prefs = 'user_pref("a", 1);\nuser_pref("extensions.zotero.dataDir", "/home/me/Zotero");\n';
		expect(dataDirFromPrefs(prefs)).toBe('/home/me/Zotero');
	});
	it('unescapes Windows paths', () => {
		const prefs = 'user_pref("extensions.zotero.dataDir", "C:\\\\Users\\\\me\\\\Zotero");';
		expect(dataDirFromPrefs(prefs)).toBe('C:\\Users\\me\\Zotero');
	});
	it('returns null when unset', () => {
		expect(dataDirFromPrefs('user_pref("a", 1);')).toBeNull();
	});
});
describe('attachmentKeys', () => {
	const item = (key: string, data: ApiItem['data']): ApiItem => ({ key, data });
	it('keeps file attachments, PDFs first', () => {
		const children = [
			item('NOTE2345', { itemType: 'note' }),
			item('HTML2345', { itemType: 'attachment', contentType: 'text/html', linkMode: 'imported_url' }),
			item('LINK2345', { itemType: 'attachment', linkMode: 'linked_url' }),
			item('PDF23456', { itemType: 'attachment', contentType: 'application/pdf', linkMode: 'imported_file' }),
		];
		expect(attachmentKeys(children)).toEqual(['PDF23456', 'HTML2345']);
	});
});
describe('readerUrl', () => {
	it('opens the reader rather than selecting the row', () => {
		expect(readerUrl({ key: 'PARENT23', groupID: null }, 'ATTACH23')).toBe('zotero://open-pdf/library/items/ATTACH23');
	});
	it('uses the group path for a group library', () => {
		expect(readerUrl({ key: 'PARENT23', groupID: 9 }, 'ATTACH23')).toBe('zotero://open-pdf/groups/9/items/ATTACH23');
	});
	it('addresses the attachment, never the parent item', () => {
		const url = readerUrl({ key: 'PARENT23', groupID: null }, 'ATTACH23');
		expect(url).toContain('ATTACH23');
		expect(url).not.toContain('PARENT23');
	});
});

/** An item as the local API really returns it, trimmed to the fields used. */
const paper = (over: Partial<ApiItem['data']> = {}, meta: ApiItem['meta'] = {}): ApiItem => ({
	key: '5UPN73EU',
	data: {
		itemType: 'journalArticle',
		title: 'Reframing heat pump transitions: a care perspective',
		date: '2026-08-11',
		citationKey: 'vanderhaerReframingHeatPump2026',
		creators: [
			{ creatorType: 'author', firstName: 'Jeltje', lastName: 'Van Der Haer' },
			{ creatorType: 'author', firstName: 'Renate', lastName: 'Schelwald' },
		],
		...over,
	},
	meta: { parsedDate: '2026-08-11', ...meta },
});

describe('authorNames', () => {
	it('joins the split names in order', () => {
		expect(authorNames(paper())).toEqual(['Jeltje Van Der Haer', 'Renate Schelwald']);
	});

	it('takes an institution as one name', () => {
		expect(authorNames(paper({ creators: [{ creatorType: 'author', name: 'IEA' }] }))).toEqual(['IEA']);
	});

	it('leaves out editors and translators', () => {
		const item = paper({
			creators: [
				{ creatorType: 'author', lastName: 'Smith' },
				{ creatorType: 'editor', lastName: 'Jones' },
			],
		});
		expect(authorNames(item)).toEqual(['Smith']);
	});

	it('is empty rather than undefined when there are no creators', () => {
		expect(authorNames(paper({ creators: undefined }))).toEqual([]);
	});
});

describe('itemYear', () => {
	it('prefers the date Zotero resolved', () => {
		expect(itemYear(paper({ date: 'in press' }, { parsedDate: '2026-08-11' }))).toBe(2026);
	});

	it('digs a year out of free text', () => {
		expect(itemYear(paper({ date: 'August 2019' }, { parsedDate: undefined }))).toBe(2019);
	});

	it('is null when there is no year to find', () => {
		expect(itemYear(paper({ date: 'forthcoming' }, { parsedDate: undefined }))).toBeNull();
	});
});

describe('noteName', () => {
	it('uses the Better BibTeX key when there is one', () => {
		expect(noteName(paper())).toBe('vanderhaerReframingHeatPump2026');
	});

	it('falls back to something stable without Better BibTeX', () => {
		expect(noteName(paper({ citationKey: undefined }))).toBe('vanderhaer-reframing-heat-pump-transitions-2026');
	});

	it('keeps a compound surname whole, as Better BibTeX does', () => {
		// Zotero stores the tussenvoegsel in lastName, so splitting a joined
		// name would turn "Van Der Haer" into "Haer".
		expect(noteName(paper({ citationKey: undefined }))).toMatch(/^vanderhaer-/);
	});

	it('uses an institution name when there is no person', () => {
		const item = paper({ citationKey: undefined, creators: [{ creatorType: 'author', name: 'IEA' }] });
		expect(noteName(item)).toMatch(/^iea-/);
	});

	it('does not produce a name with a slash or a colon in it', () => {
		const name = noteName(paper({ citationKey: undefined, title: 'A/B testing: what works?' }));
		expect(name).not.toMatch(/[/:]/);
	});

	it('copes with nothing to work from', () => {
		expect(noteName({ key: 'X', data: {} })).toBe('unknown-untitled');
	});
});

describe('highlights', () => {
	const annotation = (over: Partial<ApiItem['data']> & { key?: string } = {}): ApiItem => ({
		key: over.key ?? 'ANNOT001',
		data: { itemType: 'annotation', annotationText: 'some text', annotationSortIndex: '00001|000000|00000', ...over },
	});

	it('flattens an annotation to what a note needs', () => {
		const result = highlights([
			annotation({ annotationText: 'Care is not inherently good.', annotationComment: 'cf. Tronto', annotationPageLabel: '842' }),
		]);
		expect(result).toEqual([
			{
				key: 'ANNOT001',
				text: 'Care is not inherently good.',
				comment: 'cf. Tronto',
				page: '842',
				color: null,
				sortIndex: '00001|000000|00000',
			},
		]);
	});

	it('sorts into document order, which sortIndex gives as text', () => {
		const result = highlights([
			annotation({ key: 'C', annotationSortIndex: '00010|000000|00000' }),
			annotation({ key: 'A', annotationSortIndex: '00002|000000|00000' }),
			annotation({ key: 'B', annotationSortIndex: '00002|000500|00000' }),
		]);
		expect(result.map((h) => h.key)).toEqual(['A', 'B', 'C']);
	});

	it('keeps a comment-only annotation, which has no selected text', () => {
		expect(highlights([annotation({ annotationText: '', annotationComment: 'a thought' })])).toHaveLength(1);
	});

	it('drops an annotation that is neither text nor comment', () => {
		expect(highlights([annotation({ annotationText: '  ', annotationComment: '' })])).toHaveLength(0);
	});

	it('ignores anything that is not an annotation', () => {
		expect(highlights([paper()])).toEqual([]);
	});
});

/**
 * Taken verbatim from the local API, so the shape is checked against Zotero
 * rather than against its documentation. The two disagree about `/children`.
 */
describe('highlights, against a real annotation', () => {
	const real: ApiItem = {
		key: '2SQ873XZ',
		data: {
			itemType: 'annotation',
			annotationType: 'highlight',
			annotationText: 'The decarbonisation of domestic heating is central to climate policy, with the heat pump positioned as a key technology',
			annotationComment: '',
			annotationColor: '#ffd400',
			annotationPageLabel: '840',
			annotationSortIndex: '00000|000566|00410',
		},
	};

	it('reads what Zotero actually sends', () => {
		expect(highlights([real])).toEqual([
			{
				key: '2SQ873XZ',
				text: 'The decarbonisation of domestic heating is central to climate policy, with the heat pump positioned as a key technology',
				comment: '',
				page: '840',
				color: '#ffd400',
				sortIndex: '00000|000566|00410',
			},
		]);
	});

	it('keeps the printed page, which is what a citation needs', () => {
		expect(highlights([real])[0]?.page).toBe('840');
	});
});

describe('itemYear, beyond the last century', () => {
	it('reads a year before 1900', () => {
		expect(itemYear({ key: 'X', data: { date: '1867' } })).toBe(1867);
	});

	it('reads a year after 2099', () => {
		expect(itemYear({ key: 'X', data: { date: '2100-01-01' } })).toBe(2100);
	});

	it('is not fooled by a number that is not a year', () => {
		expect(itemYear({ key: 'X', data: { date: 'volume 12, issue 3' } })).toBeNull();
	});
});

describe('venueOf', () => {
	const of = (data: Record<string, string>): ApiItem => ({ key: 'ABCD2345', data });

	it('reads a journal article', () => {
		expect(venueOf(of({ publicationTitle: 'Energy Research & Social Science' }))).toBe('Energy Research & Social Science');
	});

	it('reads a conference paper, which keeps it somewhere else', () => {
		expect(venueOf(of({ proceedingsTitle: 'Proceedings of DIS 2026' }))).toBe('Proceedings of DIS 2026');
	});

	it('reads a book chapter as the book it is in, not the publisher who printed it', () => {
		expect(venueOf(of({ bookTitle: 'Designing Interactions', publisher: 'MIT Press' }))).toBe('Designing Interactions');
	});

	it('reads a thesis and a preprint', () => {
		expect(venueOf(of({ university: 'TU Eindhoven' }))).toBe('TU Eindhoven');
		expect(venueOf(of({ repository: 'arXiv' }))).toBe('arXiv');
	});

	it('falls back to the publisher when nothing more specific is there', () => {
		expect(venueOf(of({ publisher: 'Berg' }))).toBe('Berg');
	});

	it('ignores a field that is present but blank', () => {
		expect(venueOf(of({ publicationTitle: '   ', publisher: 'Berg' }))).toBe('Berg');
	});

	it('is null when the item says nothing about where it appeared', () => {
		expect(venueOf(of({}))).toBeNull();
	});
});

describe('abstractOf', () => {
	const of = (abstractNote?: string): ApiItem => ({ key: 'ABCD2345', data: { abstractNote } });

	it('reads the abstract Zotero holds', () => {
		expect(abstractOf(of('We report a field study of twelve households.'))).toBe('We report a field study of twelve households.');
	});

	it('trims it, because a saved abstract often arrives padded', () => {
		expect(abstractOf(of('  We report a field study.  '))).toBe('We report a field study.');
	});

	it('has none when Zotero has none', () => {
		expect(abstractOf(of())).toBeNull();
		expect(abstractOf(of('   '))).toBeNull();
	});

	// The connector saves whatever the page it was on describes itself as, and an
	// indexing site describes its own page. Left alone this shows in the triage
	// pane as the abstract, where it is the title handed back and settles nothing.
	it('refuses Semantic Scholar\'s page description, which is not an abstract', () => {
		expect(abstractOf(of('Semantic Scholar extracted view of "Reframing heat pump transitions: a care perspective" by Jeltje van der Haer et al.'))).toBeNull();
	});

	it('refuses it whatever case the page used', () => {
		expect(abstractOf(of('SEMANTIC SCHOLAR EXTRACTED VIEW OF "A paper" by Someone'))).toBeNull();
	});

	it('keeps a real abstract that merely mentions Semantic Scholar', () => {
		const real = 'We mined Semantic Scholar for citation graphs across four disciplines.';
		expect(abstractOf(of(real))).toBe(real);
	});
});
