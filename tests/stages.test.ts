import { describe, expect, it } from 'vitest';
import type { CachedMetadata } from 'obsidian';
import {
	byStage,
	hasContentUnder,
	headingCoverage,
	headingLine,
	nextAfter,
	noteState,
	rowsByStage,
	rowTask,
	rowTitle,
	settled,
	settledOf,
	STAGES,
	taskOf,
	TASKS,
	visibleStages,
	type NoteState,
	type Row,
} from '../src/core/stages';

const paper = (over: Partial<NoteState> = {}): NoteState => ({
	path: 'Literature/a.md',
	title: 'A paper',
	isPaper: true,
	key: 'ABCD2345',
	reading: null,
	hasClaim: false,
	hasAssessment: false,
	created: 0,
	decided: null,
	...over,
});

const note = (over: Partial<NoteState> = {}): NoteState => ({
	path: 'Notes/a.md',
	title: 'A note',
	isPaper: false,
	key: null,
	reading: null,
	hasClaim: false,
	hasAssessment: false,
	created: 0,
	decided: null,
	...over,
});

describe('taskOf, papers', () => {
	it('puts a paper with no reading field in triage', () => {
		expect(taskOf(paper())).toBe('triage');
	});

	it('puts an explicitly untriaged paper in triage', () => {
		expect(taskOf(paper({ reading: 'untriaged' }))).toBe('triage');
	});

	it('puts a queued paper in reading', () => {
		expect(taskOf(paper({ reading: 'queued' }))).toBe('read');
	});

	it('puts a read paper with no claim in its own claim section', () => {
		expect(taskOf(paper({ reading: 'finished', hasClaim: false }))).toBe('claim');
	});

	it('is done with a read paper that has a claim', () => {
		expect(taskOf(paper({ reading: 'finished', hasClaim: true }))).toBeNull();
	});

	it('is done with a dropped paper, claim or no claim', () => {
		expect(taskOf(paper({ reading: 'dropped' }))).toBeNull();
		expect(taskOf(paper({ reading: 'dropped', hasClaim: true }))).toBeNull();
	});

	it('takes a deferred paper off the list, which is what deferring it is for', () => {
		expect(taskOf(paper({ reading: 'deferred' }))).toBeNull();
		expect(taskOf(paper({ reading: 'deferred', hasClaim: true }))).toBeNull();
	});

	it('asks a promoted paper for the claim before the third pass', () => {
		expect(taskOf(paper({ reading: 'promoted', hasClaim: false }))).toBe('claim');
	});

	it('sends a promoted paper with a claim and no assessment to Assess', () => {
		expect(taskOf(paper({ reading: 'promoted', hasClaim: true, hasAssessment: false }))).toBe('assessment');
	});

	it('is done with a promoted paper once the assessment is written', () => {
		expect(taskOf(paper({ reading: 'promoted', hasClaim: true, hasAssessment: true }))).toBeNull();
	});

	it('never asks a merely read paper for an assessment', () => {
		expect(taskOf(paper({ reading: 'finished', hasClaim: true, hasAssessment: false }))).toBeNull();
	});

});

describe('taskOf, own notes', () => {
	// The queue is papers only. A note you wrote is finished when you stop
	// typing, and the plugin has no business having an opinion about it.
	it('never asks anything of a note that names no Zotero item', () => {
		expect(taskOf(note())).toBeNull();
		expect(taskOf(note({ reading: 'queued' }))).toBeNull();
	});
});

describe('byStage', () => {
	it('keeps every stage present, even empty', () => {
		expect([...byStage([]).keys()]).toEqual(['triage', 'read', 'claim', 'assessment']);
		expect([...byStage([]).values()].every((list) => list.length === 0)).toBe(true);
	});

	it('buckets each note once', () => {
		const notes = [paper(), paper({ reading: 'queued' }), note()];
		const result = byStage(notes);
		expect(result.get('triage')).toHaveLength(1);
		expect(result.get('read')).toHaveLength(1);
	});
});

describe('ordering', () => {
	it('drains each stage oldest first', () => {
		const notes = [
			paper({ path: 'Literature/new.md', title: 'new', created: 300 }),
			paper({ path: 'Literature/old.md', title: 'old', created: 100 }),
			paper({ path: 'Literature/mid.md', title: 'mid', created: 200 }),
		];
		expect(byStage(notes).get('triage')?.map((n) => n.title)).toEqual(['old', 'mid', 'new']);
	});
});

// A metadata cache, as Obsidian hands one over. Positions carry more than the
// line, but the line is all these rules read.
const at = (line: number) => ({ start: { line, col: 0, offset: 0 }, end: { line, col: 0, offset: 0 } });
const heading = (text: string, line: number) => ({ heading: text, level: 2, position: at(line) });
const section = (type: string, line: number) => ({ type, position: at(line) });

/** The three settings a note is read against, named once so a test reads. */
const FIELDS = { keyField: 'zotero-key', claimHeading: 'Claim', assessmentHeading: 'Assessment' };
const file = { path: 'Literature/a.md', basename: 'a', created: 100 };

/** A paper Zotero holds that the vault has no note for, as a queue row. */
const pendingRow = (key = 'AAAA1111'): Row => ({
	kind: 'pending',
	item: { key, title: key, abstract: null, venue: null, year: null, added: '2026-01-01' },
});

describe('headingLine', () => {
	const cache = {
		headings: [heading('Claim', 1), heading('Assessment', 5)],
	} as unknown as CachedMetadata;

	it('finds the line a heading sits on, so a cursor can go under it', () => {
		expect(headingLine(cache, 'Claim')).toBe(1);
		expect(headingLine(cache, 'Assessment')).toBe(5);
	});

	it('matches the heading whatever its case or padding, like the content check', () => {
		expect(headingLine(cache, '  claim  ')).toBe(1);
	});

	// The caller says so out loud rather than opening the note at the top: a
	// heading the note has not got is a stage no paper can ever leave.
	it('is null when the note has no such heading', () => {
		expect(headingLine(cache, 'Argument')).toBeNull();
		expect(headingLine(null, 'Claim')).toBeNull();
	});
});

describe('hasContentUnder', () => {
	const cache = {
		headings: [heading('Claim', 1), heading('Weging', 5)],
		sections: [section('heading', 1), section('paragraph', 3), section('heading', 5)],
	} as unknown as CachedMetadata;

	it('sees a paragraph under the heading', () => {
		expect(hasContentUnder(cache, 'Claim')).toBe(true);
	});

	it('does not see the next section as this one', () => {
		expect(hasContentUnder(cache, 'Weging')).toBe(false);
	});

	it('matches the heading whatever its case or padding', () => {
		expect(hasContentUnder(cache, '  claim  ')).toBe(true);
	});

	it('is false when the heading is not there at all', () => {
		expect(hasContentUnder(cache, 'Betekenis')).toBe(false);
	});

	it('does not count the template comment as writing', () => {
		const untouched = {
			headings: [heading('Claim', 1), heading('Weging', 5)],
			sections: [section('heading', 1), section('comment', 3), section('heading', 5)],
		} as unknown as CachedMetadata;
		expect(hasContentUnder(untouched, 'Claim')).toBe(false);
	});

	it('does not count an HTML comment either', () => {
		const untouched = {
			headings: [heading('Claim', 1), heading('Weging', 5)],
			sections: [section('heading', 1), section('html', 3), section('heading', 5)],
		} as unknown as CachedMetadata;
		expect(hasContentUnder(untouched, 'Claim')).toBe(false);
	});

	it('reads the last heading to the end of the note', () => {
		const trailing = {
			headings: [heading('Claim', 1)],
			sections: [section('heading', 1), section('paragraph', 9)],
		} as unknown as CachedMetadata;
		expect(hasContentUnder(trailing, 'Claim')).toBe(true);
	});

	it('copes with no cache at all', () => {
		expect(hasContentUnder(null, 'Claim')).toBe(false);
	});
});

describe('STAGES', () => {
	it('offers from inside a note only the actions that go somewhere else', () => {
		expect(Object.entries(TASKS).filter(([, t]) => t.inNote).map(([name]) => name)).toEqual(['triage', 'read']);
	});

	it('withholds the two whose action is opening the note you are already in', () => {
		for (const task of ['claim', 'assessment'] as const) expect(TASKS[task].inNote).toBe(false);
	});

	it('gives reading a way to end, because nothing in the vault records that it happened', () => {
		expect(TASKS.read.done).toBe('Finished');
	});

	it('gives no other task one: doing the thing is what ends them', () => {
		expect(Object.entries(TASKS).filter(([, t]) => t.done).map(([name]) => name)).toEqual(['read']);
	});

	it('gives every end-button an icon, or a row would lose it and say nothing', () => {
		for (const [name, task] of Object.entries(TASKS)) {
			if (task.done) expect(task.doneIcon, name).toBeTruthy();
		}
	});

	// Clicking a row shows the paper and does nothing else, so the button is the
	// only way the work is reached. A task without one would be a section of the
	// queue you could look at and not act on.
	it('gives every task an icon, because the row click no longer carries the work', () => {
		for (const [name, task] of Object.entries(TASKS)) expect(task.icon, name).toBeTruthy();
	});

	it('keeps the words, which every tooltip still uses', () => {
		for (const task of Object.values(TASKS)) expect(task.action).toBeTruthy();
	});

});

describe('noteState', () => {
	const cache = (frontmatter: Record<string, unknown>) => ({ frontmatter }) as unknown as CachedMetadata;

	it('is a paper when it names a Zotero item', () => {
		expect(noteState(cache({ 'zotero-key': 'ABCD2345' }), file, FIELDS).isPaper).toBe(true);
	});

	it('is not a paper under a different key field', () => {
		expect(noteState(cache({ 'zotero-key': 'ABCD2345' }), file, { ...FIELDS, keyField: 'citekey' }).isPaper).toBe(false);
	});

	it('falls back to the basename when there is no title', () => {
		expect(noteState(cache({}), file, FIELDS).title).toBe('a');
	});

	it('reports a missing reading field as null, not as a string', () => {
		expect(noteState(cache({}), file, FIELDS).reading).toBeNull();
		expect(noteState(cache({ reading: 42 }), file, FIELDS).reading).toBeNull();
	});

	it('survives a note with no frontmatter and no cache', () => {
		expect(noteState(null, file, FIELDS)).toMatchObject({ isPaper: false, reading: null });
	});
});

/**
 * The union that makes the virtual queue safe: Triage is what Zotero holds and
 * the vault does not, *plus* notes you deliberately put back into it.
 */
describe('rowsByStage', () => {
	const item = (key: string, title: string) => ({ key, title, abstract: null, venue: null, year: null, added: '2026-01-01' });

	it('puts pending papers into Triage alongside untriaged notes', () => {
		const rows = rowsByStage([paper({ reading: 'untriaged', title: 'a note' })], [item('AAAA1111', 'a pending paper')], true);
		expect(rows.get('triage')?.map(rowTitle)).toEqual(['a pending paper', 'a note']);
	});

	it('keeps a note reset to untriaged, which is the way back from any decision', () => {
		// Resetting a paper is the recovery path. If Triage were only what has no
		// note, a reset paper would vanish instead of coming back.
		const rows = rowsByStage([paper({ reading: 'untriaged' })], [], true);
		expect(rows.get('triage')).toHaveLength(1);
	});

	it('leaves every other stage to the vault alone', () => {
		const rows = rowsByStage([paper({ reading: 'queued' })], [item('AAAA1111', 'pending')], true);
		expect(rows.get('read')?.map(rowTitle)).toEqual(['A paper']);
		expect(rows.get('triage')?.map(rowTitle)).toEqual(['pending']);
	});

	it('marks which source a row came from, because only one of them has a note', () => {
		const rows = rowsByStage([paper({ reading: 'untriaged' })], [item('AAAA1111', 'pending')], true);
		expect(rows.get('triage')?.map((row) => row.kind)).toEqual(['pending', 'note']);
	});

	it('is just the vault when Zotero has told it nothing', () => {
		const rows = rowsByStage([paper({ reading: 'untriaged' })], [], true);
		expect(rows.get('triage')?.map((row) => row.kind)).toEqual(['note']);
	});
});

describe('stage icons', () => {
	it('gives every stage one, because a folder with an empty icon slot reads as broken', () => {
		for (const entry of STAGES) expect(entry.stageIcon, entry.task).toBeTruthy();
	});

	it('gives each stage its own, or two sections look like the same section', () => {
		expect(new Set(STAGES.map((entry) => entry.stageIcon)).size).toBe(STAGES.length);
	});
});

describe('what a queued paper still owes', () => {
	it('still tells them apart by the task, which is what the row draws', () => {
		expect(taskOf(paper({ reading: 'queued' }))).toBe('read');
		expect(taskOf(paper({ reading: 'finished', hasClaim: false }))).toBe('claim');
	});

	// Each half offers its own icon. The claim's repeats what clicking the row
	// does, which is a rule broken on purpose: without it the two rows are
	// identical, and pressing Finished changes nothing anybody can see.
	it('offers a different icon on each, so the two halves are distinguishable', () => {
		expect(TASKS.read.icon).toBeTruthy();
		expect(TASKS.claim.icon).toBeTruthy();
		expect(TASKS.claim.icon).not.toBe(TASKS.read.icon);
	});

	// Letting a claim alone release the paper would file one whose `reading`
	// still says queued, and that field is what the exclusions report is built
	// from. The outcome decision is owed whatever else has been written.
	it('keeps a queued paper even once its claim is written', () => {
		expect(taskOf(paper({ reading: 'queued', hasClaim: true }))).toBe('read');
		expect(taskOf(paper({ reading: 'queued', hasClaim: true }))).toBe('read');
	});

	it('lets a decided paper go once the claim is there', () => {
		expect(taskOf(paper({ reading: 'finished', hasClaim: true }))).toBeNull();
	});
});

describe('a note written under the old spelling', () => {
	// `pass-three` was the value when the section was called Third pass. Nothing
	// says that any more, so the value is `promoted` now and old notes are read
	// rather than rewritten: a paper you finished last year goes on behaving
	// exactly as it did, without the plugin touching it.
	const old = { path: 'Literature/a.md', basename: 'a', created: 0 };
	const cached = (reading: string) =>
		noteState({ frontmatter: { 'zotero-key': 'ABCD2345', reading } }, old, FIELDS);

	it('reads pass-three as promoted', () => {
		expect(cached('pass-three').reading).toBe('promoted');
	});

	it('puts it in the same place a newly promoted paper goes', () => {
		expect(taskOf(cached('pass-three'))).toBe('claim');
		expect(taskOf(cached('pass-three'))).toBe('claim');
	});

	it('leaves every other value exactly as it was written', () => {
		for (const value of ['untriaged', 'queued', 'finished', 'deferred', 'dropped', 'something-of-your-own']) {
			expect(cached(value).reading, value).toBe(value);
		}
	});
});

describe('settledOf', () => {
	it('names the state a paper came to rest in', () => {
		expect(settledOf(paper({ reading: 'dropped' }))).toBe('dropped');
		expect(settledOf(paper({ reading: 'deferred' }))).toBe('deferred');
		expect(settledOf(paper({ reading: 'finished', hasClaim: true }))).toBe('finished');
		expect(settledOf(paper({ reading: 'promoted', hasClaim: true, hasAssessment: true }))).toBe('promoted');
	});

	it('says nothing about a paper still owing something', () => {
		expect(settledOf(paper())).toBeNull();
		expect(settledOf(paper({ reading: 'untriaged' }))).toBeNull();
		expect(settledOf(paper({ reading: 'queued' }))).toBeNull();
		// Finished but the claim is not written: the second pass is not over.
		expect(settledOf(paper({ reading: 'finished' }))).toBeNull();
		expect(settledOf(paper({ reading: 'promoted', hasClaim: true }))).toBeNull();
	});

	// Both of these also make `taskOf` return null, which is why settling is not
	// defined as "nothing outstanding": neither records a decision.
	it('ignores a note that is not a paper', () => {
		expect(settledOf(note({ reading: 'dropped' }))).toBeNull();
	});

	it('ignores a reading value nothing here ever wrote', () => {
		expect(settledOf(paper({ reading: 'something-of-your-own' }))).toBeNull();
	});
});

describe('settled', () => {
	it('reads backwards: newest decision first', () => {
		const notes = [
			paper({ path: 'a.md', title: 'old', reading: 'dropped', decided: '2026-01-01' }),
			paper({ path: 'b.md', title: 'new', reading: 'dropped', decided: '2026-03-01' }),
			paper({ path: 'c.md', title: 'mid', reading: 'deferred', decided: '2026-02-01' }),
		];
		expect(settled(notes).map((entry) => entry.note.title)).toEqual(['new', 'mid', 'old']);
	});

	it('keeps an undated decision, at the end', () => {
		const notes = [
			paper({ path: 'a.md', title: 'undated', reading: 'dropped' }),
			paper({ path: 'b.md', title: 'dated', reading: 'dropped', decided: '2026-01-01' }),
		];
		expect(settled(notes).map((entry) => entry.note.title)).toEqual(['dated', 'undated']);
	});

	it('carries the decision alongside the note', () => {
		const assessed = paper({ reading: 'promoted', hasClaim: true, hasAssessment: true });
		expect(settled([assessed])).toEqual([{ note: assessed, reading: 'promoted' }]);
	});

	it('leaves out everything still outstanding', () => {
		expect(settled([paper(), paper({ reading: 'queued' }), note()])).toEqual([]);
	});
});

/**
 * The two halves of Keshav's second pass, in two sections.
 *
 * They shared one for a while, on the grounds that they are one pass. The
 * grounds were right and the conclusion was wrong: a section is named for what
 * the paper in it is waiting on, and finishing a paper that stayed put moved
 * nothing, renamed nothing and changed no count.
 */
describe('the second pass, in two sections', () => {
	const queued = (title: string, created: number) => paper({ path: `${title}.md`, title, reading: 'queued', created });
	const owesClaim = (title: string, created: number) =>
		paper({ path: `${title}.md`, title, reading: 'finished', created });

	it('separates the paper still to be read from the one still to be summarised', () => {
		const rows = byStage([queued('read-me', 100), owesClaim('write-me', 300)]);
		expect(rows.get('read')?.map((n) => n.title)).toEqual(['read-me']);
		expect(rows.get('claim')?.map((n) => n.title)).toEqual(['write-me']);
	});

	// Which is what makes finishing a paper visible: it leaves one count and
	// joins another, in a section with a different name and a different icon.
	it('moves a paper between them when the reading ends', () => {
		expect(taskOf(paper({ reading: 'queued' }))).toBe('read');
		expect(taskOf(paper({ reading: 'finished' }))).toBe('claim');
	});

	it('sends a promoted paper to the claim first, because a third pass argues with a summary', () => {
		expect(taskOf(paper({ reading: 'promoted' }))).toBe('claim');
		expect(taskOf(paper({ reading: 'promoted', hasClaim: true }))).toBe('assessment');
	});

	it('drains each of them oldest first', () => {
		const rows = byStage([owesClaim('new', 400), owesClaim('old', 100), owesClaim('mid', 200)]);
		expect(rows.get('claim')?.map((n) => n.title)).toEqual(['old', 'mid', 'new']);
	});
});

/**
 * The sidebar is read downwards as the shape of the workflow, so the sections
 * run in the order a paper passes through them. Ordering them by what each one
 * costs put Claim above Reading, which is a better argument than it is a list.
 */
describe('the order of the sections', () => {
	it('runs in the order a paper passes through them', () => {
		expect(STAGES.map((entry) => entry.task)).toEqual(['triage', 'read', 'claim', 'assessment']);
	});

	it('puts the claim after the reading it belongs to, as every explanation does', () => {
		const order = STAGES.map((entry) => entry.task);
		expect(order.indexOf('read')).toBeLessThan(order.indexOf('claim'));
	});

	it('names and describes every one of them', () => {
		for (const entry of STAGES) {
			expect(entry.label, entry.task).toBeTruthy();
			expect(entry.hint, entry.task).toBeTruthy();
			expect(entry.stageIcon, entry.task).toBeTruthy();
		}
	});
});

/**
 * The two passes that end by themselves, with nothing pressed and so nothing
 * answering. Every other end comes back with `landing`.
 */
describe('completion messages', () => {
	it('belong to the two that end when prose appears under a heading', () => {
		expect(Object.entries(TASKS).filter(([, t]) => t.completed).map(([name]) => name)).toEqual(['claim', 'assessment']);
	});

	it('are absent where a chooser has already said what happened', () => {
		expect(TASKS.triage.completed).toBeUndefined();
		expect(TASKS.read.completed).toBeUndefined();
	});
});

/**
 * A paper Zotero holds that the vault has no note for.
 *
 * What it is asking for depends on what putting it in Zotero meant, which is
 * the one thing the plugin cannot work out and the only reason there is a
 * setting for it.
 */
describe('a pending paper, with triage on and off', () => {
	const waiting = { key: 'AAAA1111', title: 'pending', abstract: null, venue: null, year: null, added: '2026-01-01' };
	const pending = { kind: 'pending' as const, item: waiting };

	it('wants ruling on when the queue is to ask first', () => {
		expect(rowTask(pending, true)).toBe('triage');
		expect(rowsByStage([], [pending.item], true).get('triage')).toHaveLength(1);
		expect(rowsByStage([], [pending.item], true).get('read')).toHaveLength(0);
	});

	// Saving it to Zotero was the first pass: the abstract was on the page and
	// the connector button was the answer.
	it('wants reading when it does not', () => {
		expect(rowTask(pending, false)).toBe('read');
		expect(rowsByStage([], [pending.item], false).get('read')).toHaveLength(1);
		expect(rowsByStage([], [pending.item], false).get('triage')).toHaveLength(0);
	});

	it('goes at the front of whichever section it lands in, either way', () => {
		for (const triage of [true, false]) {
			const stage = triage ? 'triage' : 'read';
			const already = paper({ reading: triage ? 'untriaged' : 'queued', created: 1 });
			expect(rowsByStage([already], [pending.item], triage).get(stage)?.map((row) => row.kind)).toEqual([
				'pending',
				'note',
			]);
		}
	});

	it('says nothing different about a paper that already has a note', () => {
		const note = { kind: 'note' as const, note: paper({ reading: 'queued' }) };
		expect(rowTask(note, true)).toBe('read');
		expect(rowTask(note, false)).toBe('read');
	});
});

describe('visibleStages', () => {
	const rows = (counts: Partial<Record<string, number>>) =>
		new Map(STAGES.map(({ task }) => [task, Array.from({ length: counts[task] ?? 0 }, () => pendingRow())]));

	it('keeps an empty stage, so the list does not move under the cursor as you work it', () => {
		expect(visibleStages(rows({}), true).map((entry) => entry.task)).toEqual(STAGES.map((entry) => entry.task));
	});

	// Not a stage you work, so a permanent zero teaches nothing and never moves.
	it('drops an empty Triage when triage is off', () => {
		expect(visibleStages(rows({}), false).map((entry) => entry.task)).not.toContain('triage');
	});

	it('brings Triage back the moment something lands in it, even with triage off', () => {
		expect(visibleStages(rows({ triage: 1 }), false).map((entry) => entry.task)).toContain('triage');
	});

	it('never drops any other stage, however empty', () => {
		const shown = visibleStages(rows({}), false).map((entry) => entry.task);
		expect(shown).toEqual(['read', 'claim', 'assessment']);
	});
});

describe('nextAfter', () => {
	const row = (key: string) => pendingRow(key);

	it('offers the first row when nothing has just been ruled on', () => {
		expect(nextAfter([row('AAAA2345'), row('BBBB2345')], null)).toMatchObject({ item: { key: 'AAAA2345' } });
	});

	// The note a decision just wrote is on disk before Obsidian has read it, so
	// without this the paper you just answered is handed straight back.
	it('skips the paper just decided, wherever it sits', () => {
		expect(nextAfter([row('AAAA2345'), row('BBBB2345')], 'AAAA2345')).toMatchObject({ item: { key: 'BBBB2345' } });
	});

	it('answers null when the only row left is the one just decided', () => {
		expect(nextAfter([row('AAAA2345')], 'AAAA2345')).toBeNull();
	});

	it('answers null on an empty stage', () => {
		expect(nextAfter([], null)).toBeNull();
	});
});

describe('headingCoverage', () => {
	const withHeadings = (...names: string[]) =>
		({ headings: names.map((name, index) => heading(name, index)) }) as unknown as CachedMetadata;

	it('counts the papers that have the heading', () => {
		const papers = [withHeadings('Claim'), withHeadings('Claim'), withHeadings('Assessment')];
		expect(headingCoverage(papers, 'Claim')).toEqual({ found: 2, total: 3 });
	});

	// The setting is a text box, so what someone types is untrimmed and may be
	// capitalised any way at all. The note is what it is.
	it('matches loosely on case and padding, the way the stage rules do', () => {
		expect(headingCoverage([withHeadings('Claim')], '  claim ')).toEqual({ found: 1, total: 1 });
	});

	it('finds nothing in a paper with no headings, rather than failing', () => {
		expect(headingCoverage([null], 'Claim')).toEqual({ found: 0, total: 1 });
	});

	it('is empty on a vault with no papers, which is what makes the tab say nothing', () => {
		expect(headingCoverage([], 'Claim')).toEqual({ found: 0, total: 0 });
	});
});
