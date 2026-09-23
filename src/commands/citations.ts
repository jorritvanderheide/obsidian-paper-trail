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
// What that picker cannot write is a locator, a prefix, or several sources in
// one citation. Those are still Better BibTeX's to do, so it is still there,
// one chord away in the footer, for the citations that need it. The common case
// stops raising Zotero; the rare one still can.
import { MarkdownView, Notice } from 'obsidian';
import { pickItem } from '../ui/item-picker';
import { pickCitation } from '../source';
import { notify } from '../ui/notify';
import type { Context } from '../context';

/**
 * Hand over to Better BibTeX's own dialog, for the citations this cannot write.
 *
 * It comes back already formatted, locator and all, so there is nothing to
 * parse: whatever it says goes in verbatim.
 */
async function advanced(context: Context): Promise<void> {
	const app = context.app;
	try {
		const citation = await pickCitation();
		if (!citation) return;

		// Fetched after the dialog closes, for the same reason as below: it was
		// open long enough for the cursor to have moved.
		const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!editor) {
			new Notice(`Nowhere to put it. The citation was: ${citation}`);
			return;
		}
		editor.replaceSelection(citation);
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
			purpose: 'locators, prefixes, several at once',
			run: () => void advanced(context),
		});
		// An empty answer is a cancelled picker, or the escape having taken over.
		// Neither is a failure and both mean there is nothing left to do here.
		if (!chosen) return;

		// Better BibTeX writes this into the item, and Zotero hands it over with
		// everything else. Without Better BibTeX no item has one, and there is
		// nothing to cite with.
		const key = chosen.data.citationKey?.trim();
		if (!key) {
			new Notice(
				`${chosen.data.title ?? chosen.key} has no citation key.\nInstall Better BibTeX in Zotero: it gives every item one.`,
			);
			return;
		}

		// Fetch the editor after the picker closes, not before: it was open long
		// enough for the cursor to have moved, or the pane to have changed.
		const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!editor) {
			new Notice(`Nowhere to put it. The citation was: ${wikilink(key)}`);
			return;
		}
		editor.replaceSelection(wikilink(key));
	} catch (error) {
		notify(error);
	}
}

/**
 * A citation as a link to the paper, rather than as pandoc syntax.
 *
 * `[@key]` is inert in Obsidian: the right thing to hand a bibliography
 * processor and nothing at all to the vault. A wikilink is both. It resolves,
 * because a paper is named for its citation key and carries it as an alias
 * either way; it opens the paper; it shows the paper on hover, status and all;
 * and every place you cited something turns up in that paper's backlinks, which
 * is the question a thesis actually asks of its own corpus.
 *
 * It stays exportable, and that is why it is the bare key rather than a
 * prettier label: a link whose target is a citation key is something a pandoc
 * filter can turn into a real citation without knowing anything about this
 * vault. Better BibTeX's own dialog still writes `[@key, p. 45]`, because a
 * locator is not a thing a wikilink can say, and pandoc reads that natively.
 */
function wikilink(key: string): string {
	return `[[${key}]]`;
}
