import { readFileSync } from 'node:fs';
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
	pdfBox,
	quotation,
	colorName,
	ANNOTATION_COLORS,
	itemYear,
	noteName,
	parseItemRef,
	readerUrl,
	annotationUrl,
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
describe('annotationUrl', () => {
	it('opens the reader at the annotation', () => {
		// The `annotation` parameter is read by Zotero's own open-pdf handler,
		// which turns to its page and selects it.
		expect(annotationUrl({ key: 'PARENT23', groupID: null }, 'ATTACH23', 'ANNOT234')).toBe(
			'zotero://open-pdf/library/items/ATTACH23?annotation=ANNOT234',
		);
	});

	it('uses the group path for a group library', () => {
		expect(annotationUrl({ key: 'PARENT23', groupID: 9 }, 'ATTACH23', 'ANNOT234')).toBe(
			'zotero://open-pdf/groups/9/items/ATTACH23?annotation=ANNOT234',
		);
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
		title: 'Mending quiet archive practices: a care perspective',
		date: '2026-08-11',
		citationKey: 'vanderlindMendingQuietArchive2026',
		creators: [
			{ creatorType: 'author', firstName: 'Ida', lastName: 'Van Der Lind' },
			{ creatorType: 'author', firstName: 'Tove', lastName: 'Kalmberg' },
		],
		...over,
	},
	meta: { parsedDate: '2026-08-11', ...meta },
});

describe('authorNames', () => {
	it('joins the split names in order', () => {
		expect(authorNames(paper())).toEqual(['Ida Van Der Lind', 'Tove Kalmberg']);
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
		expect(noteName(paper())).toBe('vanderlindMendingQuietArchive2026');
	});

	it('falls back to something stable without Better BibTeX', () => {
		expect(noteName(paper({ citationKey: undefined }))).toBe('vanderlind-mending-quiet-archive-practices-2026');
	});

	it('keeps a compound surname whole, as Better BibTeX does', () => {
		// Zotero stores the tussenvoegsel in lastName, so splitting a joined
		// name would turn "Van Der Lind" into "Lind".
		expect(noteName(paper({ citationKey: undefined }))).toMatch(/^vanderlind-/);
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
		expect(citation([{ citationKey: 'okaforAuthenticity2025' }])).toBe('[[okaforAuthenticity2025]]');
	});

	it('puts a page in the label, where you read it and the filter reads it', () => {
		expect(citation([{ citationKey: 'okaforAuthenticity2025', locator: '4', label: 'page' }])).toBe(
			'[[okaforAuthenticity2025|okaforAuthenticity2025, p. 4]]',
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
		expect(pageCitation('okaforAuthenticity2025', '4')).toBe('[[okaforAuthenticity2025|okaforAuthenticity2025, p. 4]]');
	});
});

describe('linkAt', () => {
	const line = 'as argued in [[okafor]] and [[marsh|Marsh]].';

	it('finds the link the cursor is inside', () => {
		expect(linkAt(line, 17)).toEqual({ from: 13, to: 23, target: 'okafor', label: null });
	});

	it('finds the link the cursor has just passed, where [[ leaves it', () => {
		expect(linkAt(line, 23)?.target).toBe('okafor');
	});

	it('reads the label', () => {
		expect(linkAt(line, 35)).toMatchObject({ target: 'marsh', label: 'Marsh' });
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
		expect(withPage(at('[[a|Marsh]]'), 'ch. 3')).toBe('[[a|Marsh, ch. 3]]');
		expect(withPage(at('[[a|Marsh, p. 3]]'), '4')).toBe('[[a|Marsh, p. 4]]');
		expect(withPage(at('[[a|Marsh, pp. 3, 6]]'), '4')).toBe('[[a|Marsh, p. 4]]');
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
			annotation({ annotationText: 'Care is not inherently good.', annotationComment: 'cf. Okafor', annotationPageLabel: '842' }),
		], true);
		expect(result).toEqual([
			{
				key: 'ANNOT001',
				text: 'Care is not inherently good.',
				comment: 'cf. Okafor',
				page: '842',
				sortIndex: '00001|000000|00000',
				color: null,
			},
		]);
	});

	it('sorts into document order, which sortIndex gives as text', () => {
		const result = annotations([
			annotation({ key: 'C', annotationSortIndex: '00010|000000|00000' }),
			annotation({ key: 'A', annotationSortIndex: '00002|000000|00000' }),
			annotation({ key: 'B', annotationSortIndex: '00002|000500|00000' }),
		], true);
		expect(result.map((h) => h.key)).toEqual(['A', 'B', 'C']);
	});

	it('keeps a comment-only annotation, which has no selected text', () => {
		expect(annotations([annotation({ annotationText: '', annotationComment: 'a thought' })], true)).toHaveLength(1);
	});

	it('drops an annotation that is neither text nor comment', () => {
		expect(annotations([annotation({ annotationText: '  ', annotationComment: '' })], true)).toHaveLength(0);
	});

	it('ignores anything that is not an annotation', () => {
		expect(annotations([paper()], true)).toEqual([]);
	});

	describe('with underlines off', () => {
		const underline = (over: Partial<ApiItem['data']> & { key?: string } = {}) =>
			annotation({ annotationType: 'underline', annotationText: 'trust', ...over });

		it('leaves out an underline with no comment', () => {
			expect(annotations([underline()], false)).toEqual([]);
		});

		it('keeps an underline you commented on', () => {
			expect(annotations([underline({ annotationComment: 'the paper never defines it' })], false)).toHaveLength(1);
		});

		it('counts a comment of only whitespace as none', () => {
			expect(annotations([underline({ annotationComment: '  \n' })], false)).toEqual([]);
		});

		it('keeps highlights and notes', () => {
			const result = annotations(
				[
					annotation({ key: 'H', annotationType: 'highlight' }),
					annotation({ key: 'N', annotationType: 'note', annotationText: '', annotationComment: 'a thought' }),
					underline({ key: 'U' }),
				],
				false,
			);
			expect(result.map((kept) => kept.key)).toEqual(['H', 'N']);
		});

		it('keeps every underline when they are on', () => {
			expect(annotations([underline()], true)).toHaveLength(1);
		});
	});
});

/**
 * Taken from the local API, so the shape is checked against Zotero rather than
 * against its documentation. The two disagree about `/children`.
 *
 * Its position is left out: nothing here reads it unless the sort index is
 * missing its offset.
 */
describe('annotations, against a real one', () => {
	const real: ApiItem = {
		key: '2SQ873XZ',
		data: {
			itemType: 'annotation',
			annotationType: 'highlight',
			annotationColor: '#ffd400',
			annotationText: 'The keeping of household records is central to archival policy, with the index card positioned as a key technology',
			annotationComment: '',
			annotationPageLabel: '840',
			annotationSortIndex: '00000|000566|00410',
		},
	};

	it('reads what Zotero actually sends', () => {
		expect(annotations([real], true)).toEqual([
			{
				key: '2SQ873XZ',
				text: 'The keeping of household records is central to archival policy, with the index card positioned as a key technology',
				comment: '',
				page: '840',
				sortIndex: '00000|000566|00410',
				color: 'yellow',
			},
		]);
	});

	it('keeps the printed page, which is what a citation needs', () => {
		expect(annotations([real], true)[0]?.page).toBe('840');
	});
});

/**
 * Zotero writes "page|000000|00000" for an annotation made on a page whose text
 * it had not loaded, which Reading Mode does. The rectangles are still right.
 */
describe('annotations Zotero gave no offset', () => {
	const at = (key: string, sortIndex: string, ...rects: number[][]): ApiItem => ({
		key,
		data: {
			itemType: 'annotation',
			annotationText: key,
			annotationSortIndex: sortIndex,
			annotationPosition: JSON.stringify({ pageIndex: Number(sortIndex.slice(0, 5)), rects }),
		},
	});
	const order = (items: ApiItem[]) => annotations(items, true).map((kept) => kept.key);

	it('puts them where they are on the page, not at its top', () => {
		// Page 7 of a real paper, one column. The two last highlights were made
		// in Reading Mode and came through with no offset.
		expect(
			order([
				at('earlier page', '00000|000166|00317', [132.5, 507, 224.2, 525]),
				at('foot, second', '00002|000000|00000', [248.5, 96, 508.8, 104], [77, 83.7, 515.3, 92]),
				at('foot, first', '00002|000000|00000', [223.6, 132.7, 506.8, 141], [77, 120.4, 355.8, 128.6]),
				at('top', '00002|000088|00121', [177, 713, 272.6, 721]),
				at('middle', '00002|003025|00539', [436.2, 294.7, 518.9, 303]),
				at('later page', '00003|000010|00050', [77, 700, 300, 710]),
			]),
		).toEqual(['earlier page', 'top', 'middle', 'foot, first', 'foot, second', 'later page']);
	});

	it('reads two columns down the left before the right', () => {
		const left = [60, 0, 290, 0];
		const right = [310, 0, 540, 0];
		const box = (column: number[], top: number) => [column[0] as number, top - 8, column[2] as number, top];
		expect(
			order([
				at('left top', '00004|000010|00100', box(left, 700)),
				at('right top', '00004|000900|00100', box(right, 700)),
				at('right bottom', '00004|001500|00600', box(right, 200)),
				at('left foot', '00004|000000|00000', box(left, 150)),
				at('right head', '00004|000000|00000', box(right, 760)),
			]),
		).toEqual(['left top', 'left foot', 'right head', 'right top', 'right bottom']);
	});

	it('goes by height on a page where nothing shares its column', () => {
		expect(
			order([
				at('high', '00001|000010|00100', [60, 690, 200, 700]),
				at('low', '00001|000500|00600', [60, 190, 200, 200]),
				at('wide figure note', '00001|000000|00000', [300, 400, 540, 410]),
			]),
		).toEqual(['high', 'wide figure note', 'low']);
	});

	it('leaves an annotation without rectangles where its sort index puts it', () => {
		const ink: ApiItem = { key: 'ink', data: { itemType: 'annotation', annotationComment: 'drawn', annotationSortIndex: '00002|000000|00000', annotationPosition: '{"pageIndex":2,"paths":[[1,2,3,4]]}' } };
		expect(order([at('placed', '00002|000100|00100', [60, 690, 200, 700]), ink])).toEqual(['ink', 'placed']);
	});
});

describe('colorName', () => {
	it('names every colour Zotero offers', () => {
		for (const [hex, name] of Object.entries(ANNOTATION_COLORS)) expect(colorName(hex)).toBe(name);
	});

	it('reads the hex in either case', () => {
		expect(colorName('#FF6666')).toBe('red');
	});

	it('has its colour drawn by styles.css, so the two lists stay in step', () => {
		const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
		for (const [hex, name] of Object.entries(ANNOTATION_COLORS)) {
			expect(css).toContain(`[data-callout-metadata='zotero-${name}'] {\n\t--callout-color: ${hex};`);
		}
	});

	it('gives no name to a colour that came with the PDF', () => {
		expect(colorName('#facd5a')).toBeNull();
		expect(colorName(undefined)).toBeNull();
		expect(colorName('')).toBeNull();
	});
});

describe('pdfBox', () => {
	it('is the rectangle around every rect', () => {
		expect(pdfBox('{"pageIndex":0,"rects":[[77,83.7,515.3,92],[248.5,96,508.8,104]]}')).toEqual([77, 83.7, 515.3, 104]);
	});

	it('is null for anything that is not PDF rectangles', () => {
		expect(pdfBox(undefined)).toBeNull();
		expect(pdfBox('not json')).toBeNull();
		expect(pdfBox('{"type":"FragmentSelector","value":"epubcfi(/6/4)"}')).toBeNull();
		expect(pdfBox('{"pageIndex":0,"rects":[]}')).toBeNull();
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
		expect(venueOf(of({ university: 'Northfield University' }))).toBe('Northfield University');
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
		expect(abstractOf(of('Semantic Scholar extracted view of "Mending quiet archive practices: a care perspective" by Ida van der Lind et al.'))).toBeNull();
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
		const [first] = annotations([{ key: 'K', data: { itemType: 'annotation', annotationText: 'written\n\ninformation' } }], true);
		expect(first?.text).toBe('written information');
	});
});

describe('quotation', () => {
	it('quotes the passage and cites its page', () => {
		expect(quotation('Care is not inherently good.', 'okafor2021', '842', '', '')).toBe(
			'> Care is not inherently good. [[okafor2021|okafor2021, p. 842]]',
		);
	});

	it('gives a page label that is not a number its p. too', () => {
		expect(quotation('A preface.', 'okafor2021', 'iv', '', '')).toBe('> A preface. [[okafor2021|okafor2021, p. iv]]');
	});

	it('cites the paper alone when there is no page', () => {
		expect(quotation('A web page.', 'okafor2021', null, '', '')).toBe('> A web page. [[okafor2021]]');
	});

	it('starts a paragraph of its own in the middle of a line', () => {
		expect(quotation('Quote.', 'a', null, 'As Okafor says:', ' and so on')).toBe('\n\n> Quote. [[a]]\n\n');
		expect(quotation('Quote.', 'a', null, '   ', '')).toBe('> Quote. [[a]]');
	});
});
