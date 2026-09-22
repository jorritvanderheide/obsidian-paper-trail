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
import { ItemView, Menu, Notice, debounce, setIcon, type App, type WorkspaceLeaf } from 'obsidian';
import { rowTask, rowTitle, TASKS, visibleStages, type Row, type Settled, type Task, type TaskDefinition } from '../core/stages';
import { DEFAULT_ROWS, fit } from '../core/fit';
import { act, finish, next, openNote } from '../commands/workflow';
import { iconOf, label } from '../core/triage';
import { noteFor, setReading } from '../commands/reading';
import { fileOf, queue } from '../outstanding';
import { reveal } from './reveal';
import { notify } from './notify';
import type { Pending } from '../core/pending';
import { lastContact } from '../source';
import { refreshLibrary, scopeProblem } from '../library';
import type { Context } from '../context';

export const QUEUE_VIEW = 'paper-trail-queue';

/**
 * Draw the whole queue into an element, replacing whatever was there.
 *
 * A free function rather than a method, because two very different hosts need
 * it: a `MarkdownRenderChild` living inside someone's note, and an `ItemView`
 * living in the sidebar. Neither wants to inherit from the other.
 */
export function renderQueue(root: HTMLElement, context: Context): void {
	const { notes, rows: buckets, done } = queue(context);

	root.empty();
	root.addClass('paper-trail');
	// Which host this is, for the handful of things that differ. A pane has a
	// height to fill and controls to carry; a block is a view on somebody's note.
	const sidebar = inSidebar(root);
	root.toggleClass('paper-trail-block', !sidebar);
	offline(root, context);

	if ([...buckets.values()].every((list) => list.length === 0)) {
		// Two different empties. A vault that has dealt with everything needs
		// telling it is done; a vault that has never seen a paper needs telling
		// where papers come from, because nothing here is how you add one.
		//
		// Every paper Zotero holds that the vault has no note for is in here
		// somewhere, so reaching this with an empty vault means Zotero itself is
		// empty or unreachable. The banner above has already said which.
		const started = notes.some((note) => note.isPaper);
		root.createDiv({
			cls: 'pane-empty',
			text: started ? 'Nothing outstanding.' : 'No papers yet. Add them to Zotero and they turn up here.',
		});
		// Still drawn, and this is the moment it earns its place: an empty queue
		// is the one state where the only thing worth showing is what you did.
		decided(root, context, done);
		return;
	}

	const visible = visibleStages(buckets, context.settings.triage);

	// The pane only. A block is a view of the queue on a note of your own, and a
	// row of controls at the top of somebody's writing is the plugin making
	// itself at home: the pane is where it lives, and the palette has Next in it
	// for anywhere else. The list still acts, because the rows still do.
	if (sidebar) toolbar(root, context, buckets, visible);

	// The tree inside the scroller, rather than the scroller itself, and it is
	// stretched to the pane's full height. That is what lets the record below
	// take the slack with an auto margin: with room it sits on the floor of the
	// pane, and without it it simply scrolls along at the end of the list.
	//
	// Not a flex column on the scroller directly, which would look equivalent
	// and is the classic way to lose: flex children shrink by default, so an
	// overflowing list would squash its own rows instead of scrolling.
	const files = root.createDiv({ cls: 'nav-files-container paper-trail-stages' });
	const tree = files.createDiv({ cls: 'paper-trail-tree' });

	const open: { task: Task; rows: Row[]; children: HTMLElement }[] = [];
	for (const definition of visible) {
		const rows = buckets.get(definition.task) ?? [];
		const children = section(tree, context, definition, rows);
		if (children) open.push({ task: definition.task, rows, children });
	}

	// Drawn before the rows are counted, and it has to be: its header is one of
	// the rows the list has to share, so measuring without it would promise room
	// the record is standing in.
	const pinned = decided(tree, context, done);

	// Now that every header is in place and no row is, what is left of the
	// container is exactly what the rows have to share. The record's own rows
	// are not counted against it: opening it is asking to read the record, and
	// the list scrolls.
	root.style.setProperty('--paper-trail-clearance', `${clearance(root, files)}px`);

	const shares = fit(
		open.map((entry) => entry.rows.length),
		capacity(root, files, open.length + (pinned ? 1 : 0)),
	);
	open.forEach((entry, index) => {
		// An opened section ignores the budget. You asked to see all of them, and
		// the container scrolls; overruling that to keep the pane tidy would be
		// answering a question nobody asked.
		const shown = expanded.has(entry.task) ? entry.rows.length : (shares[index] ?? DEFAULT_ROWS);
		sectionRows(entry.children, context, entry.task, entry.rows, shown);
	});
}

/**
 * The strip of buttons above the list.
 *
 * Icons only, in `nav-buttons-container`, which is the file explorer's own
 * markup and where a theme expects to find a pane's controls. It used to open
 * with "7 outstanding" in words, holding the whole left of the bar to say
 * something every section header already says in its own count. The number is
 * on the Next button now, where you get it by reaching for the thing it would
 * have made you reach for anyway.
 */
function toolbar(root: HTMLElement, context: Context, buckets: Map<Task, Row[]>, visible: TaskDefinition[]): void {
	const buttons = root.createDiv({ cls: 'nav-header' }).createDiv({ cls: 'nav-buttons-container' });

	// The thing the pane is for, beyond reading it: one key, no choice about
	// which pile to work first.
	const outstanding = [...buckets.values()].reduce((sum, list) => sum + list.length, 0);
	iconButton(buttons, 'arrow-right', `Next · ${outstanding} outstanding`, () => void next(context), 'nav-action-button');

	// Zotero is asked whenever you come back to Obsidian, which covers almost
	// everything: you went to Zotero to add the paper. It does not cover Zotero
	// coming back after being shut, or a window you never left. Pressing this
	// always answers, because a refresh you asked for and got silence from is
	// indistinguishable from a dead button.
	iconButton(
		buttons,
		'refresh-cw',
		'Check Zotero for new papers',
		() => void recheck(root, context),
		'nav-action-button',
	);

	// Only where there is something to fold. Four sections is few enough that
	// this is a convenience rather than a necessity, but it is the affordance
	// every other tree in the app has, and its absence is what you notice.
	const foldable = visible.filter(({ task }) => (buckets.get(task) ?? []).length > 0);
	if (foldable.length === 0) return;

	const anyOpen = foldable.some(({ task }) => !collapsed.has(task));
	iconButton(
		buttons,
		anyOpen ? 'chevrons-down-up' : 'chevrons-up-down',
		anyOpen ? 'Collapse all' : 'Expand all',
		() => {
			collapsed.clear();
			if (anyOpen) for (const { task } of foldable) collapsed.add(task);
			renderQueue(paneOf(root), context);
		},
		'nav-action-button',
	);
}

/** Ask Zotero now, and say what it said either way. */
async function recheck(root: HTMLElement, context: Context): Promise<void> {
	const moved = await refreshLibrary(context.settings.collection);
	renderQueue(paneOf(root), context);

	const contact = lastContact();
	if (contact !== null && !contact.reachable) new Notice(contact.reason);
	else new Notice(moved ? 'Zotero had something new.' : 'Nothing new in Zotero.');
}

/**
 * How far the status bar reaches over the foot of the list.
 *
 * Obsidian floats it at `position: fixed; bottom: 0; right: 0` and adds no
 * clearance for it anywhere, so every pane in the right sidebar runs underneath
 * it. For most that is invisible, because their content scrolls past and only
 * the last row is ever under there. The record is pinned to the floor of this
 * one, so it lives there.
 *
 * Measured rather than assumed, which is the whole point. A theme that hides
 * the bar, floats it somewhere else, or sets `--status-bar-position` so it sits
 * in the layout instead of over it, answers zero here and gets no padding: a
 * gap held open for something that is not there would be worse than the overlap
 * it was meant to fix.
 *
 * What the list already keeps clear counts towards it, so this asks for the
 * shortfall and not for the whole height. Both numbers come from boxes that do
 * not move when the answer is applied, or applying it would change the question.
 */
function clearance(root: HTMLElement, files: HTMLElement): number {
	if (!inSidebar(root)) return 0;

	const bar = root.doc.querySelector<HTMLElement>('.status-bar');
	if (!bar?.isShown()) return 0;

	const over = bar.getBoundingClientRect();
	const list = files.getBoundingClientRect();
	// Beside rather than on top of it, or above its foot entirely: nothing to do.
	if (over.top >= list.bottom || over.right <= list.left || over.left >= list.right) return 0;

	const already = Number.parseFloat(getComputedStyle(files).paddingBottom) || 0;
	return Math.max(0, Math.round(list.bottom - over.top - already));
}

/**
 * How many rows the sections have between them, or null when there is nothing
 * to measure.
 *
 * Null in two cases, and both want the fixed cap. A block in a note is as tall
 * as whatever it holds, so there is no space to fill and filling it would mean
 * pouring four hundred papers onto somebody's dashboard. A sidebar that has not
 * been laid out yet reports nothing, which is the first draw when the pane is
 * opening; the redraw a moment later measures properly.
 *
 * The row height comes from a section header rather than a constant. They are
 * the same `tree-item-self` markup, so a theme that gives rows more air gives
 * it to both, and nothing here has to know what a row is worth.
 */
function capacity(root: HTMLElement, files: HTMLElement, headers: number): number | null {
	if (!inSidebar(root)) return null;

	const height = files.clientHeight;
	const row = files.querySelector<HTMLElement>('.tree-item-self')?.offsetHeight ?? 0;
	if (height <= 0 || row <= 0) return null;

	return Math.max(0, Math.floor(height / row) - headers);
}

/**
 * Say when the list cannot be trusted, and only then.
 *
 * Silence means working, which is the right default for something that is true
 * almost always: a banner saying "connected" every time you glance at the queue
 * would be noise you learn to stop reading, and then miss on the day it
 * changes. Triage is read from Zotero entirely, so with Zotero closed the queue
 * is not short, it is wrong, and that is worth a line. This is the one place
 * that explains a plugin which has apparently stopped doing anything.
 *
 * Two things can make it wrong and they share a box, because from here they are
 * the same news: what you are looking at is not what you asked for. Zotero
 * being unreachable comes first, since a scope cannot be checked against a
 * Zotero that is not talking and reporting both would be reporting one twice.
 */
function offline(root: HTMLElement, context: Context): void {
	const contact = lastContact();
	const reason = contact !== null && !contact.reachable ? contact.reason : scopeProblem();
	if (reason === null) return;

	// Said once. The sidebar always says it; a block in a note says it only when
	// the sidebar is not there to, so a dashboard with the block on it and the
	// pane open beside it does not carry the same warning twice.
	//
	// It is the block that yields rather than the pane, because the pane is the
	// one that is always about this and the block is a guest on somebody's note.
	if (!inSidebar(root) && sidebarShowing(context.app)) return;

	const box = root.createDiv({ cls: 'paper-trail-offline' });
	box.createDiv({ cls: 'paper-trail-offline-reason', text: reason });
	// The same icon the note title bar uses to refresh from Zotero, because it
	// is the same gesture: go and ask Zotero again. The reason beside it is
	// already carrying the words, so the button does not need to repeat them.
	iconButton(box, 'refresh-cw', 'Try again', () => {
		void refreshLibrary(context.settings.collection).then(() => renderQueue(root, context));
	});
}

/** Whether this is the sidebar's own copy of the queue, rather than a block in a note. */
function inSidebar(root: HTMLElement): boolean {
	return root.closest(`.workspace-leaf-content[data-type='${QUEUE_VIEW}']`) !== null;
}

/**
 * Whether the sidebar is on screen right now.
 *
 * `isShown` rather than "a leaf of this type exists", and the difference is the
 * whole point: a queue in a collapsed sidebar, or on a tab behind the file
 * explorer, is a leaf that exists and a pane nobody can read. Counting those as
 * showing would hide the warning in the block and leave it nowhere.
 */
function sidebarShowing(app: App): boolean {
	return app.workspace.getLeavesOfType(QUEUE_VIEW).some((leaf) => leaf.view.containerEl.isShown());
}

/**
 * Which sections have been opened out, for as long as the pane stays open.
 *
 * Cleared when the sidebar opens, because an expansion is a thing you did to
 * find one paper rather than a preference, and a queue that came back showing
 * four hundred rows would have given up the cap that makes it readable.
 */
const expanded = new Set<Task>();

/**
 * Which sections have been folded away, for as long as the pane stays open.
 *
 * Session-scoped like `expanded`, and for the same reason turned round: a
 * stage you collapsed because you are not reading today is not a standing
 * instruction to hide it, and the queue's whole job is saying what is
 * outstanding. It comes back open, and folding it again is one click.
 */
const collapsed = new Set<Task>();

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
function treeRow(parent: HTMLElement, text: string, onClick: () => void, icon?: string): HTMLElement {
	const item = parent.createDiv({ cls: 'tree-item nav-file' });
	const self = item.createDiv({
		cls: 'tree-item-self nav-file-title is-clickable',
		attr: { tabindex: '0' },
	});
	// Before the title, on the column the stage icons use, so a list of
	// decisions scans down one edge the way the stages above it do.
	if (icon) setIcon(self.createDiv({ cls: 'tree-item-icon paper-trail-decided-icon' }), icon);
	self.createDiv({
		cls: 'tree-item-inner nav-file-title-content',
		text,
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

/** What a folding section of the tree needs to draw itself. */
interface Folder {
	label: string;
	/** The section's own mark, on the column every other section's sits on. */
	icon: string;
	hint: string;
	count: number;
	open: boolean;
	toggle: () => void;
}

/**
 * One folding section, in Obsidian's own nav markup.
 *
 * Shared by the stages and by the record at the foot of the pane, which were
 * two hand-written copies of the same thing: the same chevron, the same flair
 * count, the same click and keydown pair, the same trick of dropping the
 * children rather than hiding them. Two copies of markup this fiddly drift on
 * the first change, and the record had already lost its icon that way, which
 * left the one section that is not a stage looking like a guest among them.
 *
 * Hands back the element to draw rows into, or null when there are none to
 * draw: a section that is empty, or one that is shut.
 */
function folder(root: HTMLElement, { label, icon, hint, count, open, toggle }: Folder): HTMLElement | null {
	// An empty section cannot be folded: there is nothing behind the chevron,
	// and offering one would be a control that does nothing.
	const empty = count === 0;
	const shut = !empty && !open;

	// A section is a folder and its papers are the files in it, which is what
	// the nav classes mean. The count goes in the flair slot, where the file
	// explorer already puts a number beside a folder.
	const el = root.createDiv({
		cls: `tree-item nav-folder${shut ? ' is-collapsed' : ''}${empty ? ' paper-trail-stage-empty' : ''}`,
	});
	const header = el.createDiv({
		cls: `tree-item-self nav-folder-title${empty ? '' : ' is-clickable mod-collapsible'}`,
		attr: empty ? { 'aria-label': hint } : { 'aria-label': hint, tabindex: '0' },
	});

	// Both marks, in one slot. The section's own icon is what you see; the
	// chevron takes its place under the cursor, on a header that folds. Drawn
	// in this order because that is the order the file explorer uses, and the
	// stylesheet is what decides which of them is showing.
	setIcon(header.createDiv({ cls: 'tree-item-icon collapse-icon' }), 'chevron-down');
	setIcon(header.createDiv({ cls: 'tree-item-icon paper-trail-stage-icon' }), icon);
	header.createDiv({ cls: 'tree-item-inner nav-folder-title-content', text: label });
	header.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair', text: String(count) });

	if (empty) return null;

	// The count stays visible while folded, which is the point of folding one:
	// a section you are not working today should say how much it is holding
	// without spending the rows to do it.
	header.addEventListener('click', toggle);
	header.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		toggle();
	});

	// Obsidian styles `is-collapsed` but does not hide anything with it: the
	// file explorer drops the children instead. So does this.
	if (shut) return null;

	return el.createDiv({ cls: 'tree-item-children nav-folder-children' });
}

/**
 * A section's header, and the empty box its rows will go in.
 *
 * Drawn before any row is, because that is what makes the pane measurable: the
 * scrolling container is sized by the pane rather than by its contents, so with
 * every header in place and no rows at all, the height left over is exactly the
 * height the rows have to share.
 */
function section(
	root: HTMLElement,
	context: Context,
	{ task, stageIcon, label, hint }: TaskDefinition,
	rows: Row[],
): HTMLElement | null {
	return folder(root, {
		label,
		icon: stageIcon,
		hint,
		count: rows.length,
		open: !collapsed.has(task),
		toggle: () => {
			if (collapsed.has(task)) collapsed.delete(task);
			else collapsed.add(task);
			renderQueue(paneOf(root), context);
		},
	});
}

/**
 * Write the note for a paper that has none, and show it.
 *
 * What clicking a row means, for the one kind of row where the note does not
 * exist yet. It does not open Zotero: that is the button's job, and the row's
 * job is the same in every section, which is to put the paper in front of you
 * without starting anything.
 */
async function showPending(context: Context, item: Pending): Promise<void> {
	try {
		await reveal(context.app, await noteFor(context, item));
	} catch (error) {
		notify(error, 'show');
	}
}

/** The papers themselves, once it is known how many of them there is room for. */
function sectionRows(
	children: HTMLElement,
	context: Context,
	stage: Task,
	rows: Row[],
	shown: number,
): void {
	for (const entry of rows.slice(0, shown)) {
		// The task is the row's, not the section's. Reading holds both halves of
		// Keshav's second pass, so one row offers Zotero and the next offers the
		// note, and the icons are how you tell which half a paper is in.
		const task = rowTask(entry, context.settings.triage);
		if (!task) continue;
		const { action, icon, done, doneIcon } = TASKS[task];

		// Clicking a row shows you the paper. Always the same thing, in every
		// section, so the click is safe: it opens a note or focuses the tab one
		// is already in, and never leaves Obsidian or writes anything.
		//
		// It did carry the task for a while, so a queued row opened Zotero and a
		// claim row opened at a heading. That made the sections legible at the
		// cost of the one gesture you make most: you could not look at a paper
		// without starting its next step, and the two are not the same wish.
		// The task is on the button at the trailing edge, where it is a choice.
		//
		// A paper Zotero holds and the vault does not has no note to show, so
		// showing it means writing it. That is still the same promise kept: the
		// click gives you the note and nothing else, and the paper was already
		// decided on, in the browser, before it was ever saved.
		//
		// Triage is the one row that cannot: deciding is what writes its note,
		// and writing one first would be answering the question on your behalf.
		const row = treeRow(children, rowTitle(entry), () => {
			if (entry.kind === 'note') void openNote(context.app, entry.note);
			else if (task === 'triage') void act(context, task, entry);
			else void showPending(context, entry.item);
		});

		// At the trailing edge, on the same line as the title. A task with no
		// icon has no button here: its action is opening the note, which the
		// row it sits on already does.
		const actions = row.createDiv({ cls: 'paper-trail-workflow-actions' });
		// The task's own end first, where it is reachable: a row you are
		// coming back to is more often finished than started again.
		if (done && doneIcon) {
			iconButton(actions, doneIcon, done, () => void finish(context, task, entry));
		}
		if (icon) iconButton(actions, icon, action, () => void act(context, task, entry));
	}

	// The count is honest even when the list is not, because a backlog you
	// cannot see is the thing that stops the queue being worth reading. It also
	// opens, for the paper that is outside what fits and reachable otherwise
	// only by whatever `next` happens to offer.
	//
	// It never says "and 1 more". This line is a row's height, so hiding one
	// paper behind it costs exactly what showing the paper would and tells you
	// less; `fit` counts that cost, so the last row is always given away.
	if (rows.length > shown) {
		treeRow(children, `and ${rows.length - shown} more`, () => {
			expanded.add(stage);
			renderQueue(paneOf(children), context);
		}).addClass('paper-trail-more');
	}
}

/**
 * Whether the record is open, for as long as the pane stays open.
 *
 * Shut by default, and that is the whole reason this section is allowed to
 * exist. The pane's job is saying what is outstanding, and a list of finished
 * work that opened itself would be taking rows from the backlog to show you
 * something with nothing to do about it. Closed it costs one line and answers
 * the question it is actually there for, which is whether any of this is
 * getting anywhere.
 */
let openDecided = false;

/**
 * What you have already decided, at the foot of the pane.
 *
 * Four outcomes in one list rather than four sections, because they are not
 * four stages: nothing is outstanding for any of them. What separates them is
 * the icon, which is the same icon the chooser offered when you picked it.
 *
 * Never counted in "N outstanding" and never offered by `next`. A paper here
 * is done with, and a record that fed back into the queue would stop being a
 * record.
 */
function decided(root: HTMLElement, context: Context, done: Settled[]): boolean {
	// The one section that is hidden rather than shown at zero. A stage keeps
	// its place so the list does not move under the cursor as you work it; the
	// record has no place to keep until there is something in it, and "Decided
	// 0" on a vault that has decided nothing is a row spent saying so.
	if (done.length === 0) return false;

	// A box of its own, holding one section, which is the hook the auto margin
	// hangs on. Inside the list rather than under it: two scrolling boxes in one
	// pane means a wheel that stops working halfway down for no reason you can
	// see, and a record capped at some height of its own is a record you cannot
	// read to the end of.
	const box = root.createDiv({ cls: 'paper-trail-decided' });

	const children = folder(box, {
		label: 'Decided',
		// A box things go into when they are done with, which is what this is.
		// Not a tick: that is one outcome of the four in here.
		icon: 'archive',
		hint: 'Papers nothing is outstanding for. Dropped, parked, read, or assessed.',
		count: done.length,
		open: openDecided,
		toggle: () => {
			openDecided = !openDecided;
			renderQueue(paneOf(root), context);
		},
	});
	if (!children) return true;

	// Every one of them. A cap here would hide the oldest decisions, which are
	// the ones worth the most: the reason to keep a record is the paper you
	// ruled out long enough ago to have forgotten ruling on.
	for (const entry of done) {
		const row = treeRow(children, entry.note.title, () => void openNote(context.app, entry.note), iconOf(entry.reading));
		// The state in words as well as in the icon, because the icon is the only
		// thing distinguishing four outcomes and an icon cannot be read aloud.
		row.setAttribute('aria-label', decidedState(entry));
		row.addEventListener('contextmenu', (event) => decidedMenu(context, entry, row, event));
	}

	return true;
}

/**
 * What a decided row is, in words: the state, and when it was reached.
 *
 * `landing` is deliberately not used, though it is the obvious candidate. It
 * describes where a decision puts a paper at the moment you take it, so on a
 * paper that has since been summarised it says to go and write the claim, which
 * is advice for work already done.
 */
function decidedState(entry: Settled): string {
	const when = entry.note.decided;
	return when ? `${label(entry.reading)} on ${when}` : label(entry.reading);
}

/**
 * What a decided paper still offers, which is one thing: changing its mind.
 *
 * Right-click because there is nowhere else for it to go. An outstanding row
 * carries its actions as icons at the trailing edge, but a decided one has no
 * action by definition, and hanging a button off every row of a record for the
 * rare occasion you reconsider would be paying in every row for one of them.
 *
 * Reconsidering is not rare enough to leave out, though. A deferral is a
 * promise to come back and this is the only place that promise resurfaces; a
 * paper dropped on its abstract is exactly the one a citation sends you back to
 * two years later.
 */
function decidedMenu(context: Context, entry: Settled, row: HTMLElement, event: MouseEvent): void {
	const file = fileOf(context.app, entry.note);
	if (!file) return;

	event.preventDefault();
	const menu = new Menu();

	// The state first, and not as a choice. A row in here carries an icon and
	// nothing else, and four outcomes is more than one glyph can teach.
	menu.addItem((item) => item.setTitle(decidedState(entry)).setIcon(iconOf(entry.reading)).setIsLabel(true));
	menu.addSeparator();

	// Through the same command the palette offers, so a paper reconsidered from
	// here lands exactly where one reconsidered from the note would.
	menu.addItem((item) =>
		item
			.setTitle('Set reading status')
			.setIcon('list-checks')
			.onClick(() => void setReading(context, file)),
	);

	// The context-menu key raises this event too, and arrives with no pointer to
	// anchor to. Without this the menu would open in the corner of the screen
	// for anyone not using a mouse.
	if (event.clientX === 0 && event.clientY === 0) {
		const box = row.getBoundingClientRect();
		menu.showAtPosition({ x: box.left, y: box.bottom });
	} else {
		menu.showAtMouseEvent(event);
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
	 * A stack of papers, which is what the queue holds. Not a checklist, which
	 * is what it used to be and which promises a pipeline this is not, and not a
	 * stamp, which was the next try: at ribbon size its handle and base reduce
	 * to a blob, and a stamp means approved, which is one outcome out of six.
	 */
	getIcon(): string {
		return 'file-stack';
	}

	/**
	 * Drawing reads every note in the vault, which is cheap once and wasteful a
	 * hundred times in a row. One save fires one event, but a sync or a git pull
	 * fires one per file, and coalescing those is the difference between a
	 * redraw and a freeze.
	 */
	private readonly redraw = debounce(() => renderQueue(this.contentEl, this.context), 200, true);

	/** Redraw after a resize, once the dragging has stopped rather than during it. */
	private readonly refit = debounce(() => renderQueue(this.contentEl, this.context), 250, false);

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
			void refreshLibrary(this.context.settings.collection).then((moved) => {
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
		collapsed.clear();
		openDecided = false;
		renderQueue(this.contentEl, this.context);

		// Draw first from what is already known, then ask Zotero and draw again.
		// Triage comes entirely from Zotero, so waiting for the request before
		// showing anything would mean an empty pane every time this opens.
		void refreshLibrary(this.context.settings.collection).then(() => this.redraw());

		this.registerEvent(this.app.metadataCache.on('changed', this.redraw));
		this.registerEvent(this.app.vault.on('delete', this.redraw));
		this.registerEvent(this.app.vault.on('rename', this.redraw));

		// Coming back to Obsidian is the moment you have just saved something in
		// the browser, so it is the moment worth asking. Asking costs one request
		// that almost always answers with nothing, which is the only reason it
		// can be hung on something this frequent.
		this.registerDomEvent(window, 'focus', () => this.catchUp());

		// How many rows fit is measured from the pane, so a pane that changed
		// size is a pane holding the wrong number of them. Debounced harder than
		// the rest: dragging a sidebar edge is one gesture and hundreds of
		// events, and each redraw reads every note in the vault.
		this.registerEvent(this.app.workspace.on('resize', this.refit));

		// A theme change can hide the status bar, move it, or put it back in the
		// layout, and the room kept clear for it is measured rather than assumed.
		// Nothing else here cares, but nothing else here is cheap to be wrong
		// about: a gap held open for a bar that has gone stays until something
		// else happens to redraw.
		this.registerEvent(this.app.workspace.on('css-change', this.refit));
	}
}

/**
 * Show the sidebar, reusing the leaf it is already in.
 *
 * Called on load exactly once, on the first load after installing, and never
 * again. A plugin that takes sidebar space every time you start Obsidian has
 * decided something about someone else's workspace that was not its to decide;
 * one that never shows you where it lives has left you a ribbon icon and a
 * guess. Once is the difference. Close it and it stays closed, and the block
 * exists for people who would rather it lived in a note.
 */
export async function openQueue(app: App): Promise<void> {
	const existing = app.workspace.getLeavesOfType(QUEUE_VIEW)[0];
	const leaf = existing ?? app.workspace.getRightLeaf(false);
	if (!leaf) return;

	if (!existing) await leaf.setViewState({ type: QUEUE_VIEW, active: true });
	await app.workspace.revealLeaf(leaf);
}
