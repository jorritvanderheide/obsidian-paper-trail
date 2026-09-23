// Showing a file without opening it twice.
//
// `getLeaf('tab')` always makes a tab, so every route that used it left you
// with two copies of a note you already had open: click a row in the queue,
// click it again, and there are three. The triage pane had the right behaviour
// and kept it to itself.
import { MarkdownView, type App, type Editor, type TFile, type WorkspaceLeaf } from 'obsidian';
import { headingLineIn, insertHeading, roomUnder, writtenUnder } from '../core/stages';
import { caughtUp } from './editing';

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
 * Show a note as a document rather than as an editor.
 *
 * The counterpart of the switch `openAtHeading` makes in the other direction,
 * and allowable for the same reason: the mode is being set to match what you
 * just asked for. Going to a paper nothing is outstanding for is asking to
 * read it, and an editor there is markdown syntax standing between you and
 * something finished.
 *
 * Every pane holding the file, the way `settle` flushes every pane holding
 * it, rather than only the active one. The press that ends a paper is usually
 * made from the queue, and by then the pane with the note in it is not the one
 * with focus: asking for the active view would answer the sidebar and leave
 * the copy you had been writing in sitting open in the editor, which is the
 * one copy the switch was for.
 *
 * Only panes in source mode. One already rendered needs nothing.
 */
export async function readingView(app: App, file: TFile): Promise<void> {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file === file) await setMode(view, 'preview');
	}
}

/** Put a view into a mode, if it is not in it already. */
async function setMode(view: MarkdownView, mode: 'source' | 'preview'): Promise<void> {
	if (view.getMode() === mode) return;
	await view.leaf.setViewState({ ...view.leaf.getViewState(), state: { ...view.getState(), mode } });
}

/**
 * The note each pane last opened, so coming back to a tab is not opening it.
 *
 * `file-open` fires whenever the active file changes, which includes switching
 * to a tab that was already showing the note. Without this, a finished paper
 * you had put into editing view on purpose would be put back into reading view
 * every time you clicked its tab.
 */
const opened = new WeakMap<WorkspaceLeaf, string>();

/**
 * Open a finished paper rendered, however it was opened.
 *
 * Whatever your default view is, and from a link, the quick switcher or the
 * queue alike. No property on the note asks for it: Obsidian itself reads no
 * per-note view mode, so a key would only work because this plugin read it,
 * and what it would say is already said by `reading` and `reading-progress`.
 * A second copy of the state is a copy that can disagree with the first, and
 * one that every change of state would have to remember to write and remove.
 *
 * Once per opening. Switch the pane to editing and it stays there until the
 * pane opens something else.
 */
export async function openedIn(app: App, file: TFile, finished: boolean): Promise<void> {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view || view.file !== file || opened.get(view.leaf) === file.path) return;

	opened.set(view.leaf, file.path);
	if (finished) await setMode(view, 'preview');
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
 * Which of the three happened is the answer, because the caller has something
 * different to say about each.
 */
export type Arrival =
	/** The cursor is on an empty line under the heading, waiting for the work. */
	| 'ready'
	/** Something was already written there. You were taken to it and nothing moved. */
	| 'written'
	/** The note could not be opened, so nothing happened at all. */
	| 'shut';

export async function openAtHeading(
	app: App,
	file: TFile,
	heading: string,
	precedes: string | null = null,
): Promise<Arrival> {
	await reveal(app, file);

	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view || view.file !== file) return 'shut';

	// Reading view has no cursor to place. Switching is the right intrusion
	// here and nowhere else: the action you just took was "write the claim".
	await setMode(view, 'source');

	// Re-read the editor: changing the mode rebuilds it, so the one captured
	// above belongs to a view that no longer exists.
	const current = app.workspace.getActiveViewOfType(MarkdownView);
	const editor = current?.editor;
	if (!current || !editor) return 'shut';

	// The decision that sent you here has usually just written to this note, and
	// if it was already open the editor has not caught up with that yet.
	await caughtUp(app, current, file);

	// The editor's own text, never the metadata cache. The cache is a parse of
	// what was on disk a moment ago, so a heading the decision that sent you here
	// has only just written is not in it: asking the cache answers "no such
	// heading" and puts a second one in. It also means a note created a moment
	// ago needs no waiting, because opening it is what loaded the text.
	const lines = Array.from({ length: editor.lastLine() + 1 }, (_, n) => editor.getLine(n));
	const found = headingLineIn(lines, heading);

	// Already written, so this is a visit rather than a seat. Nothing is
	// inserted and the cursor is left exactly where it was, which is the whole
	// of the difference: `makeRoom` opens a gap under the heading, and under a
	// heading with prose under it that gap goes in above the prose. Pressing the
	// button on a claim you had already written pushed it down two lines and put
	// the cursor in the space it made.
	//
	// Scrolled to all the same, because going to the work is what was asked for,
	// and a scroll moves nothing.
	if (found !== null && writtenUnder(lines, heading)) {
		scrollTo(editor, found);
		return 'written';
	}

	const target = found === null ? writeHeading(editor, lines, heading, precedes) : makeRoom(editor, found);

	editor.setCursor({ line: target, ch: 0 });
	scrollTo(editor, target);
	editor.focus();
	return 'ready';
}

/** Put a line on screen, with a little of what is above it for context. */
function scrollTo(editor: Editor, line: number): void {
	editor.scrollIntoView({ from: { line: Math.max(0, line - 2), ch: 0 }, to: { line, ch: 0 } }, true);
}

/**
 * Write the heading the note has not got, and say which line to write under.
 *
 * A decision puts the heading in when the paper comes to owe it, so ordinarily
 * there is one here already and this does nothing. It is what is left for the
 * note whose heading was deleted, and for a Claim or Assessment heading setting
 * changed after the paper was decided on.
 *
 * Through the editor like the blank lines are, which is the distinction that
 * makes writing into somebody's note allowable at all: it joins your undo
 * history, so a heading you did not want costs one Ctrl+Z.
 */
function writeHeading(editor: Editor, lines: readonly string[], heading: string, precedes: string | null): number {
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
