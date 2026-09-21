// Reading the vault's state, and acting on one row of it. Shared by the
// `paper-trail` block, the sidebar and `next`, so a row does the same thing
// wherever it was reached from.
//
// A paper is a note that names a Zotero item, not a note in a particular
// folder: keying off the frontmatter rather than the path keeps the rules
// independent of the vault's folder layout.
import { Notice, TFile, type App } from 'obsidian';
import { noteState, rowsByStage, rowTitle, STAGES, type NoteState, type Row, type Stage } from '../core/stages';
import { formatItemRef, parseItemRef, readerUrl } from '../core/zotero';
import { loadFulltext } from '../source';
import { library } from '../library';
import { pendingOf } from '../core/pending';
import { decide, openTriage } from './reading';
import { fileNote } from './tags';
import { landing, PASS_TWO } from '../core/triage';
import { choose } from '../ui/decision';
import { reveal } from '../ui/reveal';
import type { Context } from '../context';

/** Every note in the vault, as the rules see it. Templates are not notes. */
export function collect(context: Context): NoteState[] {
	return context.app.vault
		.getMarkdownFiles()
		.filter((file) => !file.path.startsWith(`${context.settings.templateFolder}/`))
		.map((file) =>
			noteState(
				context.app.metadataCache.getFileCache(file),
				{ path: file.path, basename: file.basename, created: file.stat.ctime },
				context.settings.keyField,
				context.settings.claimHeading,
				context.settings.assessmentHeading,
			),
		);
}

export function fileOf(app: App, note: NoteState): TFile | null {
	const file = app.vault.getFileByPath(note.path);
	return file instanceof TFile ? file : null;
}

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

	let key = context.settings.attachments[formatItemRef(ref)];
	if (!key) {
		try {
			key = (await loadFulltext(context.settings, ref, await app.vault.cachedRead(file))).attachmentKey;
			await context.saveSettings();
		} catch {
			return select;
		}
	}

	return readerUrl(ref, key);
}

export async function act(context: Context, stage: Stage, row: Row): Promise<void> {
	const app = context.app;

	// A pending paper has no note, so triage is the only thing that can be done
	// with it, and doing it is what gives it one.
	if (row.kind === 'pending') {
		await openTriage(context, { kind: 'pending', item: row.item });
		return;
	}

	const note = row.note;
	const file = fileOf(app, note);
	if (!file) return;

	switch (stage) {
		case 'triage':
			await openTriage(context, { kind: 'note', file });
			return;
		case 'read': {
			const url = await readingUrl(context, file);
			if (url) window.open(url);
			else await openNote(app, note);
			return;
		}
		case 'write-up':
		case 'pass-three':
			await openNote(app, note);
			return;
		case 'file':
			await fileNote(context, file);
			return;
	}
}

/**
 * End a stage the plugin cannot see the end of. Only Read has one: opening the
 * PDF changes nothing in the vault, so the row has to ask.
 *
 * The question is Keshav's, and it has four answers rather than one, so this
 * offers them rather than assuming the commonest. Through `writeTriage` like
 * every other decision, so a paper finished from the homepage lands in exactly
 * the state the triage pane would have left it in.
 */
export async function finish(context: Context, stage: Stage, row: Row): Promise<void> {
	if (stage !== 'read' || row.kind !== 'note') return;
	const app = context.app;
	const note = row.note;
	const file = fileOf(app, note);
	if (!file) return;

	const reading = await choose(
		app,
		`Finished with ${note.title}`,
		PASS_TWO.map((entry) => ({ value: entry.reading, label: entry.label, description: landing(entry.reading) })),
	);
	if (!reading) return;
	if (!(await decide(context, file, reading))) return;

	new Notice(`${note.title}\n${landing(reading)}`);
}

/**
 * The topmost row of the topmost non-empty stage, opened with its action ready.
 * One key, no choice to make: the whole point is that working through the pile
 * should not require deciding which pile first.
 */
export function queue(context: Context): { notes: NoteState[]; rows: Map<Stage, Row[]> } {
	const notes = collect(context);
	const keys = notes.flatMap((note) => (note.key === null ? [] : [note.key]));
	return { notes, rows: rowsByStage(notes, pendingOf(library(), keys), context.settings.types) };
}

export async function next(context: Context): Promise<void> {
	const buckets = queue(context).rows;
	const outstanding = [...buckets.values()].reduce((sum, list) => sum + list.length, 0);

	for (const { stage, label } of STAGES) {
		const first = buckets.get(stage)?.[0];
		if (!first) continue;
		new Notice(`${label}: ${rowTitle(first)}${outstanding > 1 ? ` · ${outstanding} outstanding` : ''}`);
		await act(context, stage, first);
		return;
	}

	new Notice('Nothing outstanding.');
}
