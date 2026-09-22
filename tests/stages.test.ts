import { describe, expect, it } from 'vitest';
import type { CachedMetadata } from 'obsidian';
import { PASS_PROGRESS, PROGRESS_ORDER, READING_ORDER, type Progress, type Reading } from '../src/core/triage';
import {
	byStage,
	headingCoverage,
	headingLine,
	headingLineIn,
	headingSlot,
	insertHeading,
	nextAfter,
	NEXT_ORDER,
	noteState,
	parked,
	rowsByStage,
	rowTask,
	rowTitle,
	roomUnder,
	settled,
	outcomeOf,
	STAGES,
	taskFor,
	taskOf,
	TASKS,
	visibleStages,
	withHeading,
	writtenUnder,
	type NoteState,
	type Row,
} from '../src/core/stages';

const paper = (over: Partial<NoteState> = {}): NoteState => ({
	path: 'Literature/a.md',
	title: 'A paper',
	isPaper: true,
	key: 'ABCD2345',
	state: { reading: 'untriaged', progress: null },
	created: 0,
	reason: null,
	decided: null,
	...over,
});

const note = (over: Partial<NoteState> = {}): NoteState => ({
	path: 'Notes/a.md',
	title: 'A note',
	isPaper: false,
	key: null,
	state: { reading: 'untriaged', progress: null },
	created: 0,
	reason: null,
	decided: null,
	...over,
});

describe('taskOf, papers', () => {
	it('puts a paper with no reading field in triage', () => {
		expect(taskOf(paper())).toBe('triage');
	});

	it('puts an explicitly untriaged paper in triage', () => {
		expect(taskOf(paper({ state: { reading: 'untriaged', progress: null } }))).toBe('triage');
	});

	it('puts a queued paper in reading', () => {
		expect(taskOf(paper({ state: { reading: 'queued', progress: null } }))).toBe('reading');
	});

	it('asks a read paper for the claim', () => {
		expect(taskOf(paper({ state: { reading: 'queued', progress: 'read' } }))).toBe('claim');
	});

	it('is done with a paper once it has been summarised', () => {
		expect(taskOf(paper({ state: { reading: 'queued', progress: 'summarised' } }))).toBeNull();
	});

	it('is done with a dropped paper', () => {
		expect(taskOf(paper({ state: { reading: 'dropped', progress: null } }))).toBeNull();
	});

	it('takes a deferred paper off the list, which is what deferring it is for', () => {
		expect(taskOf(paper({ state: { reading: 'deferred', progress: null } }))).toBeNull();
	});

	it('asks a promoted paper for the claim before the third pass', () => {
		expect(taskOf(paper({ state: { reading: 'promoted', progress: 'read' } }))).toBe('claim');
	});

	it('sends it on to the assessment once the claim is ticked off', () => {
		expect(taskOf(paper({ state: { reading: 'promoted', progress: 'summarised' } }))).toBe('assessment');
	});

	it('is done with a promoted paper once the assessment is ticked off', () => {
		expect(taskOf(paper({ state: { reading: 'promoted', progress: 'assessed' } }))).toBeNull();
	});

	// The fork: a paper that was only read stops at the summary, and never gets
	// asked for an assessment it was not promoted to.
	it('never asks a merely read paper for an assessment', () => {
		expect(taskOf(paper({ state: { reading: 'queued', progress: 'summarised' } }))).toBeNull();
	});

	it('reads the old spelling of read as read', () => {
		expect(taskOf(paper({ state: { reading: 'queued', progress: 'read' } }))).toBe('claim');
	});

});

describe('taskOf, own notes', () => {
	// The queue is papers only. A note you wrote is finished when you stop
	// typing, and the plugin has no business having an opinion about it.
	it('never asks anything of a note that names no Zotero item', () => {
		expect(taskOf(note())).toBeNull();
		expect(taskOf(note({ state: { reading: 'queued', progress: null } }))).toBeNull();
	});
});

describe('byStage', () => {
	it('keeps every stage present, even empty', () => {
		expect([...byStage([]).keys()]).toEqual(['triage', 'reading', 'claim', 'assessment']);
		expect([...byStage([]).values()].every((list) => list.length === 0)).toBe(true);
	});

	it('buckets each note once', () => {
		const notes = [paper(), paper({ state: { reading: 'queued', progress: null } }), note()];
		const result = byStage(notes);
		expect(result.get('triage')).toHaveLength(1);
		expect(result.get('reading')).toHaveLength(1);
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

/** The one setting a note is read against. */
const KEY_FIELD = 'zotero-key';
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

describe('STAGES', () => {
	it('offers from inside a note only the actions that go somewhere else', () => {
		expect(Object.entries(TASKS).filter(([, t]) => t.inNote).map(([name]) => name)).toEqual(['triage', 'reading']);
	});

	it('withholds the two whose action is opening the note you are already in', () => {
		for (const task of ['claim', 'assessment'] as const) expect(TASKS[task].inNote).toBe(false);
	});

	it('gives reading a way to end, because nothing in the vault records that it happened', () => {
		expect(TASKS.reading.done).toBe('Finished');
	});

	// The two passes that end in prose end when you say so. The plugin used to
	// watch the heading and call a pass finished the moment anything appeared
	// under it, which took one character and left no room to think under a
	// heading without it being taken for the work.
	it('gives both written passes a way to end, because prose does not announce itself', () => {
		expect(TASKS.claim.done).toBe('Claim written');
		expect(TASKS.assessment.done).toBe('Assessment written');
	});

	// Deciding is the whole of triage, so pressing an answer is the end of it.
	it('gives triage none, because the decision is the end', () => {
		expect(Object.entries(TASKS).filter(([, t]) => !t.done).map(([name]) => name)).toEqual(['triage']);
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
		expect(noteState(cache({ 'zotero-key': 'ABCD2345' }), file, KEY_FIELD).isPaper).toBe(true);
	});

	it('is not a paper under a different key field', () => {
		expect(noteState(cache({ 'zotero-key': 'ABCD2345' }), file, 'citekey').isPaper).toBe(false);
	});

	it('falls back to the basename when there is no title', () => {
		expect(noteState(cache({}), file, KEY_FIELD).title).toBe('a');
	});

	it('reads a missing or unusable reading field as untriaged', () => {
		expect(noteState(cache({}), file, KEY_FIELD).state).toEqual({ reading: 'untriaged', progress: null });
		expect(noteState(cache({ reading: 42 }), file, KEY_FIELD).state).toEqual({ reading: 'untriaged', progress: null });
	});

	it('survives a note with no frontmatter and no cache', () => {
		expect(noteState(null, file, KEY_FIELD)).toMatchObject({
			isPaper: false,
			state: { reading: 'untriaged', progress: null },
		});
	});
});

/**
 * The union that makes the virtual queue safe: Triage is what Zotero holds and
 * the vault does not, *plus* notes you deliberately put back into it.
 */
describe('rowsByStage', () => {
	const item = (key: string, title: string) => ({ key, title, abstract: null, venue: null, year: null, added: '2026-01-01' });

	it('puts pending papers into Triage alongside untriaged notes', () => {
		const rows = rowsByStage([paper({ state: { reading: 'untriaged', progress: null }, title: 'a note' })], [item('AAAA1111', 'a pending paper')], true);
		expect(rows.get('triage')?.map(rowTitle).sort()).toEqual(['a note', 'a pending paper']);
	});

	// One order for the section, on when the paper arrived, whichever kind of
	// row it is. Two blocks sorted on different keys meant acting on a row moved
	// it from one to the other.
	it('orders a section by arrival rather than by kind', () => {
		const arrived = new Map([['NOTE0001', '2024-01-01']]);
		const older = paper({ key: 'NOTE0001', title: 'arrived first', created: 9_999_999_999_999 });
		const rows = rowsByStage([older], [item('AAAA1111', 'arrived later')], true, arrived);
		expect(rows.get('triage')?.map(rowTitle)).toEqual(['arrived first', 'arrived later']);
	});

	// The bug this ordering exists for: clicking a pending row writes its note,
	// which used to send it from the front of the section to the bottom.
	it('leaves a row where it was when acting on it gives it a note', () => {
		const arrived = new Map([['AAAA1111', '2024-01-01'], ['BBBB2222', '2025-01-01']]);
		const first = { ...item('AAAA1111', 'first'), added: '2024-01-01' };
		const second = { ...item('BBBB2222', 'second'), added: '2025-01-01' };
		const before = rowsByStage([], [first, second], true, arrived);
		// The same paper a moment later: a note, created now, still first.
		const after = rowsByStage(
			[paper({ key: 'AAAA1111', title: 'first', created: 9_999_999_999_999 })],
			[second],
			true,
			arrived,
		);
		expect(before.get('triage')?.map(rowTitle)).toEqual(['first', 'second']);
		expect(after.get('triage')?.map(rowTitle)).toEqual(['first', 'second']);
	});

	// Zotero closed, or a paper outside the collection the queue is scoped to.
	it('falls back to when the note was made when Zotero knows nothing of it', () => {
		const rows = rowsByStage(
			[paper({ key: 'X', title: 'older note', created: 1 }), paper({ path: 'b.md', key: 'Y', title: 'newer note', created: 2 })],
			[],
			true,
		);
		expect(rows.get('triage')?.map(rowTitle)).toEqual(['older note', 'newer note']);
	});

	it('keeps a note reset to untriaged, which is the way back from any decision', () => {
		// Resetting a paper is the recovery path. If Triage were only what has no
		// note, a reset paper would vanish instead of coming back.
		const rows = rowsByStage([paper({ state: { reading: 'untriaged', progress: null } })], [], true);
		expect(rows.get('triage')).toHaveLength(1);
	});

	it('leaves every other stage to the vault alone', () => {
		const rows = rowsByStage([paper({ state: { reading: 'queued', progress: null } })], [item('AAAA1111', 'pending')], true);
		expect(rows.get('reading')?.map(rowTitle)).toEqual(['A paper']);
		expect(rows.get('triage')?.map(rowTitle)).toEqual(['pending']);
	});

	it('marks which source a row came from, because only one of them has a note', () => {
		const rows = rowsByStage([paper({ state: { reading: 'untriaged', progress: null } })], [item('AAAA1111', 'pending')], true);
		expect(rows.get('triage')?.map((row) => row.kind).sort()).toEqual(['note', 'pending']);
	});

	it('is just the vault when Zotero has told it nothing', () => {
		const rows = rowsByStage([paper({ state: { reading: 'untriaged', progress: null } })], [], true);
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
		expect(taskOf(paper({ state: { reading: 'queued', progress: null } }))).toBe('reading');
		expect(taskOf(paper({ state: { reading: 'queued', progress: 'read' } }))).toBe('claim');
	});

	// Each half offers its own icon. The claim's repeats what clicking the row
	// does, which is a rule broken on purpose: without it the two rows are
	// identical, and pressing Finished changes nothing anybody can see.
	it('offers a different icon on each, so the two halves are distinguishable', () => {
		expect(TASKS.reading.icon).toBeTruthy();
		expect(TASKS.claim.icon).toBeTruthy();
		expect(TASKS.claim.icon).not.toBe(TASKS.reading.icon);
	});

	// Letting a claim alone release the paper would file one whose `reading`
	// still says queued, and that field is what the exclusions report is built
	// from. The outcome decision is owed whatever else has been written.
	it('keeps a queued paper even once its claim is written', () => {
		expect(taskOf(paper({ state: { reading: 'queued', progress: null } }))).toBe('reading');
	});

	// The tick is what moves it on, and only from a state that owes a pass.
	it('lets a paper go once its pass has been ticked off', () => {
		expect(taskOf(paper({ state: { reading: 'queued', progress: 'summarised' } }))).toBeNull();
		expect(taskOf(paper({ state: { reading: 'promoted', progress: 'assessed' } }))).toBeNull();
	});
});


describe('outcomeOf', () => {
	it('names the state a paper came to rest in', () => {
		expect(outcomeOf(paper({ state: { reading: 'dropped', progress: null } }))).toBe('dropped');
		expect(outcomeOf(paper({ state: { reading: 'deferred', progress: null } }))).toBe('deferred');
		expect(outcomeOf(paper({ state: { reading: 'queued', progress: 'summarised' } }))).toBe('summarised');
		expect(outcomeOf(paper({ state: { reading: 'promoted', progress: 'assessed' } }))).toBe('assessed');
	});

	it('says nothing about a paper still owing something', () => {
		expect(outcomeOf(paper())).toBeNull();
		expect(outcomeOf(paper({ state: { reading: 'untriaged', progress: null } }))).toBeNull();
		expect(outcomeOf(paper({ state: { reading: 'queued', progress: null } }))).toBeNull();
		// Finished but the claim is not written: the second pass is not over.
		expect(outcomeOf(paper({ state: { reading: 'queued', progress: 'read' } }))).toBeNull();
		expect(outcomeOf(paper({ state: { reading: 'promoted', progress: 'read' },  }))).toBeNull();
	});

	// Both of these also make `taskOf` return null, which is why settling is not
	// defined as "nothing outstanding": neither records a decision.
	it('ignores a note that is not a paper', () => {
		expect(outcomeOf(note({ state: { reading: 'dropped', progress: null } }))).toBeNull();
	});

	it('ignores a paper still waiting to be triaged', () => {
		expect(outcomeOf(paper({ state: { reading: 'untriaged', progress: null } }))).toBeNull();
	});
});

describe('settled', () => {
	it('reads backwards: newest decision first', () => {
		const notes = [
			paper({ path: 'a.md', title: 'old', state: { reading: 'dropped', progress: null }, decided: '2026-01-01' }),
			paper({ path: 'b.md', title: 'new', state: { reading: 'dropped', progress: null }, decided: '2026-03-01' }),
			// Not a deferral: those have their own list now, above this one.
			paper({ path: 'c.md', title: 'mid', state: { reading: 'queued', progress: 'summarised' }, decided: '2026-02-01' }),
		];
		expect(settled(notes).map((entry) => entry.note.title)).toEqual(['new', 'mid', 'old']);
	});

	it('keeps an undated decision, at the end', () => {
		const notes = [
			paper({ path: 'a.md', title: 'undated', state: { reading: 'dropped', progress: null } }),
			paper({ path: 'b.md', title: 'dated', state: { reading: 'dropped', progress: null }, decided: '2026-01-01' }),
		];
		expect(settled(notes).map((entry) => entry.note.title)).toEqual(['dated', 'undated']);
	});

	it('carries the decision alongside the note', () => {
		const assessed = paper({ state: { reading: 'promoted', progress: 'assessed' } });
		expect(settled([assessed])).toEqual([{ note: assessed, reading: 'assessed' }]);
	});

	it('leaves out everything still outstanding', () => {
		expect(settled([paper(), paper({ state: { reading: 'queued', progress: null } }), note()])).toEqual([]);
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
	const queued = (title: string, created: number) => paper({ path: `${title}.md`, title, state: { reading: 'queued', progress: null }, created });
	const owesClaim = (title: string, created: number) =>
		paper({ path: `${title}.md`, title, state: { reading: 'queued', progress: 'read' }, created });

	it('separates the paper still to be read from the one still to be summarised', () => {
		const rows = byStage([queued('read-me', 100), owesClaim('write-me', 300)]);
		expect(rows.get('reading')?.map((n) => n.title)).toEqual(['read-me']);
		expect(rows.get('claim')?.map((n) => n.title)).toEqual(['write-me']);
	});

	// Which is what makes finishing a paper visible: it leaves one count and
	// joins another, in a section with a different name and a different icon.
	it('moves a paper between them when the reading ends', () => {
		expect(taskOf(paper({ state: { reading: 'queued', progress: null } }))).toBe('reading');
		expect(taskOf(paper({ state: { reading: 'queued', progress: 'read' } }))).toBe('claim');
	});

	it('sends a promoted paper to the claim first, because a third pass argues with a summary', () => {
		expect(taskOf(paper({ state: { reading: 'promoted', progress: 'read' } }))).toBe('claim');
		expect(taskOf(paper({ state: { reading: 'promoted', progress: 'summarised' } }))).toBe('assessment');
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
		expect(STAGES.map((entry) => entry.task)).toEqual(['triage', 'reading', 'claim', 'assessment']);
	});

	it('puts the claim after the reading it belongs to, as every explanation does', () => {
		const order = STAGES.map((entry) => entry.task);
		expect(order.indexOf('reading')).toBeLessThan(order.indexOf('claim'));
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
 * What the tick on each written pass records.
 *
 * Where the paper lands afterwards is `landing`, read off the pair, so the
 * message distinguishes a paper that is finished with from one that has just
 * acquired an assessment to write. There is no fixed sentence per pass any
 * more: the one there was congratulated you on being able to summarise a paper,
 * which is not something a tick can know.
 */
describe('PASS_PROGRESS', () => {
	it('records the claim as summarised and the assessment as assessed', () => {
		expect(PASS_PROGRESS).toEqual({ claim: 'summarised', assessment: 'assessed' });
	});

	it('names a step the order knows, or a tick would file a paper nowhere', () => {
		for (const progress of Object.values(PASS_PROGRESS)) expect(PROGRESS_ORDER).toContain(progress);
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
		expect(rowsByStage([], [pending.item], true).get('reading')).toHaveLength(0);
	});

	// Saving it to Zotero was the first pass: the abstract was on the page and
	// the connector button was the answer.
	it('wants reading when it does not', () => {
		expect(rowTask(pending, false)).toBe('reading');
		expect(rowsByStage([], [pending.item], false).get('reading')).toHaveLength(1);
		expect(rowsByStage([], [pending.item], false).get('triage')).toHaveLength(0);
	});

	it('lands in whichever section the setting says, either way', () => {
		for (const triage of [true, false]) {
			const stage = triage ? 'triage' : 'reading';
			const already = paper({ state: { reading: triage ? 'untriaged' : 'queued', progress: null }, created: 1 });
			expect(rowsByStage([already], [pending.item], triage).get(stage)?.map((row) => row.kind).sort()).toEqual([
				'note',
				'pending',
			]);
		}
	});

	it('says nothing different about a paper that already has a note', () => {
		const note = { kind: 'note' as const, note: paper({ state: { reading: 'queued', progress: null } }) };
		expect(rowTask(note, true)).toBe('reading');
		expect(rowTask(note, false)).toBe('reading');
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
		expect(shown).toEqual(['reading', 'claim', 'assessment']);
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

/**
 * A paper whose `reading` says something no version of this plugin wrote.
 *
 * It cannot be built as a `NoteState` any more, which is the point of the
 * split: `stateOf` is the only way in and it has nowhere to put a value it does
 * not know. These go through `noteState`, the path a real note takes, and pin
 * that such a paper is still reachable rather than invisible.
 */
describe('a reading value nothing here recognises', () => {
	const odd = (frontmatter: Record<string, unknown>) =>
		noteState({ frontmatter: { 'zotero-key': 'ABCD2345', ...frontmatter } }, file, KEY_FIELD);

	it('goes to Triage, the one place that is neither a stage it earned nor a record', () => {
		expect(taskOf(odd({ reading: 'quued' }))).toBe('triage');
	});

	it('goes to Triage whatever progress the note claims', () => {
		expect(taskOf(odd({ reading: 'quued', 'reading-progress': 'summarised' }))).toBe('triage');
	});

	// It is not a decision, so it does not belong in a record of decisions.
	it('is not counted as decided', () => {
		expect(outcomeOf(odd({ reading: 'quued' }))).toBeNull();
	});

	it('still says nothing about a note that is not a paper', () => {
		expect(taskOf(noteState({ frontmatter: { reading: 'quued' } }, file, KEY_FIELD))).toBeNull();
	});
});

describe('a promoted paper, through both of the passes it earned', () => {
	it('owes a claim first, because a claim must read above an assessment', () => {
		expect(taskOf(paper({ state: { reading: 'promoted', progress: 'read' } }))).toBe('claim');
	});

	it('owes an assessment once the claim is ticked off', () => {
		expect(taskOf(paper({ state: { reading: 'promoted', progress: 'summarised' } }))).toBe('assessment');
	});

	it('comes to rest as assessed once both are ticked off', () => {
		const done = paper({ state: { reading: 'promoted', progress: 'assessed' } });
		expect(taskOf(done)).toBeNull();
		expect(outcomeOf(done)).toBe('assessed');
		expect(settled([done])).toHaveLength(1);
	});
});

describe('TASKS announces', () => {
	// `next` speaks only for the task that leaves Obsidian, because the other
	// three answer for themselves and a second slip is noise.
	it('is false only for reading, which goes to Zotero', () => {
		expect(Object.values(TASKS).filter((task) => !task.announces).map((task) => task.task)).toEqual(['reading']);
	});
});

/**
 * What `next` works on first, which is not what the pane shows first.
 *
 * The sections are read downwards as the shape of the workflow; `next` answers
 * a different question, and answering it with the same list meant Triage almost
 * every time, because Triage is normally longer than everything else together.
 */
describe('NEXT_ORDER', () => {
	it('finishes what is started before starting something new', () => {
		expect(NEXT_ORDER).toEqual(['claim', 'assessment', 'reading', 'triage']);
	});

	it('holds every task exactly once, or one would be unreachable', () => {
		expect([...NEXT_ORDER].sort()).toEqual(STAGES.map((entry) => entry.task).sort());
	});

	// The perishable work first. A paper you read yesterday and have not
	// summarised is decaying; an untriaged paper will triage just as well in
	// March.
	it('puts the claim first and triage last, which the pane does the other way', () => {
		expect(NEXT_ORDER[0]).toBe('claim');
		expect(NEXT_ORDER[NEXT_ORDER.length - 1]).toBe('triage');
		expect(STAGES[0]?.task).toBe('triage');
	});
});

/**
 * Opening a line to write on under a heading.
 *
 * The line you land on wants a blank above and a blank below. Only the one
 * above was arranged, so what you typed came out pressed against whatever
 * followed the section: the next heading after a claim, and the managed region
 * after an assessment, which is the last heading a paper has.
 */
describe('roomUnder', () => {
	it('opens three lines when something sits straight under the heading', () => {
		expect(roomUnder(['some prose'])).toEqual({ newlines: 3, below: 0 });
	});

	// The shipped template exactly: a blank, then the next thing.
	it('opens two when the blank above is there and the one below is not', () => {
		expect(roomUnder(['', '<!--paper-trail-->'])).toEqual({ newlines: 2, below: 1 });
	});

	it('opens one when only the blank below is missing', () => {
		expect(roomUnder(['', '', '<!--paper-trail-->'])).toEqual({ newlines: 1, below: 2 });
	});

	// Arriving at the same heading twice should cost one edit, not two.
	it('opens nothing when the room is already there', () => {
		expect(roomUnder(['', '', ''])).toBeNull();
		expect(roomUnder(['', '', '', 'later prose'])).toBeNull();
	});

	// A heading at the very end of a note has no lines after it at all, and
	// should end up with exactly the room rather than a tail of blanks.
	it('opens three at the end of a note', () => {
		expect(roomUnder([])).toEqual({ newlines: 3, below: 0 });
	});

	it('counts a line of only spaces as blank, because it reads as one', () => {
		expect(roomUnder(['   ', '\t', ''])).toBeNull();
	});
});

/**
 * Writing a heading the note has not got.
 *
 * A paper is made with neither, so the first time you go to write one it has to
 * be put there. Everything from the region marker down is the plugin's, so the
 * note's own shape goes above it.
 */
describe('headingSlot', () => {
	const note = ['# A paper', '', '[Zotero](x)', '', '<!--paper-trail-->', '## Highlights', '<!--/paper-trail-->'];

	it('puts a heading above the managed region', () => {
		expect(headingSlot(note, null)).toBe(4);
	});


	// A claim must read above an assessment, whichever was written first.
	it('puts a claim above an assessment the note already has', () => {
		const withAssessment = ['# A paper', '', '## Assessment', '', 'it strains here', '', '<!--paper-trail-->'];
		expect(headingSlot(withAssessment, 'Assessment')).toBe(2);
	});

	it('ignores the heading it precedes when the note has not got it', () => {
		expect(headingSlot(note, 'Assessment')).toBe(4);
	});

	it('matches a heading whatever its level, case or padding', () => {
		expect(headingSlot(['#### assessment  ', '<!--paper-trail-->'], 'Assessment')).toBe(0);
	});

	// A note somebody has taken the region out of. Appending cannot be wrong.
	it('goes to the end when there is no region and nothing to precede', () => {
		expect(headingSlot(['# A paper', '', 'my own notes'], null)).toBe(3);
	});
});

describe('insertHeading', () => {
	it('writes the heading with a line to type on under it', () => {
		const { at, text, cursor } = insertHeading(['# A paper', '', '<!--paper-trail-->'], 'Claim', null);
		expect(at).toBe(2);
		expect(text).toBe('## Claim\n\n\n\n');
		expect(cursor).toBe(2);
	});

	// The template leaves a blank line before the region, so nothing is needed.
	it('adds a blank above it only when what it goes under has none', () => {
		expect(insertHeading(['# A paper', '[Zotero](x)', '<!--paper-trail-->'], 'Claim', null).text).toBe(
			'\n## Claim\n\n\n\n',
		);
	});

	it('moves the cursor down with the blank it added', () => {
		expect(insertHeading(['# A paper', '[Zotero](x)', '<!--paper-trail-->'], 'Claim', null).cursor).toBe(3);
	});

	it('writes the heading the setting names, trimmed', () => {
		expect(insertHeading(['<!--paper-trail-->'], '  Argument ', null).text).toContain('## Argument\n');
	});
});

/**
 * The rules asked of a state on its own, which is what a decision has: it
 * wrote the frontmatter and the metadata cache has not caught up.
 */
describe('taskFor', () => {
	it('answers exactly as taskOf does for a paper', () => {
		for (const reading of READING_ORDER) {
			for (const progress of [null, ...PROGRESS_ORDER]) {
				const state = { reading, progress };
				expect(taskFor(state), `${reading}/${progress}`).toBe(taskOf(paper({ state })));
			}
		}
	});

	it('knows a paper that has been read owes a claim', () => {
		expect(taskFor({ reading: 'queued', progress: 'read' })).toBe('claim');
	});

	it('knows only a promoted paper is ever owed an assessment', () => {
		expect(taskFor({ reading: 'promoted', progress: 'summarised' })).toBe('assessment');
		expect(taskFor({ reading: 'queued', progress: 'summarised' })).toBeNull();
	});

	// The two headings are written because a paper is waiting on one. A paper
	// nobody is waiting on must not acquire a section for work not asked for.
	it('asks nothing of a paper that has been ruled out', () => {
		expect(taskFor({ reading: 'dropped', progress: null })).toBeNull();
		expect(taskFor({ reading: 'deferred', progress: 'read' })).toBeNull();
	});
});

describe('headingLineIn', () => {
	it('finds the heading in the note it was handed', () => {
		expect(headingLineIn(['# A paper', '', '## Claim', ''], 'Claim')).toBe(2);
	});

	it('matches the heading loosely, as the setting may be padded or cased', () => {
		expect(headingLineIn(['### claim '], '  Claim')).toBe(0);
	});

	it('is not fooled by the word appearing in prose', () => {
		expect(headingLineIn(['The claim is that', 'Claim'], 'Claim')).toBeNull();
	});
});

/**
 * The note as a decision leaves it, which is where the heading now comes from.
 * It used to arrive when you first went to write under it, so a paper you were
 * told to summarise had nowhere to summarise it until you pressed the button
 * in the queue a second time.
 */
describe('withHeading', () => {
	const note = ['# A paper', '', '[Zotero](x)', '', '<!--paper-trail-->', '<!--/paper-trail-->', ''].join('\n');

	it('puts the heading above the region, where a note\'s own shape lives', () => {
		expect(withHeading(note, 'Claim', null)).toBe(
			['# A paper', '', '[Zotero](x)', '', '## Claim', '', '', '', '<!--paper-trail-->', '<!--/paper-trail-->', ''].join(
				'\n',
			),
		);
	});

	// Which is what keeps a decision from moving a modified time for nothing,
	// and what makes writing it on every decision cost nothing after the first.
	it('returns the note untouched when the heading is already there', () => {
		const once = withHeading(note, 'Claim', null);
		expect(withHeading(once, 'Claim', null)).toBe(once);
	});

	it('leaves a line to write on, so arriving at it needs no second edit', () => {
		const lines = withHeading(note, 'Claim', null).split('\n');
		const at = headingLineIn(lines, 'Claim') ?? -1;
		expect(roomUnder(lines.slice(at + 1, at + 4))).toBeNull();
	});

	it('puts a claim above an assessment the note already has', () => {
		const assessed = withHeading(note, 'Assessment', null);
		const lines = withHeading(assessed, 'Claim', 'Assessment').split('\n');
		expect(headingLineIn(lines, 'Claim')).toBeLessThan(headingLineIn(lines, 'Assessment') ?? -1);
	});

	// A note somebody has taken the region out of. Appending is the one answer
	// that cannot be wrong, and losing the heading is not an option.
	it('appends to a note with no region to go above', () => {
		expect(withHeading('# A paper\n', 'Claim', null)).toContain('## Claim');
	});
});

/**
 * The check the tick makes before it records a pass as done. Not whether what
 * you wrote is enough, which is the mistake the tick exists to undo, but
 * whether anything is there at all.
 */
describe('writtenUnder', () => {
	const note = (...body: string[]) => ['# A paper', '', '## Claim', ...body, '<!--paper-trail-->', '<!--/paper-trail-->'];

	it('sees a claim that has been written', () => {
		expect(writtenUnder(note('', 'It argues that x.', ''), 'Claim')).toBe(true);
	});

	// Which is the whole case it is for: a heading the plugin put in, with the
	// blank lines it put in under it, and nothing typed between them.
	it('sees through the blank lines the heading arrived with', () => {
		expect(writtenUnder(note('', '', ''), 'Claim')).toBe(false);
	});

	// The region opens directly under the last heading a paper has, so an
	// assessment nobody wrote would otherwise be evidenced by the highlights.
	it('does not read the managed region as the work', () => {
		const assessed = ['## Assessment', '', '<!--paper-trail-->', '## Highlights', '', '> a passage'];
		expect(writtenUnder(assessed, 'Assessment')).toBe(false);
	});

	it('stops at the next heading, so a claim is not evidenced by an assessment', () => {
		expect(writtenUnder(['## Claim', '', '## Assessment', 'It strains here.'], 'Claim')).toBe(false);
	});

	it('says no when the note has no such heading', () => {
		expect(writtenUnder(['# A paper', 'Something.'], 'Claim')).toBe(false);
	});

	it('matches the heading as loosely as everything else does', () => {
		expect(writtenUnder(['### claim ', 'It argues that x.'], 'Claim')).toBe(true);
	});
});

/**
 * The two lists under the stages. A deferral is a promise with a condition on
 * it, so it is not filed with the papers you are done with.
 */
describe('parked and settled', () => {
	const at = (reading: Reading, progress: Progress | null, decided: string) =>
		paper({ state: { reading, progress }, decided, title: `${reading} ${decided}` });

	const notes = [
		at('deferred', null, '2026-01-02'),
		at('dropped', null, '2026-01-03'),
		at('queued', 'summarised', '2026-01-04'),
		at('promoted', 'assessed', '2026-01-05'),
		at('deferred', 'read', '2026-01-06'),
	];

	it('keeps every deferral out of the record', () => {
		expect(settled(notes).map((entry) => entry.reading)).not.toContain('deferred');
	});

	it('holds only deferrals', () => {
		expect(parked(notes).every((entry) => entry.reading === 'deferred')).toBe(true);
		expect(parked(notes)).toHaveLength(2);
	});

	// Or a paper would be in one section or in neither, which is the bug that
	// made a settled paper vanish once already.
	it('between them account for every paper at rest, exactly once', () => {
		expect(parked(notes).length + settled(notes).length).toBe(notes.length);
	});

	it('reads newest first, like the record it is beside', () => {
		expect(parked(notes).map((entry) => entry.note.decided)).toEqual(['2026-01-06', '2026-01-02']);
	});

	it('says nothing about a paper still waiting on something', () => {
		expect(parked([at('promoted', 'read', '2026-01-07')])).toHaveLength(0);
	});
});
