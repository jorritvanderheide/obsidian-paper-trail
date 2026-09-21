import { describe, expect, it } from 'vitest';
import { applyStatusTag, applyTriage, asks, landing, PASS_TWO, type Reading } from '../src/core/triage';

/** A literature note as it is created, before any decision. */
const untriaged = () => ({
	citekey: 'vanderhaerReframingHeatPump2026',
	reading: 'untriaged',
	tags: ['type/inbox'],
});

describe('applyTriage', () => {
	it('records the decision and the date', () => {
		const frontmatter: Record<string, unknown> = untriaged();
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-20');
		expect(frontmatter.reading).toBe('queued');
		expect(frontmatter['reading-date']).toBe('2026-09-20');
	});

	it('leaves the tags exactly as it found them', () => {
		// A paper's lifecycle is `reading`. It is not on the type axis, and it
		// never was truthfully: no value there is right for a paper.
		const frontmatter: Record<string, unknown> = untriaged();
		applyTriage(frontmatter, { reading: 'finished', reason: null }, '2026-09-20');
		expect(frontmatter.tags).toEqual(['type/inbox']);
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
		applyTriage(frontmatter, { reading: 'finished', reason: null }, '2026-11-14');
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

	it('does not duplicate an axis when the note is already filed', () => {
		const frontmatter: Record<string, unknown> = { tags: ['domain/phd', 'type/filed'] };
		applyTriage(frontmatter, { reading: 'finished', reason: null }, '2026-09-20');
		expect(frontmatter.tags).toEqual(['domain/phd', 'type/filed']);
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
		applyTriage(frontmatter, { reading: 'finished', reason: null }, '2026-09-20');
		expect('tags' in frontmatter).toBe(false);
	});

	it('keeps what you set by hand rather than overwriting it on every decision', () => {
		const frontmatter: Record<string, unknown> = { tags: ['domain/teaching', 'type/living'] };
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-20');
		expect(frontmatter.tags).toEqual(['domain/teaching', 'type/living']);
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
		applyTriage(once, { reading: 'finished', reason: null }, '2026-09-21');
		const twice = { ...once };
		applyTriage(twice, { reading: 'finished', reason: null }, '2026-09-21');
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
		expect(asks('finished')).toBeNull();
		expect(asks('pass-three')).toBeNull();
		expect(asks('untriaged')).toBeNull();
	});

	it('gives each question its own button, so neither says "OK"', () => {
		expect(asks('dropped')?.cta).toBe('Drop');
		expect(asks('deferred')?.cta).toBe('Defer');
	});
});

describe('PASS_TWO', () => {
	it('offers Keshav\'s three, plus abandoning a paper an hour in', () => {
		expect(PASS_TWO.map((entry) => entry.reading)).toEqual(['finished', 'pass-three', 'deferred', 'dropped']);
	});

	it('never offers a state that would send a read paper backwards', () => {
		expect(PASS_TWO.map((entry) => entry.reading)).not.toContain('queued');
		expect(PASS_TWO.map((entry) => entry.reading)).not.toContain('untriaged');
	});
});

describe('landing', () => {
	it('says something different for every state, so no two decisions look alike', () => {
		const all: Reading[] = ['untriaged', 'dropped', 'queued', 'deferred', 'finished', 'pass-three'];
		expect(new Set(all.map(landing)).size).toBe(all.length);
	});
});

describe('applyStatusTag', () => {
	it('writes nothing at all when no namespace is set', () => {
		const frontmatter: Record<string, unknown> = {};
		applyStatusTag(frontmatter, 'dropped', '');
		expect('tags' in frontmatter).toBe(false);
	});

	it('mirrors the reading status under the namespace it is given', () => {
		const frontmatter: Record<string, unknown> = {};
		applyStatusTag(frontmatter, 'dropped', 'status');
		expect(frontmatter.tags).toEqual(['status/dropped']);
	});

	// The namespace is a setting so it cannot collide with one a vault already
	// uses, which is only worth anything if it is actually honoured.
	it('uses a namespace of your own choosing', () => {
		const frontmatter: Record<string, unknown> = {};
		applyStatusTag(frontmatter, 'queued', 'reading-state');
		expect(frontmatter.tags).toEqual(['reading-state/queued']);
	});

	it('replaces the old status rather than collecting them', () => {
		const frontmatter: Record<string, unknown> = { tags: ['status/untriaged'] };
		applyStatusTag(frontmatter, 'queued', 'status');
		expect(frontmatter.tags).toEqual(['status/queued']);
	});

	// The one thing this must never do. Every other tag belongs to whoever put
	// it there.
	it('leaves every tag outside its namespace alone', () => {
		const frontmatter: Record<string, unknown> = { tags: ['domain/research', 'type/filed', 'status/untriaged'] };
		applyStatusTag(frontmatter, 'dropped', 'status');
		expect(frontmatter.tags).toEqual(['domain/research', 'status/dropped', 'type/filed']);
	});

	it('reads tags written as a string, which is a shape Obsidian allows', () => {
		const frontmatter: Record<string, unknown> = { tags: 'domain/research status/untriaged' };
		applyStatusTag(frontmatter, 'finished', 'status');
		expect(frontmatter.tags).toEqual(['domain/research', 'status/finished']);
	});
});

describe('applyTriage with a status tag', () => {
	it('keeps the frontmatter and the tag saying the same thing', () => {
		const frontmatter: Record<string, unknown> = {};
		applyTriage(frontmatter, { reading: 'dropped', reason: 'Out of scope' }, '2026-09-21', 'status');
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
		applyTriage(frontmatter, { reading: 'queued', reason: null }, '2026-09-22', 'status');
		expect(frontmatter.tags).toEqual(['status/queued']);
	});
});

