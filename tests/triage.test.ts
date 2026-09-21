import { describe, expect, it } from 'vitest';
import { applyTriage, asks, landing, PASS_TWO, type Reading } from '../src/core/triage';

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
