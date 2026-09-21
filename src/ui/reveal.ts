// Showing a file without opening it twice.
//
// `getLeaf('tab')` always makes a tab, so every route that used it left you
// with two copies of a note you already had open: click a row in the queue,
// click it again, and there are three. The triage pane had the right behaviour
// and kept it to itself.
import { MarkdownView, type App, type TFile, type WorkspaceLeaf } from 'obsidian';

/** The pane a file is already open in, if any. */
export function leafShowing(app: App, file: TFile): WorkspaceLeaf | null {
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
