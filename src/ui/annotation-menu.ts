// Show in Zotero, on a right-click on a synced passage in a paper note.
//
// Two surfaces, because Obsidian has two kinds of note view. The editor has a
// menu of its own that plugins add to, and it acts on the cursor's line.
// Reading view has none for text, so each rendered passage gets one, found
// through the lines it was rendered from.
//
// Wiring only. Which line is which annotation is `annotationAt`'s to say.
import { Menu, type Editor, type MarkdownFileInfo, type MarkdownPostProcessor, type MarkdownView, type TFile } from 'obsidian';
import { annotationAt, isPaper } from '../core/paper-note';
import { showAnnotation } from '../commands/papers';
import { notify } from './notify';
import type { Context } from '../context';

function addShow(menu: Menu, context: Context, file: TFile, key: string): void {
	menu.addItem((item) =>
		item
			.setTitle('Show in Zotero')
			.setIcon('external-link')
			.onClick(() => {
				showAnnotation(context, file, key).catch((error: unknown) => notify(error));
			}),
	);
}

function isPaperFile(context: Context, file: TFile): boolean {
	return isPaper(context.app.metadataCache.getFileCache(file)?.frontmatter, context.settings.keyField);
}

/** For the editor menu, in source mode and Live Preview. */
export function annotationEditorMenu(context: Context) {
	return (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo): void => {
		const file = info.file;
		if (!file || !isPaperFile(context, file)) return;

		const key = annotationAt(editor.getValue(), editor.getCursor().line);
		if (key) addShow(menu, context, file, key);
	};
}

/**
 * For reading view, where right-clicking text opens no menu at all.
 *
 * Stands aside while text is selected, so a right-click to copy a passage
 * still gets whatever it got before.
 */
export function annotationReadingMenu(context: Context): MarkdownPostProcessor {
	return (el, ctx) => {
		// Null in an embed or a hover preview, which is not the note itself.
		const section = ctx.getSectionInfo(el);
		if (!section) return;

		const file = context.app.vault.getFileByPath(ctx.sourcePath);
		if (!file || !isPaperFile(context, file)) return;

		const key = annotationAt(section.text, section.lineStart);
		if (!key) return;

		el.addEventListener('contextmenu', (event) => {
			if (activeWindow.getSelection()?.toString()) return;
			event.preventDefault();
			const menu = new Menu();
			addShow(menu, context, file, key);
			menu.showAtMouseEvent(event);
		});
	};
}
