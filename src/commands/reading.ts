// A paper's reading state: forming it in the triage dialog, and changing it by
// hand afterwards.
//
// The pane is one way in, but not the only one. A paper that has actually been
// read needs a way out of the queue, or it sits in the Read stage forever and
// `next` keeps offering it, and only you know when you finished reading.
//
// Every route goes through applyTriage, so the frontmatter a decision leaves
// behind cannot drift between them.
import { Notice, type App, type TFile } from 'obsidian';
import { abstractOf, itemYear, parseItemRef, venueOf, type ItemRef } from '../core/zotero';
import { itemMetadata, SourceError } from '../source';
import { messageOf, say } from '../ui/notify';
import { TriageModal, type Brief } from '../ui/triage-modal';
import { applyTriage, asks, iconOf, landing, READING_ORDER, type Reading, type Triage } from '../core/triage';
import { statusTagsOf } from '../core/settings';
import { isPaper, notAPaper } from '../core/paper-note';
import { createPaperNote } from './papers';
import type { Pending } from '../core/pending';
import { prompt, suggest } from '../ui/prompt';
import { fileOf, nextTriage } from '../outstanding';
import type { Row } from '../core/stages';
import type { Context } from '../context';

/** ISO date, which is what the Linter and every Dataview query want. */
export function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Record a decision. Nothing else: the annotations arrive when the note is
 * opened, which for a paper that has just been read is the next thing that
 * happens anyway, and for one that has just been dropped is never, which is
 * right.
 */
export async function writeTriage(context: Context, file: TFile, triage: Triage): Promise<void> {
	const date = today();
	await context.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		applyTriage(frontmatter, triage, date, statusTagsOf(context.settings));
	});
}

/**
 * How each state reads in the list, as a state rather than as an action.
 *
 * Unlike the second-pass chooser, which asks what just happened, this one asks
 * what a paper should be. So "Queued" rather than "worth an hour": you are
 * correcting a record, not making a decision about reading.
 */
const CHOICE_LABELS: Record<Reading, string> = {
	untriaged: 'Untriaged, assess it again',
	queued: 'Queued, worth an hour',
	finished: 'Finished, and that was enough',
	promoted: 'Read, and worth assessing closely',
	deferred: 'Deferred, come back to it later',
	dropped: 'Dropped, not worth reading',
};

/**
 * Built from `READING_ORDER` rather than written out, so the list cannot come
 * to disagree with the pane by someone adding a state in the wrong place. The
 * record shape also means a new state is a compile error until it is labelled.
 */
const CHOICES: { reading: Reading; label: string }[] = READING_ORDER.map((reading) => ({
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
		new Notice('No active note.');
		return;
	}

	if (!isPaper(app.metadataCache.getFileCache(file)?.frontmatter, context.settings.keyField)) {
		new Notice(notAPaper(file.basename, context.settings.keyField));
		return;
	}

	await chooseReading(context, { kind: 'note', file }, file.basename);
}

/**
 * Put the six states to someone and write the one they pick.
 *
 * Takes a target rather than a file, so a queue row can offer it whether or not
 * the paper has a note yet: for one that has none, deciding is what writes it,
 * exactly as it is in the triage dialog.
 *
 * Every state, including the ones no button offers, because the reason to reach
 * for this is to correct a record rather than to make a decision. `landing`
 * rides along on each option so the list says where a paper will end up, which
 * is the thing you cannot know from the word alone.
 */
export async function chooseReading(context: Context, target: TriageTarget, name: string): Promise<void> {
	const choice = await suggest(
		context.app,
		CHOICES,
		(entry) => entry.label,
		`Reading status of ${name}`,
		(entry) => landing(entry.reading),
		(entry) => iconOf(entry.reading),
	);
	if (!choice) return;
	if (!(await decideOn(context, target, choice.reading))) return;

	say(context, `${name}\n${landing(choice.reading)}`);
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
export async function noteFor(context: Context, item: Pending): Promise<TFile> {
	const ref: ItemRef = { key: item.key, groupID: null };
	// The queue's copy is a summary. The note wants the authors and the citation
	// key, which only the item itself carries.
	return createPaperNote(context, await itemMetadata(ref), ref);
}

/**
 * Write a decision, making the note first when there is not one.
 *
 * Every route to a decision comes through here: the triage dialog, the queue's
 * Finished button, the status command and the title bar. The alternative was
 * several copies of "a drop asks why", which is how one of them ends up not
 * asking.
 *
 * Escaping the question abandons the change rather than writing it without an
 * answer. A drop with no reason is a deletion with extra steps, and a deferral
 * with no condition is a paper nobody will ever look at again.
 *
 * Returns the note it wrote to, or null when the question went unanswered.
 * Nothing is created in that case: abandoning a drop halfway through should
 * leave no trace, which it cannot do if the file came first.
 */
export async function decideOn(context: Context, target: TriageTarget, reading: Reading): Promise<TFile | null> {
	const question = asks(reading);

	let reason: string | null = null;
	if (question) {
		reason = await prompt(context.app, question.question, { cta: question.cta });
		if (!reason) return null;
	}

	const file = target.kind === 'note' ? target.file : await noteFor(context, target.item);
	await writeTriage(context, file, { reading, reason });
	return file;
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
 * Wait until Obsidian has read a file, or give up.
 *
 * A note written a moment ago is on disk before the metadata cache knows
 * anything about it. The timeout is the point: a note that never arrives should
 * cost a second, not a promise that never settles.
 */
function indexed(app: App, file: TFile, wait = 1000): Promise<void> {
	if (app.metadataCache.getFileCache(file)) return Promise.resolve();

	return new Promise((resolve) => {
		const done = () => {
			app.metadataCache.offref(ref);
			window.clearTimeout(timer);
			resolve();
		};
		const ref = app.metadataCache.on('changed', (changed) => {
			if (changed.path === file.path) done();
		});
		const timer = window.setTimeout(done, wait);
	});
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
	const decide = async (reading: Reading) => {
		const file = await decideOn(context, target, reading);
		if (!file) return;
		say(context, `${title}\n${landing(reading)}`);
		await advance(context, file, key);
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
