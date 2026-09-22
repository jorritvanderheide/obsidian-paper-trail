import { describe, expect, it } from 'vitest';
import {
	MANAGED_KEYS,
	applyPaperFrontmatter,
	REGION_END,
	REGION_START,
	paperFrontmatter,
	renderHighlight,
	renderHighlights,
	replaceRegion,
	fill,
	isPaper,
	managedDiffers,
	paperLinks,
	selectUrl,
} from '../src/core/paper-note';
import type { ApiItem, Highlight, ItemRef } from '../src/core/zotero';
import { PAPER } from '../src/core/templates';
import { DEFAULT_SETTINGS } from '../src/core/settings';

const ref: ItemRef = { key: '5UPN73EU', groupID: null };

const item: ApiItem = {
	key: '5UPN73EU',
	data: {
		itemType: 'journalArticle',
		title: 'Reframing heat pump transitions: a care perspective',
		shortTitle: 'Reframing heat pump transitions',
		date: '2026-08-11',
		citationKey: 'vanderhaerReframingHeatPump2026',
		creators: [
			{ creatorType: 'author', firstName: 'Jeltje', lastName: 'Van Der Haer' },
			{ creatorType: 'author', firstName: 'Freek', lastName: 'De Haan' },
		],
	},
	meta: { parsedDate: '2026-08-11' },
};

const highlight = (over: Partial<Highlight> = {}): Highlight => ({
	key: '2SQ873XZ',
	text: 'Care is not inherently good.',
	comment: '',
	page: '842',
	sortIndex: '00000|000566|00410',
	...over,
});

describe('paperFrontmatter', () => {
	it('prefers the short title', () => {
		expect(paperFrontmatter(item, ref, 'some-old-name').title).toBe('Reframing heat pump transitions');
	});

	// It used to be, and only when Zotero's short title differed from its long
	// one. That split the library arbitrarily: the papers findable by title were
	// the ones whose link came out a hundred characters long, and the rest could
	// not be found that way at all. One way to reach a paper is worth more.
	it('does not alias the full title, whether or not a short one exists', () => {
		const long = 'Reframing heat pump transitions: a care perspective';
		expect(paperFrontmatter(item, ref, 'some-old-name').aliases).not.toContain(long);

		const same = { ...item, data: { ...item.data, shortTitle: undefined } };
		expect(paperFrontmatter(same, ref, 'some-old-name').aliases).not.toContain(long);
	});

	// A citation is written as `[[key]]`, so the key has to find the paper. It
	// usually does by filename, because a paper with a key is named for it. A
	// note made before Better BibTeX was installed is not, and learns its key
	// later from a sync: the alias is what covers those.
	it('aliases the citation key when the file is called something else', () => {
		expect(paperFrontmatter(item, ref, 'some-old-name').aliases).toContain('vanderhaerReframingHeatPump2026');
	});

	// Aliasing a note to its own name lists it twice in the link suggester: once
	// as a file, once as an alias pointing at that file.
	it('does not alias the citation key when the file is already called that', () => {
		expect(paperFrontmatter(item, ref, 'vanderhaerReframingHeatPump2026').aliases).toEqual([]);
	});

	// Without Better BibTeX there is no key, so there is nothing to alias and
	// nothing to cite with either.
	it('aliases nothing at all when Zotero has no key to give', () => {
		const none = { ...item, data: { ...item.data, citationKey: undefined } };
		expect(paperFrontmatter(none, ref, 'some-old-name').aliases).toEqual([]);
	});

	it('keeps compound surnames whole', () => {
		expect(paperFrontmatter(item, ref, 'some-old-name').authors).toBe('Jeltje Van Der Haer, Freek De Haan');
	});

	it('is null rather than empty when Better BibTeX is absent', () => {
		const fm = paperFrontmatter({ ...item, data: { ...item.data, citationKey: undefined } }, ref, 'some-old-name');
		expect(fm.citekey).toBeNull();
	});

	it('writes only keys it declares as managed, plus the item key', () => {
		const fm = paperFrontmatter(item, ref, 'some-old-name');
		expect(Object.keys(fm).sort()).toEqual([...MANAGED_KEYS, 'itemKey'].sort());
	});

	it('does not claim the reading decision', () => {
		for (const key of ['reading', 'reading-date', 'triaged-date', 'reading-reason']) {
			expect(MANAGED_KEYS).not.toContain(key);
		}
	});
});

describe('selectUrl', () => {
	it('points at the item in the library', () => {
		expect(selectUrl(ref)).toBe('zotero://select/library/items/5UPN73EU');
	});

	it('uses the group path for a group item', () => {
		expect(selectUrl({ key: '5UPN73EU', groupID: 9 })).toBe('zotero://select/groups/9/items/5UPN73EU');
	});
});

describe('renderHighlight', () => {
	it('quotes the passage with its printed page and a derived id', () => {
		expect(renderHighlight(highlight())).toBe('> Care is not inherently good. (p. 842) ^zt-2SQ873XZ');
	});

	it('leaves out the page when Zotero has none', () => {
		expect(renderHighlight(highlight({ page: null }))).toBe('> Care is not inherently good. ^zt-2SQ873XZ');
	});

	it('puts a comment under its quote', () => {
		expect(renderHighlight(highlight({ comment: 'cf. Tronto' }))).toBe(
			'> Care is not inherently good. (p. 842) ^zt-2SQ873XZ\n\ncf. Tronto',
		);
	});

	it('renders a comment with no selected text', () => {
		expect(renderHighlight(highlight({ text: '', comment: 'a thought' }))).toBe('a thought');
	});

	it('gives the same id every time, so links survive a re-sync', () => {
		expect(renderHighlight(highlight())).toBe(renderHighlight(highlight()));
	});
});

describe('renderHighlights', () => {
	it('says so when there is nothing yet', () => {
		expect(renderHighlights([])).toContain('Nothing highlighted in Zotero yet');
	});

	it('keeps the order it is given', () => {
		const out = renderHighlights([highlight({ key: 'A', text: 'first' }), highlight({ key: 'B', text: 'second' })]);
		expect(out.indexOf('first')).toBeLessThan(out.indexOf('second'));
	});
});

describe('replaceRegion', () => {
	const body = [
		'# A paper',
		'',
		'## Claim',
		'',
		'It argues that care matters.',
		'',
		REGION_START,
		'## Highlights',
		'',
		'> old quote ^zt-OLD',
		REGION_END,
		'',
		'## My own section',
		'',
		'Something I wrote afterwards.',
	].join('\n');

	it('replaces only what is between the markers', () => {
		const out = replaceRegion(body, '## Highlights\n\n> new quote ^zt-NEW');
		expect(out).toContain('> new quote ^zt-NEW');
		expect(out).not.toContain('old quote');
	});

	it('does not touch a word the user wrote', () => {
		const out = replaceRegion(body, '## Highlights');
		expect(out).toContain('It argues that care matters.');
		expect(out).toContain('## My own section');
		expect(out).toContain('Something I wrote afterwards.');
	});

	it('is stable: syncing twice with the same content changes nothing', () => {
		const once = replaceRegion(body, '## Highlights\n\n> quote ^zt-A');
		expect(replaceRegion(once, '## Highlights\n\n> quote ^zt-A')).toBe(once);
	});

	it('appends a region rather than rebuilding a body that has none', () => {
		const plain = '# A paper\n\nI removed the highlights section.';
		const out = replaceRegion(plain, '## Highlights');
		expect(out).toContain('I removed the highlights section.');
		expect(out.indexOf(REGION_START)).toBeGreaterThan(out.indexOf('I removed'));
	});

	it('leaves a body alone when the markers are the wrong way round', () => {
		const broken = `${REGION_END}\ntext\n${REGION_START}`;
		expect(replaceRegion(broken, 'x')).toContain('text');
	});
});

describe('fill', () => {
	it('replaces what it is given', () => {
		expect(fill('# {{TITLE}}\n{{LINKS}}', { TITLE: 'A paper', LINKS: '[Zotero](x)' })).toBe('# A paper\n[Zotero](x)');
	});

	it('replaces every occurrence', () => {
		expect(fill('{{A}} and {{A}}', { A: 'x' })).toBe('x and x');
	});

	it('leaves an unknown placeholder standing rather than blanking a line', () => {
		// A typo in a user-edited template should show itself, not delete text.
		expect(fill('{{TITLE}} {{TYPOO}}', { TITLE: 'A' })).toBe('A {{TYPOO}}');
	});

	it('leaves a template with no placeholders alone', () => {
		expect(fill('plain text', { TITLE: 'A' })).toBe('plain text');
	});
});

describe('paperLinks', () => {
	it('links the item and the PDF', () => {
		expect(paperLinks(ref, '4VV8LYJ2')).toBe(
			'[Zotero](zotero://select/library/items/5UPN73EU) · [PDF](zotero://open-pdf/library/items/4VV8LYJ2)',
		);
	});

	it('links only the item when there is no attachment', () => {
		expect(paperLinks(ref, null)).toBe('[Zotero](zotero://select/library/items/5UPN73EU)');
	});
});

describe('the shipped paper template', () => {
	it('carries the region a sync may rewrite', () => {
		expect(PAPER).toContain(REGION_START);
		expect(PAPER).toContain(REGION_END);
	});

	it('asks for the claim heading rather than naming one', () => {
		// A literal would mean renaming the setting leaves new notes carrying a
		// heading the workflow is not watching, and nothing leaves Write up.
		expect(PAPER).toContain('## {{CLAIM}}');
		expect(fill(PAPER, { CLAIM: DEFAULT_SETTINGS.claimHeading })).toContain(`## ${DEFAULT_SETTINGS.claimHeading}`);
	});

	it('asks for the assessment heading rather than naming one', () => {
		// The third pass ends under this heading, so the same argument as the
		// claim applies: a literal means a promoted paper never leaves the list.
		expect(PAPER).toContain('## {{ASSESSMENT}}');
		expect(fill(PAPER, { ASSESSMENT: DEFAULT_SETTINGS.assessmentHeading })).toContain(`## ${DEFAULT_SETTINGS.assessmentHeading}`);
	});

	it('uses only placeholders the command supplies', () => {
		const used = [...PAPER.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]);
		expect(used.sort()).toEqual(['ASSESSMENT', 'CLAIM', 'LINKS', 'TITLE']);
	});
});

/**
 * The frontmatter half of the safety story. A sync reads Zotero, and Zotero
 * knows nothing about what the user decided or wrote.
 */
describe('applyPaperFrontmatter', () => {
	const managed = () => paperFrontmatter(item, ref, 'some-old-name');

	/** A note that has been lived in: triaged, tagged, and annotated by hand. */
	const lived = (): Record<string, unknown> => ({
		title: 'an old title',
		reading: 'finished',
		'reading-date': '2026-11-14',
		'triaged-date': '2026-09-20',
		'reading-reason': 'kept for the method',
		tags: ['project/wp1', 'topic/heat-pumps'],
		'my-own-field': 'do not touch',
	});

	it('refreshes the managed keys', () => {
		const fm = lived();
		applyPaperFrontmatter(fm, managed(), null, 'zotero-key');
		expect(fm.title).toBe('Reframing heat pump transitions');
		expect(fm.citekey).toBe('vanderhaerReframingHeatPump2026');
		expect(fm['zotero-key']).toBe('5UPN73EU');
	});

	it('does not reset the reading decision', () => {
		const fm = lived();
		applyPaperFrontmatter(fm, managed(), null, 'zotero-key');
		expect(fm.reading).toBe('finished');
		expect(fm['reading-date']).toBe('2026-11-14');
		expect(fm['triaged-date']).toBe('2026-09-20');
		expect(fm['reading-reason']).toBe('kept for the method');
	});

	it('does not touch a field it never heard of', () => {
		const fm = lived();
		applyPaperFrontmatter(fm, managed(), null, 'zotero-key');
		expect(fm['my-own-field']).toBe('do not touch');
	});

	it('does not restamp the tags on a sync', () => {
		const fm = lived();
		applyPaperFrontmatter(fm, managed(), null, 'zotero-key');
		expect(fm.tags).toEqual(['project/wp1', 'topic/heat-pumps']);
	});

	it('stamps the reading state on creation, and no tags', () => {
		// The reading state is the whole of a paper's lifecycle. Filing is the
		// user's business, so a new paper arrives carrying no tag of ours at all.
		const fm: Record<string, unknown> = {};
		applyPaperFrontmatter(fm, managed(), 'untriaged', 'zotero-key');
		expect(fm.reading).toBe('untriaged');
		expect('tags' in fm).toBe(false);
	});

	it('leaves tags you added yourself alone on creation', () => {
		const fm: Record<string, unknown> = { tags: ['topic/heat-pumps'] };
		applyPaperFrontmatter(fm, managed(), 'untriaged', 'zotero-key');
		expect(fm.tags).toEqual(['topic/heat-pumps']);
	});

	it('removes a citation key that Better BibTeX no longer provides', () => {
		const fm: Record<string, unknown> = { citekey: 'oldKey2020' };
		applyPaperFrontmatter(fm, paperFrontmatter({ ...item, data: { ...item.data, citationKey: undefined } }, ref, 'some-old-name'), null, 'zotero-key');
		expect('citekey' in fm).toBe(false);
	});

	it('takes out a key the plugin has stopped writing, so old notes tidy themselves', () => {
		// `attachment` was dropped: it showed an opaque Zotero id in every note's
		// properties to save one localhost request, and was preferred over what
		// Zotero offered now, so a replaced PDF left the note reading annotations
		// off an attachment that had gone.
		const fm: Record<string, unknown> = { attachment: '4VV8LYJ2', reading: 'finished' };
		applyPaperFrontmatter(fm, paperFrontmatter(item, ref, 'some-old-name'), null, 'zotero-key');
		expect('attachment' in fm).toBe(false);
		expect(fm.reading).toBe('finished');
	});

	it('is stable: syncing twice changes nothing the second time', () => {
		const once = lived();
		applyPaperFrontmatter(once, managed(), null, 'zotero-key');
		const twice = { ...once };
		applyPaperFrontmatter(twice, managed(), null, 'zotero-key');
		expect(twice).toEqual(once);
	});
});

describe('the region breathes', () => {
	it('opens straight onto the contents, with no blank line to push them down', () => {
		const out = replaceRegion('# A paper', '## Highlights\n\n> a quote ^zt-A');
		expect(out).toContain(`${REGION_START}\n## Highlights`);
	});

	it('keeps the blank line before the closing marker, so the last quote is not flush against it', () => {
		const out = replaceRegion('# A paper', '## Highlights\n\n> a quote ^zt-A');
		expect(out).toContain(`> a quote ^zt-A\n\n${REGION_END}`);
	});

	it('does not accumulate blank lines across syncs', () => {
		const once = replaceRegion('# A paper', '## Highlights');
		const twice = replaceRegion(once, '## Highlights');
		expect(twice).toBe(once);
	});
});

describe('the item key property is configurable at both ends', () => {
	it('writes the key under the configured name', () => {
		const fm: Record<string, unknown> = {};
		applyPaperFrontmatter(fm, paperFrontmatter(item, ref, 'some-old-name'), null, 'citekey-zotero');
		expect(fm['citekey-zotero']).toBe('5UPN73EU');
		expect('zotero-key' in fm).toBe(false);
	});

	it('defaults to the name everything else reads', () => {
		const fm: Record<string, unknown> = {};
		applyPaperFrontmatter(fm, paperFrontmatter(item, ref, 'some-old-name'), null, 'zotero-key');
		expect(fm['zotero-key']).toBe('5UPN73EU');
	});

	it('never leaves the internal name in the note', () => {
		// `itemKey` is how the value travels, not what it is called on disk.
		const fm: Record<string, unknown> = {};
		applyPaperFrontmatter(fm, paperFrontmatter(item, ref, 'some-old-name'), null, 'zotero-key');
		expect('itemKey' in fm).toBe(false);
	});
});

describe('the frontmatter a paper ends up with', () => {
	it('is in alphabetical order', () => {
		const fm: Record<string, unknown> = {};
		applyPaperFrontmatter(fm, paperFrontmatter(item, ref, 'some-old-name'), 'untriaged', 'zotero-key');
		expect(Object.keys(fm)).toEqual([...Object.keys(fm)].sort());
	});

	it('sorts a user own keys in with the managed ones', () => {
		const fm: Record<string, unknown> = { supervisor: 'Hanna', 'my-own-field': 'x' };
		applyPaperFrontmatter(fm, paperFrontmatter(item, ref, 'some-old-name'), null, 'zotero-key');
		expect(Object.keys(fm)).toEqual([...Object.keys(fm)].sort());
		expect(fm.supervisor).toBe('Hanna');
	});
});

/**
 * The guard that makes syncing on every open safe. A paper nobody has touched
 * in Zotero has to come back from a sync with nothing written, or opening a
 * note becomes a modification and two machines start fighting over it.
 */
describe('managedDiffers', () => {
	const managed = () => paperFrontmatter(item, ref, 'some-old-name');

	/** What a synced note's frontmatter looks like: managed keys, plus the user's. */
	const synced = (): Record<string, unknown> => {
		const out: Record<string, unknown> = {};
		applyPaperFrontmatter(out, managed(), null, 'zotero-key');
		return out;
	};

	it('is false for a note that is already up to date', () => {
		expect(managedDiffers(synced(), managed(), 'zotero-key')).toBe(false);
	});

	it('ignores the keys it does not own, however many of them there are', () => {
		const lived = { ...synced(), reading: 'finished', 'reading-reason': 'a review', tags: ['topic/heat-pumps'], mine: 1 };
		expect(managedDiffers(lived, managed(), 'zotero-key')).toBe(false);
	});

	it('ignores key order, because a differently sorted note is not out of date', () => {
		const reversed = Object.fromEntries(Object.entries(synced()).reverse());
		expect(managedDiffers(reversed, managed(), 'zotero-key')).toBe(false);
	});

	it('sees a title changed in Zotero', () => {
		expect(managedDiffers({ ...synced(), title: 'something else' }, managed(), 'zotero-key')).toBe(true);
	});

	it('sees an alias list that has changed', () => {
		expect(managedDiffers({ ...synced(), aliases: ['nope'] }, managed(), 'zotero-key')).toBe(true);
	});

	it('sees a managed key that is missing altogether', () => {
		const missing = synced();
		delete missing.authors;
		expect(managedDiffers(missing, managed(), 'zotero-key')).toBe(true);
	});

	it('sees a managed key that should be gone but is not', () => {
		// The citation key disappears when Better BibTeX is uninstalled.
		const stale = { ...synced(), citekey: 'leftBehind2020' };
		expect(managedDiffers(stale, paperFrontmatter({ ...item, data: { ...item.data, citationKey: undefined } }, ref, 'some-old-name'), 'zotero-key')).toBe(true);
	});

	it('sees a retired key still on the note, or the sync that removes it never runs', () => {
		expect(managedDiffers({ ...synced(), attachment: '4VV8LYJ2' }, managed(), 'zotero-key')).toBe(true);
	});

	it('is satisfied once that key is gone', () => {
		expect(managedDiffers(synced(), managed(), 'zotero-key')).toBe(false);
	});

	it('sees a note that has never been synced at all', () => {
		expect(managedDiffers({}, managed(), 'zotero-key')).toBe(true);
		expect(managedDiffers(undefined, managed(), 'zotero-key')).toBe(true);
	});

	it('notices the item key property moving, under whichever name it is read', () => {
		expect(managedDiffers(synced(), managed(), 'citekey-field')).toBe(true);
	});
});

describe('isPaper', () => {
	it('is a paper when it names a Zotero item under the configured property', () => {
		expect(isPaper({ 'zotero-key': '5UPN73EU' }, 'zotero-key')).toBe(true);
	});

	it('is not a paper under a different property', () => {
		expect(isPaper({ 'zotero-key': '5UPN73EU' }, 'citekey')).toBe(false);
	});

	it('is not a paper when the key is there but is not a string', () => {
		expect(isPaper({ 'zotero-key': 42 }, 'zotero-key')).toBe(false);
		expect(isPaper({ 'zotero-key': null }, 'zotero-key')).toBe(false);
	});

	it('still counts a key that is malformed, because every other rule does', () => {
		// The triage dialog has to open for these or they stay in Triage forever.
		expect(isPaper({ 'zotero-key': 'nonsense' }, 'zotero-key')).toBe(true);
	});

	it('copes with a note that has no frontmatter at all', () => {
		expect(isPaper(undefined, 'zotero-key')).toBe(false);
		expect(isPaper({}, 'zotero-key')).toBe(false);
	});
});

/**
 * A note written under the old `%%` markers.
 *
 * They were swapped for HTML comments because the metadata cache has to agree
 * about what they are: the region opens directly under the assessment heading,
 * and Obsidian read a `%%` line as prose, so every paper promoted to a third
 * pass looked like it had already had one.
 *
 * The risk in swapping them is one thing, and these are here for it: a note
 * whose old region is not recognised gets a second one appended below the
 * first, which is the region duplicated and the highlights written twice.
 */
describe('replaceRegion, converting the old markers', () => {
	const legacy = ['# A paper', '', '## Claim', '', '## Assessment', '', '%%paper-trail%%', '## Highlights', '', '> old', '', '%%/paper-trail%%', ''].join('\n');

	it('finds the old region rather than appending a second one', () => {
		const out = replaceRegion(legacy, '## Highlights\n\n> new');
		expect(out.match(/<!--paper-trail-->/g)).toHaveLength(1);
		expect(out).not.toContain('%%');
	});

	it('writes the new markers in its place', () => {
		const out = replaceRegion(legacy, '## Highlights');
		expect(out).toContain('<!--paper-trail-->');
		expect(out).toContain('<!--/paper-trail-->');
	});

	it('keeps every word outside the region, which is the whole promise', () => {
		const out = replaceRegion(legacy, '## Highlights');
		expect(out).toContain('# A paper');
		expect(out).toContain('## Claim');
		expect(out).toContain('## Assessment');
	});

	it('loses the old contents of the region, which is what replacing it means', () => {
		expect(replaceRegion(legacy, '## Highlights')).not.toContain('> old');
	});

	it('is a no-op the second time, because the region is now the new one', () => {
		const once = replaceRegion(legacy, '## Highlights\n\n> new');
		expect(replaceRegion(once, '## Highlights\n\n> new')).toBe(once);
	});

	// Someone's own prose below the region has to survive the swap too.
	it('keeps what follows the old region', () => {
		const after = `${legacy}\n## My own notes\n\nkept\n`;
		expect(replaceRegion(after, '## Highlights')).toContain('## My own notes');
	});
});
