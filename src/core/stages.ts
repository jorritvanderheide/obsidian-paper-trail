// Which stage of the workflow a note is waiting at. Pure, so the rules that
// decide what shows up on the homepage are testable and written down once.
//
// This describes state, never a sequence. Nothing here stops a paper going
// straight to written up, because research reading is not a pipeline and a UI
// that pretends otherwise just produces false states.

import type { CachedMetadata } from 'obsidian';
import { isPaper } from './paper-note';
import type { Pending } from './pending';

export type Stage = 'triage' | 'reading' | 'assessment';

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
}

/**
 * What a paper owes, which is not the same as which section it sits under.
 *
 * Keshav's second pass ends when "you should be able to summarize the main
 * thrust of the paper, with supporting evidence, to someone else", so reading a
 * paper and writing its claim are two halves of one pass rather than two
 * passes. They share a section. They are still different work, and a row says
 * which by the button it offers.
 */
export type Task = 'triage' | 'read' | 'claim' | 'assessment';

/** Which section a task is drawn under. Four things to do, three passes. */
const SECTION: Record<Task, Stage> = { triage: 'triage', read: 'reading', claim: 'reading', assessment: 'assessment' };

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
	 * Absent where the action is opening the row's own note, because clicking
	 * the row already does that. A button that repeats the thing next to it
	 * teaches you that the buttons are worth ignoring.
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
}

export const TASKS: Record<Task, TaskAction> = {
	triage: { action: 'Triage', icon: 'scan-eye', inNote: true },
	read: { action: 'Open in Zotero', icon: 'external-link', done: 'Finished', doneIcon: 'check', inNote: true },
	claim: { action: 'Open note', inNote: false },
	assessment: { action: 'Open note', inNote: false },
};

/** One section of the queue: a heading, a count, and the rows under it. */
export interface StageAction {
	stage: Stage;
	label: string;
	/** The stage as an icon, at the head of its section. */
	stageIcon: string;
	hint: string;
}

export const STAGES: StageAction[] = [
	{
		stage: 'triage',
		stageIcon: 'scan-eye',
		label: 'Triage',
		hint: 'Added, not yet assessed. Twenty seconds on the abstract, or eight minutes if it earns them.',
	},
	{
		stage: 'reading',
		stageIcon: 'book-open',
		label: 'Reading',
		hint: 'Worth an hour, and not finished until you can say what it argues.',
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

	// `pass-three` and `finished` both mean the second pass happened, so both owe
	// a claim, and the claim comes first either way: assessing a paper is an
	// argument with one you can already summarise.
	const finished = note.reading === 'finished' || note.reading === 'pass-three';
	if (finished && !note.hasClaim) return 'claim';
	if (note.reading === 'pass-three' && !note.hasAssessment) return 'assessment';

	// `dropped` and `deferred` are both off the list. The difference is on
	// the note, where the record needs it, and not in the machine, where a
	// parked paper that kept appearing would not be parked.
	return null;
}

/** Which section the note sits under, which is its task's section. */
export function stageOf(note: NoteState): Stage | null {
	const task = taskOf(note);
	return task === null ? null : SECTION[task];
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

/**
 * Whether a heading has anything under it, judged from the cache alone so that
 * nothing has to read every note in the vault. Comments and the heading itself
 * do not count, which is what makes an untouched template section read as empty.
 */
export function hasContentUnder(cache: CachedMetadata | null, heading: string): boolean {
	const wanted = heading.trim().toLowerCase();
	const headings = cache?.headings ?? [];
	const index = headings.findIndex((entry) => entry.heading.trim().toLowerCase() === wanted);
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
		reading: typeof frontmatter?.reading === 'string' ? frontmatter.reading : null,
		hasClaim: hasContentUnder(cache, claimHeading),
		hasAssessment: hasContentUnder(cache, assessmentHeading),
		created: file.created,
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
 * A pending paper has no note and so can only be triaged: deciding is the thing
 * that gives it one.
 */
export function rowTask(row: Row): Task | null {
	return row.kind === 'pending' ? 'triage' : taskOf(row.note);
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
export function rowsByStage(notes: NoteState[], pending: Pending[]): Map<Stage, Row[]> {
	const out = new Map<Stage, Row[]>();
	for (const [stage, list] of byStage(notes)) {
		out.set(
			stage,
			list.map((note) => ({ kind: 'note' as const, note })),
		);
	}

	const triage = out.get('triage') ?? [];
	out.set('triage', [...pending.map((item) => ({ kind: 'pending' as const, item })), ...triage]);
	return out;
}
