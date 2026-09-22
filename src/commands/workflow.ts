// Acting on one row of the queue. Shared by the `paper-trail` block, the
// sidebar and `next`, so a row does the same thing wherever it was reached
// from.
//
// What is outstanding in the first place is worked out in `outstanding.ts`,
// which triage needs as well and which must not depend on this.
import { Notice, type App, type TFile } from 'obsidian';
import { rowTask, rowTitle, STAGES, TASKS, type NoteState, type Row, type Task } from '../core/stages';
import { attachmentKeys, parseItemRef, readerUrl, type ItemRef } from '../core/zotero';
import { selectUrl } from '../core/paper-note';
import { itemChildren } from '../source';
import { decideOn, noteFor, openTriage, targetOf } from './reading';
import { fileOf, queue } from '../outstanding';
import { iconOf, landing, PASS_TWO } from '../core/triage';
import { suggest } from '../ui/prompt';
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
 * The attachment key is normally already known, because pass one recorded the
 * one it found text in, and triage always comes before reading. Resolving it
 * again is the fallback for a paper that reached the queue another way. A note
 * body can carry several `zotero://open` links, a snapshot alongside the PDF,
 * so picking the first one there would be a coin flip.
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
		case 'read': {
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
 * A heading the note does not have falls back to the note and says so. It is
 * the one failure in this workflow that is otherwise completely silent: the
 * paper never leaves its section and nothing anywhere explains why.
 */
async function writeUnder(context: Context, file: TFile, task: 'claim' | 'assessment'): Promise<void> {
	const claim = task === 'claim';
	const heading = claim ? context.settings.claimHeading : context.settings.assessmentHeading;

	if (await openAtHeading(context.app, file, heading)) {
		const asked = TASKS[task].prompt;
		if (asked) new Notice(asked);
		return;
	}

	new Notice(
		`${file.basename} has no "${heading}" heading, so nothing can ever leave this stage.\n` +
			`Add it to the note, or change the ${claim ? 'Claim' : 'Assessment'} heading in settings.`,
	);
}

/**
 * End the one task the plugin cannot see the end of. Opening the PDF changes
 * nothing in the vault, so the row has to ask.
 *
 * The question is Keshav's, and it has four answers rather than one, so this
 * offers them rather than assuming the commonest. Through `writeTriage` like
 * every other decision, so a paper finished from the homepage lands in exactly
 * the state the triage pane would have left it in.
 */
export async function finish(context: Context, task: Task, row: Row): Promise<void> {
	if (task !== 'read') return;
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
		(entry) => landing(entry.reading),
		(entry) => iconOf(entry.reading),
	);
	if (!choice) return;

	const file = await decideOn(context, target, choice.reading);
	if (!file) return;

	new Notice(`${title}\n${landing(choice.reading)}`);

	// Both of the outcomes that mean you engaged with the paper leave it owing a
	// claim, so this goes straight there rather than leaving you to find it.
	// It is the moment the summary is cheapest to write: you have just closed
	// the PDF, and the highlights are already in the note below the cursor.
	//
	// The two that end the paper are not followed anywhere. A drop and a
	// deferral have already been answered, and there is nothing left to type.
	if (choice.reading === 'finished' || choice.reading === 'promoted') {
		await writeUnder(context, file, 'claim');
	}
}

/**
 * The topmost row of the topmost non-empty stage, opened with its action ready.
 * One key, no choice to make: the whole point is that working through the pile
 * should not require deciding which pile first.
 */
export async function next(context: Context): Promise<void> {
	const buckets = queue(context).rows;
	const outstanding = [...buckets.values()].reduce((sum, list) => sum + list.length, 0);

	for (const { stage, label } of STAGES) {
		const first = buckets.get(stage)?.[0];
		const task = first ? rowTask(first, context.settings.triage) : null;
		if (!first || !task) continue;
		new Notice(`${label}: ${rowTitle(first)}${outstanding > 1 ? ` · ${outstanding} outstanding` : ''}`);
		await act(context, task, first);
		return;
	}

	new Notice('Nothing outstanding.');
}
