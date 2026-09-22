// Holding back what a note's own change would do to the rest of the interface,
// for as long as you are the one writing it.
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
