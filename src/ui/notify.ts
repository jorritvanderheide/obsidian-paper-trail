// Turning a thrown thing into something a person can read.
//
// This was five copies of the same three lines, one per command that talks to
// Zotero, and they had already drifted: two logged before showing, one after,
// one not at all. The distinction they all meant to draw is the one worth
// keeping, so it is written down once.
import { Notice } from 'obsidian';
import { SourceError } from '../source';
import type { Context } from '../context';

/** Whatever was thrown, as a sentence. */
export function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Show the failure, and log it only when it is worth logging.
 *
 * A `SourceError` is already a sentence written for the person reading it:
 * Zotero is not running, or its local API is off. Those are ordinary states of
 * the world rather than faults, and filling the console with them buries the
 * ones that are. Everything else is a surprise and gets a stack trace.
 *
 * `tag` names the thing that failed, for the console. It does not reach the
 * notice, which has to be readable on its own.
 */
export function notify(error: unknown, tag?: string): void {
	if (!(error instanceof SourceError)) {
		if (tag) console.error(`paper-trail:${tag}`, error);
		else console.error(error);
	}
	new Notice(messageOf(error));
}

/**
 * An answer: what just happened, where a paper went, that a pass is finished.
 *
 * Silenced by the quiet setting, because each of these follows something you
 * pressed and the queue has already moved to show it. A failure never comes
 * through here, because it is the difference between broken and busy.
 */
export function say(context: Context, text: string): void {
	if (context.settings.quietNotices) return;
	new Notice(text);
}
