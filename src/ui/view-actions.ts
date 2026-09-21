// Paper Trail's buttons in a note's own title bar, beside the editor mode toggle.
//
// The queue is excellent when you are looking at it and no help at all when you
// are looking at the paper, which is where the work happens. These close that
// gap without spending a pane on it: whatever is outstanding for the note in
// front of you, offered where your hand already is.
//
// Wiring only. Which stage a note is at, and what that stage offers, are core's
// to say; this asks and draws the answer.
import { MarkdownView, setIcon, type App } from 'obsidian';
import { noteState, taskOf, TASKS, type NoteState, type Task } from '../core/stages';
import { act, finish } from '../commands/workflow';
import { refreshPaper } from '../commands/papers';
import type { Context } from '../context';

const REFRESH = 'paper-trail-refresh';
const ACT = 'paper-trail-act';
const DONE = 'paper-trail-done';

/**
 * Obsidian has no way to register an action on every markdown view, so this
 * walks the open ones and decorates any it has not seen.
 *
 * Whether it has been seen is asked of the DOM rather than of a map on the
 * side, and that is load-bearing rather than tidy. Switching between editing
 * and reading makes a markdown view rebuild its own actions, which throws these
 * buttons away with them. Asking the DOM means a view that has been rebuilt
 * simply looks undecorated again and gets new ones; a map would have insisted
 * it already had them and left the header empty.
 *
 * There is no mode-change event to hang this on, so the caller drives it from
 * `layout-change`, deferred: that fires before the rebuild, and decorating
 * synchronously puts the buttons somewhere Obsidian is about to clear.
 */
export function decorate(context: Context): void {
	for (const leaf of context.app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) continue;

		const note = stateOf(context, view);

		// Refreshing is a paper's alone, and frequent enough to stay one click.
		const refresh = ensure(
			view,
			REFRESH,
			'refresh-cw',
			'Refresh from Zotero',
			() => void refreshPaper(context, view.file ?? undefined),
		);
		refresh.toggle(note !== null && note.isPaper);

		// The stage's own actions, in the bar rather than behind a menu.
		//
		// A menu was right when these were words: a title bar is no place for a
		// row of verbs. As icons there are never more than two, which is an
		// ordinary number for a title bar, and a menu holding one item is two
		// clicks to reach one action. It also puts the same icon here as in the
		// sidebar row, so a stage looks like itself wherever you meet it.
		//
		// Nothing outstanding now draws as nothing, which is what it is. The
		// menu had to say it in words because an empty menu is a dead click.
		//
		// Every handler reads the view when it runs rather than closing over
		// what it held when the button was made. A view outlives the files shown
		// in it, and `ensure` hands back a button it has already made without
		// rebinding: a handler that captured a note would still be holding the
		// first paper ever opened in that tab, and would act on it.
		const task = note ? taskOf(note) : null;
		const outstanding = task ? TASKS[task] : null;

		// Made in the reverse of the order they appear. `addAction` puts each new
		// one at the front, so the last one made is the leftmost: this reads
		// backwards and has to, or the pair comes out mirrored.
		//
		// Claim and Assessment are absent by design. Their action is
		// "open this note", and you are in it.
		const action = ensure(view, ACT, 'scan-eye', 'Triage', () =>
			withCurrent(context, view, act),
		);
		show(
			action,
			outstanding?.inNote ? outstanding.action : undefined,
			outstanding?.icon,
		);

		// So this one lands to its left, matching the sidebar row: a paper you
		// have come back to is more often finished than started again.
		const done = ensure(view, DONE, 'check', 'Finished', () =>
			withCurrent(context, view, finish),
		);
		show(done, outstanding?.done, outstanding?.doneIcon);
	}
}

/**
 * Point a title-bar button at the stage in front of it, or take it away.
 *
 * The icon and the label are set on every pass rather than at creation,
 * because one button serves every stage: the same element is Triage on an
 * untriaged paper and Open in Zotero once it is queued.
 */
function show(
	button: HTMLElement,
	label: string | undefined,
	icon: string | undefined,
): void {
	if (label !== undefined && icon !== undefined) {
		button.empty();
		setIcon(button, icon);
		button.setAttribute('aria-label', label);
	}
	button.toggle(label !== undefined && icon !== undefined);
}

/** Do a stage's thing to whatever the view is holding now. */
function withCurrent(
	context: Context,
	view: MarkdownView,
	what: (context: Context, task: Task, row: { kind: 'note'; note: NoteState }) => Promise<void>,
): void {
	const note = stateOf(context, view);
	const task = note ? taskOf(note) : null;
	if (note && task) void what(context, task, { kind: 'note', note });
}

/** The note in this view, as the rules see it, or null when the view holds none. */
function stateOf(context: Context, view: MarkdownView): NoteState | null {
	const file = view.file;
	if (!file) return null;

	return noteState(
		context.app.metadataCache.getFileCache(file),
		{ path: file.path, basename: file.basename, created: file.stat.ctime },
		context.settings.keyField,
		context.settings.claimHeading,
		context.settings.assessmentHeading,
	);
}

/** The action, made if this view has not got one yet. */
function ensure(
	view: MarkdownView,
	marker: string,
	icon: string,
	title: string,
	run: (event: MouseEvent) => void,
): HTMLElement {
	const existing = view.containerEl.querySelector<HTMLElement>(`.${marker}`);
	if (existing) return existing;

	const button = view.addAction(icon, title, run);
	button.addClass(marker);
	return button;
}

/** Take the buttons back out, so unloading the plugin leaves no trace in the UI. */
export function undecorate(app: App): void {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		if (!(leaf.view instanceof MarkdownView)) continue;
		for (const marker of [REFRESH, ACT, DONE])
			leaf.view.containerEl.querySelector(`.${marker}`)?.remove();
	}
}
