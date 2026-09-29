import { describe, expect, it } from 'vitest';
import {
	abstractOf,
	venueOf,
	attachmentKeys,
	citation,
	itemRefOfUri,
	LOCATOR_LABELS,
	LOCATOR_TERMS,
	linkAt,
	pageCitation,
	typedLocator,
	withPage,
	libraryPath,
	authorNames,
	annotations,
	passage,
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
});
describe('libraryPath', () => {
	it('maps the personal library to users/0', () => {
		expect(libraryPath({ key: 'ABCD2345', groupID: null })).toBe('users/0');
		expect(libraryPath({ key: 'ABCD2345', groupID: 7 })).toBe('groups/7');
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

describe('citation', () => {
	it('links a bare key', () => {
		expect(citation([{ citationKey: 'jacobsAuthenticity2025' }])).toBe('[[jacobsAuthenticity2025]]');
	});

	it('puts a page in the label, where you read it and the filter reads it', () => {
		expect(citation([{ citationKey: 'jacobsAuthenticity2025', locator: '4', label: 'page' }])).toBe(
			'[[jacobsAuthenticity2025|jacobsAuthenticity2025, p. 4]]',
		);
	});

	it('abbreviates other locators as Better BibTeX does', () => {
		expect(citation([{ citationKey: 'a', locator: '3', label: 'chapter' }])).toBe('[[a|a, ch. 3]]');
	});

	it('keeps a label it has no abbreviation for', () => {
		expect(citation([{ citationKey: 'a', locator: '3', label: 'folio' }])).toBe('[[a|a, folio 3]]');
	});

	it('writes a locator without a label as it is', () => {
		expect(citation([{ citationKey: 'a', locator: '12', label: '' }])).toBe('[[a|a, 12]]');
	});

	it('ignores a label with no locator', () => {
		// Better BibTeX sends the label field either way.
		expect(citation([{ citationKey: 'a', locator: '', label: 'page' }])).toBe('[[a]]');
	});

	it('puts a prefix and a suffix in the label around the name, as pandoc puts them around the key', () => {
		const cited = citation([{ citationKey: 'a', locator: '4', label: 'page', prefix: 'see', suffix: 'emphasis added' }]);
		expect(cited).toBe('[[a|see a, p. 4 emphasis added]]');
	});

	it('closes up to a suffix that starts with punctuation', () => {
		const cited = citation([{ citationKey: 'a', locator: '4', label: 'page', suffix: ', emphasis added' }]);
		expect(cited).toBe('[[a|a, p. 4, emphasis added]]');
	});

	it('writes a label for a prefix alone', () => {
		expect(citation([{ citationKey: 'a', prefix: 'see' }])).toBe('[[a|see a]]');
	});

	it('leaves the author out with a - against the name, as pandoc does before the key', () => {
		expect(citation([{ citationKey: 'a', locator: '4', label: 'page', suppressAuthor: true }])).toBe('[[a|-a, p. 4]]');
		expect(citation([{ citationKey: 'a', prefix: 'see', suppressAuthor: true }])).toBe('[[a|see -a]]');
	});

	it('writes a label for leaving the author out alone', () => {
		expect(citation([{ citationKey: 'a', suppressAuthor: true }])).toBe('[[a|-a]]');
	});

	it("leaves the author out of a citation to the paper's note by its name", () => {
		const cited = citation([{ citationKey: 'newKey2025', locator: '4', label: 'page', suppressAuthor: true }], () => 'oldKey2025');
		expect(cited).toBe('[[oldKey2025|-oldKey2025, p. 4]]');
	});

	it("links to the paper's note by its name, which Better BibTeX may have left behind", () => {
		const cited = citation([{ citationKey: 'newKey2025', locator: '4', label: 'page' }], () => 'oldKey2025');
		expect(cited).toBe('[[oldKey2025|oldKey2025, p. 4]]');
	});

	it('writes only abbreviations it reads back as locators', () => {
		for (const label of Object.values(LOCATOR_LABELS)) expect(LOCATOR_TERMS).toContain(label);
	});

	it('separates several sources with a semicolon', () => {
		const cited = citation([{ citationKey: 'a', locator: '4', label: 'page' }, { citationKey: 'b' }]);
		expect(cited).toBe('[[a|a, p. 4]]; [[b]]');
	});

	it('leaves out a Zotero note, which has no key to link', () => {
		expect(citation([{ citationKey: '' }, { citationKey: 'b' }])).toBe('[[b]]');
		expect(citation([{ citationKey: '' }])).toBe('');
	});
});

describe('itemRefOfUri', () => {
	it('reads an item in the personal library', () => {
		expect(itemRefOfUri('http://zotero.org/users/local/abcdEFGH/items/ABCD2345')).toEqual({ key: 'ABCD2345', groupID: null });
		expect(itemRefOfUri('http://zotero.org/users/123456/items/ABCD2345')).toEqual({ key: 'ABCD2345', groupID: null });
	});

	it('reads an item in a group', () => {
		expect(itemRefOfUri('http://zotero.org/groups/5/items/ABCD2345')).toEqual({ key: 'ABCD2345', groupID: 5 });
	});

	it('reads nothing else', () => {
		expect(itemRefOfUri('http://zotero.org/users/local/x/collections/ABCD2345')).toBeNull();
		expect(itemRefOfUri('')).toBeNull();
	});
});

describe('typedLocator', () => {
	it('reads a bare number as a page', () => {
		expect(typedLocator('4')).toBe('p. 4');
		expect(typedLocator(' 12-14 ')).toBe('p. 12-14');
	});

	it('keeps anything else as typed', () => {
		expect(typedLocator('ch. 3')).toBe('ch. 3');
		expect(typedLocator('§ 2')).toBe('§ 2');
		expect(typedLocator('pp. 4, 6')).toBe('pp. 4, 6');
	});
});

describe('pageCitation', () => {
	it('writes the page into the label', () => {
		expect(pageCitation('jacobsAuthenticity2025', '4')).toBe('[[jacobsAuthenticity2025|jacobsAuthenticity2025, p. 4]]');
	});
});

describe('linkAt', () => {
	const line = 'as argued in [[jacobs]] and [[baker|Baker]].';

	it('finds the link the cursor is inside', () => {
		expect(linkAt(line, 17)).toEqual({ from: 13, to: 23, target: 'jacobs', label: null });
	});

	it('finds the link the cursor has just passed, where [[ leaves it', () => {
		expect(linkAt(line, 23)?.target).toBe('jacobs');
	});

	it('reads the label', () => {
		expect(linkAt(line, 35)).toMatchObject({ target: 'baker', label: 'Baker' });
	});

	it('finds nothing away from a link', () => {
		expect(linkAt(line, 5)).toBeNull();
	});

	it('leaves an embed alone', () => {
		expect(linkAt('![[figure.png]]', 5)).toBeNull();
	});
});

describe('withPage', () => {
	const at = (text: string) => linkAt(text, 2)!;

	it('names the link by its key', () => {
		expect(withPage(at('[[a]]'), '4')).toBe('[[a|a, p. 4]]');
	});

	it('replaces a page rather than adding a second', () => {
		expect(withPage(at('[[a|a, p. 3]]'), '4')).toBe('[[a|a, p. 4]]');
	});

	it('keeps a label of your own', () => {
		expect(withPage(at('[[a|Jacobs]]'), 'ch. 3')).toBe('[[a|Jacobs, ch. 3]]');
		expect(withPage(at('[[a|Jacobs, p. 3]]'), '4')).toBe('[[a|Jacobs, p. 4]]');
		expect(withPage(at('[[a|Jacobs, pp. 3, 6]]'), '4')).toBe('[[a|Jacobs, p. 4]]');
	});

	it('keeps what surrounds the name in a label that repeats it', () => {
		expect(withPage(at('[[a|see a]]'), '4')).toBe('[[a|see a, p. 4]]');
		expect(withPage(at('[[a|see a, p. 3, emphasis added]]'), '4')).toBe('[[a|see a, p. 4, emphasis added]]');
		expect(withPage(at('[[a|a, pp. 3, 6, emphasis added]]'), '4')).toBe('[[a|a, p. 4, emphasis added]]');
		expect(withPage(at('[[a|a emphasis added]]'), '4')).toBe('[[a|a, p. 4 emphasis added]]');
	});

	it('keeps a citation that leaves the author out as it is, around its new page', () => {
		expect(withPage(at('[[a|-a]]'), '4')).toBe('[[a|-a, p. 4]]');
		expect(withPage(at('[[a|see -a, p. 3, emphasis added]]'), '4')).toBe('[[a|see -a, p. 4, emphasis added]]');
	});

	it('does not take a word that only starts with the name for it', () => {
		expect(withPage(at('[[a|about]]'), '4')).toBe('[[a|about, p. 4]]');
	});

	it('drops a heading, because a page is not a section', () => {
		expect(withPage(at('[[a#Claim]]'), '4')).toBe('[[a|a, p. 4]]');
	});

	it('keeps a folder in the target but not in the label', () => {
		expect(withPage(at('[[Literature/a]]'), '4')).toBe('[[Literature/a|a, p. 4]]');
	});
});

describe('annotations', () => {
	const annotation = (over: Partial<ApiItem['data']> & { key?: string } = {}): ApiItem => ({
		key: over.key ?? 'ANNOT001',
		data: { itemType: 'annotation', annotationText: 'some text', annotationSortIndex: '00001|000000|00000', ...over },
	});

	it('flattens an annotation to what a note needs', () => {
		const result = annotations([
			annotation({ annotationText: 'Care is not inherently good.', annotationComment: 'cf. Tronto', annotationPageLabel: '842' }),
		]);
		expect(result).toEqual([
			{
				key: 'ANNOT001',
				text: 'Care is not inherently good.',
				comment: 'cf. Tronto',
				page: '842',
				sortIndex: '00001|000000|00000',
			},
		]);
	});

	it('sorts into document order, which sortIndex gives as text', () => {
		const result = annotations([
			annotation({ key: 'C', annotationSortIndex: '00010|000000|00000' }),
			annotation({ key: 'A', annotationSortIndex: '00002|000000|00000' }),
			annotation({ key: 'B', annotationSortIndex: '00002|000500|00000' }),
		]);
		expect(result.map((h) => h.key)).toEqual(['A', 'B', 'C']);
	});

	it('keeps a comment-only annotation, which has no selected text', () => {
		expect(annotations([annotation({ annotationText: '', annotationComment: 'a thought' })])).toHaveLength(1);
	});

	it('drops an annotation that is neither text nor comment', () => {
		expect(annotations([annotation({ annotationText: '  ', annotationComment: '' })])).toHaveLength(0);
	});

	it('ignores anything that is not an annotation', () => {
		expect(annotations([paper()])).toEqual([]);
	});
});

/**
 * Taken from the local API, so the shape is checked against Zotero rather than
 * against its documentation. The two disagree about `/children`.
 *
 * The real response also carries `annotationType: "highlight"` and
 * `annotationColor: "#ffd400"`. Neither is declared on `ApiItem` and neither is
 * read: nothing renders a colour, and the only annotations that reach here are
 * the ones `?itemType=annotation` returned.
 */
describe('annotations, against a real one', () => {
	const real: ApiItem = {
		key: '2SQ873XZ',
		data: {
			itemType: 'annotation',
			annotationText: 'The decarbonisation of domestic heating is central to climate policy, with the heat pump positioned as a key technology',
			annotationComment: '',
			annotationPageLabel: '840',
			annotationSortIndex: '00000|000566|00410',
		},
	};

	it('reads what Zotero actually sends', () => {
		expect(annotations([real])).toEqual([
			{
				key: '2SQ873XZ',
				text: 'The decarbonisation of domestic heating is central to climate policy, with the heat pump positioned as a key technology',
				comment: '',
				page: '840',
				sortIndex: '00000|000566|00410',
			},
		]);
	});

	it('keeps the printed page, which is what a citation needs', () => {
		expect(annotations([real])[0]?.page).toBe('840');
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

/**
 * A passage as one line. Zotero extracts a selection as laid out on the page,
 * so crossing a column or a page puts a break in the middle of a sentence.
 */
describe('passage', () => {
	// The one that was reported, verbatim: a column break mid-sentence.
	it('closes a blank line left by a column break', () => {
		expect(passage('The traditional mechanism for guaranteeing authenticity of written\n\ninformation uses a handwritten signature')).toBe(
			'The traditional mechanism for guaranteeing authenticity of written information uses a handwritten signature',
		);
	});

	it('closes a single line break, and a Windows one', () => {
		expect(passage('one\ntwo')).toBe('one two');
		expect(passage('one\r\ntwo')).toBe('one two');
	});

	it('collapses runs of spaces a PDF selection is full of', () => {
		expect(passage('  one   two  ')).toBe('one two');
	});

	// Keeps the hyphen, so a real compound survives and a split word still reads.
	it('closes up a word hyphenated across the break', () => {
		expect(passage('a well-\nknown result')).toBe('a well-known result');
	});

	// A dash with space before it is punctuation, not a split word.
	it('leaves a spaced dash at the break as a dash between words', () => {
		expect(passage('this -\nthat')).toBe('this - that');
	});

	it('is what annotations() reads the selected text through', () => {
		const [first] = annotations([{ key: 'K', data: { itemType: 'annotation', annotationText: 'written\n\ninformation' } }]);
		expect(first?.text).toBe('written information');
	});
});
