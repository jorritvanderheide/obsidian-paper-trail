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
import { noteState, rowKey, rowsByStage, settled, type NoteState, type Row, type Settled, type Stage } from './core/stages';
import { pendingOf } from './core/pending';
import { library } from './library';
import type { Context } from './context';

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
 * What the queue draws: every row by stage, and everything already decided.
 *
 * `done` is worked out here rather than by the pane because it is the same
 * sweep of the vault. Reading every note is the expensive half, and doing it
 * twice to answer two halves of one question would double the cost of a redraw
 * that already fires on every metadata change.
 */
export function queue(context: Context): { notes: NoteState[]; rows: Map<Stage, Row[]>; done: Settled[] } {
	const notes = collect(context);
	const keys = notes.flatMap((note) => (note.key === null ? [] : [note.key]));
	return { notes, rows: rowsByStage(notes, pendingOf(library(), keys), context.settings.triage), done: settled(notes) };
}

/**
 * The next paper waiting to be assessed, skipping one you have just ruled on.
 *
 * The skip is not belt and braces. A decision about a paper Zotero holds and
 * the vault does not writes a note, and that note is on disk before Obsidian
 * has read it, so for a moment the paper still looks like it has none and would
 * be offered straight back. Naming the key that was just answered is what keeps
 * triage from handing you the same paper twice.
 */
export function nextTriage(context: Context, decided: string | null): Row | null {
	const rows = queue(context).rows.get('triage') ?? [];
	return rows.find((row) => rowKey(row) !== decided) ?? null;
}
