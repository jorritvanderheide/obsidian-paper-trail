// Waiting for Obsidian, which does several things on its own schedule.
//
// It saves an editor on a delay, it parses a file into the metadata cache after
// the file exists, and it redraws nothing in particular when either happens.
// Everything here is the plugin arranging to be in step with that rather than
// racing it.
//
// The queue redraws whenever the metadata cache moves, and the cache moves
// while you type. A redraw reads every note in the vault and rebuilds the pane
// from nothing, which loses the scroll position and whatever you were hovering.
//
// Typing no longer moves any row, because a pass ends when you tick it rather
// than when prose appears under a heading. So this is no longer about the
// answer being wrong; it is about doing a vault's worth of work, and throwing
// away where you were in the list, for a keystroke that changes nothing.
import { MarkdownView, type App, type TFile } from 'obsidian';

/**
 * One thing to do on a metadata change, deferred while the change is your own
 * typing.
 *
 * Scoped to the file, not to typing in general, so a sync bringing in another
 * paper still shows up immediately. It is also what makes this cover the
 * assessment as well as the claim without knowing about either: what it holds
 * is the note you are in, whatever heading your cursor happens to be under.
 */
export class WhileWriting {
	private pending: TFile | null = null;

	constructor(
		private readonly app: App,
		private readonly run: (file: TFile) => void,
	) {}

	/** Act on the change, or hold it until you leave the note. */
	changed(file: TFile): void {
		if (this.writing(file)) {
			this.pending = file;
			return;
		}
		this.run(file);
	}

	/**
	 * Let go of anything held back, now that the workspace has moved.
	 *
	 * Driven from `active-leaf-change` and `file-open`, which between them cover
	 * every way of leaving a note, including clicking the queue itself. Not from
	 * a timer: a pause mid-sentence is still mid-sentence, and catching up then
	 * would put the jump back exactly where it was least wanted.
	 */
	flush(): void {
		const file = this.pending;
		if (file === null || this.writing(file)) return;
		this.pending = null;
		this.run(file);
	}

	/** Forget what is held, for an unload that should leave nothing behind. */
	forget(): void {
		this.pending = null;
	}

	/**
	 * Whether this is the file you are writing in right now.
	 *
	 * Source mode only, because reading view has no cursor and nothing you do
	 * there changes the note. `getActiveViewOfType` follows the active leaf, so
	 * the moment focus moves to the sidebar this is false and the held change is
	 * free to land.
	 */
	private writing(file: TFile): boolean {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.file === file && view.getMode() === 'source';
	}
}

/**
 * Flush any unsaved edits in a note before the plugin writes to it.
 *
 * Obsidian shows "has been modified externally, merging changes automatically"
 * when a file on disk changes while its editor holds unsaved edits. The check
 * is exactly that: the disk content moved, the view is dirty, and what you have
 * typed differs from what was last saved. It then three-way merges and tells
 * you so.
 *
 * Which is the plugin's own workflow, most of the time. You write a claim, and
 * the tick that ends it is in the title bar an inch away, so it is pressed
 * seconds later while the editor is still holding what you typed: the write
 * lands on a dirty view and Obsidian quite reasonably reports it.
 *
 * Saving first is not a trick to silence a warning. The warning is correct, and
 * this removes what it is correct about: the editor's content is on disk before
 * anything else writes, so there is one version rather than two to merge. It
 * writes only what you typed, a moment earlier than Obsidian would have.
 */
export async function settle(app: App, file: TFile): Promise<void> {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file === file) await view.save();
	}
}

/**
 * Wait until Obsidian has read a file, or give up.
 *
 * A note written a moment ago is on disk before the metadata cache knows
 * anything about it, and everything the plugin reads about a note it reads from
 * that cache. A decision that writes a note and then asks where its headings
 * are gets no answer at all unless it waits.
 *
 * The timeout is the point: a note that never arrives should cost a second, not
 * a promise that never settles.
 */
export function indexed(app: App, file: TFile, wait = 1000): Promise<void> {
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
