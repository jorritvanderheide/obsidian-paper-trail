// Saying when a paper has finished a pass under its own steam.
//
// Every other end in this workflow answers you, because you pressed something
// to reach it: a triage decision and the end of a reading both come back with
// `landing`. A claim and an assessment end when prose appears under a heading.
// Nothing is pressed, so nothing answers, and the only sign is a row that has
// stopped being there.
//
// That is the wrong silence. Those two are the passes the whole plugin exists
// to get you to, and finishing one should not be less acknowledged than
// dropping a paper on its abstract.
//
// What counts as finished is core's to say. This watches and speaks.
import { Notice } from 'obsidian';
import { noteState, taskOf, TASKS, type Task } from '../core/stages';
import type { Context } from '../context';
import type { TFile } from 'obsidian';

/**
 * What each paper was waiting on when this session last looked.
 *
 * Session-scoped and never written anywhere, like the queue's fold state. It
 * starts empty on purpose: a paper whose claim was written in another vault, or
 * before Obsidian opened, was not finished in front of you, and announcing it
 * on startup would be congratulating you for something you did last week.
 */
const before = new Map<string, Task | null>();

/**
 * Watch one note across a metadata change, and say so if it just finished.
 *
 * Driven from the metadata cache rather than from the command that opened the
 * note, so it fires however the claim got written: through the queue, by typing
 * into the note directly, or by a sync bringing one in from another machine.
 */
export function announce(context: Context, file: TFile): void {
	const note = noteState(
		context.app.metadataCache.getFileCache(file),
		{ path: file.path, basename: file.basename, created: file.stat.ctime },
		context.settings.keyField,
		context.settings.claimHeading,
		context.settings.assessmentHeading,
	);

	const was = before.get(file.path);
	const now = taskOf(note);
	before.set(file.path, now);

	// Nothing to compare against yet, so nothing was watched happening.
	if (was === undefined || was === null || now !== null) return;

	// Only the two that have nothing else to announce them. A paper leaving
	// Triage or Reading was already answered by the chooser that sent it there.
	const said = TASKS[was].completed;
	if (said) new Notice(`${note.title}\n${said}`);
}

/** Forget everything, so unloading leaves nothing to speak up about later. */
export function forgetCompletions(): void {
	before.clear();
}
