// A paper's right-click menu: what its row's buttons do, then the reading
// statuses that would move it.
//
// One menu wherever a paper is right-clicked, on its row in the queue and on
// its note in the file explorer, so it never matters which of the two you
// reached for. The explorer is where a vault is browsed, and a paper found
// there had nothing of the workflow on it: to tick off a reading you had to
// open the note or go and find its row.
//
// Wiring only. Which step a paper owes and which statuses would move it are
// decided in core, and every item runs the command its button or the chooser
// runs, so a paper lands in the same place whichever way it was sent.
import { TFile, type Menu, type TAbstractFile } from 'obsidian';
import { rowTask, rowTitle, TASKS, type Row } from '../core/stages';
import { act, finish } from '../commands/workflow';
import { offersFor, takeOffer, targetOf } from '../commands/reading';
import { paperNote } from '../outstanding';
import type { Context } from '../context';

/**
 * Put a paper's items in a menu. False when there is no paper to act on,
 * because its note has gone since the row was drawn.
 *
 * The row's own steps first, in the row's order: finished before the action,
 * because a paper you have come back to is more often finished than started
 * again. None for a paper in Deferred or Filed, which owes nothing.
 *
 * Then the statuses themselves, only those that would move this paper, rather
 * than one item that opened the chooser: that was a menu of one line spent on
 * getting to a second list. What a menu cannot carry is the line under each
 * option saying where the paper lands. The notice after a decision says it,
 * and the chooser, from the pill and the palette, still shows it beforehand.
 *
 * One group, fenced by a separator at each end. In the explorer the items
 * share Obsidian's unsectioned group with every other plugin's, and without
 * the fences they ran on into their neighbours'. A section would fence them
 * too, but Obsidian puts a section it does not know after its last one, below
 * Delete. The fences cost nothing where they are not needed: Obsidian hides a
 * separator at either end of a menu and one directly after another.
 */
export function paperMenu(menu: Menu, context: Context, row: Row): boolean {
	const target = targetOf(context.app, row);
	if (!target) return false;

	menu.addSeparator();

	const task = rowTask(row, context.settings.triage);
	if (task) {
		const { action, icon, done, doneIcon } = TASKS[task];
		if (done && doneIcon) {
			menu.addItem((item) => item.setTitle(done).setIcon(doneIcon).onClick(() => void finish(context, task, row)));
		}
		menu.addItem((item) => item.setTitle(action).setIcon(icon).onClick(() => void act(context, task, row)));
	}

	for (const offer of offersFor(context, target).offers) {
		menu.addItem((item) =>
			item
				.setTitle(offer.choice.label)
				.setIcon(offer.icon)
				.onClick(() => void takeOffer(context, target, rowTitle(row), offer.choice)),
		);
	}

	menu.addSeparator();
	return true;
}

/**
 * The same items on a paper in the file explorer.
 *
 * The explorer's menu and no other. Obsidian builds a file menu for a tab's
 * header and a note's own title bar too, and those already carry the pill and
 * the buttons. Unsectioned, so the items land together near the foot of the
 * explorer's menu, above Delete, where plugins' items go.
 */
export function explorerMenu(context: Context): (menu: Menu, file: TAbstractFile, source: string) => void {
	return (menu, file, source) => {
		if (source !== 'file-explorer-context-menu' || !(file instanceof TFile)) return;

		const note = paperNote(context, file);
		if (note.isPaper) paperMenu(menu, context, { kind: 'note', note });
	};
}
