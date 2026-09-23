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
import {
	rowTask,
	rowTitle,
	type NoteState,
	TASKS,
	visibleStages,
	type Row,
	type Settled,
	type Task,
	type TaskDefinition,
} from '../core/stages';
import { DEFAULT_ROWS, fit } from '../core/fit';
import { act, finish, next, openNote } from '../commands/workflow';
import { iconOf, label } from '../core/triage';
import { chooseReading, targetOf } from '../commands/reading';
import { queue } from '../outstanding';
import { WhileWriting } from './editing';
import { lastContact } from '../source';
import { onLibraryChange, refreshLibrary, scopeProblem } from '../library';
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
	const { notes, rows: buckets, waiting, done } = queue(context);

	root.empty();
	root.addClass('paper-trail');
	// Which host this is, for the handful of things that differ. A pane has a
	// height to fill and controls to carry; a block is a view on somebody's note.
	const sidebar = inSidebar(root);
	root.toggleClass('paper-trail-block', !sidebar);
	offline(root, context);

	const visible = visibleStages(buckets, context.settings.triage);
	const empty = [...buckets.values()].every((list) => list.length === 0);

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

	// Two different empties. A vault that has dealt with everything needs telling
	// it is done; a vault that has never seen a paper needs telling where papers
	// come from, because nothing here is how you add one.
	//
	// Every paper Zotero holds that the vault has no note for is in here
	// somewhere, so reaching this with an empty vault means Zotero itself is
	// empty or unreachable. The banner above has already said which.
	//
	// Inside the tree rather than straight onto the pane, which is where it used
	// to go: the record drawn under it then sat outside the container everything
	// else is styled and measured in, so the one section still on screen was the
	// one that did not look like itself.
	if (empty) {
		const started = notes.some((note) => note.isPaper);
		tree.createDiv({
			cls: 'pane-empty',
			text: started ? 'Nothing outstanding.' : 'No papers yet. Add them to Zotero and they turn up here.',
		});
		foot(tree, context, waiting, done);
		root.style.setProperty('--paper-trail-clearance', `${clearance(root, files)}px`);
		highlight(root, context.app);
		return;
	}

	const open: { task: Task; rows: Row[]; children: HTMLElement }[] = [];
	for (const definition of visible) {
		const rows = buckets.get(definition.task) ?? [];
		const children = section(tree, context, definition, rows);
		if (children) open.push({ task: definition.task, rows, children });
	}

	// Drawn before the rows are counted, and it has to be: their headers are two
	// of the rows the list has to share, so measuring without them would promise
	// room the record is standing in.
	const pinned = foot(tree, context, waiting, done);

	// Now that every header is in place and no row is, what is left of the
	// container is exactly what the rows have to share. The record's own rows
	// are not counted against it: opening it is asking to read the record, and
	// the list scrolls.
	root.style.setProperty('--paper-trail-clearance', `${clearance(root, files)}px`);

	const shares = fit(open.map((entry) => entry.rows.length), capacity(root, files, open.length + pinned));
	open.forEach((entry, index) => {
		// An opened section ignores the budget. You asked to see all of them, and
		// the container scrolls; overruling that to keep the pane tidy would be
		// answering a question nobody asked.
		const shown = expanded.has(entry.task) ? entry.rows.length : (shares[index] ?? DEFAULT_ROWS);
		sectionRows(entry.children, context, entry.task, entry.rows, shown);
	});

	highlight(root, context.app);
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

/**
 * Mark the row for the note you are looking at.
 *
 * `is-active` is the class the file explorer puts on the file you have open, so
 * the pane picks up whatever the theme already does for it and a paper is
 * marked here the same way it would be there.
 *
 * Kept off the redraw path on purpose. Following the cursor is a class on one
 * row; a redraw reads every note in the vault and rebuilds the tree, which is a
 * great deal of work to move a highlight, and it would throw away the scroll
 * position every time you changed tab.
 */
/**
 * Whether a row is the note you are already looking at.
 *
 * The same question `highlight` asks to mark a row active, and deliberately
 * the same answer: the row wearing the active colour is exactly the row whose
 * click does nothing. `getActiveFile` rather than the active view, because
 * clicking in this pane is what moves focus into it, and the file you were
 * last reading is the one that question is about.
 */
function showing(app: App, note: NoteState): boolean {
	return app.workspace.getActiveFile()?.path === note.path;
}

function highlight(root: HTMLElement, app: App): void {
	const active = app.workspace.getActiveFile()?.path ?? null;
	for (const row of Array.from(root.querySelectorAll<HTMLElement>('.tree-item-self[data-path]'))) {
		row.toggleClass('is-active', row.dataset.path === active);
	}
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

	// One mark, and it stays. A chevron used to take the slot over on hover, on
	// the grounds that a section icon and a chevron side by side are two glyphs
	// competing in a four-row list. Swapping them was worse: the icon is how you
	// find a section without reading it, and the one under the cursor is the one
	// you are about to act on, so it was the row being pointed at that stopped
	// saying what it was.
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


/** The papers themselves, once it is known how many of them there is room for. */
function sectionRows(
	children: HTMLElement,
	context: Context,
	stage: Task,
	rows: Row[],
	shown: number,
): void {
	for (const entry of rows.slice(0, shown)) {
		// The task is the row's, not the section's. A pending paper sits in the
		// section the triage setting sends it to, and what it is asking for is what
		// putting it in Zotero meant, which is not always what the section is named
		// for.
		const task = rowTask(entry, context.settings.triage);
		if (!task) continue;
		const { action, icon, done, doneIcon } = TASKS[task];

		// Clicking a row does the row's task.
		//
		// It used to show you the paper instead, in every section, on the grounds
		// that the one gesture you make most should be safe: you could not look at
		// a paper without starting its next step. What that missed is that the
		// note is not the paper until some of it has been written. A row in
		// Reading is a paper you have not read, so its note is a title and a link,
		// and being shown it is being shown nothing; the PDF is the paper, and it
		// is in Zotero. A row in Claim is a note with a heading waiting in it, so
		// going to that heading is the same note, scrolled to the part of it the
		// row is about.
		//
		// So the safe click was safe about the wrong thing, and the section a
		// paper is in is exactly what says where looking at it means going.
		//
		// Triage is the exception, and only for a paper that has a note: there the
		// task is a dialog, and a list that raises one when you click a line in it
		// is a list you stop clicking. A pending paper has no note to show, so
		// clicking it opens the dialog after all, which is the one thing it can
		// do that is not writing a note to answer the question on your behalf.
		//
		// Clicking the row you are already in does nothing. Going somewhere you
		// already are is not a move, and doing it anyway is felt rather than
		// ignored: it takes the cursor off whatever you were typing, puts it back
		// under the heading, and asks the question again. Reading is not covered,
		// because where that row goes is Zotero and having the note in front of
		// you says nothing about whether you want the PDF.
		//
		// The button beside it is not covered either, and that is what it is for
		// now: from inside a note scrolled somewhere else, it is how you get back
		// to the heading you owe.
		const row = treeRow(children, rowTitle(entry), () => {
			if (entry.kind === 'note' && task !== 'reading' && showing(context.app, entry.note)) return;
			if (entry.kind === 'note' && task === 'triage') void openNote(context.app, entry.note);
			else void act(context, task, entry);
		});

		if (entry.kind === 'note') row.dataset.path = entry.note.path;

		// Overruling the workflow, on every row rather than only on a filed one.
		// Moving a paper between states was reachable from inside its note and
		// nowhere else, which is a long way round for a list whose whole subject
		// is what state things are in.
		row.addEventListener('contextmenu', (event) => rowMenu(context, entry, row, event));

		// At the trailing edge, on the same line as the title.
		const actions = row.createDiv({ cls: 'paper-trail-workflow-actions' });
		// The task's own end first, where it is reachable: a row you are
		// coming back to is more often finished than started again.
		if (done && doneIcon) {
			iconButton(actions, doneIcon, done, () => void finish(context, task, entry));
		}
		// The same thing the row click does, and kept for that reason rather than in
		// spite of it: it is what says in advance where the click goes, and the
		// sections differ, so a row that gave no sign would have to be tried to be
		// known. It also still acts on the row you are already in, where the click
		// does nothing: from further down a note, it is the way back to the heading.
		iconButton(actions, icon, action, () => void act(context, task, entry));
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
 * Whether each of the two resting sections is open, for as long as the pane
 * stays open.
 *
 * Both shut by default, and that is the whole reason they are allowed to be
 * here. The pane's job is saying what is outstanding, and a list of work that
 * is not opening itself would be taking rows from the backlog to show you
 * something with nothing to do about it. Closed, each costs one line and
 * answers the question it is there for: whether any of this is getting
 * anywhere, and how much you have promised yourself you would come back to.
 */
let openWaiting = false;
let openDecided = false;

/**
 * The two sections under the stages, and how many headers they cost.
 *
 * Deferred above Filed, because between them they are the two halves of "not
 * outstanding" and only one of them is over. A deferral is a promise with a
 * condition attached, which is what the plugin insists on before it will write
 * one; filing it with the papers you finished is how that promise goes quiet.
 * Its own row means a standing count of what you have parked is always in
 * front of you, and the condition you set is on each row.
 *
 * Neither is counted in "N outstanding" and neither is ever offered by `next`.
 * A parked paper is parked, and a section that fed back into the queue would
 * be overruling the decision you made.
 *
 * One box, which is the hook the auto margin hangs on. Inside the list rather
 * than under it: two scrolling boxes in one pane means a wheel that stops
 * working halfway down for no reason you can see.
 */
function foot(root: HTMLElement, context: Context, waiting: Settled[], done: Settled[]): number {
	const box = root.createDiv({ cls: 'paper-trail-decided' });

	resting(box, context, waiting, {
		label: 'Deferred',
		// The same mark the chooser puts on a deferral and the pill shows on the
		// note, so a parked paper looks like itself wherever you meet it.
		icon: 'clock',
		hint: 'Papers you deferred, each with the condition you gave. Right-click one to pick it back up.',
		open: openWaiting,
		toggle: () => {
			openWaiting = !openWaiting;
			renderQueue(paneOf(root), context);
		},
	});

	resting(box, context, done, {
		label: 'Filed',
		// A box things go into when they are done with, which is what this is.
		// Not a tick: that is one outcome of the three in here.
		icon: 'archive',
		hint: 'Papers nothing is outstanding for. Dropped, read, or assessed.',
		open: openDecided,
		toggle: () => {
			openDecided = !openDecided;
			renderQueue(paneOf(root), context);
		},
	});

	return 2;
}

/**
 * One of the two sections of papers nothing is outstanding for.
 *
 * Drawn at zero, dimmed, exactly like a stage. Vanishing when empty was the
 * old behaviour, on the grounds that a record has no place to keep until there
 * is something in it. That is one row of argument against the reason every
 * other section stays: the pane should be the same shape every time you look
 * at it, and a dimmed row teaches where a section will be.
 *
 * Every paper in it, uncapped. A cap would hide the oldest decisions, which
 * are the ones worth the most: the reason to keep a record is the paper you
 * ruled out long enough ago to have forgotten ruling on.
 */
function resting(
	box: HTMLElement,
	context: Context,
	rows: Settled[],
	spec: Omit<Folder, 'count'>,
): void {
	const children = folder(box, { ...spec, count: rows.length });
	if (!children) return;

	for (const entry of rows) {
		// Nothing to do for the one you are already reading, and here that is the
		// whole of it: these rows have no button and no second place to go.
		const row = treeRow(
			children,
			entry.note.title,
			() => {
				if (!showing(context.app, entry.note)) void openNote(context.app, entry.note);
			},
			iconOf(entry.note.state),
		);
		// The state in words as well as in the icon, because the icon is the only
		// thing distinguishing the outcomes and an icon cannot be read aloud.
		row.dataset.path = entry.note.path;
		row.setAttribute('aria-label', decidedState(entry));
		row.addEventListener('contextmenu', (event) => rowMenu(context, { kind: 'note', note: entry.note }, row, event));
	}
}

/**
 * What a resting row is, in words: the state, when it was reached, and what
 * you said at the time.
 *
 * The reason is the point of it on a deferred row, where it is the condition
 * the paper is waiting on and the row is otherwise a title you have to open
 * the note to understand. It earns its place on a dropped row too: why you
 * ruled a paper out is exactly what you will want two years later, and it is
 * the same sentence the record puts in its table.
 *
 * `landing` is deliberately not used, though it is the obvious candidate. It
 * describes where a decision puts a paper at the moment you take it, so on a
 * paper that has since been summarised it says to go and write the claim, which
 * is advice for work already done.
 */
function decidedState(entry: Settled): string {
	const when = entry.note.decided;
	const word = label(entry.note.state);
	const said = when ? `${word} on ${when}` : word;
	return entry.note.reason ? `${said} · ${entry.note.reason}` : said;
}

/**
 * What a row offers besides its own next step: changing where the paper sits.
 *
 * On every row, not just a filed one. Moving a paper between states was only
 * reachable from inside its note, which is a long way round for a list whose
 * whole subject is what state things are in.
 *
 * Right-click rather than another icon. A row's trailing edge already carries
 * the one or two things the paper is actually waiting for, and hanging a third
 * button on every row for the occasion you overrule the workflow would pay in
 * every row for a few of them. Reconsidering is not rare enough to leave out,
 * though: a deferral is a promise to come back and this is where it resurfaces,
 * and a paper dropped on its abstract is exactly the one a citation sends you
 * back to two years later.
 *
 * One item, and no heading over it. The state the paper is in was named at the
 * top for a while, on the grounds that a filed row carries an icon and nothing
 * else. A menu that opens with a line you cannot press, above a single line you
 * can, spends most of itself saying what you already knew: you right-clicked
 * that row. The words are still on the row, as the label a screen reader reads.
 *
 * Not drag and drop, which the shape of the workflow will not support. Claim
 * and Assessment are not states you can put a paper into: they mean the reading
 * is finished and the heading is still empty, so dropping a paper on Assessment
 * would land it in Claim whenever the claim is unwritten, and dropping one on
 * Claim would land it in Filed whenever the claim is written. A target that
 * takes the paper somewhere other than where you dropped it is worse than a
 * menu that names where each state leads, which is what this opens.
 */
function rowMenu(context: Context, row: Row, el: HTMLElement, event: MouseEvent): void {
	const target = targetOf(context.app, row);
	if (!target) return;

	event.preventDefault();
	const menu = new Menu();

	// Through the same chooser the palette offers, so a paper moved from here
	// lands exactly where one moved from its own note would, and a paper that
	// has no note yet gets one written by the decision.
	menu.addItem((item) =>
		item
			.setTitle('Set reading status')
			.setIcon('list-checks')
			.onClick(() => void chooseReading(context, target, rowTitle(row))),
	);

	// The context-menu key raises this event too, and arrives with no pointer to
	// anchor to. Without this the menu would open in the corner of the screen
	// for anyone not using a mouse.
	if (event.clientX === 0 && event.clientY === 0) {
		const box = el.getBoundingClientRect();
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

	/**
	 * The redraw a note's own change asks for, held while you are writing it.
	 *
	 * Typing in a paper changes the metadata cache, and the queue redraws on every
	 * change: it reads every note in the vault and rebuilds the tree, mid-sentence,
	 * for a keystroke that moves no row. This holds it until you leave the note.
	 */
	private readonly writing = new WhileWriting(this.app, () => this.redraw());

	/** Redraw after a resize, once the dragging has stopped rather than during it. */
	private readonly refit = debounce(() => renderQueue(this.contentEl, this.context), 250, false);

	/**
	 * Ask Zotero what has changed. The redraw, if one is due, comes from
	 * `onLibraryChange`, which tells every view drawing the library and not only
	 * the one that asked.
	 *
	 * Coalesced because the events that call it arrive in bursts.
	 */
	private readonly catchUp = debounce(() => void refreshLibrary(this.context.settings.collection), 300, true);

	async onOpen(): Promise<void> {
		expanded.clear();
		collapsed.clear();
		openDecided = false;
		renderQueue(this.contentEl, this.context);

		// Draw first from what is already known, then ask Zotero, which redraws if
		// the answer changed anything. Triage comes entirely from Zotero, so
		// waiting for the request before showing anything would mean an empty pane
		// every time this opens.
		this.register(onLibraryChange(() => this.redraw()));
		void refreshLibrary(this.context.settings.collection);

		// A note's own change waits while you are the one writing it. Everything
		// else lands at once: a deletion, a rename, or a paper arriving from a
		// sync has nothing to do with the sentence you are in the middle of.
		this.registerEvent(this.app.metadataCache.on('changed', (file) => this.writing.changed(file)));
		this.registerEvent(this.app.vault.on('delete', this.redraw));
		this.registerEvent(this.app.vault.on('rename', this.redraw));

		// Leaving the note is what lets the held change land, and clicking this
		// pane counts as leaving. The same two events move the highlight, which
		// is a class on one row rather than a reason to draw the pane again.
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.writing.flush();
				highlight(this.contentEl, this.app);
			}),
		);
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				this.writing.flush();
				highlight(this.contentEl, this.app);
			}),
		);

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
