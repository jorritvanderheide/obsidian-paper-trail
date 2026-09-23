// What the vault and Zotero between them say is still to be done.
//
// Its own module because two halves of the plugin need it and neither should
// depend on the other: the queue draws it, and triage asks it what to show
// next once a decision has been made.
//
// A paper is a note that names a Zotero item, not a note in a particular
// folder, so keying off the frontmatter rather than the path keeps the rules
// independent of the vault's layout.
import { TFile, type App } from 'obsidian';
import {
	nextAfter,
	noteState,
	parked,
	rowsByStage,
	settled,
	type NoteState,
	type Row,
	type Settled,
	type Task,
} from './core/stages';
import { pendingOf } from './core/pending';
import { library } from './library';
import type { Context } from './context';

/** Every note in the vault, as the rules see it. Templates are not notes. */
function collect(context: Context): NoteState[] {
	return context.app.vault
		.getMarkdownFiles()
		.filter((file) => !file.path.startsWith(`${context.settings.templateFolder}/`))
		.map((file) =>
			noteState(
				context.app.metadataCache.getFileCache(file),
				{ path: file.path, basename: file.basename, created: file.stat.ctime },
				context.settings.keyField,
			),
		);
}

export function fileOf(app: App, note: NoteState): TFile | null {
	const file = app.vault.getFileByPath(note.path);
	return file instanceof TFile ? file : null;
}

/**
 * What the queue draws: every row by stage, everything parked, and everything
 * already decided.
 *
 * All three are worked out here rather than by the pane because they are one
 * sweep of the vault. Reading every note is the expensive half, and doing it
 * three times to answer three halves of one question would treble the cost of
 * a redraw that already fires on every metadata change.
 */
export function queue(context: Context): {
	notes: NoteState[];
	rows: Map<Task, Row[]>;
	waiting: Settled[];
	done: Settled[];
} {
	const notes = collect(context);
	const items = library();
	const keys = notes.flatMap((note) => (note.key === null ? [] : [note.key]));

	// When Zotero got each paper, so a note and a paper with no note yet can be
	// put in one order. Built from the same read of the library the pending list
	// comes from, which is already in hand.
	const arrived = new Map(items.flatMap((item) => (item.data.dateAdded ? [[item.key, item.data.dateAdded]] : [])));

	return {
		notes,
		rows: rowsByStage(notes, pendingOf(items, keys), context.settings.triage, arrived),
		waiting: parked(notes),
		done: settled(notes),
	};
}

/** The next paper waiting to be assessed, skipping one you have just ruled on. */
export function nextTriage(context: Context, decided: string | null): Row | null {
	return nextAfter(queue(context).rows.get('triage') ?? [], decided);
}
