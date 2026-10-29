// Insert annotation: quote a passage you highlighted, with a citation to its
// page.
//
// Inserting a citation of any paper is Due Credit's, which picks from the
// bibliography. This is the one citation Paper Trail still writes, because
// the passages are the paper notes', as the last sync wrote them. It writes
// `[[key|key, p. 12]]`, a form Due Credit reads, as its `docs/citations.md`
// agrees.
import { MarkdownView, Notice } from 'obsidian';
import { pickPaper, pickPassage, type AnnotatedPaper } from '../ui/annotation-picker';
import { inRegion, isPaper, syncedPassages } from '../core/paper-note';
import { quotation } from '../core/zotero';
import type { Context } from '../context';

const IN_ANNOTATIONS = "The cursor is in the annotations section, which is rewritten every time the note is refreshed from Zotero. Put the cursor above it, and try again.";

/**
 * Whether the cursor is in a paper note's annotations, where a quote would be
 * gone at the next sync. Asked again once the pickers close, since the cursor,
 * or the note, may have changed while they were open.
 */
function inAnnotations(context: Context, view: MarkdownView): boolean {
	const frontmatter = view.file === null ? undefined : context.app.metadataCache.getFileCache(view.file)?.frontmatter;
	return isPaper(frontmatter, context.settings.keyField) && inRegion(view.editor.getValue(), view.editor.getCursor().line);
}

/**
 * Quote a passage you annotated, with the citation to its page.
 *
 * The paper first, then the passage. The passages come out of the paper notes,
 * as the last sync wrote them, and the papers are offered most recently
 * changed first, which is usually the one you are writing about. Only papers
 * with something to quote are offered. The quote is a copy: it is yours to cut
 * down once it is in.
 */
export async function insertAnnotation(context: Context): Promise<void> {
	const app = context.app;
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) {
		new Notice('Open a note and put the cursor where the quote should go.');
		return;
	}
	if (inAnnotations(context, view)) {
		new Notice(IN_ANNOTATIONS);
		return;
	}

	const papers: AnnotatedPaper[] = [];
	const files = app.vault.getMarkdownFiles().sort((a, b) => b.stat.mtime - a.stat.mtime);
	for (const file of files) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!isPaper(frontmatter, context.settings.keyField)) continue;
		const passages = syncedPassages(await app.vault.cachedRead(file));
		if (passages.length === 0) continue;
		const title = typeof frontmatter.title === 'string' && frontmatter.title.trim() ? frontmatter.title.trim() : file.basename;
		const byline = [frontmatter.authors, frontmatter.year].filter((part) => typeof part === 'string' || typeof part === 'number').join(', ');
		papers.push({ file, title, byline, passages });
	}
	if (papers.length === 0) {
		new Notice("There are no annotations in your paper notes yet. Open a paper's note with Zotero running to bring them in.");
		return;
	}

	const paper = await pickPaper(app, papers);
	if (!paper) return;
	const chosen = await pickPassage(app, paper);
	if (!chosen) return;

	// Fetched after the picker closes, for the same reason as a citation: the
	// cursor may have moved while it was open.
	const target = app.workspace.getActiveViewOfType(MarkdownView);
	if (!target) {
		new Notice("There's no open note to put it in.");
		return;
	}
	if (inAnnotations(context, target)) {
		new Notice(IN_ANNOTATIONS);
		return;
	}
	const editor = target.editor;
	// Either side of the selection rather than of the cursor: a selection is
	// replaced, so what stays on the line is what is before and after it.
	const from = editor.getCursor('from');
	const to = editor.getCursor('to');
	const before = editor.getLine(from.line).slice(0, from.ch);
	const after = editor.getLine(to.line).slice(to.ch);
	editor.replaceSelection(quotation(chosen.text, paper.file.basename, chosen.page, before, after));
}
