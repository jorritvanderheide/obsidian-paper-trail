import { describe, expect, it } from 'vitest';
import {
	applyStatusTag,
	applyTriage,
	arrivalReading,
	asks,
	iconOf,
	judgementIcon,
	label,
	landing,
	NO_STATUS_TAGS,
	PASS_TWO,
	READ_AGAIN,
	readTags,
	retiredTagCount,
	progressOf,
	PROGRESS_ORDER,
	READING_ORDER,
	setTag,
	stateOf,
	type Reading,
	type State,
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
		applyTriage(frontmatter, { reading: 'queued', progress: 'read', reason: null }, '2026-09-20');
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
		applyTriage(frontmatter, { reading: 'queued', progress: 'read', reason: null }, '2026-11-14');
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
		applyTriage(frontmatter, { reading: 'queued', progress: 'read', reason: null }, '2026-09-20');
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
		applyTriage(frontmatter, { reading: 'queued', progress: 'read', reason: null }, '2026-09-20');
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
		applyTriage(once, { reading: 'queued', progress: 'read', reason: null }, '2026-09-21');
		const twice = { ...once };
		applyTriage(twice, { reading: 'queued', progress: 'read', reason: null }, '2026-09-21');
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
		expect(asks('queued')).toBeNull();
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
		expect(PASS_TWO.map((entry) => entry.reading)).toEqual(['queued', 'promoted', 'deferred', 'dropped']);
	});

	it('never sends a read paper back to be triaged', () => {
		expect(PASS_TWO.map((entry) => entry.reading)).not.toContain('untriaged');
	});

	// The two that mean you engaged with the paper record the reading as done.
	// The two that end it leave progress alone, so picking the paper up again
	// returns it to where it was rather than to the start.
	it('records the reading only on the two that finished it', () => {
		expect(PASS_TWO.filter((entry) => entry.progress === 'read').map((entry) => entry.reading)).toEqual([
			'queued',
			'promoted',
		]);
		expect(PASS_TWO.filter((entry) => entry.progress === undefined).map((entry) => entry.reading)).toEqual([
			'deferred',
			'dropped',
		]);
	});

	// One question, one grammar. These were a first-person statement, two
	// verdicts and an imperative, which is four shapes for four answers to one
	// question. They are verdicts on the paper now, because that is what the
	// question asks for.
	//
	// The first gave up something real: Keshav's own test for the end of a
	// second pass is that you can summarise the paper to someone else, which is
	// a claim about you rather than about the paper. It survives in the Claim
	// section's tooltip and in the question asked at the heading.
	it('answers the one question in one grammar', () => {
		expect(PASS_TWO.map((entry) => entry.label)).toEqual([
			'Worth summarising',
			'Worth a third pass',
			'Worth another hour, but not now',
			'Not worth finishing',
		]);
	});

	it('gives every option a label', () => {
		for (const entry of PASS_TWO) expect(entry.label, entry.reading).toBeTruthy();
	});
});

/** Every state a pair can name, which is what the nine words are for. */
const EVERY_STATE: State[] = [
	{ reading: 'untriaged', progress: null },
	{ reading: 'queued', progress: null },
	{ reading: 'queued', progress: 'read' },
	{ reading: 'queued', progress: 'summarised' },
	{ reading: 'promoted', progress: 'read' },
	{ reading: 'promoted', progress: 'summarised' },
	{ reading: 'promoted', progress: 'assessed' },
	{ reading: 'deferred', progress: null },
	{ reading: 'dropped', progress: null },
];

describe('landing', () => {
	it('says something different for every state, so no two decisions look alike', () => {
		expect(new Set(EVERY_STATE.map(landing)).size).toBe(EVERY_STATE.length);
	});

	it('has something to say about every one of them', () => {
		for (const state of EVERY_STATE) expect(landing(state), label(state)).toBeTruthy();
	});
});

describe('applyStatusTag', () => {
	it('writes nothing at all when no namespace is set', () => {
		const frontmatter: Record<string, unknown> = {};
		applyStatusTag(frontmatter, { reading: 'dropped', progress: null }, NO_STATUS_TAGS);
		expect('tags' in frontmatter).toBe(false);
	});

	it('mirrors the reading status under the namespace it is given', () => {
		const frontmatter: Record<string, unknown> = {};
		applyStatusTag(frontmatter, { reading: 'dropped', progress: null }, { current: 'status', retired: [] });
		expect(frontmatter.tags).toEqual(['status/dropped']);
	});

	// The namespace is a setting so it cannot collide with one a vault already
	// uses, which is only worth anything if it is actually honoured.
	it('uses a namespace of your own choosing', () => {
		const frontmatter: Record<string, unknown> = {};
		applyStatusTag(frontmatter, { reading: 'queued', progress: null }, { current: 'reading-state', retired: [] });
		expect(frontmatter.tags).toEqual(['reading-state/queued']);
	});

	it('replaces the old status rather than collecting them', () => {
		const frontmatter: Record<string, unknown> = { tags: ['status/untriaged'] };
		applyStatusTag(frontmatter, { reading: 'queued', progress: null }, { current: 'status', retired: [] });
		expect(frontmatter.tags).toEqual(['status/queued']);
	});

	// The one thing this must never do. Every other tag belongs to whoever put
	// it there.
	it('leaves every tag outside its namespace alone', () => {
		const frontmatter: Record<string, unknown> = { tags: ['project/wp1', 'topic/heat-pumps', 'status/untriaged'] };
		applyStatusTag(frontmatter, { reading: 'dropped', progress: null }, { current: 'status', retired: [] });
		expect(frontmatter.tags).toEqual(['project/wp1', 'status/dropped', 'topic/heat-pumps']);
	});

	it('reads tags written as a string, which is a shape Obsidian allows', () => {
		const frontmatter: Record<string, unknown> = { tags: 'topic/heat-pumps status/untriaged' };
		applyStatusTag(frontmatter, { reading: 'queued', progress: 'read' }, { current: 'status', retired: [] });
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
		for (const state of EVERY_STATE) expect(iconOf(state), label(state)).toBeTruthy();
	});

	it('gives each state its own, or two of them would look like one', () => {
		expect(new Set(EVERY_STATE.map(iconOf)).size).toBe(EVERY_STATE.length);
	});

	// Keyed off the word rather than the pair, so a state cannot read one way
	// and draw another.
	it('agrees with the word, which is the thing it is keyed on', () => {
		expect(new Set(EVERY_STATE.map(label)).size).toBe(EVERY_STATE.length);
	});
});

/**
 * One order for the five judgements, so the chooser and the pane agree.
 *
 * Five, not nine. What you have done is not in here: it is not chosen from a
 * list, so it needs no order to be chosen in.
 */
describe('READING_ORDER', () => {
	it('holds every judgement exactly once', () => {
		const all: Reading[] = ['untriaged', 'queued', 'promoted', 'deferred', 'dropped'];
		expect([...READING_ORDER].sort()).toEqual([...all].sort());
	});

	// Untriaged is Triage, queued is Reading, promoted earns a third pass, and
	// the last two are the ways out.
	it('reads as the queue does, downwards', () => {
		expect(READING_ORDER).toEqual(['untriaged', 'queued', 'promoted', 'deferred', 'dropped']);
	});

	it('offers no report about yourself, only judgements about the paper', () => {
		for (const reading of READING_ORDER) {
			expect(PROGRESS_ORDER).not.toContain(reading as unknown as (typeof PROGRESS_ORDER)[number]);
		}
	});
});

describe('PROGRESS_ORDER', () => {
	it('runs forwards, which is the only direction it moves', () => {
		expect(PROGRESS_ORDER).toEqual(['read', 'summarised', 'assessed']);
	});
});

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
		expect(EVERY_STATE.map(label)).toEqual([
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

	// Nine words for a pair of five and three. That is the point of the split
	// rather than an argument against it: you read all nine, and pick from five.
	it('has a word of its own for every state', () => {
		expect(new Set(EVERY_STATE.map(label)).size).toBe(EVERY_STATE.length);
	});
});

/**
 * The whole migration, and the one place a note's era stops mattering.
 *
 * `reading` has carried three different things: a judgement alone, then the
 * judgement and the progress merged into one value, and now the judgement with
 * the progress beside it. A note written under any of them has to read as the
 * same paper, and nothing rewrites the vault to make that true, so this is the
 * table that makes it true.
 */
describe('stateOf', () => {
	const at = (frontmatter: Record<string, unknown>) => stateOf(frontmatter);

	it('reads a paper written since the split from its two keys', () => {
		expect(at({ reading: 'queued', 'reading-progress': 'summarised' })).toEqual({
			reading: 'queued',
			progress: 'summarised',
		});
	});

	it('reads a judgement with nothing done as nothing done', () => {
		expect(at({ reading: 'queued' })).toEqual({ reading: 'queued', progress: null });
	});



	// The one value that is both a verdict now and a merged value before. It is
	// not ambiguous, because promoting a paper is something you decide at the
	// end of reading it: promoted implies read, in either era.
	it('reads promoted as having been read, whichever era wrote it', () => {
		expect(at({ reading: 'promoted' })).toEqual({ reading: 'promoted', progress: 'read' });
		expect(at({ reading: 'promoted', 'reading-progress': 'summarised' })).toEqual({
			reading: 'promoted',
			progress: 'summarised',
		});
	});


	// Untriaged rather than nothing: no opinion the machine can read has been
	// formed, and that is the answer that puts the paper back in front of you.
	it('reads a value it does not know as untriaged', () => {
		expect(at({ reading: 'quued' })).toEqual({ reading: 'untriaged', progress: null });
		expect(at({ reading: 'something a future version writes' })).toEqual({ reading: 'untriaged', progress: null });
	});

	it('reads a missing or unusable field as untriaged', () => {
		expect(at({})).toEqual({ reading: 'untriaged', progress: null });
		expect(stateOf(undefined)).toEqual({ reading: 'untriaged', progress: null });
		expect(at({ reading: 42 })).toEqual({ reading: 'untriaged', progress: null });
	});

	it('ignores a progress value it does not know', () => {
		expect(at({ reading: 'queued', 'reading-progress': 'skimmed' })).toEqual({ reading: 'queued', progress: null });
	});

	it('passes every judgement through untouched', () => {
		for (const reading of READING_ORDER) {
			if (reading === 'promoted') continue;
			expect(at({ reading }).reading, reading).toBe(reading);
		}
	});
});

describe('progressOf', () => {
	it('takes every step it knows', () => {
		for (const progress of PROGRESS_ORDER) expect(progressOf(progress)).toBe(progress);
	});

	it('is nothing at all for a paper that has not got there', () => {
		expect(progressOf(undefined)).toBeNull();
		expect(progressOf('')).toBeNull();
		expect(progressOf('skimmed')).toBeNull();
		expect(progressOf(42)).toBeNull();
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
		applyStatusTag(frontmatter, { reading: 'dropped', progress: null }, { current: 'status', retired: ['literature', 'reading'] });
		expect(frontmatter.tags).toEqual(['status/dropped']);
	});

	it('leaves the note with no tags key rather than an empty list', () => {
		const frontmatter: Record<string, unknown> = { tags: ['literature/queued'] };
		applyStatusTag(frontmatter, { reading: 'dropped', progress: null }, { current: '', retired: ['literature'] });
		expect('tags' in frontmatter).toBe(false);
	});

	// Out before in: renaming onto a namespace the note already carries must not
	// drop what was just written.
	it('keeps the new tag when the old namespace is the new one', () => {
		const frontmatter: Record<string, unknown> = { tags: ['status/queued'] };
		applyStatusTag(frontmatter, { reading: 'dropped', progress: null }, { current: 'status', retired: ['status'] });
		expect(frontmatter.tags).toEqual(['status/dropped']);
	});

	it('touches a note carrying nothing of ours not at all', () => {
		const frontmatter: Record<string, unknown> = {};
		applyStatusTag(frontmatter, { reading: 'dropped', progress: null }, NO_STATUS_TAGS);
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
 * Sending a paper back to be read. A judgement leaves progress alone, which is
 * why queueing a summarised paper used to leave it in Filed; this is the one
 * decision that clears it.
 */
describe('READ_AGAIN', () => {
	const summarised = () => ({ reading: 'queued', 'reading-progress': 'summarised' }) as Record<string, unknown>;

	it('clears progress, so the paper is waiting to be read', () => {
		const fm = summarised();
		applyTriage(fm, { reading: READ_AGAIN.reading, reason: null, progress: READ_AGAIN.progress }, '2026-09-24');
		expect(stateOf(fm)).toEqual({ reading: 'queued', progress: null });
		expect(fm).not.toHaveProperty('reading-progress');
	});

	// The other half of the split. Without it, a paper deferred halfway through
	// its claim would go back to the start of the queue rather than to Claim.
	it('leaves a plain Queued decision keeping the progress it found', () => {
		const fm = summarised();
		applyTriage(fm, { reading: 'queued', reason: null }, '2026-09-24');
		expect(stateOf(fm).progress).toBe('summarised');
	});

	it('lands where Queued lands on a paper nobody has read', () => {
		expect(landing({ reading: READ_AGAIN.reading, progress: READ_AGAIN.progress })).toBe(landing({ reading: 'queued', progress: null }));
	});
});

describe('judgementIcon', () => {
	// The chooser drew each option with the icon of where it landed, so on a
	// paper already assessed Queued and Promoted both wore the Assessed mark.
	it('draws a judgement as itself, whatever the paper has been through', () => {
		expect(judgementIcon('queued')).toBe(iconOf({ reading: 'queued', progress: null }));
		expect(judgementIcon('promoted')).toBe(iconOf({ reading: 'promoted', progress: 'read' }));
		expect(judgementIcon('queued')).not.toBe(iconOf({ reading: 'queued', progress: 'assessed' }));
	});

	it('gives the five judgements five different icons', () => {
		expect(new Set(READING_ORDER.map(judgementIcon)).size).toBe(READING_ORDER.length);
	});
});
