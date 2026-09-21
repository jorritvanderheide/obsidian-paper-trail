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
		root.createDiv({
			cls: 'pane-empty',
			text: started ? 'Nothing outstanding.' : 'No papers yet. Add them to Zotero and they turn up here to triage.',
		});
		return;
	}

	// One button for the whole list, above it. `next` takes the top row of the
	// topmost non-empty stage, and the palette is a poor home for the thing you
	// reach for most.
	const outstanding = [...buckets.values()].reduce((sum, list) => sum + list.length, 0);
	const header = root.createDiv({ cls: 'nav-header' });
	const buttons = header.createDiv({ cls: 'nav-buttons-container' });
	buttons.createSpan({
		cls: 'paper-trail-outstanding',
		text: `${outstanding} outstanding`,
	});
	iconButton(buttons, 'arrow-right', 'Next', () => void next(context), 'nav-action-button');

	// Every stage, including the empty ones. A section that vanished when it
	// emptied meant the list moved under the cursor as you worked it, and you
	// could never learn where Read sits. A zero is also worth reading: it says
	// there is nothing to write up, which is different from not being told.
	const files = root.createDiv({ cls: 'nav-files-container' });
	for (const definition of STAGES) {
		section(files, context, definition, buckets.get(definition.stage) ?? []);
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
	// The same icon the note title bar uses to refresh from Zotero, because it
	// is the same gesture: go and ask Zotero again. The reason beside it is
	// already carrying the words, so the button does not need to repeat them.
	iconButton(box, 'refresh-cw', 'Try again', () => {
		void refreshLibrary().then(() => renderQueue(root, context));
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
 * Which sections have been folded away, for as long as the pane stays open.
 *
 * Session-scoped like `expanded`, and for the same reason turned round: a
 * stage you collapsed because you are not reading today is not a standing
 * instruction to hide it, and the queue's whole job is saying what is
 * outstanding. It comes back open, and folding it again is one click.
 */
const collapsed = new Set<Stage>();

/**
 * The element the whole queue was drawn into.
 *
 * Redrawing from a section would nest a second copy of the queue inside the
 * first, and both the fold and the more link redraw.
 */
function paneOf(el: HTMLElement): HTMLElement {
	return el.closest<HTMLElement>('.paper-trail') ?? el;
}

/**
 * A button in this pane: an icon, labelled for the tooltip and for a screen
 * reader. Used by a row's actions and by the offline banner's retry.
 *
 * `clickable-icon` is Obsidian's own class for exactly this, so the button
 * picks up the hover, focus and theme treatment every other icon button in the
 * app has rather than an approximation of it made here.
 */
function iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void, extra = ''): void {
	const button = parent.createEl('button', {
		cls: `clickable-icon ${extra}`.trim(),
		attr: { 'aria-label': label },
	});
	setIcon(button, icon);
	button.addEventListener('click', (event) => {
		// A row is clickable too, and its click means "open this". Without this
		// a button would fire its own action and the row's underneath it.
		event.stopPropagation();
		onClick();
	});
}

/**
 * One row of the tree, in Obsidian's own nav markup.
 *
 * The classes are not decoration. A sidebar that styles itself independently
 * looks like a guest in the pane next to the file explorer, and matching by
 * copying font sizes only matches the theme you happened to test. Emitting
 * `tree-item` means the indentation, the type scale, the hover and the active
 * colour all arrive from whatever theme is installed, and keep arriving when it
 * changes.
 */
function treeRow(parent: HTMLElement, label: string, onClick: () => void): HTMLElement {
	const item = parent.createDiv({ cls: 'tree-item nav-file' });
	const self = item.createDiv({
		cls: 'tree-item-self nav-file-title is-clickable',
		attr: { tabindex: '0' },
	});
	self.createDiv({
		cls: 'tree-item-inner nav-file-title-content',
		text: label,
	});

	// The whole row, not just the words, which is how every other nav item in
	// the app behaves. `tabindex` and the key handler are what the anchor this
	// replaced gave for free: a row a keyboard cannot reach is not a row.
	self.addEventListener('click', onClick);
	self.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		onClick();
	});
	return self;
}

function section(
	root: HTMLElement,
	context: Context,
	{ stage, stageIcon, label, action, icon, hint, done, doneIcon }: StageAction,
	rows: Row[],
): void {
	const shown = expanded.has(stage) ? rows.length : ROWS;
	// An empty stage cannot be folded: there is nothing behind the chevron, and
	// offering one would be a control that does nothing.
	const empty = rows.length === 0;
	const folded = !empty && collapsed.has(stage);

	// A stage is a folder and its papers are the files in it, which is what the
	// nav classes mean. The count goes in the flair slot, where the file
	// explorer already puts a number beside a folder.
	const el = root.createDiv({ cls: `tree-item nav-folder${folded ? ' is-collapsed' : ''}${empty ? ' paper-trail-stage-empty' : ''}` });
	const header = el.createDiv({
		cls: `tree-item-self nav-folder-title${empty ? '' : ' is-clickable mod-collapsible'}`,
		attr: empty ? { 'aria-label': hint } : { 'aria-label': hint, tabindex: '0' },
	});

	// The chevron, then the stage's own icon, which is the order the file
	// explorer uses for a folder that has one. An empty stage keeps the slot
	// and hides what is in it, so every stage icon stays on one column.
	setIcon(header.createDiv({ cls: 'tree-item-icon collapse-icon' }), 'chevron-down');
	setIcon(header.createDiv({ cls: 'tree-item-icon paper-trail-stage-icon' }), stageIcon);
	header.createDiv({
		cls: 'tree-item-inner nav-folder-title-content',
		text: label,
	});
	header.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair', text: String(rows.length) });

	if (empty) return;

	// The count stays visible while folded, which is the point of folding one:
	// a stage you are not working today should say how much it is holding
	// without spending the rows to do it.
	const fold = () => {
		if (folded) collapsed.delete(stage);
		else collapsed.add(stage);
		renderQueue(paneOf(root), context);
	};
	header.addEventListener('click', fold);
	header.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		fold();
	});

	// Obsidian styles `is-collapsed` but does not hide anything with it: the
	// file explorer drops the children instead. So does this.
	if (folded) return;

	const children = el.createDiv({
		cls: 'tree-item-children nav-folder-children',
	});

	for (const entry of rows.slice(0, shown)) {
		const row = treeRow(children, rowTitle(entry), () => {
			// A pending paper has no note to open, so its row does the one thing
			// there is to do with it rather than nothing at all.
			if (entry.kind === 'note') void openNote(context.app, entry.note);
			else void act(context, stage, entry);
		});

		// At the trailing edge, on the same line as the title. A stage with no
		// icon has no button here: its action is opening the note, which the
		// row it sits on already does.
		const actions = row.createDiv({ cls: 'paper-trail-workflow-actions' });
		// The stage's own end first, where it is reachable: a row you are
		// coming back to is more often finished than started again.
		if (done && doneIcon && entry.kind === 'note') {
			iconButton(actions, doneIcon, done, () => void finish(context, stage, entry));
		}
		if (icon) iconButton(actions, icon, action, () => void act(context, stage, entry));
	}

	// The count is honest even when the list is not, because a backlog you
	// cannot see is the thing that stops the queue being worth reading. It also
	// opens: capping at three keeps the list a prompt rather than a wall, but a
	// cap you cannot lift means a paper outside the top three is reachable only
	// by whatever `next` happens to offer.
	if (rows.length > shown) {
		treeRow(children, `and ${rows.length - shown} more`, () => {
			expanded.add(stage);
			renderQueue(paneOf(root), context);
		}).addClass('paper-trail-more');
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

	/**
	 * The plugin's own mark, shared with the ribbon so the tab and the button
	 * that opens it are recognisably the same thing.
	 *
	 * Not a checklist, which is what it used to be. The queue shows what is
	 * outstanding and offers an order, but it never refuses an action because an
	 * earlier one is unfinished, and a row of ticked boxes promises exactly the
	 * pipeline this is not. A stamp is the thing it actually does: a judgement,
	 * pressed onto the record.
	 */
	getIcon(): string {
		return 'stamp';
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
	private readonly catchUp = debounce(
		() => {
			const before = lastContact()?.reachable;
			void refreshLibrary().then((moved) => {
				// Redrawn when the library moved, and also when Zotero itself came or
				// went. Skipping on "nothing moved" alone meant quitting Zotero with
				// this pane open changed nothing on screen: the failure was recorded
				// and never drawn, so the one surface that explains an unreachable
				// Zotero stayed silent about it until something else forced a redraw.
				if (moved || before !== lastContact()?.reachable) this.redraw();
			});
		},
		300,
		true,
	);

	async onOpen(): Promise<void> {
		expanded.clear();
		renderQueue(this.contentEl, this.context);

		// Draw first from what is already known, then ask Zotero and draw again.
		// Triage comes entirely from Zotero, so waiting for the request before
		// showing anything would mean an empty pane every time this opens.
		void refreshLibrary().then(() => this.redraw());

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
