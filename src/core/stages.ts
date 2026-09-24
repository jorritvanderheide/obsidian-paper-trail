// Which stage of the workflow a note is waiting at. Pure, so the rules that
// decide what shows up on the homepage are testable and written down once.
//
// This describes state, never a sequence. Nothing here stops a paper going
// straight to written up, because research reading is not a pipeline and a UI
// that pretends otherwise just produces false states.

import type { CachedMetadata } from 'obsidian';
import { isPaper, isRegionStart } from './paper-note';
import { deferralOf, label, landing, stateOf, type Outcome, type Progress, type State } from './triage';
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
	/** Where the paper is: what it earns, and how far you have got. */
	state: State;
	/** Creation time, so a backlog drains in the order things arrived. */
	created: number;
	/**
	 * What you said when you parked or dropped it, or null.
	 *
	 * The Deferred and Filed rows read it. It is the whole reason the Deferred
	 * list is worth drawing: a deferral is a promise with a condition on it, and
	 * a row saying only the title is a promise with the condition left off. On a
	 * dropped paper it is why you ruled it out, which is what year four asks.
	 */
	reason: string | null;
	/**
	 * When a deferral comes back, as an ISO date, or null.
	 */
	until: string | null;
	/** The Zotero key of the paper a deferral waits for, or null. */
	after: string | null;
	/**
	 * Whether a deferral has come back: its date has arrived, or the paper it
	 * was waiting for has been read or dropped.
	 *
	 * Worked out across the whole vault by `markDue`, because the second needs
	 * another paper's state. A note read on its own starts not due, which is
	 * what it is until something has looked.
	 */
	due: boolean;
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
export type Task = 'triage' | 'claim' | 'reading' | 'assessment';

/**
 * The order a paper passes through them, which is the order the queue is read
 * downwards. `next` has an order of its own, below.
 *
 * Claim sat above Reading for a while, ordered by what each one costs so that
 * the cheapest outstanding thing was always at the top. That was a better
 * argument than it was a list: the sidebar is read downwards as the shape of
 * the workflow, and a section that comes after Reading in every explanation
 * and before it on screen is a puzzle to solve rather than a list to read.
 *

 * Declaration order on the type above is not it, and cannot be: that order is
 * arbitrary and nothing can depend on it. This is the one that is meant.
 */
const ORDER: readonly Task[] = ['triage', 'reading', 'claim', 'assessment'];

/**
 * The order `next` works in, which is not the order the queue is read in.
 *
 * Two different questions, and they were answered with one list. The sections
 * are read downwards as the shape of the workflow, so Triage is first; `next`
 * walked the same order and so offered Triage almost every time, because Triage
 * is normally longer than everything else put together. A claim you owed from
 * this morning queued behind four hundred papers you have never opened.
 *
 * Finish what is started. An untriaged paper is stable: it will triage just as
 * well in March. A paper you read yesterday and have not summarised is
 * perishable, and Keshav's test for the second pass, that you can say what it
 * argues, is exactly the thing that decays. So the cheapest work that is also
 * the most urgent comes first, and starting something new comes last.
 */
export const NEXT_ORDER: readonly Task[] = ['claim', 'assessment', 'reading', 'triage'];

/**
 * Everything one task is: the section it heads in the queue, and the work it
 * is asking for.
 *
 * One table rather than two. There was a `Stage` alias for `Task` and a second
 * list keyed by it, on the grounds that a task is work and a stage is a place
 * in a list. They are one per one and always were, so all the split bought was
 * two words for one idea and two places to add a task to.
 *
 * That they coincide is the point rather than an accident. Reading and the
 * claim shared a section once, because they are one of Keshav's passes. That
 * was right about Keshav and wrong about queues: a section is named for what
 * the papers in it are waiting on, and a paper that has been read and not
 * summarised is not waiting on reading. Sharing meant finishing a paper moved
 * nothing, renamed nothing and changed no count, so the one action that ends
 * an hour of work looked like it had failed.
 */
export interface TaskDefinition {
	/** Which task this is, so an entry taken out of the table still knows. */
	task: Task;
	/** The section heading in the queue. */
	label: string;
	/** The task as an icon, at the head of its section. */
	stageIcon: string;
	/** What the section is for, as a tooltip on its header. */
	hint: string;
	/** The button that takes you to the work, and the tooltip on its icon. */
	action: string;
	/**
	 * The same action as an icon, for a queue row.
	 *
	 * A row in a sidebar has no width to spare: "Open in Zotero" is a hundred
	 * points of label that cannot shrink. The label survives as the tooltip and
	 * as what a screen reader reads.
	 *
	 * Every task has one, and that is load-bearing rather than tidy. The row
	 * click does the same thing as the button, so the icon is what says in
	 * advance where the click will take you: Zotero from a reading row, a
	 * heading in the note from the two that are written. A task without one
	 * would be a section whose rows went somewhere you had to try them to learn.
	 */
	icon: string;
	/**
	 * A second button, for the three tasks whose end the plugin cannot see.
	 *
	 * Only triage ends by itself, because deciding is the whole of it. Reading
	 * happens in Zotero over days and changes nothing here; a claim and an
	 * assessment are prose you write, and the plugin used to watch the heading
	 * and call the pass finished when anything appeared under it. One character
	 * counted, so the row left mid-sentence, and there was nowhere to put a note
	 * to yourself under a heading without it being taken for the work. Saying
	 * when you are done is one press, and it is a press you can mean.
	 *
	 * What reading opens is a question rather than a single outcome, because the
	 * end of a second pass has four answers and picking one for the reader would
	 * be the same mistake in a smaller place. The other two are a tick.
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
	 * Whether acting on this task shows you, in Obsidian, which paper it was.
	 *
	 * `next` chooses for you, so it says what it picked. That is worth a notice
	 * only where nothing else answers: triage opens a dialog with the title on
	 * it, and a claim or an assessment puts the cursor in the note and names the
	 * work, so a slip announcing the same paper a beat earlier is the second of
	 * two notices for one keypress. Reading is the one that leaves for Zotero,
	 * which may not even be running, so nothing here would say anything at all.
	 */
	announces: boolean;
}

export const TASKS: Record<Task, TaskDefinition> = {
	triage: {
		task: 'triage',
		label: 'Triage',
		stageIcon: 'scan-eye',
		hint: 'Added, not yet assessed. Twenty seconds on the abstract, or eight minutes if it earns them.',
		action: 'Triage',
		icon: 'scan-eye',
		inNote: true,
		announces: true,
	},
	reading: {
		task: 'reading',
		label: 'Reading',
		stageIcon: 'book-open',
		hint: 'Worth an hour, in Zotero, where your annotations go. Say what came of it when you are done.',
		action: 'Open in Zotero',
		icon: 'external-link',
		done: 'Reading finished',
		doneIcon: 'check',
		inNote: true,
		announces: false,
	},
	claim: {
		task: 'claim',
		label: 'Claim',
		stageIcon: 'pencil',
		hint: 'Read, and not yet summarised. Say what the paper argues, with its evidence, then tick it off.',
		action: 'Write the claim',
		icon: 'pencil',
		done: 'Claim written',
		doneIcon: 'check',
		inNote: false,
		announces: true,
	},
	assessment: {
		task: 'assessment',
		label: 'Assessment',
		stageIcon: 'book-open-check',
		hint: 'You said this one earns four hours. Argue with it under the heading, then tick it off.',
		action: 'Write the assessment',
		// The same mark as the claim, because it is the same verb: put the cursor
		// under a heading and write. Which heading is what the section says.
		icon: 'pencil',
		done: 'Assessment written',
		doneIcon: 'check',
		inNote: false,
		announces: true,
	},
};

/** Every section, in the order a paper passes through them. */
export const STAGES: TaskDefinition[] = ORDER.map((task) => TASKS[task]);

/**
 * Which sections the queue draws, which is all of them but one.
 *
 * A stage keeps its place when it empties. A section that vanished meant the
 * list moved under the cursor as you worked it, and you could never learn
 * where Reading sits; a zero is also worth reading, because "nothing to write
 * up" is different from not being told.
 *
 * Triage with triage turned off is the exception: it is not a stage you work,
 * so a permanent zero teaches nothing and never moves. It comes back the
 * moment something lands in it, which it still can: a note imported from
 * elsewhere with no `reading` on it, or one edited by hand.
 */
export function visibleStages(rows: Map<Task, Row[]>, triage: boolean): TaskDefinition[] {
	return STAGES.filter(({ task }) => !(task === 'triage' && !triage && (rows.get(task) ?? []).length === 0));
}

/**
 * How many of a set of papers carry a heading, for the setting that names it.
 *
 * Renaming a heading after papers carry it leaves them behind: the old heading
 * is not found any more, so the next time one of those papers needs the
 * section it gets a second heading. Counted against the papers that exist
 * rather than against the template, which never carries either heading.
 */
export function headingCoverage(papers: (CachedMetadata | null)[], heading: string): { found: number; total: number } {
	const wanted = heading.trim().toLowerCase();
	const found = papers.filter((cache) =>
		(cache?.headings ?? []).some((entry) => entry.heading.trim().toLowerCase() === wanted),
	).length;
	return { found, total: papers.length };
}

/**
 * What a note is waiting on, or null when nothing is outstanding.
 *
 * Only papers can be outstanding. A note you wrote yourself is finished when
 * you stop typing, and the plugin has no business having an opinion about it.
 */
export function taskOf(note: NoteState): Task | null {
	if (!note.isPaper) return null;

	// A deferral that has come back is outstanding again, in the stage it would
	// return to if you picked it up. Its note still says deferred: coming back is
	// the queue reading a date and another paper, never a write, and the note
	// changes only when you decide something about it.
	if (note.due) return returnsTo(note.state.progress);
	return taskFor(note.state);
}

/**
 * The stage a deferral comes back to: Claim if you had read it, and Reading
 * otherwise, which is also where a paper you had summarised goes to be looked
 * at again.
 */
export function returnsTo(progress: Progress | null): Task {
	return progress === 'read' ? 'claim' : 'reading';
}

/**
 * Whether a deferred paper has come back.
 *
 * Its date has arrived, or the paper it waits for has been read (any progress
 * at all) or dropped, whichever comes first. Only on that evidence: a paper
 * that has no note yet has not been read, and one that has left Zotero never
 * brings anything back, which is what the date is there to cover.
 *
 * `find` turns a Zotero key into the note for it, so this stays a question
 * about plain data and whoever asks decides how to look notes up.
 */
export function isDue(note: NoteState, today: string, find: (key: string) => NoteState | undefined): boolean {
	if (!note.isPaper || note.state.reading !== 'deferred') return false;
	if (note.until !== null && note.until <= today) return true;
	if (note.after === null) return false;

	const other = find(note.after);
	return other !== undefined && (other.state.reading === 'dropped' || other.state.progress !== null);
}

/** Every note, with the deferrals that have come back marked as due. */
export function markDue(notes: NoteState[], today: string): NoteState[] {
	const byKey = new Map(notes.flatMap((note) => (note.key === null ? [] : [[note.key, note] as const])));
	return notes.map((note) => {
		const due = isDue(note, today, (key) => byKey.get(key));
		return due === note.due ? note : { ...note, due };
	});
}

/**
 * The same question asked of a state on its own.
 *
 * Split out because a decision knows the state it just wrote and has no note
 * to hand: the frontmatter is written, the metadata cache has not caught up,
 * and what the paper is now waiting on decides whether its note is owed a
 * heading. Reading it back off a stale cache would answer for the state before
 * the decision.
 */
export function taskFor(state: State): Task | null {
	const { reading, progress } = state;

	// A missing or unreadable `reading` counts as untriaged rather than as
	// nothing at all. A note brought in from somewhere else, or written before
	// the field existed, has no opinion recorded on it, and an unrecorded
	// opinion is one not yet formed.
	if (reading === 'untriaged') return 'triage';

	// Both ways out. The difference is on the note, where the record needs it,
	// and not in the machine, where a parked paper that kept appearing would not
	// be parked.
	if (reading === 'deferred' || reading === 'dropped') return null;

	// What is left is a paper that earns at least a second pass, so what it is
	// waiting on is simply how far you have got with it.
	if (progress === null) return 'reading';
	if (progress === 'read') return 'claim';

	// Only a promoted paper is ever asked for a third pass, which is what
	// promoting it meant.
	if (progress === 'summarised' && reading === 'promoted') return 'assessment';
	return null;
}

/**
 * Where a paper came to rest, or null while it is still outstanding.
 *
 * Every one of the four is an answer somebody gave: three ways a paper can be
 * done with you and one way you can be done with it.
 *
 * A paper and nothing outstanding is a paper at rest, and there is nothing
 * further to test: `taskOf` sends untriaged to Triage and queued to Reading, so
 * what reaches here is always one of the four a decision can leave behind. It
 * used to re-check the value against that list, and the second check is what
 * made a settled paper vanish from both the queue and the record whenever the
 * two readings of the field disagreed. One reading, in one place, stops that.
 */
export function outcomeOf(note: NoteState): Outcome | null {
	if (!note.isPaper || taskOf(note) !== null) return null;

	const { reading, progress } = note.state;
	if (reading === 'dropped' || reading === 'deferred') return reading;
	return progress === 'assessed' ? 'assessed' : 'summarised';
}

/** A paper nothing is outstanding for, and the decision that put it there. */
export interface Settled {
	note: NoteState;
	reading: Outcome;
}

/**
 * Everything at rest, newest decision first.
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
function atRest(notes: NoteState[]): Settled[] {
	return notes
		.flatMap((note) => {
			const reading = outcomeOf(note);
			return reading === null ? [] : [{ note, reading }];
		})
		.sort((a, b) => (b.note.decided ?? '').localeCompare(a.note.decided ?? '') || b.note.created - a.note.created);
}

/**
 * Everything you are done with.
 *
 * Three of the four outcomes, because a deferral is not one of them. It is
 * the one decision that is a promise rather than an ending, and filing it
 * with the papers you finished is how the promise goes quiet: the section is
 * shut by default, so a paper you parked until March joins a list you open
 * once a year to admire.
 */
export function settled(notes: NoteState[]): Settled[] {
	return atRest(notes).filter((entry) => entry.reading !== 'deferred');
}

/**
 * Everything you promised to come back to.
 *
 * Its own list, above the record and below the stages, which is exactly what
 * it is: not work outstanding, because you decided it was not, and not
 * finished either. `next` never offers one and the outstanding count never
 * includes one; the section is there so that a standing count of parked
 * papers is in front of you, and the condition you set is on the row.
 */
export function parked(notes: NoteState[]): Settled[] {
	return atRest(notes).filter((entry) => entry.reading === 'deferred');
}

/**
 * A decided paper in words: the state, when it was reached, and what you said
 * at the time. The tooltip on its row in Deferred or Filed.
 *
 * The reason is the point of it on a deferral, where it is the condition the
 * paper is waiting on and the row is otherwise a title you have to open the
 * note to understand. It earns its place on a drop too: why you ruled a paper
 * out is exactly what you will want two years later, and it is the same
 * sentence the record puts in its table.
 */
export function decidedWords(note: Pick<NoteState, 'state' | 'decided' | 'reason'>): string {
	const word = label(note.state);
	const said = note.decided ? `${word} on ${note.decided}` : word;
	return note.reason ? `${said} · ${note.reason}` : said;
}

/**
 * What a paper's status pill says on hover.
 *
 * Where the paper stands, as a decision would put it, unless you gave a reason
 * for the decision. Then it is the same line its row shows, reason included,
 * because the reason is what you would otherwise open the properties to find.
 * Only a deferral and a drop have one: the first is the condition the paper is
 * waiting on, and "Deferred, with the condition on the note" pointed at it
 * without saying it.
 */
export function statusWords(note: Pick<NoteState, 'state' | 'decided' | 'reason'>): string {
	return note.reason ? decidedWords(note) : `${label(note.state)}. ${landing(note.state)}`;
}

/** Oldest first within each stage, so the pile drains in the order it arrived. */
export function byStage(notes: NoteState[]): Map<Task, NoteState[]> {
	const out = new Map<Task, NoteState[]>(ORDER.map((task) => [task, []]));
	for (const note of notes) {
		const stage = taskOf(note);
		if (stage) out.get(stage)?.push(note);
	}
	for (const list of out.values()) list.sort((a, b) => a.created - b.created);
	return out;
}

/** Whether a line is a markdown heading with this exact text. */
function isHeading(line: string, heading: string): boolean {
	const match = /^#{1,6}\s+(.*)$/.exec(line);
	return match !== null && match[1]?.trim().toLowerCase() === heading.trim().toLowerCase();
}

/**
 * Where a heading the note has not got should be inserted.
 *
 * Above the managed region, because everything from the marker down is the
 * plugin's and the note's own shape belongs above it. Above `precedes` as well
 * when the note has it, so an assessment written before a claim does not leave
 * the claim below it.
 *
 * The end of the note when it has neither, which is a note somebody has taken
 * the region out of. Appending is the one answer that cannot be wrong there.
 */
export function headingSlot(lines: readonly string[], precedes: string | null): number {
	const bounds = [
		lines.findIndex(isRegionStart),
		precedes === null ? -1 : lines.findIndex((line) => isHeading(line, precedes)),
	].filter((at) => at !== -1);

	return bounds.length === 0 ? lines.length : Math.min(...bounds);
}

/** An edit that adds a heading and the room to write under it. */
export interface Insertion {
	/** The line to insert at, at column nothing. */
	at: number;
	text: string;
	/** Lines below `at` the cursor ends on. */
	cursor: number;
}

/**
 * The heading, and the blank lines that make it somewhere to write.
 *
 * A paper is made with neither heading in it. They were in the template, which
 * meant every note ever created carried two empty sections, including every
 * paper dropped on its abstract: an outline of work that was never going to
 * happen. The same argument took the prompts out of the template, and it
 * applies to the headings the prompts used to sit under.
 *
 * So the heading arrives when the paper comes to owe it, and a paper you drop
 * stays three lines long.
 */
export function insertHeading(lines: readonly string[], heading: string, precedes: string | null): Insertion {
	const at = headingSlot(lines, precedes);

	// A blank line above it, unless whatever it is going under already ends in
	// one. Three blank lines below: one to separate, one to write on, and one so
	// what you write is not pressed against what follows.
	const spaced = at > 0 && lines[at - 1]?.trim() !== '';
	return {
		at,
		text: `${spaced ? '\n' : ''}## ${heading.trim()}\n\n\n\n`,
		cursor: (spaced ? 1 : 0) + 2,
	};
}

/**
 * What to open up under a heading so there is a line to write on.
 *
 * The line you land on wants a blank line above it and a blank line below it,
 * which is how anyone writes markdown and what the Linter would put back
 * anyway. Only the one above was arranged, so what you typed came out pressed
 * against whatever followed the section: against the next heading in a claim,
 * and against the managed region in an assessment, which is the last heading a
 * paper has.
 *
 * `following` is the lines the note actually has after the heading, up to
 * three, so a heading at the end of a note is short rather than padded.
 * Answers null when the room is already there, which is what makes arriving at
 * the same heading twice cost one edit rather than two.
 */
export interface Room {
	/** Newlines to insert. */
	newlines: number;
	/** How far below the heading to insert them; 0 is the heading's own end. */
	below: number;
}

export function roomUnder(following: readonly string[]): Room | null {
	const blank = (n: number) => n < following.length && following[n]?.trim() === '';

	if (!blank(0)) return { newlines: 3, below: 0 };
	if (!blank(1)) return { newlines: 2, below: 1 };
	if (!blank(2)) return { newlines: 1, below: 2 };
	return null;
}

/**
 * Whether anything has been written under a heading.
 *
 * For the tick that ends a pass, which records that you consider the work
 * done. Nothing at all under the heading is the one case where that is almost
 * certainly not what you meant, and it is the only case this asks about: the
 * plugin used to watch the heading and call a pass finished as soon as one
 * character appeared, which is why the tick exists. Reading the prose to
 * decide whether it is good enough would be that mistake again. Reading it to
 * notice there is none is a different question.
 *
 * The section ends at the next heading or at the managed region, so the
 * annotations below an assessment are not mistaken for the assessment.
 */
export function writtenUnder(lines: readonly string[], heading: string): boolean {
	const at = headingLineIn(lines, heading);
	if (at === null) return false;

	for (const line of lines.slice(at + 1)) {
		if (isRegionStart(line) || /^#{1,6}\s/.test(line)) return false;
		if (line.trim() !== '') return true;
	}
	return false;
}

/**
 * The line to show the question for a pass on, or null when there should be
 * none.
 *
 * The empty line under an empty heading, which is the line the pencil puts
 * the cursor on: under the blank that separates it from the heading when
 * there is one, and directly under the heading when that is all the room
 * there is. Nothing once anything has been written, because a question over
 * its own answer is the fault that took the prompts out of the template.
 *
 * Nothing either when the heading has no empty line under it at all. The
 * question is drawn on a line, not inserted as one, and pressing the pencil
 * makes the room.
 */
export function questionLine(lines: readonly string[], heading: string): number | null {
	const at = headingLineIn(lines, heading);
	if (at === null || writtenUnder(lines, heading)) return null;

	const blank = (n: number) => n < lines.length && lines[n]?.trim() === '';
	if (blank(at + 1) && blank(at + 2)) return at + 2;
	return blank(at + 1) ? at + 1 : null;
}

/**
 * The line a heading is on in a note's text, or null.
 *
 * The text rather than the cache, for anything about to write to the note. The
 * cache is a parse of what was on disk a moment ago, so a heading written by
 * the decision you just made is not in it yet, and asking it where the Claim
 * heading is answers "nowhere" and writes a second one.
 */
export function headingLineIn(lines: readonly string[], heading: string): number | null {
	const at = lines.findIndex((line) => isHeading(line, heading));
	return at === -1 ? null : at;
}

/**
 * The note with the heading it is waiting on, or the note unchanged when it
 * already has one.
 *
 * A paper gets the heading for the pass it owes at the moment it comes to owe
 * it, rather than the first time you go to write under it. The old moment was
 * the safer one and read as a plugin that had not done its half: you open a
 * paper you were told to summarise and there is nowhere to summarise it, until
 * you go back to the queue and press the button that puts the section in.
 *
 * Still one at a time, which is what keeps the original argument intact: the
 * headings left the template because every paper dropped on its abstract
 * carried an outline of work that was never going to happen. A dropped paper
 * is never waiting on a claim, so it never gets the heading, and an assessment
 * arrives only when the claim is ticked off.
 */
export function withHeading(content: string, heading: string, precedes: string | null): string {
	const lines = content.split('\n');
	if (headingLineIn(lines, heading) !== null) return content;

	const { at, text } = insertHeading(lines, heading, precedes);
	const tail = lines.slice(at).join('\n');
	return at === 0 ? text + tail : `${lines.slice(0, at).join('\n')}\n${text}${tail}`;
}

/**
 * What a note looks like to the rules. Reads the cache, decides nothing.
 *
 * Frontmatter only, now that a finished pass says so rather than being read off
 * the prose under a heading. The headings are still where the cursor goes, but
 * nothing about which section a paper sits in depends on what is under them.
 */
export function noteState(
	cache: CachedMetadata | null,
	file: { path: string; basename: string; created: number },
	keyField: string,
): NoteState {
	const frontmatter = cache?.frontmatter;
	return {
		path: file.path,
		title: typeof frontmatter?.title === 'string' ? frontmatter.title : file.basename,
		isPaper: isPaper(frontmatter, keyField),
		key: isPaper(frontmatter, keyField) ? String(frontmatter[keyField]) : null,
		// Through `stateOf`, so the queue, the record and the pill all read the
		// pair of fields exactly one way.
		state: stateOf(frontmatter),
		created: file.created,
		reason: typeof frontmatter?.['reading-reason'] === 'string' ? frontmatter['reading-reason'] : null,
		...deferralOf(frontmatter),
		due: false,
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
 * Either way nothing is written until you decide on it, and deciding is what
 * gives it a note.
 */
export function rowTask(row: Row, triage: boolean): Task | null {
	if (row.kind !== 'pending') return taskOf(row.note);
	return triage ? 'triage' : 'reading';
}

/**
 * The papers a deferral can wait for: the ones still unread, in Triage and
 * Reading, whether they have a note yet or not.
 *
 * Unread is the whole test, and it also keeps waits from going round in a
 * circle. A deferred paper is in neither section until it comes back, so
 * nothing can be told to wait for a paper that is itself still waiting.
 */
export function unread(rows: ReadonlyMap<Task, Row[]>, except: string | null): { key: string; title: string }[] {
	const seen = new Set<string>();
	return (['triage', 'reading'] as const)
		.flatMap((task) => rows.get(task) ?? [])
		.flatMap((row) => {
			const key = rowKey(row);
			if (key === null || key === except || seen.has(key)) return [];
			seen.add(key);
			return [{ key, title: rowTitle(row) }];
		});
}

/** The Zotero item a row is about, which is the one name both kinds share. */
function rowKey(row: Row): string | null {
	return row.kind === 'note' ? row.note.key : row.item.key;
}

/**
 * The first row that is not the one just ruled on.
 *
 * The skip is not belt and braces. A decision about a paper Zotero holds and
 * the vault does not writes a note, and that note is on disk before Obsidian
 * has read it, so for a moment the paper still looks like it has none and
 * would be offered straight back. Naming the key that was just answered is
 * what keeps triage from handing you the same paper twice.
 */
export function nextAfter(rows: Row[], decided: string | null): Row | null {
	return rows.find((row) => rowKey(row) !== decided) ?? null;
}

/**
 * When a paper arrived, in epoch milliseconds.
 *
 * Zotero's own `dateAdded` wherever it is known, for a note as much as for a
 * paper with no note yet, because that is the thing both kinds actually share.
 * A note's own creation time is when *you* acted, not when the paper arrived: a
 * paper sitting in Zotero since 2024 whose note you make today would sort as
 * the newest thing in its section when it is the oldest.
 *
 * Falling back to the note's creation time covers a paper outside the
 * collection the queue is scoped to, one that has left Zotero, and a Zotero
 * that is not running. Ordering is then what it always was rather than
 * arbitrary.
 */
function arrivedAt(row: Row, arrived: ReadonlyMap<string, string>): number {
	const stamp = (value: string | undefined): number | null => {
		if (value === undefined) return null;
		const ms = Date.parse(value);
		return Number.isNaN(ms) ? null : ms;
	};

	if (row.kind === 'pending') return stamp(row.item.added) ?? 0;
	return stamp(row.note.key === null ? undefined : arrived.get(row.note.key)) ?? row.note.created;
}

/**
 * Every row, by stage, oldest arrival first.
 *
 * One order for the whole section, and that is the point. Pending papers used
 * to be a block at the front and notes a block behind them, each sorted on a
 * different key, so acting on a row moved it from one block to the other:
 * clicking the oldest paper in Reading wrote its note and sent it to the bottom
 * of the section, having changed nothing about where it sits in the workflow.
 *
 * The block order had a reason, and it was a Triage reason: a note already
 * marked untriaged is one you made a point of keeping. It was applied to
 * whichever section pending papers land in, which with triage off is Reading,
 * where it means nothing. Sorting on when the paper arrived says the same thing
 * where it is true and nothing where it is not.
 */
export function rowsByStage(
	notes: NoteState[],
	pending: Pending[],
	triage: boolean,
	arrived: ReadonlyMap<string, string> = new Map(),
): Map<Task, Row[]> {
	const out = new Map<Task, Row[]>();
	for (const [stage, list] of byStage(notes)) {
		out.set(
			stage,
			list.map((note) => ({ kind: 'note' as const, note })),
		);
	}

	// A paper Zotero holds that the vault has no note for is asking for whatever
	// the first thing you do with a paper is, which is what the setting decides.
	const stage: Task = triage ? 'triage' : 'reading';
	out.set(stage, [...(out.get(stage) ?? []), ...pending.map((item) => ({ kind: 'pending' as const, item }))]);

	for (const [task, rows] of out) {
		out.set(
			task,
			[...rows].sort(
				(a, b) => arrivedAt(a, arrived) - arrivedAt(b, arrived) || rowTitle(a).localeCompare(rowTitle(b)),
			),
		);
	}
	return out;
}
