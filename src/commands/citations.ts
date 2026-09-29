// Inserting a citation, without leaving Obsidian.
//
// Better BibTeX's cite-as-you-write endpoint opens a picker better than
// anything here: fuzzy search over the library, locators, prefixes, several
// citations at once. It also raises Zotero over whatever you were writing and
// waits for you there, which is the wrong trade when the whole point of
// talking to the local API is that Zotero stays where you put it.
//
// So: the same list the paper picker uses, in a modal here, and the citation
// key that Better BibTeX has already written into the item. No extra request,
// because the key comes back with the search results.
//
// A page is one key more: Tab instead of Enter asks for it. What that picker
// cannot write is a prefix, or several sources in one citation. Those are
// still Better BibTeX's to do, so it is still there, one chord away in the
// footer, for the citations that need it. The common case stops raising
// Zotero; the rare one still can. Either way the link is written in
// core/zotero.ts, so both look the same.
//
// A link written through Obsidian's own `[[` gets its page from Add page to
// citation, which rewrites the link at the cursor rather than asking for the
// key a second time.
import { MarkdownView, Notice } from 'obsidian';
import { pickItem } from '../ui/item-picker';
import { prompt } from '../ui/prompt';
import { pickCitation } from '../source';
import { citation, linkAt, pageCitation, withPage } from '../core/zotero';
import { notify } from '../ui/notify';
import type { Context } from '../context';

/** Hand over to Better BibTeX's own dialog, for the citations this cannot write. */
async function advanced(context: Context): Promise<void> {
	const app = context.app;
	try {
		const sources = await pickCitation();
		if (!sources) return;
		const cited = citation(sources);
		// Nothing picked had a citation key: a Zotero note has none.
		if (!cited) {
			new Notice('Nothing to cite: Better BibTeX gave no citation key for what was picked.');
			return;
		}

		// Fetched after the dialog closes, for the same reason as below: it was
		// open long enough for the cursor to have moved.
		const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!editor) {
			new Notice(`Nowhere to put it. The citation was: ${cited}`);
			return;
		}
		editor.replaceSelection(cited);
	} catch (error) {
		notify(error);
	}
}

export async function insertCitation(context: Context): Promise<void> {
	const app = context.app;
	if (!app.workspace.getActiveViewOfType(MarkdownView)) {
		new Notice('Open a note and put the cursor where the citation should go.');
		return;
	}

	try {
		const chosen = await pickItem(app, {
			purpose: 'prefixes, several at once',
			run: () => void advanced(context),
		});
		// An empty answer is a cancelled picker, or the escape having taken over.
		// Neither is a failure and both mean there is nothing left to do here.
		if (!chosen) return;

		// Better BibTeX writes this into the item, and Zotero hands it over with
		// everything else. Without Better BibTeX no item has one, and there is
		// nothing to cite with.
		const { item, withPage: asked } = chosen;
		const key = item.data.citationKey?.trim();
		if (!key) {
			new Notice(
				`${item.data.title ?? item.key} has no citation key.\nInstall Better BibTeX in Zotero: it gives every item one.`,
			);
			return;
		}

		// Dismissing the page question cancels the citation, as Escape does
		// anywhere else: a citation without the page you meant to give is a
		// quiet mistake, and inserting nothing is not.
		let cited = citation([{ citationKey: key }]);
		if (asked) {
			const page = await askPage(context, key);
			if (!page) return;
			cited = pageCitation(key, page);
		}

		// Fetch the editor after the picker closes, not before: it was open long
		// enough for the cursor to have moved, or the pane to have changed.
		const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!editor) {
			new Notice(`Nowhere to put it. The citation was: ${cited}`);
			return;
		}
		editor.replaceSelection(cited);
	} catch (error) {
		notify(error);
	}
}


function askPage(context: Context, name: string): Promise<string | null> {
	return prompt(context.app, `Page in ${name}`, { cta: 'Cite', placeholder: '4, or ch. 3' });
}

/**
 * Put a page on the citation at the cursor.
 *
 * For links written with Obsidian's own `[[`, which puts the cursor just after
 * the link it wrote: adding a page there otherwise means typing the key again.
 */
export async function addPage(context: Context): Promise<void> {
	const app = context.app;
	const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
	if (!editor) {
		new Notice('Open a note and put the cursor on a citation.');
		return;
	}

	const cursor = editor.getCursor();
	const link = linkAt(editor.getLine(cursor.line), cursor.ch);
	if (!link) {
		new Notice('Put the cursor on a citation, or just after one, like [[key]].');
		return;
	}

	const before = editor.getLine(cursor.line).slice(link.from, link.to);
	const page = await askPage(context, link.target.replace(/#.*$/, ''));
	if (!page) return;

	// Checked before replacing, because a sync can change the note while the
	// prompt is open, and replacing a range that now holds other words would
	// overwrite them.
	if (editor.getLine(cursor.line).slice(link.from, link.to) !== before) {
		new Notice('The note changed while the page was asked for, so nothing was replaced.');
		return;
	}
	editor.replaceRange(
		withPage(link, page),
		{ line: cursor.line, ch: link.from },
		{ line: cursor.line, ch: link.to },
	);
}
