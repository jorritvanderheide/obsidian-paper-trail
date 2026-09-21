// What is outstanding, drawn once and shown in two places: a sidebar you can
// leave open, and the ```paper-trail``` block if you would rather have it on a
// note of your own.
//
// The block was the only surface for a long time, which meant the queue existed
// when you were looking at your homepage and nowhere else. That is the wrong
// half of the day. The sidebar is the same list, always to hand.
//
// Rendering only. What is outstanding comes from outstanding.ts and acting on
// a row lives in commands/workflow.ts, so a row does the same thing whether it
// was clicked here, clicked in a note, or reached by `next`.
//
// Derived, never authoritative: everything is read from the metadata cache and
// every write goes through the same commands the palette uses. If this and a
// note disagree, the note is right.
import { ItemView, debounce, setIcon, type App, type WorkspaceLeaf } from 'obsidian';
import { rowTitle, STAGES, type Row, type Stage, type StageAction } from '../core/stages';
import { act, finish, next, openNote } from '../commands/workflow';
import { queue } from '../outstanding';
import { lastContact } from '../source';
import { refreshLibrary } from '../library';
import type { Context } from '../context';

export const QUEUE_VIEW = 'paper-trail-queue';

/** How many rows a section shows before it stops being a prompt and starts being a wall. */
const ROWS = 3;

/**
 * Draw the whole queue into an element, replacing whatever was there.
 *
 * A free function rather than a method, because two very different hosts need
 * it: a `MarkdownRenderChild` living inside someone's note, and an `ItemView`
 * living in the sidebar. Neither wants to inherit from the other.
 */
export function renderQueue(root: HTMLElement, context: Context): void {
	const { notes, rows: buckets } = queue(context);

	root.empty();
	root.addClass('paper-trail');
	offline(root, context);

	if ([...buckets.values()].every((list) => list.length === 0)) {
		// Two different empties. A vault that has dealt with everything needs
		// telling it is done; a vault that has never seen a paper needs telling
		// where papers come from, because nothing here is how you add one.
		//
		// Triage is everything Zotero holds that has no note, so reaching this
		// with an empty vault means Zotero itself is empty or unreachable. The
		// offline banner above has already said which.
		const started = notes.some((note) => note.isPaper);
		const empty = root.createDiv({ cls: 'paper-trail-workflow-clear' });

		empty.setText(started ? 'Nothing outstanding.' : 'No papers yet. Add them to Zotero and they turn up here to triage.');
		return;
	}

	// One button for the whole list, above it. `next` takes the top row of the
	// topmost non-empty stage, and the palette is a poor home for the thing you
	// reach for most.
	const outstanding = [...buckets.values()].reduce((sum, list) => sum + list.length, 0);
	const header = root.createDiv({ cls: 'paper-trail-queue-header' });
	header.createSpan({ cls: 'paper-trail-workflow-more', text: `${outstanding} outstanding` });
	header.createEl('button', { cls: 'mod-cta', text: 'Next' }).addEventListener('click', () => void next(context));

	for (const definition of STAGES) {
		const rows = buckets.get(definition.stage) ?? [];
		if (rows.length > 0) section(root, context, definition, rows);
	}
}

/**
 * Say when Zotero is not answering, and only then.
 *
 * Silence means working, which is the right default for something that is true
 * almost always: a banner saying "connected" every time you glance at the queue
 * would be noise you learn to stop reading, and then miss on the day it
 * changes. Triage is read from Zotero entirely, so with Zotero closed the queue
 * is not short, it is wrong, and that is worth a line. This is the one place
 * that explains a plugin which has apparently stopped doing anything.
 */
function offline(root: HTMLElement, context: Context): void {
	const contact = lastContact();
	if (contact === null || contact.reachable) return;

	const box = root.createDiv({ cls: 'paper-trail-offline' });
	box.createDiv({ cls: 'paper-trail-offline-reason', text: contact.reason });
	box.createEl('button', { text: 'Try again' }).addEventListener('click', () => {
		void refreshLibrary(context.settings.apiPort).then(() => renderQueue(root, context));
	});
}

/**
 * Which sections have been opened out, for as long as the pane stays open.
 *
 * Cleared when the sidebar opens, because an expansion is a thing you did to
 * find one paper rather than a preference, and a queue that came back showing
 * four hundred rows would have given up the cap that makes it readable.
 */
const expanded = new Set<Stage>();

/**
 * A row's action: an icon, labelled for the tooltip and for a screen reader.
 *
 * `clickable-icon` is Obsidian's own class for exactly this, so the button
 * picks up the hover, focus and theme treatment every other icon button in the
 * app has rather than an approximation of it made here.
 */
function iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
	const button = parent.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
	setIcon(button, icon);
	button.addEventListener('click', onClick);
}

function section(root: HTMLElement, context: Context, { stage, label, action, icon, hint, done, doneIcon }: StageAction, rows: Row[]): void {
	const shown = expanded.has(stage) ? rows.length : ROWS;
	const el = root.createDiv({ cls: 'paper-trail-workflow-section' });
	const header = el.createDiv({ cls: 'paper-trail-workflow-header' });
	header.createSpan({ cls: 'paper-trail-workflow-label', text: label });
	header.createSpan({ cls: 'paper-trail-workflow-count', text: String(rows.length) });
	header.setAttr('aria-label', hint);

	for (const entry of rows.slice(0, shown)) {
		const row = el.createDiv({ cls: 'paper-trail-workflow-row' });
		const title = row.createEl('a', { cls: 'paper-trail-workflow-title', text: rowTitle(entry), href: '#' });
		title.addEventListener('click', (event) => {
			event.preventDefault();
			// A pending paper has no note to open, so its title does the one
			// thing there is to do with it rather than nothing at all.
			if (entry.kind === 'note') void openNote(context.app, entry.note);
			else void act(context, stage, entry);
		});

		// At the trailing edge, on the same line as the title.
		const actions = row.createDiv({ cls: 'paper-trail-workflow-actions' });
		// The stage's own end first, where it is reachable: a row you are
		// coming back to is more often finished than started again.
		if (done && doneIcon && entry.kind === 'note') {
			iconButton(actions, doneIcon, done, () => void finish(context, stage, entry));
		}
		iconButton(actions, icon, action, () => void act(context, stage, entry));
	}

	// The count is honest even when the list is not, because a backlog you
	// cannot see is the thing that stops the queue being worth reading. It also
	// opens: capping at three keeps the list a prompt rather than a wall, but a
	// cap you cannot lift means a paper outside the top three is reachable only
	// by whatever `next` happens to offer.
	if (rows.length > shown) {
		const more = el.createEl('a', { cls: 'paper-trail-workflow-more', text: `and ${rows.length - shown} more`, href: '#' });
		more.addEventListener('click', (event) => {
			event.preventDefault();
			expanded.add(stage);
			renderQueue(root, context);
		});
	}
}

/**
 * The sidebar. Same list as the block, but it does not depend on you being on
 * the note that happens to carry one.
 */
export class QueueView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private readonly context: Context,
	) {
		super(leaf);
	}

	getViewType(): string {
		return QUEUE_VIEW;
	}

	getDisplayText(): string {
		return 'Reading queue';
	}

	getIcon(): string {
		return 'list-checks';
	}

	/**
	 * Drawing reads every note in the vault, which is cheap once and wasteful a
	 * hundred times in a row. One save fires one event, but a sync or a git pull
	 * fires one per file, and coalescing those is the difference between a
	 * redraw and a freeze.
	 */
	private readonly redraw = debounce(() => renderQueue(this.contentEl, this.context), 200, true);

	/**
	 * Ask Zotero what has changed, and redraw if anything has.
	 *
	 * Coalesced because the events that call it arrive in bursts, and skipped
	 * when nothing moved: the usual answer is that nothing has, and redrawing
	 * the queue reads every note in the vault.
	 */
	private readonly catchUp = debounce(() => {
		const before = lastContact()?.reachable;
		void refreshLibrary(this.context.settings.apiPort).then((moved) => {
			// Redrawn when the library moved, and also when Zotero itself came or
			// went. Skipping on "nothing moved" alone meant quitting Zotero with
			// this pane open changed nothing on screen: the failure was recorded
			// and never drawn, so the one surface that explains an unreachable
			// Zotero stayed silent about it until something else forced a redraw.
			if (moved || before !== lastContact()?.reachable) this.redraw();
		});
	}, 300, true);

	async onOpen(): Promise<void> {
		expanded.clear();
		renderQueue(this.contentEl, this.context);

		// Draw first from what is already known, then ask Zotero and draw again.
		// Triage comes entirely from Zotero, so waiting for the request before
		// showing anything would mean an empty pane every time this opens.
		void refreshLibrary(this.context.settings.apiPort).then(() => this.redraw());

		this.registerEvent(this.app.metadataCache.on('changed', this.redraw));
		this.registerEvent(this.app.vault.on('delete', this.redraw));
		this.registerEvent(this.app.vault.on('rename', this.redraw));

		// Coming back to Obsidian is the moment you have just saved something in
		// the browser, so it is the moment worth asking. Asking costs one request
		// that almost always answers with nothing, which is the only reason it
		// can be hung on something this frequent.
		this.registerDomEvent(window, 'focus', () => this.catchUp());
	}
}

/**
 * Show the sidebar, reusing the leaf it is already in.
 *
 * Never called on load. A plugin that takes sidebar space before being asked
 * has decided something about someone else's workspace that was not its to
 * decide, and the block exists for people who would rather it lived in a note.
 */
export async function openQueue(app: App): Promise<void> {
	const existing = app.workspace.getLeavesOfType(QUEUE_VIEW)[0];
	const leaf = existing ?? app.workspace.getRightLeaf(false);
	if (!leaf) return;

	if (!existing) await leaf.setViewState({ type: QUEUE_VIEW, active: true });
	await app.workspace.revealLeaf(leaf);
}
