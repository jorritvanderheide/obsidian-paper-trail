// A paper's reading state: forming it in the triage pane, and changing it by
// hand afterwards.
//
// The pane is one way in, but not the only one. A paper that has actually been
// read needs a way out of the queue, or it sits in the Read stage forever and
// `next` keeps offering it, and only you know when you finished reading.
//
// Every route goes through applyTriage, so the frontmatter a decision leaves
// behind cannot drift between them.
import { MarkdownView, Notice, type App, type TFile, type WorkspaceLeaf } from 'obsidian';
import { backMatter, cleanFulltext } from '../core/clean';
import { passOne } from '../core/passOne';
import { glance, referenceLines, type KnownPaper } from '../core/references';
import { itemYear, parseItemRef, venueOf, type ItemRef } from '../core/zotero';
import { itemMetadata, loadFulltext, SourceError } from '../source';
import { PASS_ONE_VIEW, PassOneView, type Brief, type Full } from '../ui/pass-one-view';
import { applyTriage, asks, landing, type Reading, type Triage } from '../core/triage';
import { isPaper, notAPaper } from '../core/paper-note';
import { createPaperNote } from './papers';
import type { Pending } from '../core/pending';
import { prompt, suggest } from '../ui/prompt';
import { leafShowing, reveal } from '../ui/reveal';
import type { Context } from '../context';

/** ISO date, which is what the Linter and every Dataview query want. */
function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Record a decision. Nothing else: the annotations arrive when the note is
 * opened, which for a paper that has just been read is the next thing that
 * happens anyway, and for one that has just been dropped is never, which is
 * right.
 */
export async function writeTriage(context: Context, file: TFile, triage: Triage): Promise<void> {
	const date = today();
	await context.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		applyTriage(frontmatter, triage, date);
	});
}

/**
 * Ask whatever the decision owes an answer to, then write it. Returns whether
 * anything was written.
 *
 * Every route to a decision comes through here: the triage pane, the
 * homepage's Finished button and the status command. The alternative was three
 * copies of "a drop asks why", which is how two of them end up not asking.
 *
 * Escaping the question abandons the change rather than writing it without an
 * answer. A drop with no reason is a deletion with extra steps, and a deferral
 * with no condition is a paper nobody will ever look at again.
 */
export async function decide(context: Context, file: TFile, reading: Reading): Promise<boolean> {
	const question = asks(reading);

	let reason: string | null = null;
	if (question) {
		reason = await prompt(context.app, question.question, { cta: question.cta });
		if (!reason) return false;
	}

	await writeTriage(context, file, { reading, reason });
	return true;
}

const CHOICES: { reading: Reading; label: string }[] = [
	{ reading: 'finished', label: 'Finished, and that was enough' },
	{ reading: 'pass-three', label: 'Read, and worth a third pass' },
	{ reading: 'queued', label: 'Queued, worth an hour' },
	{ reading: 'deferred', label: 'Deferred, come back to it later' },
	{ reading: 'dropped', label: 'Dropped, not worth reading' },
	{ reading: 'untriaged', label: 'Untriaged, assess it again' },
];

/**
 * Set the reading state by hand, including back to states no button offers.
 * The routes through the block cover the common path; this is how a paper gets
 * out of a state you put it in by mistake.
 */
export async function setReading(context: Context, target?: TFile): Promise<void> {
	const app = context.app;
	const file = target ?? app.workspace.getActiveFile();
	if (!file) {
		new Notice('No active note.');
		return;
	}

	if (!isPaper(app.metadataCache.getFileCache(file)?.frontmatter, context.settings.keyField)) {
		new Notice(notAPaper(file.basename, context.settings.keyField));
		return;
	}

	const choice = await suggest(
		app,
		CHOICES,
		(entry) => entry.label,
		`Reading status of ${file.basename}`,
		(entry) => landing(entry.reading),
	);
	if (!choice) return;
	if (!(await decide(context, file, choice.reading))) return;

	new Notice(`${file.basename}\n${landing(choice.reading)}`);
}

/**
 * Every paper the vault already holds, as the references glance needs to see
 * it. Titles and aliases together, because Zotero's short title is what the
 * note is called and the full one is what somebody else's bibliography prints.
 *
 * The paper being assessed is left out. It does not cite itself, and matching
 * its own title would only ever mean the cleaner had left the front matter in.
 */
function known(context: Context, selfPath: string | null): KnownPaper[] {
	const app = context.app;
	const keyField = context.settings.keyField;

	return app.vault
		.getMarkdownFiles()
		.filter((file) => file.path !== selfPath)
		.flatMap((file) => {
			const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
			if (!isPaper(frontmatter, keyField)) return [];

			const titles = [frontmatter.title, ...(Array.isArray(frontmatter.aliases) ? (frontmatter.aliases as unknown[]) : [])].filter(
				(value): value is string => typeof value === 'string',
			);

			return [
				{
					path: file.path,
					titles: titles.length > 0 ? titles : [file.basename],
					reading: typeof frontmatter.reading === 'string' ? frontmatter.reading : null,
				},
			];
		});
}

/**
 * Keshav's full first pass: the extracted text, cleaned, plus how much of the
 * bibliography the vault already holds.
 *
 * Everything expensive lives here, and nothing calls it until the button is
 * pressed. Reading the cache off disk, running the cleaner over it and scanning
 * every note in the vault for titles is a fair price for a paper you are
 * seriously considering and an absurd one for the four out of five that the
 * abstract already answered.
 */
async function fullPass(context: Context, ref: ItemRef, body: string, selfPath: string | null): Promise<Full> {
	const fulltext = await loadFulltext(context.settings, ref, body);
	await context.saveSettings();

	return {
		result: passOne(cleanFulltext(fulltext.text)),
		seen: glance(referenceLines(backMatter(fulltext.text)), known(context, selfPath)),
	};
}

/**
 * Bring a note into view, reusing the pane it is already in. Returns the leaf
 * only when it had to open one, so the caller can put the workspace back the way
 * it found it: closing a note the user opened themselves would be rude.
 */
async function showNote(app: App, file: TFile): Promise<WorkspaceLeaf | null> {
	// A new tab lands in whichever group is active, and after a previous run that
	// is the triage pane itself. Move to a text group first, or the note opens
	// on top of the pane it is supposed to sit beside. Only when it is not
	// already showing somewhere, because then no tab is about to be made.
	if (!leafShowing(app, file) && app.workspace.getMostRecentLeaf()?.view.getViewType() === PASS_ONE_VIEW) {
		const markdown = app.workspace.getLeavesOfType('markdown')[0];
		if (markdown) app.workspace.setActiveLeaf(markdown, { focus: false });
	}

	return reveal(app, file);
}


/**
 * Wait until Obsidian has read a file, or give up.
 *
 * A note written a moment ago is on disk before the metadata cache knows
 * anything about it, so asking for its headings straight away gets nothing.
 * The timeout is the point: a note that never arrives should cost a second of
 * no cursor, not a promise that never settles.
 */
function indexed(app: App, file: TFile, wait = 1000): Promise<void> {
	if (app.metadataCache.getFileCache(file)) return Promise.resolve();

	return new Promise((resolve) => {
		const done = () => {
			app.metadataCache.offref(ref);
			window.clearTimeout(timer);
			resolve();
		};
		const ref = app.metadataCache.on('changed', (changed) => {
			if (changed.path === file.path) done();
		});
		const timer = window.setTimeout(done, wait);
	});
}

/**
 * Put the workspace back, or leave it where the work is.
 *
 * A dropped or queued paper is finished with for now, so a tab this command
 * opened is closed again and you end up where you started. A paper marked read
 * goes straight to Write up in that same note, so it stays open with the cursor
 * under the claim, ready to type into.
 */
function afterDecision(app: App, file: TFile, opened: WorkspaceLeaf | null, reading: Reading, claimHeading: string): void {
	// A tick later, because the pane closes itself once this callback returns.
	// Focusing the note before that happens lets the detach take the focus back.
	window.setTimeout(() => void rearrange(app, file, opened, reading, claimHeading), 0);
}

async function rearrange(app: App, file: TFile, opened: WorkspaceLeaf | null, reading: Reading, claimHeading: string): Promise<void> {
	// Both land in Write up, so both leave you in the note with somewhere to type.
	if (reading === 'finished' || reading === 'pass-three') {
		// Opened rather than only focused. A paper triaged straight out of the
		// queue has no note until the decision makes one, so there is nothing on
		// screen to focus and the paper would move to Write up invisibly.
		await reveal(app, file);
		const leaf = leafShowing(app, file);
		if (!leaf) return;

		// A note this new may not be in the metadata cache yet, and its headings
		// are what the cursor is aimed at.
		await indexed(app, file);

		const view = leaf.view;
		const heading = (app.metadataCache.getFileCache(file)?.headings ?? []).find(
			(entry) => entry.heading.trim().toLowerCase() === claimHeading.trim().toLowerCase(),
		);
		if (view instanceof MarkdownView && heading) {
			const at = { line: heading.position.end.line + 1, ch: 0 };
			view.editor.setCursor(at);
			view.editor.scrollIntoView({ from: at, to: at }, true);
		}
		return;
	}

	// Only close a tab this command opened, and only while it still holds the
	// note: the pane was open for a while and may have been navigated away from.
	if (opened && opened.view instanceof MarkdownView && opened.view.file === file) opened.detach();
}

/**
 * The triage pane, split beside whatever is active. One pane, reused: opening
 * triage twice without deciding in between would otherwise leave two of them
 * up, both claiming to be waiting for an answer.
 */
async function passOneLeaf(app: App): Promise<WorkspaceLeaf> {
	const leaf = app.workspace.getLeavesOfType(PASS_ONE_VIEW)[0] ?? app.workspace.getLeaf('split', 'vertical');
	await leaf.setViewState({ type: PASS_ONE_VIEW, active: true });
	await app.workspace.revealLeaf(leaf);
	return leaf;
}

/**
 * Open the triage pane on a paper.
 *
 * Takes the paper rather than finding one, because everything that reaches
/**
 * What triage can be pointed at: a paper's note, or a paper in Zotero that has
 * none yet.
 *
 * The second is the ordinary case now. Triage is computed from what Zotero
 * holds and the vault does not, so most of what you assess has never been
 * written down, and deciding is what writes it.
 */
export type TriageTarget = { kind: 'note'; file: TFile } | { kind: 'pending'; item: Pending };

/** Make the note a decision needs, for a paper that did not have one. */
async function noteFor(context: Context, item: Pending): Promise<TFile> {
	const ref: ItemRef = { key: item.key, groupID: null };
	// The queue's copy is a summary. The note wants the authors and the citation
	// key, which only the item itself carries.
	return createPaperNote(context, await itemMetadata(context.settings.apiPort, ref), ref);
}

/**
 * Write a decision, making the note first when there is not one.
 *
 * Returns the note it wrote to, or null when the question behind the decision
 * went unanswered. Nothing is created in that case: abandoning a drop halfway
 * through should leave no trace, which it cannot do if the file came first.
 */
async function decideOn(context: Context, target: TriageTarget, reading: Reading): Promise<TFile | null> {
	const question = asks(reading);

	let reason: string | null = null;
	if (question) {
		reason = await prompt(context.app, question.question, { cta: question.cta });
		if (!reason) return null;
	}

	const file = target.kind === 'note' ? target.file : await noteFor(context, target.item);
	await writeTriage(context, file, { reading, reason });
	return file;
}

/**
 * Open the triage pane on a paper.
 *
 * A pending paper costs no requests at all: the queue already fetched its
 * title, venue, year and abstract when it worked out what was outstanding, and
 * that is everything the cheap depth shows. A paper that already has a note
 * costs one, because its abstract is not written down anywhere here.
 *
 * The deeper pass is handed over as a function the pane calls if you press for
 * it, so nothing touches the PDF, the cleaner or the vault scan for a paper the
 * abstract is about to settle.
 */
export async function openTriage(context: Context, target: TriageTarget): Promise<void> {
	const app = context.app;
	const settings = context.settings;

	let title: string;
	let ref: ItemRef | null;
	let brief: Brief = { abstract: null, venue: null, year: null };
	let problem: string | null = null;

	if (target.kind === 'pending') {
		const item = target.item;
		title = item.title;
		ref = { key: item.key, groupID: null };
		brief = { abstract: item.abstract, venue: item.venue, year: item.year };
	} else {
		const file = target.file;
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		// A note with no key field at all is not a paper, and nothing in the
		// workflow ever sends one here. A note whose key field is unreadable is a
		// paper as far as every other rule is concerned, so it gets the pane.
		if (!isPaper(frontmatter, settings.keyField)) {
			new Notice(notAPaper(file.basename, settings.keyField));
			return;
		}

		title = typeof frontmatter.title === 'string' ? frontmatter.title : file.basename;
		const key = String(frontmatter[settings.keyField]);
		ref = parseItemRef(key);

		// The pane opens whether or not any of this could be found, and that is
		// the whole reason why: triage is the first stage and `next` always
		// offers its oldest row, so a paper that failed here with a notice and
		// changed nothing blocked every other paper in the vault, permanently. A
		// pane that admits what it is missing still ends in a decision, and a
		// decision is what unblocks the queue.
		if (!ref) {
			problem = `${settings.keyField} is "${key}", which is not a Zotero item key. Fix it in the note, or decide from the title.`;
		} else {
			try {
				const item = await itemMetadata(settings.apiPort, ref);
				brief = { abstract: item.data.abstractNote?.trim() || null, venue: venueOf(item), year: itemYear(item) };
			} catch (error) {
				if (!(error instanceof SourceError)) console.error(error);
				problem = error instanceof Error ? error.message : String(error);
			}
		}
	}

	// The note first, so the pane has the right thing to sit beside: reached
	// from the queue the note is usually not open at all, and splitting off
	// whatever was in front leaves the pane hanging next to something it has
	// nothing to do with. A pending paper has no note to sit beside yet.
	const opened = target.kind === 'note' ? await showNote(app, target.file) : null;
	const selfPath = target.kind === 'note' ? target.file.path : null;

	const leaf = await passOneLeaf(app);
	if (!(leaf.view instanceof PassOneView)) return;

	leaf.view.show(
		{ title, brief, problem },
		{
			decide: async (reading) => {
				const file = await decideOn(context, target, reading);
				if (!file) return false;
				afterDecision(app, file, opened, reading, settings.claimHeading);
				return true;
			},
			full: async () => {
				if (!ref) throw new SourceError('This note names no Zotero item, so there is no text to read.');
				const body = target.kind === 'note' ? await app.vault.cachedRead(target.file) : '';
				return fullPass(context, ref, body, selfPath);
			},
		},
	);
}
