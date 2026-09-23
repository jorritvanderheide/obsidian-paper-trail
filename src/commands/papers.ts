// Making a paper's note, and keeping it level with Zotero afterwards.
//
// Nothing here is a command you reach for to start a paper. A note is written
// by a triage decision and by nothing else, so every file in the vault stands
// for a judgement somebody made.
//
// The plugin owns the note from there on, which is what lets it know the shape
// instead of asking: where the claim heading is, which region a sync may
// rewrite, and which frontmatter keys are its own.
import { Notice, TFile, normalizePath } from 'obsidian';
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
	renderAnnotations,
} from '../core/paper-note';
import { attachmentKeys, noteName, parseItemRef, type ApiItem, type ItemRef } from '../core/zotero';
import { arrivalReading, type Reading } from '../core/triage';
import { attachmentAnnotations, itemChildren, itemMetadata, SourceError } from '../source';
import { settle } from '../ui/editing';
import { notify } from '../ui/notify';
import { statusTagsOf } from '../core/settings';
import { ensureFolder, templateBody } from './seed';
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
async function writePaperFrontmatter(
	context: Context,
	file: TFile,
	item: ApiItem,
	ref: ItemRef,
	arriving: Reading | null,
): Promise<void> {
	const managed = paperFrontmatter(item, ref, file.basename);
	await context.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		applyPaperFrontmatter(frontmatter, managed, arriving, context.settings.keyField, statusTagsOf(context.settings));
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

	// A note that is already there is the note, not a name collision to fail on.
	// Two routes can now reach a pending paper at once, the row and its button,
	// and the queue takes a moment to notice the first one landed. Checking the
	// key as well as the path is what keeps this from adopting somebody else's
	// note that happens to be called the same thing.
	const path = notePath(context, item);
	const existing = app.vault.getFileByPath(path);
	if (existing instanceof TFile) {
		const frontmatter = app.metadataCache.getFileCache(existing)?.frontmatter;
		if (frontmatter?.[context.settings.keyField] === ref.key) return existing;

		// Something else is already called this. Most likely an empty note made
		// by following a citation to a paper that had none yet, since a citation
		// is a link and Obsidian offers to create what a link points at. Said
		// plainly here, because the alternative is `vault.create` refusing with
		// a message about a file existing and nothing about which paper or why.
		throw new Error(
			`${path} already exists and is not this paper.\n` +
				'Delete it, or rename it out of the way, and try again.',
		);
	}

	const attachment = attachmentKeys(await itemChildren(ref))[0] ?? null;

	// A brand new paper usually has no annotations, but one imported with a
	// PDF you had already marked up has all of them, and a note that opens
	// with an empty Annotations section under an annotated paper looks broken.
	const annotations = attachment ? await attachmentAnnotations(ref, attachment) : [];

	await ensureFolder(app, context.settings.papersFolder);

	const body = fill(await templateBody(app, PAPER_TEMPLATE, context.settings.templateFolder), {
		TITLE: item.data.shortTitle?.trim() || item.data.title || item.key,
		LINKS: paperLinks(ref, attachment),
	});

	// Created with an empty frontmatter block rather than none.
	// `processFrontMatter` decides what to replace from the metadata cache,
	// which has not indexed a file this new, and on a file with no block it
	// ate the first two lines: the `# Title` and the blank after it. Given a
	// real block to edit, it edits that.
	//
	// The annotations go in before the file exists rather than through a sync
	// afterwards, for the same reason: a sync reads the note's frontmatter from
	// the cache, finds no Zotero key on a file this new, and quietly does
	// nothing.
	const file = await app.vault.create(path, `---\n---\n${replaceRegion(body, renderAnnotations(annotations))}`);
	await writePaperFrontmatter(context, file, item, ref, arrivalReading(context.settings.triage));
	return file;
}

/**
 * Refresh a paper's note from Zotero: the managed frontmatter, and the
 * annotations region.
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

	const item = await itemMetadata(ref);

	// Whichever attachment Zotero offers now, asked every time rather than
	// remembered. Recording one and preferring it would save a request on
	// localhost and cost the case that matters: replace a PDF and the note goes
	// on reading annotations off an attachment that has gone.
	const attachment = attachmentKeys(await itemChildren(ref))[0] ?? null;

	const annotations = attachment ? await attachmentAnnotations(ref, attachment) : [];

	// Everything above asks Zotero and writes nothing; everything below writes.
	// So the flush belongs here rather than at the top, where it used to be: up
	// there it was separated from its own writes by three round trips, and a
	// note that went dirty during them got the write on top of unsaved edits and
	// the "modified externally" notice that says so. The window is not
	// hypothetical, because this sync is started by opening a note and the thing
	// that opens a paper's note is usually about to type in it: finishing a
	// reading reveals the note, which fires this, and then writes the Claim
	// heading into the editor while Zotero is still answering.
	await settle(app, file);

	const managed = paperFrontmatter(item, ref, file.basename);
	if (managedDiffers(frontmatter, managed, context.settings.keyField)) {
		await app.fileManager.processFrontMatter(file, (existing: Record<string, unknown>) => {
			applyPaperFrontmatter(existing, managed, null, context.settings.keyField);
		});
	}

	// Checked against a cached read, written through `process`. The check is what
	// keeps a paper nobody has touched in Zotero from having its modified time
	// moved on every open; `process` is what keeps the write from being an
	// overwrite. `modify` replaces the whole file with a string decided before
	// the call, so a note you were typing into when a sync landed had the sync's
	// idea of the body written over yours, and Obsidian reported the file as
	// modified externally because from the editor's side it was.
	// Read after the flush, or the comparison is against a version of the note
	// that no longer exists and can skip a write that was needed.
	const rendered = renderAnnotations(annotations);
	const body = await app.vault.cachedRead(file);
	if (replaceRegion(body, rendered) === body) return;

	await app.vault.process(file, (current) => replaceRegion(current, rendered));
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
		notify(error);
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
 * the note you are looking at is exactly the one whose annotations you want.
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
