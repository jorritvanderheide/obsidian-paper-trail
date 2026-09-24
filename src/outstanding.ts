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
	isDue,
	markDue,
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
import { today } from './today';

/**
 * One note, as the rules see it on its own.
 *
 * Without the rest of the vault, so it cannot say whether a deferral has come
 * back; `paperNote` can. What it can say, it says for the cost of one lookup,
 * which is what a caller asked once for every block of a rendered note needs.
 */
export function noteOf(context: Context, file: TFile): NoteState {
	return noteState(
		context.app.metadataCache.getFileCache(file),
		{ path: file.path, basename: file.basename, created: file.stat.ctime },
		context.settings.keyField,
	);
}

/** Every note in the vault, each read on its own. Templates are not notes. */
function scan(context: Context): NoteState[] {
	return context.app.vault
		.getMarkdownFiles()
		.filter((file) => !file.path.startsWith(`${context.settings.templateFolder}/`))
		.map((file) => noteOf(context, file));
}

/**
 * Every note in the vault, as the rules see it: with the deferrals that have
 * come back marked, since that is a question about the vault and not the note.
 */
function collect(context: Context): NoteState[] {
	return markDue(scan(context), today());
}

/**
 * One paper, as the rules see it, for everything that shows one note at a time:
 * its title bar, and whether it opens rendered.
 *
 * Without this those two would read a returned deferral as still parked, while
 * the queue beside them showed it back in Reading. Only a deferral can have come
 * back, and only one waiting for another paper needs the rest of the vault to
 * say so, so the scan is paid for by those alone.
 */
export function paperNote(context: Context, file: TFile): NoteState {
	const note = noteOf(context, file);
	if (note.state.reading !== 'deferred') return note;

	const others = note.after === null ? [] : scan(context);
	const due = isDue(note, today(), (key) => others.find((other) => other.key === key));
	return due ? { ...note, due } : note;
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
