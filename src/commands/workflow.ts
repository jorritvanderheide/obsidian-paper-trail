// Acting on one row of the queue. Shared by the `paper-trail` block, the
// sidebar and `next`, so a row does the same thing wherever it was reached
// from.
//
// What is outstanding in the first place is worked out in `outstanding.ts`,
// which triage needs as well and which must not depend on this.
import { Notice, type App, type TFile } from 'obsidian';
import { NEXT_ORDER, rowTask, rowTitle, TASKS, type NoteState, type Row, type Task } from '../core/stages';
import { attachmentKeys, parseItemRef, readerUrl, type ItemRef } from '../core/zotero';
import { selectUrl } from '../core/paper-note';
import { itemChildren } from '../source';
import { decideOn, noteFor, openTriage, targetOf, writeTriage } from './reading';
import { fileOf, queue } from '../outstanding';
import { iconOf, landing, PASS_PROGRESS, PASS_TWO, type State } from '../core/triage';
import { suggest } from '../ui/prompt';
import { say } from '../ui/notify';
import { openAtHeading, reveal } from '../ui/reveal';
import type { Context } from '../context';

/**
 * Show a row's note, reusing the tab it is already in.
 *
 * Clicking the same row twice should not give you two tabs of the same paper,
 * which for a list you click through is the fastest way to a workspace full of
 * duplicates.
 */
export async function openNote(app: App, note: NoteState): Promise<void> {
	const file = fileOf(app, note);
	if (file) await reveal(app, file);
}

/**
 * Where to send someone who is about to read the paper. The `zotero`
 * frontmatter field is a *select* link, which only highlights the row in the
 * library; reading means the PDF, so this resolves the attachment instead.
 *
 * Resolved from Zotero rather than read off the note. A note body can carry
 * several `zotero://open` links, a snapshot alongside the PDF, so picking the
 * first one there would be a coin flip; the select link in the frontmatter is
 * the fallback, and names the item rather than a file.
 */
async function readingUrl(context: Context, file: TFile): Promise<string | null> {
	const app = context.app;
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	const select = typeof frontmatter?.zotero === 'string' ? frontmatter.zotero : null;

	const ref = parseItemRef(frontmatter?.[context.settings.keyField]);
	if (!ref) return select;

	return attachmentUrl(ref, select);
}

/**
 * The reader link for whichever attachment Zotero is offering now, or the
 * select link when it has none.
 *
 * Asked every time rather than remembered. A key used to be cached in the
 * settings to save a request on localhost, which is the wrong trade and the
 * sync already said so: replace a PDF and the note goes on pointing at an
 * attachment that has gone. This is the same call `createPaperNote` and
 * `syncPaper` make, so all three now agree about which file a paper is.
 */
async function attachmentUrl(ref: ItemRef, fallback: string | null): Promise<string | null> {
	try {
		const key = attachmentKeys(await itemChildren(ref))[0];
		return key ? readerUrl(ref, key) : fallback;
	} catch {
		// Zotero not answering is not a reason to open nothing: the select link
		// came off the note and still names the item.
		return fallback;
	}
}

export async function act(context: Context, task: Task, row: Row): Promise<void> {
	const app = context.app;

	if (row.kind === 'pending') {
		// Triaging is what gives a pending paper a note, so it must not have one
		// yet: the dialog writes it along with the decision, or writes nothing.
		if (task === 'triage') {
			await openTriage(context, { kind: 'pending', item: row.item });
			return;
		}

		// Reading one does need a note, and now rather than later. You are about
		// to annotate the paper in Zotero, and the highlights want somewhere to
		// land when you come back. It arrives queued, because with triage off
		// that is what putting it in Zotero meant.
		const ref: ItemRef = { key: row.item.key, groupID: null };
		await noteFor(context, row.item);
		const url = await attachmentUrl(ref, selectUrl(ref));
		if (url) window.open(url);
		return;
	}

	const note = row.note;
	const file = fileOf(app, note);
	if (!file) return;

	switch (task) {
		case 'triage':
			await openTriage(context, { kind: 'note', file });
			return;
		case 'reading': {
			const url = await readingUrl(context, file);
			if (url) window.open(url);
			else await openNote(app, note);
			return;
		}
		case 'claim':
		case 'assessment':
			await writeUnder(context, file, task);
			return;
	}
}

/**
 * Go to the heading a paper is waiting on, put the cursor under it, and ask
 * for what goes there.
 *
 * The question is put here rather than left in the note. It used to be an HTML
 * comment the template wrote under each heading, which was the only way to ask
 * at the point of use when arriving at the point of use meant scrolling. Asked
 * on arrival it is asked once, in the current wording, and is gone as soon as
 * it is answered.
 *
 * A heading the note does not have falls back to the note and says so. The
 * paper can still be ticked off from the row, so this no longer traps it; it
 * is a setting disagreeing with the vault, and worth a word either way.
 */
async function writeUnder(context: Context, file: TFile, task: 'claim' | 'assessment', lead?: string): Promise<void> {
	const claim = task === 'claim';
	const heading = claim ? context.settings.claimHeading : context.settings.assessmentHeading;

	if (await openAtHeading(context.app, file, heading)) {
		// One notice rather than two. A caller that has something to say about
		// how the paper got here says it on the same slip as the question, which
		// is where you are about to be looking anyway. Finishing a reading used
		// to raise both, and they largely said the same thing twice.
		//
		// The prompt is never silenced: it is the question that replaced the ones
		// the template used to carry, and a heading with no question is the state
		// this plugin moved away from. The lead is an answer and can be.
		const answer = context.settings.quietNotices ? undefined : lead;
		const said = [answer, TASKS[task].prompt].filter(Boolean).join('\n');
		if (said) new Notice(said);
		return;
	}

	// The pass can still be ended from the tick beside this button, so this is
	// no longer a paper that can never leave. It is still worth saying: the
	// cursor went nowhere, and a heading the note has not got is a setting that
	// disagrees with the vault.
	new Notice(
		`${file.basename} has no "${heading}" heading, so there is nowhere to put the cursor.\n` +
			`Add it to the note, or change the ${claim ? 'Claim' : 'Assessment'} heading in settings.`,
	);
}

/**
 * Say a pass is written, which is the only thing that ends one.
 *
 * The plugin used to decide this for you, by watching the heading and calling
 * the pass finished as soon as anything appeared under it. That read the state
 * straight off the prose, which is a lovely property and cost too much: one
 * character counted, so a paper left its section mid-sentence, and there was
 * nowhere to put a note to yourself under a heading without it being taken for
 * the work.
 *
 * It writes a date and nothing else. What is under the heading is yours, and
 * this records only that you consider it done, so a claim can be redrafted for
 * a week afterwards without the queue having an opinion about it.
 */
async function finishPass(context: Context, pass: 'claim' | 'assessment', row: Row): Promise<void> {
	// A pass belongs to a note. A paper Zotero holds and the vault does not has
	// never been read, so it is never in either of these sections.
	if (row.kind !== 'note') return;
	const file = fileOf(context.app, row.note);
	if (!file) return;

	// The pass, and only the pass. What the paper earns is a judgement you made
	// and this is a report about you, so ticking a claim off leaves `reading`
	// exactly as it was. Through `writeTriage` like every other change, so the
	// date moves and the tag mirror follows.
	await writeTriage(context, file, {
		reading: row.note.state.reading,
		reason: null,
		progress: PASS_PROGRESS[pass],
	});

	const said = TASKS[pass].completed;
	if (said) say(context, `${rowTitle(row)}\n${said}`);
}

/**
 * End the one task the plugin cannot see the end of. Opening the PDF changes
 * nothing in the vault, so the row has to ask.
 *
 * The question is Keshav's, and it has four answers rather than one, so this
 * offers them rather than assuming the commonest. Through `writeTriage` like
 * every other decision, so a paper finished from the homepage lands in exactly
 * the state the triage dialog would have left it in.
 */
export async function finish(context: Context, task: Task, row: Row): Promise<void> {
	if (task === 'claim' || task === 'assessment') return finishPass(context, task, row);
	if (task !== 'reading') return;
	const app = context.app;

	// A pending paper can be finished too, when triage is off: you may have read
	// it in Zotero without ever opening its row. Through the same path a triage
	// decision takes, which asks its question before it writes anything, so
	// escaping a drop still leaves no file behind.
	const target = targetOf(app, row);
	if (!target) return;

	const title = rowTitle(row);
	const choice = await suggest(
		app,
		PASS_TWO,
		(entry) => entry.label,
		`Finished with ${title}`,
		(entry) => landing({ reading: entry.reading, progress: entry.progress ?? null }),
		(entry) => iconOf({ reading: entry.reading, progress: entry.progress ?? null }),
	);
	if (!choice) return;

	const file = await decideOn(context, target, choice.reading, choice.progress);
	if (!file) return;

	const at: State = { reading: choice.reading, progress: choice.progress ?? null };
	const landed = `${title}\n${landing(at)}`;

	// Both of the outcomes that mean you engaged with the paper leave it owing a
	// claim, so this goes straight there rather than leaving you to find it.
	// It is the moment the summary is cheapest to write: you have just closed
	// the PDF, and the highlights are already in the note below the cursor.
	//
	// Where it lands and what it now owes go on one notice, because they are one
	// answer to one press and were two slips saying nearly the same thing.
	//
	// The two that end the paper are not followed anywhere. A drop and a
	// deferral have already been answered, and there is nothing left to type.
	if (choice.progress === 'read') {
		await writeUnder(context, file, 'claim', landed);
		return;
	}

	say(context, landed);
}

/**
 * The topmost row of the topmost non-empty stage, opened with its action ready.
 * One key, no choice to make: the whole point is that working through the pile
 * should not require deciding which pile first.
 */
export async function next(context: Context): Promise<void> {
	const buckets = queue(context).rows;
	const outstanding = [...buckets.values()].reduce((sum, list) => sum + list.length, 0);

	for (const section of NEXT_ORDER) {
		const { label } = TASKS[section];
		const first = buckets.get(section)?.[0];
		// The row's own task, not the section's: a pending paper in Reading is
		// asking to be read whatever the section it was filed under is called.
		const task = first ? rowTask(first, context.settings.triage) : null;
		if (!first || !task) continue;

		// Only where the action will not say it itself. Triage opens a dialog
		// with the title on it and writing a pass lands the cursor in the note,
		// so announcing the paper a beat before either of those was the first of
		// two notices for one keypress.
		if (!TASKS[task].announces) {
			say(context, `${label}: ${rowTitle(first)}${outstanding > 1 ? ` · ${outstanding} outstanding` : ''}`);
		}
		await act(context, task, first);
		return;
	}

	new Notice('Nothing outstanding.');
}
