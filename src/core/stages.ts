// Which stage of the workflow a note is waiting at. Pure, so the rules that
// decide what shows up on the homepage are testable and written down once.
//
// This describes state, never a sequence. Nothing here stops a paper going
// straight to written up, because research reading is not a pipeline and a UI
// that pretends otherwise just produces false states.

import type { CachedMetadata } from 'obsidian';
import { TYPE, axisValue, readTags, roleOf, type Types } from './vocabulary';
import { isPaper } from './paper-note';
import type { Pending } from './pending';

export type Stage = 'triage' | 'read' | 'write-up' | 'pass-three' | 'file';

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
	/** The value on the `type/` axis, or null. */
	type: string | null;
	/** Whether anything has been written under the claim heading. */
	hasClaim: boolean;
	/** Whether anything has been written under the assessment heading. */
	hasAssessment: boolean;
	/** Creation time, so a backlog drains in the order things arrived. */
	created: number;
}

export interface StageAction {
	stage: Stage;
	label: string;
	/**
	 * The stage itself, as an icon, for the head of its section in the queue.
	 *
	 * Always present, unlike the action icon below: every stage is drawn as a
	 * folder and a folder beside a tag explorer's iconned ones with nothing in
	 * that slot reads as broken rather than as plain.
	 */
	stageIcon: string;
	/** The button that takes you to the work. */
	action: string;
	/**
	 * The same action as an icon, for a queue row.
	 *
	 * A row in a sidebar has no width to spare: "Open in Zotero" is a hundred
	 * points of label that cannot shrink, and two of those leave a paper's title
	 * about sixteen characters. The label survives as the tooltip and as what a
	 * screen reader reads, which is where a menu still uses it.
	 *
	 * Absent where the action is opening the row's own note, because clicking
	 * the row already does that. A button that repeats the thing next to it
	 * teaches you that the buttons are worth ignoring.
	 */
	icon?: string;
	hint: string;
	/**
	 * A second button that ends the stage, for the one stage whose end the
	 * plugin cannot see.
	 *
	 * Every other stage finishes by doing the thing: a decision is written, a
	 * claim or an assessment is typed, a domain is chosen, and the row leaves of
	 * its own accord. Reading happens in Zotero over days, so nothing in the
	 * vault changes when it is over. Without this the row sits there forever and
	 * `next` offers the same paper every time it is pressed.
	 *
	 * What it opens is a question rather than a single outcome, because the end
	 * of a second pass has four answers and picking one for the reader would be
	 * the same mistake in a smaller place.
	 */
	done?: string;
	/** `done` as an icon, for the same reason `action` has one. */
	doneIcon?: string;
	/**
	 * Whether the action is worth offering from inside the note it concerns.
	 *
	 * Write up and the third pass are finished by typing into the note, so their
	 * action is "open this note", which from inside that note is an offer to do
	 * nothing. The others go somewhere or ask something, and are exactly what you
	 * want to hand when you are looking at the paper.
	 */
	inNote: boolean;
}

export const STAGES: StageAction[] = [
	{
		stage: 'triage',
		stageIcon: 'scan-eye',
		label: 'Triage',
		action: 'Assess',
		icon: 'scan-eye',
		hint: 'Added, not yet assessed. Twenty seconds on the abstract, or eight minutes if it earns them.',
		inNote: true,
	},
	{
		stage: 'read',
		stageIcon: 'book-open',
		label: 'Read',
		action: 'Open in Zotero',
		icon: 'external-link',
		done: 'Finished',
		doneIcon: 'check',
		hint: 'Triage said these are worth an hour.',
		inNote: true,
	},
	{ stage: 'write-up', label: 'Write up', stageIcon: 'square-pen', action: 'Open note', hint: 'Read, but the claim is still empty.', inNote: false },
	{
		stage: 'pass-three',
		stageIcon: 'book-open-check',
		label: 'Third pass',
		action: 'Open note',
		hint: 'You said this one earns four hours. The assessment is still empty.',
		inNote: false,
	},
	{ stage: 'file', label: 'File', stageIcon: 'folder-input', action: 'File it', icon: 'folder-input', hint: 'In the inbox, waiting for a domain.', inNote: true },
];

/** The stage a note is at, as the thing that draws its title bar needs it. */
export function stageActionOf(stage: Stage | null): StageAction | null {
	return STAGES.find((entry) => entry.stage === stage) ?? null;
}

/**
 * A missing `reading` counts as untriaged rather than as nothing at all. A note
 * brought in from somewhere else, or written before the field existed, has no
 * opinion recorded on it, and an unrecorded opinion is one not yet formed.
 */
export function stageOf(note: NoteState, types: Types = TYPE): Stage | null {
	if (note.isPaper) {
		if (note.reading === null || note.reading === 'untriaged') return 'triage';
		if (note.reading === 'queued') return 'read';

		// `pass-three` and `read` both mean the second pass happened, so both owe a
		// claim, and the claim comes first either way: Keshav's third pass is
		// an argument with a paper you can already summarise.
		const finished = note.reading === 'finished' || note.reading === 'pass-three';
		if (finished && !note.hasClaim) return 'write-up';
		if (note.reading === 'pass-three' && !note.hasAssessment) return 'pass-three';

		// `dropped` and `deferred` are both off the list. The difference is on
		// the note, where the record needs it, and not in the machine, where a
		// parked paper that kept appearing would not be parked.
		return null;
	}
	// Only notes you wrote reach this line. The return above is what guarantees
	// it, rather than the tags on a paper: papers are not put on the type axis,
	// but one adopted from another vault may arrive carrying `type/inbox`, and
	// it should not be asked to join a loop its reading status already answers.
	return roleOf(types, note.type) === 'inbox' ? 'file' : null;
}

/** Oldest first within each stage, so the pile drains in the order it arrived. */
export function byStage(notes: NoteState[], types: Types = TYPE): Map<Stage, NoteState[]> {
	const out = new Map<Stage, NoteState[]>(STAGES.map(({ stage }) => [stage, []]));
	for (const note of notes) {
		const stage = stageOf(note, types);
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
		type: axisValue(readTags(frontmatter?.tags), 'type'),
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
export function rowsByStage(notes: NoteState[], pending: Pending[], types: Types = TYPE): Map<Stage, Row[]> {
	const out = new Map<Stage, Row[]>();
	for (const [stage, list] of byStage(notes, types)) {
		out.set(
			stage,
			list.map((note) => ({ kind: 'note' as const, note })),
		);
	}

	const triage = out.get('triage') ?? [];
	out.set('triage', [...pending.map((item) => ({ kind: 'pending' as const, item })), ...triage]);
	return out;
}
