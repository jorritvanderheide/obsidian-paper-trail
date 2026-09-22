import { describe, expect, it } from 'vitest';
import type { CachedMetadata } from 'obsidian';
import { byStage, hasContentUnder, noteState, rowsByStage, rowTitle, stageActionOf, stageOf, STAGES, taskOf, TASKS, type NoteState } from '../src/core/stages';

const paper = (over: Partial<NoteState> = {}): NoteState => ({
	path: 'Literature/a.md',
	title: 'A paper',
	isPaper: true,
	key: 'ABCD2345',
	reading: null,
	hasClaim: false,
	hasAssessment: false,
	created: 0,
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
	...over,
});

describe('stageOf, papers', () => {
	it('puts a paper with no reading field in triage', () => {
		expect(stageOf(paper())).toBe('triage');
	});

	it('puts an explicitly untriaged paper in triage', () => {
		expect(stageOf(paper({ reading: 'untriaged' }))).toBe('triage');
	});

	it('puts a queued paper in read', () => {
		expect(stageOf(paper({ reading: 'queued' }))).toBe('reading');
	});

	it('puts a read paper with no claim in write up', () => {
		expect(stageOf(paper({ reading: 'finished', hasClaim: false }))).toBe('reading');
	});

	it('is done with a read paper that has a claim', () => {
		expect(stageOf(paper({ reading: 'finished', hasClaim: true }))).toBeNull();
	});

	it('is done with a dropped paper, claim or no claim', () => {
		expect(stageOf(paper({ reading: 'dropped' }))).toBeNull();
		expect(stageOf(paper({ reading: 'dropped', hasClaim: true }))).toBeNull();
	});

	it('takes a deferred paper off the list, which is what deferring it is for', () => {
		expect(stageOf(paper({ reading: 'deferred' }))).toBeNull();
		expect(stageOf(paper({ reading: 'deferred', hasClaim: true }))).toBeNull();
	});

	it('asks a promoted paper for the claim before the third pass', () => {
		expect(stageOf(paper({ reading: 'promoted', hasClaim: false }))).toBe('reading');
	});

	it('sends a promoted paper with a claim and no assessment to Assess', () => {
		expect(stageOf(paper({ reading: 'promoted', hasClaim: true, hasAssessment: false }))).toBe('assessment');
	});

	it('is done with a promoted paper once the assessment is written', () => {
		expect(stageOf(paper({ reading: 'promoted', hasClaim: true, hasAssessment: true }))).toBeNull();
	});

	it('never asks a merely read paper for an assessment', () => {
		expect(stageOf(paper({ reading: 'finished', hasClaim: true, hasAssessment: false }))).toBeNull();
	});

});

describe('stageOf, own notes', () => {
	// The filing loop is gone, so a note you wrote is never outstanding. It was
	// the only stage that was not about a paper, and the only thing that read
	// the type axis.
	it('never asks anything of a note that names no Zotero item', () => {
		expect(stageOf(note())).toBeNull();
		expect(stageOf(note({ reading: 'queued' }))).toBeNull();
	});
});

describe('byStage', () => {
	it('keeps every stage present, even empty', () => {
		expect([...byStage([]).keys()]).toEqual(['triage', 'reading', 'assessment']);
		expect([...byStage([]).values()].every((list) => list.length === 0)).toBe(true);
	});

	it('buckets each note once', () => {
		const notes = [paper(), paper({ reading: 'queued' }), note()];
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
const section = (type: string, line: number) => ({ type, position: at(line) });

const file = { path: 'Literature/a.md', basename: 'a', created: 100 };

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
		for (const task of ['claim', 'assessment'] as const) {
			expect(TASKS[task].inNote).toBe(false);
			expect(TASKS[task].action).toBe('Open note');
		}
	});

	it('finds the definition for every stage a note can be at', () => {
		for (const entry of STAGES) expect(stageActionOf(entry.stage)).toBe(entry);
	});

	it('has nothing to offer a note that is not waiting at all', () => {
		expect(stageActionOf(null)).toBeNull();
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

	it('gives no icon to the two whose action the row title already is', () => {
		expect(Object.entries(TASKS).filter(([, t]) => t.icon).map(([name]) => name)).toEqual(['triage', 'read']);
	});

	it('keeps the words, which every tooltip still uses', () => {
		for (const task of Object.values(TASKS)) expect(task.action).toBeTruthy();
	});

});

describe('noteState', () => {
	const cache = (frontmatter: Record<string, unknown>) => ({ frontmatter }) as unknown as CachedMetadata;

	it('is a paper when it names a Zotero item', () => {
		expect(noteState(cache({ 'zotero-key': 'ABCD2345' }), file, 'zotero-key', 'Claim', 'Assessment').isPaper).toBe(true);
	});

	it('is not a paper under a different key field', () => {
		expect(noteState(cache({ 'zotero-key': 'ABCD2345' }), file, 'citekey', 'Claim', 'Assessment').isPaper).toBe(false);
	});

	it('falls back to the basename when there is no title', () => {
		expect(noteState(cache({}), file, 'zotero-key', 'Claim', 'Assessment').title).toBe('a');
	});

	it('reports a missing reading field as null, not as a string', () => {
		expect(noteState(cache({}), file, 'zotero-key', 'Claim', 'Assessment').reading).toBeNull();
		expect(noteState(cache({ reading: 42 }), file, 'zotero-key', 'Claim', 'Assessment').reading).toBeNull();
	});

	it('survives a note with no frontmatter and no cache', () => {
		expect(noteState(null, file, 'zotero-key', 'Claim', 'Assessment')).toMatchObject({ isPaper: false, reading: null });
	});
});

/**
 * The union that makes the virtual queue safe: Triage is what Zotero holds and
 * the vault does not, *plus* notes you deliberately put back into it.
 */
describe('rowsByStage', () => {
	const item = (key: string, title: string) => ({ key, title, abstract: null, venue: null, year: null, added: '2026-01-01' });

	it('puts pending papers into Triage alongside untriaged notes', () => {
		const rows = rowsByStage([paper({ reading: 'untriaged', title: 'a note' })], [item('AAAA1111', 'a pending paper')]);
		expect(rows.get('triage')?.map(rowTitle)).toEqual(['a pending paper', 'a note']);
	});

	it('keeps a note reset to untriaged, which is the way back from any decision', () => {
		// Resetting a paper is the recovery path. If Triage were only what has no
		// note, a reset paper would vanish instead of coming back.
		const rows = rowsByStage([paper({ reading: 'untriaged' })], []);
		expect(rows.get('triage')).toHaveLength(1);
	});

	it('leaves every other stage to the vault alone', () => {
		const rows = rowsByStage([paper({ reading: 'queued' })], [item('AAAA1111', 'pending')]);
		expect(rows.get('reading')?.map(rowTitle)).toEqual(['A paper']);
		expect(rows.get('triage')?.map(rowTitle)).toEqual(['pending']);
	});

	it('marks which source a row came from, because only one of them has a note', () => {
		const rows = rowsByStage([paper({ reading: 'untriaged' })], [item('AAAA1111', 'pending')]);
		expect(rows.get('triage')?.map((row) => row.kind)).toEqual(['pending', 'note']);
	});

	it('is just the vault when Zotero has told it nothing', () => {
		const rows = rowsByStage([paper({ reading: 'untriaged' })], []);
		expect(rows.get('triage')?.map((row) => row.kind)).toEqual(['note']);
	});
});

describe('stage icons', () => {
	it('gives every stage one, because a folder with an empty icon slot reads as broken', () => {
		for (const entry of STAGES) expect(entry.stageIcon, entry.stage).toBeTruthy();
	});

	it('gives each stage its own, or two sections look like the same section', () => {
		expect(new Set(STAGES.map((entry) => entry.stageIcon)).size).toBe(STAGES.length);
	});
});

describe('the second pass is one section', () => {
	// Keshav's second pass ends when you can summarise the paper to someone
	// else, so reading it and writing its claim are halves of one pass. They
	// share a section and differ only in what the row offers.
	it('holds an unread paper and an unwritten one together', () => {
		expect(stageOf(paper({ reading: 'queued' }))).toBe('reading');
		expect(stageOf(paper({ reading: 'finished', hasClaim: false }))).toBe('reading');
	});

	it('still tells them apart by the task, which is what the row draws', () => {
		expect(taskOf(paper({ reading: 'queued' }))).toBe('read');
		expect(taskOf(paper({ reading: 'finished', hasClaim: false }))).toBe('claim');
	});

	// The row that owes a claim has no button: its action is opening the note,
	// which clicking the row already does.
	it('offers Zotero on one and nothing extra on the other', () => {
		expect(TASKS.read.icon).toBeTruthy();
		expect(TASKS.claim.icon).toBeUndefined();
	});

	// Letting a claim alone release the paper would file one whose `reading`
	// still says queued, and that field is what the exclusions report is built
	// from. The outcome decision is owed whatever else has been written.
	it('keeps a queued paper even once its claim is written', () => {
		expect(stageOf(paper({ reading: 'queued', hasClaim: true }))).toBe('reading');
		expect(taskOf(paper({ reading: 'queued', hasClaim: true }))).toBe('read');
	});

	it('lets a decided paper go once the claim is there', () => {
		expect(stageOf(paper({ reading: 'finished', hasClaim: true }))).toBeNull();
	});
});

describe('a note written under the old spelling', () => {
	// `pass-three` was the value when the section was called Third pass. Nothing
	// says that any more, so the value is `promoted` now and old notes are read
	// rather than rewritten: a paper you finished last year goes on behaving
	// exactly as it did, without the plugin touching it.
	const old = { path: 'Literature/a.md', basename: 'a', created: 0 };
	const cached = (reading: string) =>
		noteState({ frontmatter: { 'zotero-key': 'ABCD2345', reading } }, old, 'zotero-key', 'Claim', 'Assessment');

	it('reads pass-three as promoted', () => {
		expect(cached('pass-three').reading).toBe('promoted');
	});

	it('puts it in the same place a newly promoted paper goes', () => {
		expect(stageOf(cached('pass-three'))).toBe('reading');
		expect(taskOf(cached('pass-three'))).toBe('claim');
	});

	it('leaves every other value exactly as it was written', () => {
		for (const value of ['untriaged', 'queued', 'finished', 'deferred', 'dropped', 'something-of-your-own']) {
			expect(cached(value).reading, value).toBe(value);
		}
	});
});
