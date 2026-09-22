// Which stage of the workflow a note is waiting at. Pure, so the rules that
// decide what shows up on the homepage are testable and written down once.
//
// This describes state, never a sequence. Nothing here stops a paper going
// straight to written up, because research reading is not a pipeline and a UI
// that pretends otherwise just produces false states.

import type { CachedMetadata } from 'obsidian';
import { isPaper } from './paper-note';
import { currentReading, type Reading } from './triage';
import type { Pending } from './pending';

/** Everything the rules need, read from Obsidian's metadata cache. */
export interface NoteState {
	path: string;
	title: string;
	/** Whether the note names a Zotero item, which is what makes it a paper. */
	isPaper: boolean;
	/**
	 * The Zotero item this note is for, or null when it is not a paper.
	 *
	 * Here so the queue can subtract what the vault already has from what Zotero
	 * holds. Without it, working out what is pending would mean reading every
	 * note's frontmatter a second time.
	 */
	key: string | null;
	/** The `reading` property, or null when the note has none. */
	reading: string | null;
	/** Whether anything has been written under the claim heading. */
	hasClaim: boolean;
	/** Whether anything has been written under the assessment heading. */
	hasAssessment: boolean;
	/** Creation time, so a backlog drains in the order things arrived. */
	created: number;
	/**
	 * The `reading-date` property, or null when the note has none.
	 *
	 * Only the settled list reads it. A backlog is ordered by when a paper
	 * arrived, because that is what makes it a queue; a record is ordered by
	 * when you decided, because that is what makes it a record.
	 */
	decided: string | null;
}

/**
 * What a paper is waiting on.
 *
 * Four of them for Keshav's three passes, because his second pass ends in a
 * test rather than a document: "you should be able to summarize the main
 * thrust of the paper, with supporting evidence, to someone else". Reading the
 * paper and being able to say what it argues are halves of one pass, and
 * writing the summary down is this plugin's own addition to it.
 */
export type Task = 'triage' | 'claim' | 'read' | 'assessment';

/**
 * A section of the queue. One per task, which is why this is an alias.
 *
 * Reading and the claim shared a section once, on the grounds that they are
 * one pass. That was right about Keshav and wrong about queues: the section a
 * paper sits in is named for what it is waiting on, and a paper that has been
 * read and not summarised is not waiting on reading. Sharing meant finishing a
 * paper moved nothing, renamed nothing and changed no count, so the one action
 * that ends an hour of work looked like it had failed.
 */
export type Stage = Task;

export interface TaskAction {
	/** The button that takes you to the work, and the tooltip on its icon. */
	action: string;
	/**
	 * The same action as an icon, for a queue row.
	 *
	 * A row in a sidebar has no width to spare: "Open in Zotero" is a hundred
	 * points of label that cannot shrink. The label survives as the tooltip and
	 * as what a screen reader reads.
	 *
	 * Every task has one, and that is load-bearing rather than tidy. Clicking a
	 * row shows you the paper and does nothing else, so the button is the only
	 * way the work is reached: a task without one would be a section of the
	 * queue you could look at and not act on.
	 *
	 * Two of them are a jump rather than an opening. The row opens a note at the
	 * top; the pencil opens it at the heading that is owed, with the cursor on
	 * an empty line under it. That is the difference between looking a paper up
	 * and sitting down to write about it.
	 */
	icon?: string;
	/**
	 * A second button, for the one task whose end the plugin cannot see.
	 *
	 * Every other task ends by doing the thing: a decision is written, a claim
	 * or an assessment is typed, and the row leaves of its own accord. Reading
	 * happens in Zotero over days, so nothing in the vault changes when it is
	 * over. Without this the row would sit there forever.
	 *
	 * What it opens is a question rather than a single outcome, because the end
	 * of a second pass has four answers and picking one for the reader would be
	 * the same mistake in a smaller place.
	 */
	done?: string;
	/** The `done` button as an icon, for the same reason the action has one. */
	doneIcon?: string;
	/**
	 * Whether the action is worth offering from inside the note it concerns.
	 *
	 * A claim or an assessment is written by typing into the note, so the action
	 * is "open this note", which from inside that note is an offer to do
	 * nothing. The others go somewhere or ask something.
	 */
	inNote: boolean;
	/**
	 * What to say when this task ends by itself, for the two that do.
	 *
	 * A triage decision and the end of a reading both announce themselves,
	 * because you pressed something and `landing` answered. A claim and an
	 * assessment end when prose appears under a heading, which nothing presses
	 * and nothing answers: the row simply stops being there. That is the one
	 * completion in the plugin with no acknowledgement, and it is the completion
	 * the whole stage exists for.
	 */
	completed?: string;
	/**
	 * The question to put when you arrive at the heading, for the two tasks that
	 * are answered by writing under one.
	 *
	 * These lived in the note, as HTML comments the template left under each
	 * heading. That was the only way to ask at the point of use when there was
	 * no moment to ask at. Now that landing on the heading is a moment, the
	 * instruction belongs to it: asked once, always current, and gone the
	 * instant it is answered, rather than sitting in every paper you ever made
	 * including the ones you dropped.
	 */
	prompt?: string;
}

export const TASKS: Record<Task, TaskAction> = {
	triage: { action: 'Triage', icon: 'scan-eye', inNote: true },
	read: { action: 'Open in Zotero', icon: 'external-link', done: 'Finished', doneIcon: 'check', inNote: true },
	claim: {
		action: 'Write the claim',
		icon: 'pencil',
		inNote: false,
		completed: 'The second pass is done: you can say what it argues.',
		prompt: 'What does this paper argue? One or two sentences, in your own words.',
	},
	assessment: {
		action: 'Write the assessment',
		// The same mark as the claim, because it is the same verb: put the cursor
		// under a heading and write. Which heading is what the section says.
		icon: 'pencil',
		inNote: false,
		completed: 'The third pass is done.',
		prompt: 'Where does it strain? What is it assuming? What is the evidence actually doing?',
	},
};

/** One section of the queue: a heading, a count, and the rows under it. */
export interface StageAction {
	stage: Stage;
	label: string;
	/** The stage as an icon, at the head of its section. */
	stageIcon: string;
	hint: string;
}

/**
 * Every section, in the order a paper passes through them.
 *
 * Claim sat above Reading for a while, ordered by what each one costs so that
 * the cheapest outstanding thing was always at the top. That was a better
 * argument than it was a list: the sidebar is read downwards as the shape of
 * the workflow, and a section that comes after Reading in every explanation
 * and before it on screen is a puzzle to solve rather than a list to read.
 *
 * `next` walks this order too, so it prefers a reading to a claim. That costs
 * less than it sounds: Triage is normally the longest section by an order of
 * magnitude, so it is what `next` almost always offers whatever comes after.
 */
export const STAGES: StageAction[] = [
	{
		stage: 'triage',
		stageIcon: 'scan-eye',
		label: 'Triage',
		hint: 'Added, not yet assessed. Twenty seconds on the abstract, or eight minutes if it earns them.',
	},
	{
		stage: 'read',
		stageIcon: 'book-open',
		label: 'Reading',
		hint: 'Worth an hour, in Zotero, where your highlights go. Say what came of it when you are done.',
	},
	{
		stage: 'claim',
		stageIcon: 'pencil',
		label: 'Claim',
		hint: 'Read, and not yet summarised. Keshav’s second pass ends when you can say what the paper argues, with its evidence, to someone else. Write that and it leaves.',
	},
	{
		stage: 'assessment',
		stageIcon: 'book-open-check',
		label: 'Assessment',
		hint: 'You said this one earns four hours. The assessment is still empty.',
	},
];

/** The stage a note is at, as the thing that draws its title bar needs it. */
export function stageActionOf(stage: Stage | null): StageAction | null {
	return STAGES.find((entry) => entry.stage === stage) ?? null;
}

/**
 * A missing `reading` counts as untriaged rather than as nothing at all. A note
 * brought in from somewhere else, or written before the field existed, has no
 * opinion recorded on it, and an unrecorded opinion is one not yet formed.
 *
 * Only papers can be outstanding. A note you wrote yourself is finished when
 * you stop typing, and the plugin has no business having an opinion about it.
 */
export function taskOf(note: NoteState): Task | null {
	if (!note.isPaper) return null;

	if (note.reading === null || note.reading === 'untriaged') return 'triage';

	// Queued keeps the paper here even once a claim exists, because the outcome
	// of the reading is still unrecorded. Letting it leave on the claim alone
	// would file a paper whose `reading` says it was never finished, and that
	// field is the record the exclusions report is built from.
	if (note.reading === 'queued') return 'read';

	// `promoted` and `finished` both mean the second pass happened, so both owe
	// a claim, and the claim comes first either way: assessing a paper is an
	// argument with one you can already summarise.
	const finished = note.reading === 'finished' || note.reading === 'promoted';
	if (finished && !note.hasClaim) return 'claim';
	if (note.reading === 'promoted' && !note.hasAssessment) return 'assessment';

	// `dropped` and `deferred` are both off the list. The difference is on
	// the note, where the record needs it, and not in the machine, where a
	// parked paper that kept appearing would not be parked.
	return null;
}

/**
 * Which section the note sits under, which is simply what it is waiting on.
 *
 * Kept as its own name rather than folded into `taskOf` because the two words
 * answer different questions: a task is work, a stage is a place in a list.
 * That they now coincide is the point of giving the claim its own section.
 */
export function stageOf(note: NoteState): Stage | null {
	return taskOf(note);
}

/**
 * The states a paper can come to rest in. Every one of them is an answer
 * somebody gave: three ways a paper can be done with you and one way you can
 * be done with it.
 */
const SETTLED: readonly Reading[] = ['finished', 'promoted', 'deferred', 'dropped'];

/**
 * Where a paper came to rest, or null while it is still outstanding.
 *
 * Deliberately narrower than "taskOf returned null". That is also true of a
 * note you wrote yourself, and of a paper whose `reading` says something no
 * version of this plugin ever wrote. Neither belongs in a record of decisions,
 * because neither records one.
 */
export function settledOf(note: NoteState): Reading | null {
	if (!note.isPaper || taskOf(note) !== null) return null;
	return SETTLED.find((value) => value === note.reading) ?? null;
}

/** A paper nothing is outstanding for, and the decision that put it there. */
export interface Settled {
	note: NoteState;
	reading: Reading;
}

/**
 * Everything decided, newest decision first.
 *
 * The one list in the queue that reads backwards, and that is the point. A
 * stage drains oldest first because a backlog is worked from the bottom of the
 * pile; this is the record, and the useful end of a record is the end you just
 * added to. It is also the only evidence that a morning of triage happened at
 * all, since every other section answers by getting shorter.
 *
 * Papers with no `reading-date` sort last rather than being dropped. A note
 * brought in from another vault, or decided before the field existed, is still
 * a decision, and hiding it would make the count disagree with the list.
 */
export function settled(notes: NoteState[]): Settled[] {
	return notes
		.flatMap((note) => {
			const reading = settledOf(note);
			return reading === null ? [] : [{ note, reading }];
		})
		.sort((a, b) => (b.note.decided ?? '').localeCompare(a.note.decided ?? '') || b.note.created - a.note.created);
}

/** Oldest first within each stage, so the pile drains in the order it arrived. */
export function byStage(notes: NoteState[]): Map<Stage, NoteState[]> {
	const out = new Map<Stage, NoteState[]>(STAGES.map(({ stage }) => [stage, []]));
	for (const note of notes) {
		const stage = stageOf(note);
		if (stage) out.get(stage)?.push(note);
	}
	for (const list of out.values()) list.sort((a, b) => a.created - b.created);
	return out;
}

/** Where a heading is in the cache's list, or -1. Matched loosely on case and padding. */
function indexOfHeading(cache: CachedMetadata | null, heading: string): number {
	const wanted = heading.trim().toLowerCase();
	return (cache?.headings ?? []).findIndex((entry) => entry.heading.trim().toLowerCase() === wanted);
}

/**
 * The line a heading is on, or null when the note has none by that name.
 *
 * For putting a cursor where the work happens. Finishing a paper takes you to
 * the claim heading rather than to the top of the note, because the note opens
 * on a title and some links and the thing being asked for is four screens down
 * past highlights you have already read.
 */
export function headingLine(cache: CachedMetadata | null, heading: string): number | null {
	const index = indexOfHeading(cache, heading);
	return index === -1 ? null : (cache?.headings?.[index]?.position.start.line ?? null);
}

/**
 * Whether a heading has anything under it, judged from the cache alone so that
 * nothing has to read every note in the vault. Comments and the heading itself
 * do not count, which is what makes an untouched template section read as empty.
 */
export function hasContentUnder(cache: CachedMetadata | null, heading: string): boolean {
	const headings = cache?.headings ?? [];
	const index = indexOfHeading(cache, heading);
	if (index === -1) return false;

	const start = headings[index]?.position.end.line ?? 0;
	const end = headings[index + 1]?.position.start.line ?? Number.MAX_SAFE_INTEGER;

	return (cache?.sections ?? []).some(
		(section) =>
			section.type !== 'heading' &&
			section.type !== 'html' &&
			section.type !== 'comment' &&
			section.position.start.line > start &&
			section.position.start.line < end,
	);
}

/** What a note looks like to the rules. Reads the cache, decides nothing. */
export function noteState(
	cache: CachedMetadata | null,
	file: { path: string; basename: string; created: number },
	keyField: string,
	claimHeading: string,
	assessmentHeading: string,
): NoteState {
	const frontmatter = cache?.frontmatter;
	return {
		path: file.path,
		title: typeof frontmatter?.title === 'string' ? frontmatter.title : file.basename,
		isPaper: isPaper(frontmatter, keyField),
		key: isPaper(frontmatter, keyField) ? String(frontmatter[keyField]) : null,
		// Through `currentReading`, so a note written under an older spelling is
		// read as what that value is called now and nothing below has to know.
		reading: typeof frontmatter?.reading === 'string' ? currentReading(frontmatter.reading) : null,
		hasClaim: hasContentUnder(cache, claimHeading),
		hasAssessment: hasContentUnder(cache, assessmentHeading),
		created: file.created,
		decided: typeof frontmatter?.['reading-date'] === 'string' ? frontmatter['reading-date'] : null,
	};
}

/**
 * One line in the queue: a note the vault holds, or a paper Zotero holds that
 * the vault does not.
 *
 * Two sources rather than one type, because they genuinely are two things. A
 * note has a path, a stage and a claim; a pending paper has an abstract and
 * nothing written down at all. Flattening them into one shape would mean half
 * the fields being null half the time and every reader having to know which
 * half it was looking at.
 */
export type Row = { kind: 'note'; note: NoteState } | { kind: 'pending'; item: Pending };

/** What a row is called, wherever it came from. */
export function rowTitle(row: Row): string {
	return row.kind === 'note' ? row.note.title : row.item.title;
}

/**
 * What a row is asking for.
 *
 * A pending paper is one Zotero holds that the vault has no note for, so what
 * it is asking for is whatever you decided putting it in Zotero means. With
 * triage on it wants ruling on; with triage off that ruling already happened,
 * in the browser, and what it wants is reading.
 *
 * Either way nothing is written until you act on it, and acting is what gives
 * it a note.
 */
export function rowTask(row: Row, triage: boolean): Task | null {
	if (row.kind !== 'pending') return taskOf(row.note);
	return triage ? 'triage' : 'read';
}

/** The Zotero item a row is about, which is the one name both kinds share. */
export function rowKey(row: Row): string | null {
	return row.kind === 'note' ? row.note.key : row.item.key;
}

/**
 * Every row, by stage: the vault's, plus the pending papers at the front of
 * Triage.
 *
 * Pending first within Triage, because they are the ones that arrived by
 * themselves. A note already marked untriaged is one you made a point of
 * keeping, usually by resetting it to look at again, and it has waited longer
 * than anything the queue has just noticed.
 */
export function rowsByStage(notes: NoteState[], pending: Pending[], triage: boolean): Map<Stage, Row[]> {
	const out = new Map<Stage, Row[]>();
	for (const [stage, list] of byStage(notes)) {
		out.set(
			stage,
			list.map((note) => ({ kind: 'note' as const, note })),
		);
	}

	// Whichever section pending papers belong to, they go at the front of it.
	// They are the ones that arrived by themselves; anything already in the
	// vault got there by a decision and has waited longer.
	const stage: Stage = triage ? 'triage' : 'read';
	const rest = out.get(stage) ?? [];
	out.set(stage, [...pending.map((item) => ({ kind: 'pending' as const, item })), ...rest]);
	return out;
}
