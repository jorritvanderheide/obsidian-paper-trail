// A paper's reading state: forming it in the triage dialog, and changing it by
// hand afterwards.
//
// The pane is one way in, but not the only one. A paper that has actually been
// read needs a way out of the queue, or it sits in Reading forever and
// `next` keeps offering it, and only you know when you finished reading.
//
// Every route goes through applyTriage, so the frontmatter a decision leaves
// behind cannot drift between them.
import { Notice, type App, type TFile } from 'obsidian';
import { abstractOf, itemYear, parseItemRef, venueOf, type ItemRef } from '../core/zotero';
import { itemMetadata, SourceError } from '../source';
import { indexed, settle } from '../ui/editing';
import { editingView, readingView } from '../ui/reveal';
import { messageOf, say } from '../ui/notify';
import { TriageModal, type Brief } from '../ui/triage-modal';
import {
	applyTriage,
	asks,
	arrivalReading,
	deferredLanding,
	judgementIcon,
	label,
	landing,
	lookAgain,
	moves,
	offered,
	READ_AGAIN,
	READING_ORDER,
	stateOf,
	type Progress,
	type Reading,
	type State,
	type Triage,
} from '../core/triage';
import { statusTagsOf } from '../core/settings';
import { isPaper, notAPaper } from '../core/paper-note';
import { createPaperNote } from './papers';
import type { Pending } from '../core/pending';
import { prompt, suggest } from '../ui/prompt';
import { askDeferral, type Waitable } from '../ui/defer-modal';
import { fileOf, nextTriage, paperNote, queue } from '../outstanding';
import { taskFor, unread, withHeading, type Row } from '../core/stages';
import type { Context } from '../context';
import { today } from '../today';

/**
 * Record a decision, put the note into the shape it leaves the paper in, and
 * say where that is.
 *
 * Nothing else: the annotations arrive when the note is opened, which for a
 * paper that has just been read is the next thing that happens anyway, and for
 * one that has just been dropped is never, which is right.
 *
 * Returns the state as written, which every notice about the decision reads.
 * They used to work it out from the choice instead, and a choice is not the
 * state: a judgement leaves progress alone, so a summarised paper sent back to
 * Triage and queued there lands in Filed, not in Reading, whatever the button
 * said.
 */
export async function writeTriage(context: Context, file: TFile, triage: Triage): Promise<State> {
	// What you have typed goes to disk before this does, so the two are never
	// two versions of the note for Obsidian to merge and report.
	await settle(context.app, file);

	const date = today();
	// The state as written, read back out of the object that was just written,
	// rather than assembled from the decision. `applyTriage` is what decides
	// which half of the pair a decision moves, and this has to agree with it.
	// The state before it too, off the same object, for the same reason.
	let before: State = { reading: 'untriaged', progress: null };
	let after: State = { reading: 'untriaged', progress: null };
	await context.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		before = stateOf(frontmatter);
		applyTriage(frontmatter, triage, date, statusTagsOf(context.settings));
		after = stateOf(frontmatter);
	});

	await fitNote(context, file, before, after);
	return after;
}

/**
 * Put the note into the shape its new state means.
 *
 * Two halves of one idea, which is why they are one function. A paper that
 * owes a pass gets the heading for it, so that a paper waiting on a claim has
 * somewhere to put one however you arrive at it: through the queue, through the
 * note you already had open, through search a week later. A paper that owes
 * nothing gets rendered, because the writing is over and an editor there is
 * markdown syntax standing between you and something finished.
 *
 * The second half matters most in the case it is hardest to notice from here:
 * you wrote the claim, the note is open in front of you, and the tick that ends
 * the paper is an inch away in the title bar. Leaving that copy in source mode
 * while a fresh open of the same note rendered would be the plugin disagreeing
 * with itself about a note you are looking at.
 *
 * It is undone the same way. A paper put back on the list, out of Deferred or
 * Filed, gets the editor back in any pane that has it open, where it would
 * otherwise sit rendered like something finished until you reopened it. Only
 * on that way out, from owing nothing to owing something: a paper that was
 * outstanding all along is in whatever mode you left it in.
 *
 * The heading goes through the vault rather than the editor, unlike the blank
 * lines, because the note is usually not open at the moment a decision is made.
 * `process` rather than `modify`, so it edits what is on disk now rather than a
 * copy read before the call, and `withHeading` returns the note untouched when
 * it has the heading already, so nothing is written and no modified time moves.
 */
async function fitNote(context: Context, file: TFile, before: State, state: State): Promise<void> {
	const task = taskFor(state);

	// Nothing outstanding: dropped, parked, or both passes ticked off.
	if (task === null) {
		await readingView(context.app, file);
		return;
	}

	if (taskFor(before) === null) await editingView(context.app, file);

	if (task !== 'claim' && task !== 'assessment') return;

	const claim = task === 'claim';
	const heading = claim ? context.settings.claimHeading : context.settings.assessmentHeading;
	// A claim must read above an assessment, so a paper that somehow has the
	// second and not the first gets the first put in above it.
	const precedes = claim ? context.settings.assessmentHeading : null;

	await context.app.vault.process(file, (current) => withHeading(current, heading, precedes));
}

/**
 * How each judgement reads in the list.
 *
 * Five, and every one a decision about the paper rather than a report about
 * you. The list used to hold nine, because the field held both axes: picking
 * from it meant answering "what do I want to do with this" and "what have I
 * done" from the same menu, and two pairs of labels differed only in a clause
 * at the end. What you have done is not chosen here; it is ticked off on the
 * row that owes it.
 *
 * The state first and what it means after it, unlike the second-pass chooser,
 * which asks what came of a reading. Here you are correcting a record rather
 * than making a decision about reading, so the state is what leads.
 */
const CHOICE_LABELS: Record<Reading, string> = {
	untriaged: 'Untriaged, assess it again',
	queued: 'Queued, worth an hour',
	promoted: 'Promoted, worth a third pass',
	deferred: 'Deferred, come back to it later',
	dropped: 'Dropped, not worth reading',
};

/** One line of the chooser. `progress` and `icon` are set only by `READ_AGAIN`. */
export interface Choice {
	reading: Reading;
	label: string;
	progress?: null;
	icon?: string;
}

/**
 * Built from `READING_ORDER` rather than written out, so the list cannot come
 * to disagree with the pane by someone adding a state in the wrong place. The
 * record shape also means a new state is a compile error until it is labelled.
 */
const CHOICES: Choice[] = READING_ORDER.map((reading) => ({
	reading,
	label: CHOICE_LABELS[reading],
}));

/**
 * Set the reading state by hand, including back to states no button offers.
 * The routes through the block cover the common path; this is how a paper gets
 * out of a state you put it in by mistake.
 */
export async function setReading(context: Context, target?: TFile): Promise<void> {
	const app = context.app;
	const file = target ?? app.workspace.getActiveFile();
	if (!file) {
		new Notice('Open a paper first.');
		return;
	}

	if (!isPaper(app.metadataCache.getFileCache(file)?.frontmatter, context.settings.keyField)) {
		new Notice(notAPaper(file.basename, context.settings.keyField));
		return;
	}

	await chooseReading(context, { kind: 'note', file }, file.basename);
}

/** A judgement worth offering one paper: its line, its icon, and where it would leave the paper. */
export interface Offer {
	choice: Choice;
	icon: string;
	lands: State;
}

/**
 * The judgements that would move a paper, and where it is now.
 *
 * Every one that would move it, including the ones no button offers, because
 * the reason to reach for these is to correct a record rather than to make a
 * decision. Shared by the chooser and a queue row's menu, so the two offer the
 * same things.
 */
export function offersFor(context: Context, target: TriageTarget): { now: State; offers: Offer[] } {
	// Where the paper is now. A paper with no note is wherever the queue shows
	// it, which is what putting it in Zotero meant: Triage with triage on,
	// Reading with it off.
	const note = target.kind === 'note' ? paperNote(context, target.file) : null;
	const now: State = note?.state ?? { reading: arrivalReading(context.settings.triage), progress: null };
	// A deferral that has come back can be deferred again, which is how you say
	// "not yet", though the word on it would not change.
	const due = note?.due ?? false;
	// Where each option lands. A judgement leaves progress alone, so it rides
	// along; `READ_AGAIN` is the one option that clears it.
	const after = (entry: Choice): State => ({
		reading: entry.reading,
		progress: entry.progress === null ? null : now.progress,
	});

	// Beside Queued, and only for a paper that has been read, which is the one
	// case where Queued on its own could not send it back to be read.
	const candidates =
		now.progress === null ? CHOICES : CHOICES.flatMap((entry) => (entry.reading === 'queued' ? [entry, READ_AGAIN] : [entry]));
	const offers = candidates
		.filter((entry) => offered(entry.reading, context.settings.triage, now.progress) && moves(now, after(entry), due))
		.map((entry) => ({
			choice: entry,
			// The icon is the judgement being offered, and where it lands is said
			// beside it. Drawing the landing as the icon as well put the Assessed
			// mark on both Queued and Promoted for a paper already assessed, which
			// read as two wrong icons rather than as one fact said three times.
			icon: entry.icon ?? judgementIcon(entry.reading),
			lands: after(entry),
		}));
	return { now, offers };
}

/** Write a judgement someone picked, and say where it left the paper. */
export async function takeOffer(context: Context, target: TriageTarget, name: string, choice: Choice): Promise<void> {
	const written = await decideOn(context, target, choice.reading, choice.progress);
	if (written) say(context, `${name}\n${written.landing}`);
}

/**
 * Put the judgements to someone and write the one they pick.
 *
 * Takes a target rather than a file, so a queue row can offer it whether or not
 * the paper has a note yet: for one that has none, deciding is what writes it,
 * exactly as it is in the triage dialog.
 *
 * `landing` rides along on each option so the list says where a paper will end
 * up, which is the thing you cannot know from the word alone.
 */
export async function chooseReading(context: Context, target: TriageTarget, name: string): Promise<void> {
	const { now, offers } = offersFor(context, target);
	const offer = await suggest(
		context.app,
		offers,
		(entry) => entry.choice.label,
		// Where it is now goes in the title, because it is no longer in the list:
		// the line that would have said so was the one line that did nothing.
		`Reading status of ${name} · ${label(now)}`,
		(entry) => landing(entry.lands),
		(entry) => entry.icon,
	);
	if (offer) await takeOffer(context, target, name, offer.choice);
}

/**
 * What triage can be pointed at: a paper's note, or a paper in Zotero that has
 * none yet.
 *
 * The second is the ordinary case. Triage is computed from what Zotero holds
 * and the vault does not, so most of what you assess has never been written
 * down, and deciding is what writes it.
 */
export type TriageTarget = { kind: 'note'; file: TFile } | { kind: 'pending'; item: Pending };

/**
 * The dialog, while one is up.
 *
 * Module state rather than a field on anything, because triage has no owner: it
 * is reached from a queue row, from a note's title bar and from `next`, and all
 * three should land in the same dialog rather than stacking a second one over
 * the first.
 */
let open: TriageModal | null = null;

/** The paper a queue row is about, as triage needs to be handed it. */
export function targetOf(app: App, row: Row): TriageTarget | null {
	if (row.kind === 'pending') return { kind: 'pending', item: row.item };
	const file = fileOf(app, row.note);
	return file ? { kind: 'note', file } : null;
}

/** Make the note a decision needs, for a paper that did not have one. */
async function noteFor(context: Context, item: Pending): Promise<TFile> {
	const ref: ItemRef = { key: item.key, groupID: null };
	// The queue's copy is a summary. The note wants the authors and the citation
	// key, which only the item itself carries.
	return createPaperNote(context, await itemMetadata(ref), ref);
}

/**
 * Write a decision, making the note first when there is not one.
 *
 * Every route to a decision comes through here: the triage dialog, the queue's
 * Reading finished button, the status command and the title bar. The
 * alternative was several copies of "a drop asks why", which is how one of
 * them ends up not asking.
 *
 * Escaping the question abandons the change rather than writing it without an
 * answer. A drop with no reason is a deletion with extra steps, and a deferral
 * with no condition is a paper nobody will ever look at again.
 *
 * Returns the note it wrote to and where the decision left the paper, or null
 * when the question went unanswered. Nothing is created in that case:
 * abandoning a drop halfway through should leave no trace, which it cannot do
 * if the file came first.
 */
export async function decideOn(
	context: Context,
	target: TriageTarget,
	reading: Reading,
	progress?: Progress | null,
): Promise<Written | null> {
	const question = asks(reading);

	let reason: string | null = null;
	let until: string | null = null;
	let after: Waitable | null = null;
	if (question && reading === 'deferred') {
		// The one decision that is a promise, so it asks for the way back as well
		// as the reason: a date, or a paper still unread to wait for.
		const deferral = await askDeferral(
			context.app,
			question.question,
			question.cta,
			unread(queue(context).rows, keyOf(context, target)),
			today(),
		);
		if (!deferral) return null;
		reason = deferral.reason;
		until = lookAgain(deferral.lookAgain, today());
		after = deferral.after;
	} else if (question) {
		reason = await prompt(context.app, question.question, { cta: question.cta });
		if (!reason) return null;
	}

	const file = target.kind === 'note' ? target.file : await noteFor(context, target.item);
	const state = await writeTriage(context, file, { reading, reason, progress, until, after: after?.key ?? null });
	return { file, state, landing: deferredLanding(until, after?.title ?? null) ?? landing(state) };
}

/** The Zotero key of the paper a target is about, so it is not offered as its own wait. */
function keyOf(context: Context, target: TriageTarget): string | null {
	if (target.kind === 'pending') return target.item.key;
	const value: unknown = context.app.metadataCache.getFileCache(target.file)?.frontmatter?.[context.settings.keyField];
	return typeof value === 'string' ? value : null;
}

/**
 * A decision as written: the note it went to, where it left the paper, and
 * the sentence saying so.
 *
 * The sentence is worked out here rather than by each caller, because only
 * here is it known that a deferral has a way back, and when.
 */
export interface Written {
	file: TFile;
	state: State;
	landing: string;
}

/**
 * Move on to the next paper waiting, or close the pane.
 *
 * Triage is a sitting, not a series of interruptions: assessing a pile of forty
 * should be decide, decide, decide, and the pane closing after each one made it
 * forty rounds of opening and shutting the same window.
 *
 * It waits for Obsidian to read the note the decision just wrote, because until
 * it has, a paper that had no note still looks like one that has none and would
 * be handed straight back.
 */
async function advance(context: Context, decided: TFile, key: string | null): Promise<void> {
	const app = context.app;
	await indexed(app, decided);

	const next = nextTriage(context, key);
	const target = next ? targetOf(app, next) : null;

	if (target) {
		await openTriage(context, target);
		return;
	}

	open?.close();
	say(context, 'Nothing left to triage.');
}

/**
 * Show a paper in the triage dialog.
 *
 * A pending paper costs no requests at all: the queue already fetched its
 * title, venue, year and abstract when it worked out what was outstanding. A
 * paper that already has a note costs one, because its abstract is not written
 * down anywhere here.
 *
 * Nothing else is opened. The note is not worth showing beside a decision made
 * from the abstract, and most papers reaching triage have no note to show.
 */
export async function openTriage(context: Context, target: TriageTarget): Promise<void> {
	const app = context.app;
	const settings = context.settings;

	let title: string;
	let key: string | null = null;
	let ref: ItemRef | null;
	let brief: Brief = { abstract: null, venue: null, year: null };
	let problem: string | null = null;

	if (target.kind === 'pending') {
		const item = target.item;
		title = item.title;
		key = item.key;
		ref = { key: item.key, groupID: null };
		brief = { abstract: item.abstract, venue: item.venue, year: item.year };
	} else {
		const file = target.file;
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		// A note with no key field at all is not a paper, and nothing in the
		// workflow ever sends one here. A note whose key field is unreadable is a
		// paper as far as every other rule is concerned, so it gets the pane.
		if (!isPaper(frontmatter, settings.keyField)) {
			new Notice(notAPaper(file.basename, settings.keyField));
			return;
		}

		title = typeof frontmatter.title === 'string' ? frontmatter.title : file.basename;
		key = String(frontmatter[settings.keyField]);
		ref = parseItemRef(key);

		// The pane opens whether or not any of this could be found, and that is
		// the whole reason why: triage is the first stage and `next` always
		// offers its oldest row, so a paper that failed here with a notice and
		// changed nothing blocked every other paper in the vault, permanently. A
		// pane that admits what it is missing still ends in a decision, and a
		// decision is what unblocks the queue.
		if (!ref) {
			problem = `${settings.keyField} is "${key}", which is not a Zotero item key. Fix it in the note, or decide from the title.`;
		} else {
			try {
				const item = await itemMetadata(ref);
				brief = { abstract: abstractOf(item), venue: venueOf(item), year: itemYear(item) };
			} catch (error) {
				if (!(error instanceof SourceError)) console.error(error);
				problem = messageOf(error);
			}
		}
	}

	const loaded = { title, brief, problem };

	// Rebuilt for every paper, because it is what closes over the one being
	// decided. Handing the dialog a new paper to show and leaving it the handler
	// it was built with is how a sitting came to write its answers to whichever
	// paper opened it.
	//
	// The notice comes before `advance` rather than after the whole thing, so
	// the answer to what you pressed arrives before the news that the pile is
	// empty. The other way round read as a conclusion before its premise.
	const decide = async ({ reading, progress }: { reading: Reading; progress?: Progress }) => {
		const written = await decideOn(context, target, reading, progress);
		if (!written) return;
		// Where it landed, which is not always where the button points. A note
		// can reach Triage again with progress on it, and a judgement leaves that
		// alone: queue a summarised paper here and it goes to Filed.
		say(context, `${title}\n${written.landing}`);
		await advance(context, written.file, key);
	};

	// One dialog for the whole sitting. Pointing the open one at the next paper
	// rather than opening another is what makes forty decisions forty answers
	// instead of forty dialogs.
	if (open) {
		open.show(loaded, decide);
		return;
	}

	open = new TriageModal(app, loaded, decide, () => (open = null));
	open.open();
}
