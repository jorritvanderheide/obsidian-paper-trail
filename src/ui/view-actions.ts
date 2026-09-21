// Two buttons in a note's own title bar, beside the editor mode toggle.
//
// The queue is excellent when you are looking at it and no help at all when you
// are looking at the paper, which is where the work happens. These close that
// gap without spending a pane on it: whatever is outstanding for the note in
// front of you, offered where your hand already is.
//
// Wiring only. Which stage a note is at, and what that stage offers, are core's
// to say; this asks and draws the answer.
import { MarkdownView, Menu, type App } from 'obsidian';
import { byStage, noteState, stageActionOf, type NoteState, type Stage, type StageAction } from '../core/stages';
import { act, finish } from '../commands/workflow';
import { refreshPaper } from '../commands/papers';
import { setReading } from '../commands/reading';
import type { Context } from '../context';

const REFRESH = 'paper-trail-refresh';
const STATUS = 'paper-trail-status';

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
		const refresh = ensure(view, REFRESH, 'refresh-cw', 'Refresh from Zotero', () => void refreshPaper(context, view.file ?? undefined));
		refresh.toggle(note !== null && note.isPaper);

		// Everything else is behind one button, because a title bar is not a
		// place to put a row of verbs.
		//
		// Both handlers read the view when they run rather than closing over
		// what it held when the button was made. A view outlives the files shown
		// in it, and `ensure` hands back a button it has already made without
		// rebinding: a handler that captured a note would still be holding the
		// first paper ever opened in that tab, and would act on it.
		const status = ensure(view, STATUS, 'list-checks', 'What is outstanding', (event) => {
			const current = stateOf(context, view);
			if (current) menu(context, current, stageActionOf(byStageOf(context, current))).showAtMouseEvent(event);
		});

		const outstanding = note ? stageActionOf(byStageOf(context, note)) : null;
		status.toggle(note !== null && (note.isPaper || outstanding !== null));
	}
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

/** The one stage this note is waiting at, if any. */
function byStageOf(context: Context, note: NoteState): Stage | null {
	for (const [stage, rows] of byStage([note], context.settings.types)) {
		if (rows.length > 0) return stage;
	}
	return null;
}

/**
 * What this note is waiting for, and what can be done about it.
 *
 * The stage is a heading rather than a step number, and the actions under it
 * are whatever that stage offers. Nothing here says "next": the workflow has
 * never refused an action because an earlier one was unfinished, and a menu
 * that counted steps would be the first thing to imply otherwise.
 */
function menu(context: Context, note: NoteState, outstanding: StageAction | null): Menu {
	const built = new Menu();

	built.addItem((item) => item.setTitle(outstanding ? outstanding.label : 'Nothing outstanding').setIsLabel(true));

	if (outstanding?.inNote) {
		built.addItem((item) =>
			item
				.setTitle(outstanding.action)
				.setIcon('arrow-right')
				.onClick(() => void act(context, outstanding.stage, { kind: 'note', note })),
		);
	}

	if (outstanding?.done) {
		built.addItem((item) =>
			item
				.setTitle(outstanding.done ?? '')
				.setIcon('check')
				.onClick(() => void finish(context, outstanding.stage, { kind: 'note', note })),
		);
	}

	if (note.isPaper) {
		built.addSeparator();
		built.addItem((item) =>
			item
				.setTitle('Set reading status')
				.setIcon('list')
				.onClick(() => void setReading(context, context.app.vault.getFileByPath(note.path) ?? undefined)),
		);
	}

	return built;
}

/** The action, made if this view has not got one yet. */
function ensure(view: MarkdownView, marker: string, icon: string, title: string, run: (event: MouseEvent) => void): HTMLElement {
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
		for (const marker of [REFRESH, STATUS]) leaf.view.containerEl.querySelector(`.${marker}`)?.remove();
	}
}
