// Showing a file without opening it twice.
//
// `getLeaf('tab')` always makes a tab, so every route that used it left you
// with two copies of a note you already had open: click a row in the queue,
// click it again, and there are three. The triage pane had the right behaviour
// and kept it to itself.
import { MarkdownView, type App, type Editor, type TFile, type WorkspaceLeaf } from 'obsidian';
import { headingLine, insertHeading, roomUnder } from '../core/stages';
import { indexed } from './editing';

/** The pane a file is already open in, if any. */
function leafShowing(app: App, file: TFile): WorkspaceLeaf | null {
	return (
		app.workspace.getLeavesOfType('markdown').find((leaf) => leaf.view instanceof MarkdownView && leaf.view.file === file) ??
		null
	);
}

/**
 * Bring a file into view, reusing the pane it is already in.
 *
 * Returns the leaf only when it had to open one, so a caller that opened a note
 * to do something with it can put the workspace back afterwards without closing
 * a tab the user opened themselves.
 */
export async function reveal(app: App, file: TFile): Promise<WorkspaceLeaf | null> {
	const open = leafShowing(app, file);
	if (open) {
		await app.workspace.revealLeaf(open);
		app.workspace.setActiveLeaf(open, { focus: true });
		return null;
	}

	const leaf = app.workspace.getLeaf('tab');
	await leaf.openFile(file);
	return leaf;
}

/**
 * Open a note with the cursor under one of its headings, ready to type.
 *
 * The last step of a second pass is writing what the paper argues, and it had
 * no moment. Triage gets a whole pane; finishing gets a chooser; the claim got
 * an icon and an HTML comment four screens down a file. So the decision that
 * ends the reading now lands you in the place the work happens, while the paper
 * is still in your head and with the highlights Zotero synced sitting directly
 * below.
 *
 * It navigates rather than writing. A box that captured the claim and wrote it
 * for you would make the plugin author prose outside the one region it owns,
 * and a claim composed in a modal cannot see the evidence it is supposed to
 * summarise.
 *
 * False means the heading was not found, which is worth saying out loud: it is
 * the one failure that otherwise shows up as a paper that never leaves.
 */
export async function openAtHeading(
	app: App,
	file: TFile,
	heading: string,
	precedes: string | null = null,
): Promise<boolean> {
	await reveal(app, file);

	// A note the decision just wrote is on disk before Obsidian has parsed it,
	// and the headings come from that parse. Finishing a paper the vault had no
	// note for created one and then asked it where its Claim heading was: the
	// cache was empty, so the answer was none, and the paper that had just been
	// read was told it had no heading to write under.
	await indexed(app, file);

	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view || view.file !== file) return false;

	// Reading view has no cursor to place. Switching is the right intrusion
	// here and nowhere else: the action you just took was "write the claim".
	if (view.getMode() !== 'source') {
		await view.leaf.setViewState({ ...view.leaf.getViewState(), state: { ...view.getState(), mode: 'source' } });
	}

	// Re-read the editor: changing the mode rebuilds it, so the one captured
	// above belongs to a view that no longer exists.
	const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
	if (!editor) return false;

	const found = headingLine(app.metadataCache.getFileCache(file), heading);
	const target = found === null ? writeHeading(editor, heading, precedes) : makeRoom(editor, found);

	editor.setCursor({ line: target, ch: 0 });
	editor.scrollIntoView({ from: { line: Math.max(0, target - 2), ch: 0 }, to: { line: target, ch: 0 } }, true);
	editor.focus();
	return true;
}

/**
 * Write the heading the note has not got, and say which line to write under.
 *
 * A paper is made with neither heading in it, so the first time you go to write
 * one this is what puts it there. Through the editor like the blank lines are,
 * which is the distinction that makes writing into somebody's note allowable at
 * all: it joins your undo history, so a heading you did not want costs one
 * Ctrl+Z.
 */
function writeHeading(editor: Editor, heading: string, precedes: string | null): number {
	const lines = Array.from({ length: editor.lastLine() + 1 }, (_, n) => editor.getLine(n));
	const { at, text, cursor } = insertHeading(lines, heading, precedes);

	editor.replaceRange(text, { line: at, ch: 0 });
	return at + cursor;
}

/**
 * Make sure there is a blank line under the heading and an empty one to type
 * on, and say which line that is.
 *
 * The cursor used to go on the line directly beneath the heading, so what you
 * typed came out pressed against it with no blank between. That is not how
 * anybody writes markdown, and the Linter puts the blank back afterwards, so
 * the note ends up edited twice to reach the shape it should have started in.
 *
 * It inserts through the editor rather than through the vault, which is the
 * distinction that makes it allowable at all: an editor edit joins your undo
 * history, so a cursor that landed somewhere unwanted costs one Ctrl+Z. It
 * also adds nothing but newlines, and only where the section is empty, which
 * is the only time anything sends you here.
 *
 * Idempotent: arriving at a heading that already has the room takes none.
 */
function makeRoom(editor: Editor, line: number): number {
	// The lines the note actually has after the heading, so `roomUnder` can tell
	// a section with something under it from one at the end of the note.
	const following = [1, 2, 3]
		.map((n) => line + n)
		.filter((n) => n <= editor.lastLine())
		.map((n) => editor.getLine(n));

	const room = roomUnder(following);
	if (room) {
		const at =
			room.below === 0
				? { line, ch: editor.getLine(line).length }
				: { line: line + room.below, ch: 0 };
		editor.replaceRange('\n'.repeat(room.newlines), at);
	}

	return line + 2;
}
