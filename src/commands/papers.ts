// Making a paper's note, and keeping it level with Zotero afterwards.
//
// Nothing here is a command you reach for to start a paper. A note is written
// by a triage decision and by nothing else, so every file in the vault stands
// for a judgement somebody made.
//
// The plugin owns the note from there on, which is what lets it know the shape
// instead of asking: where the claim heading is, which region a sync may
// rewrite, and which frontmatter keys are its own.
import { Notice, normalizePath, type TFile } from 'obsidian';
import { PAPER_TEMPLATE } from '../core/templates';
import {
	applyPaperFrontmatter,
	fill,
	isPaper,
	notAPaper,
	managedDiffers,
	paperFrontmatter,
	paperLinks,
	replaceRegion,
	renderHighlights,
} from '../core/paper-note';
import { attachmentKeys, noteName, parseItemRef, type ApiItem, type ItemRef } from '../core/zotero';
import { attachmentAnnotations, itemChildren, itemMetadata, SourceError } from '../source';
import { ensureFolder, templateBody } from './templates';
import type { Context } from '../context';

/** Where a new note for this paper would go. */
function notePath(context: Context, item: ApiItem): string {
	return normalizePath(`${context.settings.papersFolder}/${noteName(item)}.md`);
}

/**
 * Write the managed frontmatter. On creation this also stamps the tags and the
 * reading state; on a later sync it must not, because those are answers the
 * user gave and Zotero knows nothing about them.
 */
export async function writePaperFrontmatter(
	context: Context,
	file: TFile,
	item: ApiItem,
	ref: ItemRef,
	fresh: boolean,
): Promise<void> {
	const managed = paperFrontmatter(item, ref);
	await context.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		applyPaperFrontmatter(frontmatter, managed, fresh, context.settings.keyField, context.settings.statusTag);
	});
}


/**
 * Write the note for a paper, and hand it back.
 *
 * Two things make one, so neither may do it differently: the command, and a
 * triage decision about a paper Zotero holds and the vault has no note for.
 */
export async function createPaperNote(context: Context, item: ApiItem, ref: ItemRef): Promise<TFile> {
	const app = context.app;
	const port = context.settings.apiPort;

	const attachment = attachmentKeys(await itemChildren(port, ref))[0] ?? null;

	// A brand new paper usually has no annotations, but one imported with a
	// PDF you had already marked up has all of them, and a note that opens
	// with an empty Highlights section under an annotated paper looks broken.
	const highlights = attachment ? await attachmentAnnotations(port, ref, attachment) : [];

	await ensureFolder(app, context.settings.papersFolder);

	const body = fill(await templateBody(app, PAPER_TEMPLATE, context.settings.templateFolder), {
		TITLE: item.data.shortTitle?.trim() || item.data.title || item.key,
		LINKS: paperLinks(ref, attachment),
		// The two headings the workflow watches, one per pass. Literals here
		// would mean a note whose claim and assessment the plugin is looking
		// for under names the template does not use.
		CLAIM: context.settings.claimHeading,
		ASSESSMENT: context.settings.assessmentHeading,
	});

	// Created with an empty frontmatter block rather than none.
	// `processFrontMatter` decides what to replace from the metadata cache,
	// which has not indexed a file this new, and on a file with no block it
	// ate the first two lines: the `# Title` and the blank after it. Given a
	// real block to edit, it edits that.
	//
	// The highlights go in before the file exists rather than through a sync
	// afterwards, for the same reason: a sync reads the note's frontmatter from
	// the cache, finds no Zotero key on a file this new, and quietly does
	// nothing.
	const file = await app.vault.create(notePath(context, item), `---\n---\n${replaceRegion(body, renderHighlights(highlights))}`);
	await writePaperFrontmatter(context, file, item, ref, true);
	return file;
}

/**
 * Refresh a paper's note from Zotero: the managed frontmatter, and the
 * highlights region.
 *
 * Nothing else in the file is read or written. The user's prose, their reading
 * decision and any frontmatter key the plugin does not claim survive untouched,
 * which is the promise `core/paper-note.ts` exists to keep.
 *
 * Both halves are written only when they would actually differ, so a paper
 * nobody has touched in Zotero comes back from a sync with its modified time
 * unchanged. That guard is what makes it safe to do this on every open.
 *
 * Throws on a Zotero it cannot reach. The caller decides whether that is worth
 * saying out loud.
 */
async function syncPaper(context: Context, file: TFile): Promise<void> {
	const app = context.app;
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	const ref = parseItemRef(frontmatter?.[context.settings.keyField]);
	if (!ref) return;

	const port = context.settings.apiPort;
	const item = await itemMetadata(port, ref);

	// Whichever attachment Zotero offers now, asked every time rather than
	// remembered. Recording one and preferring it would save a request on
	// localhost and cost the case that matters: replace a PDF and the note goes
	// on reading annotations off an attachment that has gone.
	const attachment = attachmentKeys(await itemChildren(port, ref))[0] ?? null;

	const highlights = attachment ? await attachmentAnnotations(port, ref, attachment) : [];

	const managed = paperFrontmatter(item, ref);
	if (managedDiffers(frontmatter, managed, context.settings.keyField)) {
		await app.fileManager.processFrontMatter(file, (existing: Record<string, unknown>) => {
			applyPaperFrontmatter(existing, managed, false, context.settings.keyField);
		});
	}

	const body = await app.vault.read(file);
	const updated = replaceRegion(body, renderHighlights(highlights));
	if (updated !== body) await app.vault.modify(file, updated);
}

/**
 * Refresh the paper you are looking at, and say what happened.
 *
 * The automatic sync is deliberately silent, which is right when it fires on
 * every note you open and wrong when you asked for it: pressing refresh and
 * getting no answer is indistinguishable from pressing a dead button. So this
 * one reports both ways round, including that Zotero is not running.
 */
export async function refreshPaper(context: Context, target?: TFile): Promise<void> {
	const file = target ?? context.app.workspace.getActiveFile();
	if (!file) {
		new Notice('Open a paper first.');
		return;
	}

	if (!isPaper(context.app.metadataCache.getFileCache(file)?.frontmatter, context.settings.keyField)) {
		new Notice(notAPaper(file.basename, context.settings.keyField));
		return;
	}

	try {
		await syncPaper(context, file);
		new Notice(`${file.basename} is up to date with Zotero.`);
	} catch (error) {
		if (!(error instanceof SourceError)) console.error(error);
		new Notice(error instanceof Error ? error.message : String(error));
	}
}

/**
 * Papers being synced right now.
 *
 * `file-open` fires on every tab switch, so flicking between two notes can ask
 * for the same paper again while the first request is still out. Two syncs
 * racing on one file is two writers of the same region.
 */
const syncing = new Set<string>();

/**
 * Bring a paper up to date because its note was opened.
 *
 * This is the only thing that refreshes an existing paper, which is the whole
 * point: a sync you have to remember to run is a sync that does not happen, and
 * the note you are looking at is exactly the one whose highlights you want.
 *
 * Failure says nothing. Zotero not being open is the ordinary case, not an
 * error, and a notice on every literature note you opened without it running
 * would be unusable. The note still shows whatever was synced last time, which
 * is the honest thing for it to show.
 */
export async function syncOnOpen(context: Context, file: TFile): Promise<void> {
	if (!isPaper(context.app.metadataCache.getFileCache(file)?.frontmatter, context.settings.keyField)) return;
	if (syncing.has(file.path)) return;

	syncing.add(file.path);
	try {
		await syncPaper(context, file);
	} catch (error) {
		if (!(error instanceof SourceError)) console.error('paper-trail:sync', error);
	} finally {
		syncing.delete(file.path);
	}
}
