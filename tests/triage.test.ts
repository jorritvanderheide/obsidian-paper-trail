import { describe, expect, it } from 'vitest';
import {
	applyStatusTag,
	applyTriage,
	arrivalReading,
	asks,
	iconOf,
	label,
	landing,
	NO_STATUS_TAGS,
	advance,
	PASS_TWO,
	readingOf,
	readTags,
	retiredTagCount,
	READING_ORDER,
	setTag,
	type Reading,
} from '../src/core/triage';

/** A literature note as it is created, before any decision. */
const untriaged = () => ({
	citekey: 'vanderhaerReframingHeatPump2026',
	reading: 'untriaged',
	tags: ['topic/heat-pumps'],
});

describe('applyTriage', () => {
	it('records the decision and the date', () => {
		const frontmatter: Record<string, unknown> = untriaged();
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-20');
		expect(frontmatter.reading).toBe('queued');
		expect(frontmatter['reading-date']).toBe('2026-09-20');
	});

	it('leaves the tags exactly as it found them', () => {
		// A paper's lifecycle is `reading`, in the frontmatter. Every tag on the
		// note belongs to whoever put it there.
		const frontmatter: Record<string, unknown> = untriaged();
		applyTriage(frontmatter, { reading: 'read', reason: null }, '2026-09-20');
		expect(frontmatter.tags).toEqual(['topic/heat-pumps']);
	});

	it('keeps the fields it does not own', () => {
		const frontmatter: Record<string, unknown> = untriaged();
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-20');
		expect(frontmatter.citekey).toBe('vanderhaerReframingHeatPump2026');
	});

	it('dates the first assessment', () => {
		const frontmatter: Record<string, unknown> = untriaged();
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-20');
		expect(frontmatter['triaged-date']).toBe('2026-09-20');
	});

	it('never moves the first assessment, however often the status changes', () => {
		const frontmatter: Record<string, unknown> = untriaged();
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-20');
		applyTriage(frontmatter, { reading: 'read', reason: null }, '2026-11-14');
		applyTriage(frontmatter, { reading: 'dropped', reason: 'changed my mind' }, '2027-02-01');

		expect(frontmatter['triaged-date']).toBe('2026-09-20');
		expect(frontmatter['reading-date']).toBe('2027-02-01');
	});

	it('records the reason on a drop', () => {
		const frontmatter: Record<string, unknown> = untriaged();
		applyTriage(frontmatter, { reading: 'dropped', reason: 'a review, not empirical' }, '2026-09-20');
		expect(frontmatter['reading-reason']).toBe('a review, not empirical');
	});

	it('clears the reason when a dropped paper is decided again', () => {
		const frontmatter: Record<string, unknown> = untriaged();
		applyTriage(frontmatter, { reading: 'dropped', reason: 'a review, not empirical' }, '2026-09-20');
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-21');

		expect(frontmatter.reading).toBe('queued');
		expect(frontmatter['reading-date']).toBe('2026-09-21');
		expect('reading-reason' in frontmatter).toBe(false);
	});

	it('replaces the reason when a paper is dropped twice for different reasons', () => {
		const frontmatter: Record<string, unknown> = untriaged();
		applyTriage(frontmatter, { reading: 'dropped', reason: 'first reason' }, '2026-09-20');
		applyTriage(frontmatter, { reading: 'dropped', reason: 'second reason' }, '2026-09-21');
		expect(frontmatter['reading-reason']).toBe('second reason');
	});

	it('leaves a tagged note alone, whatever the tags are', () => {
		const frontmatter: Record<string, unknown> = { tags: ['project/wp1', 'topic/heat-pumps'] };
		applyTriage(frontmatter, { reading: 'read', reason: null }, '2026-09-20');
		expect(frontmatter.tags).toEqual(['project/wp1', 'topic/heat-pumps']);
	});

	it('copes with a note that has no tags at all, and adds none', () => {
		const frontmatter: Record<string, unknown> = {};
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-20');
		expect('tags' in frontmatter).toBe(false);
		expect(frontmatter.reading).toBe('queued');
	});
});

describe('a decision writes no tags at all', () => {
	it('adds neither a domain nor a type, because nothing reads either on a paper', () => {
		const frontmatter: Record<string, unknown> = {};
		applyTriage(frontmatter, { reading: 'read', reason: null }, '2026-09-20');
		expect('tags' in frontmatter).toBe(false);
	});

	it('keeps what you set by hand rather than overwriting it on every decision', () => {
		const frontmatter: Record<string, unknown> = { tags: ['project/wp1', 'topic/heat-pumps'] };
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-20');
		expect(frontmatter.tags).toEqual(['project/wp1', 'topic/heat-pumps']);
	});
});

describe('a decision leaves sorted frontmatter', () => {
	it('sorts after writing', () => {
		const frontmatter: Record<string, unknown> = { year: 2026, aliases: ['x'], citekey: 'k' };
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-21');
		expect(Object.keys(frontmatter)).toEqual([...Object.keys(frontmatter)].sort());
	});

	it('is still a no-op the second time, order included', () => {
		const once: Record<string, unknown> = untriaged();
		applyTriage(once, { reading: 'read', reason: null }, '2026-09-21');
		const twice = { ...once };
		applyTriage(twice, { reading: 'read', reason: null }, '2026-09-21');
		expect(Object.keys(twice)).toEqual(Object.keys(once));
	});
});

describe('asks', () => {
	it('makes a drop say why, because that is the whole value of a drop', () => {
		expect(asks('dropped')).not.toBeNull();
	});

	it('makes a deferral name its condition, or the queue becomes a graveyard', () => {
		expect(asks('deferred')).not.toBeNull();
	});

	it('asks nothing of the decisions that leave a paper on the list', () => {
		expect(asks('queued')).toBeNull();
		expect(asks('read')).toBeNull();
		expect(asks('promoted')).toBeNull();
		expect(asks('untriaged')).toBeNull();
	});

	it('gives each question its own button, so neither says "OK"', () => {
		expect(asks('dropped')?.cta).toBe('Drop');
		expect(asks('deferred')?.cta).toBe('Defer');
	});
});

describe('PASS_TWO', () => {
	it('offers Keshav\'s three, plus abandoning a paper an hour in', () => {
		expect(PASS_TWO.map((entry) => entry.reading)).toEqual(['read', 'promoted', 'deferred', 'dropped']);
	});

	it('never offers a state that would send a read paper backwards', () => {
		expect(PASS_TWO.map((entry) => entry.reading)).not.toContain('queued');
		expect(PASS_TWO.map((entry) => entry.reading)).not.toContain('untriaged');
	});

	// Keshav's own test for the end of a second pass is that you can summarise
	// the paper to someone else, so the button claims exactly that and the next
	// screen asks you to make good on it. It used to say "Enough: I have what I
	// need", which is completion language for a paper that then does not leave.
	it('words the first as the test it is, not as a completion', () => {
		expect(PASS_TWO[0]?.label).toBe('I can summarise it');
	});

	it('gives every option a label', () => {
		for (const entry of PASS_TWO) expect(entry.label, entry.reading).toBeTruthy();
	});
});

describe('landing', () => {
	it('says something different for every state, so no two decisions look alike', () => {
		const all: Reading[] = [
			'untriaged',
			'dropped',
			'queued',
			'deferred',
			'read',
			'summarised',
			'promoted',
			'assessing',
			'assessed',
		];
		expect(new Set(all.map(landing)).size).toBe(all.length);
	});
});

describe('applyStatusTag', () => {
	it('writes nothing at all when no namespace is set', () => {
		const frontmatter: Record<string, unknown> = {};
		applyStatusTag(frontmatter, 'dropped', NO_STATUS_TAGS);
		expect('tags' in frontmatter).toBe(false);
	});

	it('mirrors the reading status under the namespace it is given', () => {
		const frontmatter: Record<string, unknown> = {};
		applyStatusTag(frontmatter, 'dropped', { current: 'status', retired: [] });
		expect(frontmatter.tags).toEqual(['status/dropped']);
	});

	// The namespace is a setting so it cannot collide with one a vault already
	// uses, which is only worth anything if it is actually honoured.
	it('uses a namespace of your own choosing', () => {
		const frontmatter: Record<string, unknown> = {};
		applyStatusTag(frontmatter, 'queued', { current: 'reading-state', retired: [] });
		expect(frontmatter.tags).toEqual(['reading-state/queued']);
	});

	it('replaces the old status rather than collecting them', () => {
		const frontmatter: Record<string, unknown> = { tags: ['status/untriaged'] };
		applyStatusTag(frontmatter, 'queued', { current: 'status', retired: [] });
		expect(frontmatter.tags).toEqual(['status/queued']);
	});

	// The one thing this must never do. Every other tag belongs to whoever put
	// it there.
	it('leaves every tag outside its namespace alone', () => {
		const frontmatter: Record<string, unknown> = { tags: ['project/wp1', 'topic/heat-pumps', 'status/untriaged'] };
		applyStatusTag(frontmatter, 'dropped', { current: 'status', retired: [] });
		expect(frontmatter.tags).toEqual(['project/wp1', 'status/dropped', 'topic/heat-pumps']);
	});

	it('reads tags written as a string, which is a shape Obsidian allows', () => {
		const frontmatter: Record<string, unknown> = { tags: 'topic/heat-pumps status/untriaged' };
		applyStatusTag(frontmatter, 'read', { current: 'status', retired: [] });
		expect(frontmatter.tags).toEqual(['status/read', 'topic/heat-pumps']);
	});
});

describe('applyTriage with a status tag', () => {
	it('keeps the frontmatter and the tag saying the same thing', () => {
		const frontmatter: Record<string, unknown> = {};
		applyTriage(frontmatter, { reading: 'dropped', reason: 'Out of scope' }, '2026-09-21', { current: 'status', retired: [] });
		expect(frontmatter.reading).toBe('dropped');
		expect(frontmatter.tags).toEqual(['status/dropped']);
	});

	it('writes no tag when the setting is empty, which is the default', () => {
		const frontmatter: Record<string, unknown> = {};
		applyTriage(frontmatter, { reading: 'dropped', reason: 'Out of scope' }, '2026-09-21');
		expect('tags' in frontmatter).toBe(false);
	});

	// Retriaging must not leave the previous answer behind in the tag either.
	it('moves the tag with the decision', () => {
		const frontmatter: Record<string, unknown> = { tags: ['status/dropped'] };
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-22', { current: 'status', retired: [] });
		expect(frontmatter.tags).toEqual(['status/queued']);
	});
});

describe('iconOf', () => {
	it('names an icon for every state, so no chooser can draw a blank', () => {
		const states: Reading[] = ['untriaged', 'dropped', 'queued', 'deferred', 'read', 'promoted'];
		for (const state of states) expect(iconOf(state), state).toBeTruthy();
	});

	it('gives each state its own, or two decisions would look like one', () => {
		const states: Reading[] = ['untriaged', 'dropped', 'queued', 'deferred', 'read', 'promoted'];
		expect(new Set(states.map(iconOf)).size).toBe(states.length);
	});
});

/**
 * One order for the six states, so a chooser and the pane behind it agree.
 */
describe('READING_ORDER', () => {
	it('holds every state exactly once', () => {
		const all: Reading[] = [
			'untriaged',
			'queued',
			'read',
			'summarised',
			'promoted',
			'assessing',
			'assessed',
			'deferred',
			'dropped',
		];
		expect([...READING_ORDER].sort()).toEqual([...all].sort());
	});

	// Untriaged is Triage, queued is Reading, read and promoted are Claim
	// and then Assessment, and the last two are the ways out.
	it('reads as the queue does, downwards', () => {
		expect(READING_ORDER).toEqual([
			'untriaged',
			'queued',
			'read',
			'summarised',
			'promoted',
			'assessing',
			'assessed',
			'deferred',
			'dropped',
		]);
	});

	// PASS_TWO is a subset: the four a second pass can end in. It was written
	// in Keshav's order and happens to agree, which is worth keeping true.
	it('agrees with the order the second pass offers its four', () => {
		const second = PASS_TWO.map((entry) => entry.reading);
		expect(second).toEqual(READING_ORDER.filter((reading) => second.includes(reading)));
	});
});

/**
 * What putting an item in Zotero meant, which is the one thing the plugin
 * cannot work out for itself.
 */
describe('arrivalReading', () => {
	it('arrives untriaged when the queue is to ask first', () => {
		expect(arrivalReading(true)).toBe('untriaged');
	});

	// Recording it as untriaged would be asking for a judgement already made:
	// the abstract was on the page, and the connector button was the answer.
	it('arrives queued when saving it to Zotero already was the first pass', () => {
		expect(arrivalReading(false)).toBe('queued');
	});

	it('never arrives anywhere a paper cannot come back from', () => {
		for (const triage of [true, false]) expect(asks(arrivalReading(triage))).toBeNull();
	});
});

/**
 * The tag helpers, which serve one caller: the status tag. They used to be the
 * vocabulary module's, back when the plugin owned a `domain/` axis and validated
 * values against a configured list. The axis went; these two stayed, because
 * writing one namespace into somebody's frontmatter without disturbing the rest
 * is still exactly what `applyStatusTag` has to do.
 */
describe('setTag', () => {
	it('replaces the value in its namespace', () => {
		expect(setTag(['status/untriaged', 'topic/heat-pumps'], 'status', 'queued')).toEqual([
			'status/queued',
			'topic/heat-pumps',
		]);
	});

	it('adds the tag when the note has none in that namespace', () => {
		expect(setTag(['topic/heat-pumps'], 'status', 'queued')).toEqual(['status/queued', 'topic/heat-pumps']);
	});

	it('drops the namespace entirely when given null', () => {
		expect(setTag(['status/queued', 'topic/heat-pumps'], 'status', null)).toEqual(['topic/heat-pumps']);
	});

	// The one thing it must never do.
	it('leaves every tag outside the namespace alone', () => {
		expect(setTag(['project/wp1', 'topic/heat-pumps'], 'status', 'dropped')).toEqual([
			'project/wp1',
			'status/dropped',
			'topic/heat-pumps',
		]);
	});

	// The Linter sorts tag arrays ascending. A note that comes back already
	// sorted does not show up as a diff the next time it runs.
	it('sorts, so a synced note is not a diff for the Linter to fix', () => {
		expect(setTag(['topic/heat-pumps', 'project/wp1'], 'status', 'queued')).toEqual([
			'project/wp1',
			'status/queued',
			'topic/heat-pumps',
		]);
	});

	it('does not mistake a longer namespace for its own', () => {
		expect(setTag(['status-of/mine'], 'status', 'queued')).toEqual(['status-of/mine', 'status/queued']);
	});
});

describe('readTags', () => {
	it('takes a list as it is', () => {
		expect(readTags(['project/wp1', 'topic/heat-pumps'])).toEqual(['project/wp1', 'topic/heat-pumps']);
	});

	// Obsidian allows tags written inline as a string, and a note written by
	// hand often is.
	it('splits a string on commas and spaces', () => {
		expect(readTags('project/wp1, topic/heat-pumps')).toEqual(['project/wp1', 'topic/heat-pumps']);
	});

	it('reads a note with no tags as no tags rather than failing', () => {
		expect(readTags(undefined)).toEqual([]);
		expect(readTags(null)).toEqual([]);
	});

	it('drops anything in the list that is not a string', () => {
		expect(readTags(['project/wp1', 3, null])).toEqual(['project/wp1']);
	});
});

describe('label', () => {
	it('gives every state a word, because an icon cannot be read aloud', () => {
		expect(READING_ORDER.map(label)).toEqual([
			'Untriaged',
			'Queued',
			'Read',
			'Summarised',
			'Promoted',
			'Assessing',
			'Assessed',
			'Deferred',
			'Dropped',
		]);
	});
});

/**
 * A `reading` value nothing here wrote. `RENAMED` exists because values get
 * renamed, so this is what a future spelling looks like to the version before
 * it, and what a typo in somebody's frontmatter looks like always.
 */
describe('readingOf', () => {
	it('passes through every state it knows', () => {
		for (const reading of READING_ORDER) expect(readingOf(reading)).toBe(reading);
	});

	it('reads the old spelling as what it is called now', () => {
		expect(readingOf('pass-three')).toBe('promoted');
	});

	// Untriaged rather than nothing: no opinion the machine can read has been
	// formed, and that is the answer that puts the paper back in front of you.
	it('reads a value it does not know as untriaged', () => {
		expect(readingOf('quued')).toBe('untriaged');
		expect(readingOf('something a future version writes')).toBe('untriaged');
	});

	it('reads a missing or non-string value as untriaged', () => {
		expect(readingOf(undefined)).toBe('untriaged');
		expect(readingOf(null)).toBe('untriaged');
		expect(readingOf(42)).toBe('untriaged');
	});
});

/**
 * The namespace is a name somebody chose, so it can be changed or cleared, and
 * a tag the plugin has stopped maintaining does not stop being read. Renaming
 * `literature` to `status` used to leave a paper you later dropped still saying
 * `literature/queued`, which is not stale but false.
 */
describe('a status tag written under an older setting', () => {
	it('is taken back out as the new one is written', () => {
		const frontmatter: Record<string, unknown> = { tags: ['literature/queued', 'topic/heat-pumps'] };
		applyTriage(frontmatter, { reading: 'dropped', reason: 'out of scope' }, '2026-02-01', {
			current: 'status',
			retired: ['literature'],
		});
		expect(frontmatter.tags).toEqual(['status/dropped', 'topic/heat-pumps']);
	});

	it('is taken back out when the setting has been cleared, leaving no status tag at all', () => {
		const frontmatter: Record<string, unknown> = { tags: ['literature/queued', 'topic/heat-pumps'] };
		applyTriage(frontmatter, { reading: 'dropped', reason: 'out of scope' }, '2026-02-01', {
			current: '',
			retired: ['literature'],
		});
		expect(frontmatter.tags).toEqual(['topic/heat-pumps']);
	});

	// The setting can be changed more than once, and the papers carrying the
	// first name do not heal when you pick a third.
	it('sheds every namespace the setting has held, not just the last', () => {
		const frontmatter: Record<string, unknown> = { tags: ['literature/queued', 'reading/queued'] };
		applyStatusTag(frontmatter, 'dropped', { current: 'status', retired: ['literature', 'reading'] });
		expect(frontmatter.tags).toEqual(['status/dropped']);
	});

	it('leaves the note with no tags key rather than an empty list', () => {
		const frontmatter: Record<string, unknown> = { tags: ['literature/queued'] };
		applyStatusTag(frontmatter, 'dropped', { current: '', retired: ['literature'] });
		expect('tags' in frontmatter).toBe(false);
	});

	// Out before in: renaming onto a namespace the note already carries must not
	// drop what was just written.
	it('keeps the new tag when the old namespace is the new one', () => {
		const frontmatter: Record<string, unknown> = { tags: ['status/queued'] };
		applyStatusTag(frontmatter, 'dropped', { current: 'status', retired: ['status'] });
		expect(frontmatter.tags).toEqual(['status/dropped']);
	});

	it('touches a note carrying nothing of ours not at all', () => {
		const frontmatter: Record<string, unknown> = {};
		applyStatusTag(frontmatter, 'dropped', NO_STATUS_TAGS);
		expect('tags' in frontmatter).toBe(false);
	});
});

describe('retiredTagCount', () => {
	it('counts the notes still carrying a namespace no longer written', () => {
		const notes = [['literature/queued'], ['status/dropped'], ['literature/dropped', 'topic/x'], []];
		expect(retiredTagCount(notes, ['literature'])).toBe(2);
	});

	it('counts a note once however many retired tags it carries', () => {
		expect(retiredTagCount([['literature/queued', 'reading/queued']], ['literature', 'reading'])).toBe(1);
	});

	it('is nothing at all when no namespace has been retired', () => {
		expect(retiredTagCount([['literature/queued']], [])).toBe(0);
	});

	// `literature` must not match `literature-review/x`, or a rename would
	// report notes it is never going to touch.
	it('matches the namespace rather than the start of a word', () => {
		expect(retiredTagCount([['literature-review/methods']], ['literature'])).toBe(0);
	});
});


/**
 * The tick on a Claim or Assessment row, as one step along the status.
 *
 * Pass completion used to live beside this field rather than in it: first read
 * off the prose under a heading, then as a date of its own. One axis is fewer
 * things to keep in step, and it is what makes reopening a pass an ordinary
 * change of status rather than a control of its own.
 */
describe('advance', () => {
	it('takes a read paper to summarised, which is the end of it', () => {
		expect(advance('read')).toBe('summarised');
		expect(advance('summarised')).toBeNull();
	});

	// The claim comes first either way: assessing a paper is an argument with
	// one you can already summarise.
	it('takes a promoted paper through the claim before the assessment', () => {
		expect(advance('promoted')).toBe('assessing');
		expect(advance('assessing')).toBe('assessed');
		expect(advance('assessed')).toBeNull();
	});

	it('has nothing to advance for a paper that owes no pass', () => {
		for (const reading of ['untriaged', 'queued', 'deferred', 'dropped'] as const) {
			expect(advance(reading), reading).toBeNull();
		}
	});

	// Every step lands on a state the rest of the list knows about, or a tick
	// would put a paper somewhere nothing can show it.
	it('only ever lands on a state the order knows', () => {
		for (const reading of READING_ORDER) {
			const next = advance(reading);
			if (next) expect(READING_ORDER).toContain(next);
		}
	});
});
