// Getting started, without writing anything into anybody's vault.
//
// The queue lives in the sidebar, which costs no file, so the welcome opens
// that rather than helping itself to a note in your notes folder. The block is
// there for anyone who would rather have the queue on a dashboard of their
// own; it has to be asked for, and it goes where you put the cursor.
import { MarkdownView, Modal, Notice, Setting, type App } from 'obsidian';
import { WORKFLOW_BLOCK } from '../core/templates';
import { openQueue } from '../ui/queue';
import type { Context } from '../context';

/**
 * Put the queue block where the cursor is.
 *
 * Replaces the selection like any other insertion, so wrapping it round
 * something by accident is undoable in the usual way.
 */
export async function insertBlock(context: Context): Promise<void> {
	const view = context.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) {
		new Notice('Open a note in editing view and put the cursor where the queue should go.');
		return;
	}

	if (view.getMode() !== 'source') {
		new Notice('Switch to editing view first: reading view has nowhere to put the cursor.');
		return;
	}

	view.editor.replaceSelection(`\`\`\`${WORKFLOW_BLOCK}\n\`\`\`\n`);
	return Promise.resolve();
}

/**
 * Shown once, on the first load after installing.
 *
 * An opinionated plugin owes the user the opinion. Four steps and a button is
 * cheaper to read than a README they will not open, and the button now opens a
 * pane rather than creating a file, which is the difference between showing
 * someone around and rearranging their furniture.
 */
class Welcome extends Modal {
	constructor(
		app: App,
		private readonly name: string,
		private readonly onOpenQueue: () => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		// From the manifest rather than written out here: one source for the
		// name, and a dialog that does not say which plugin it came from is a
		// mystery box on the day someone installs four of them.
		this.setTitle(this.name);

		const el = this.contentEl;
		el.createEl('p', { cls: 'paper-trail-welcome-lead', text: 'Decide what to read before you read it.' });

		const steps = el.createEl('ol', { cls: 'paper-trail-welcome-steps' });
		for (const step of [
			'Add a paper from your Zotero library.',
			'Triage it on its abstract, in about twenty seconds. Spend eight minutes only when that is not enough.',
			'Drop it and say why, queue it for a real read, or mark it already read.',
			'Queued papers open in Zotero. Mark one read and it asks you for the claim.',
		]) {
			steps.createEl('li', { text: step });
		}

		el.createEl('p', {
			text: 'Everything outstanding appears in one list, in that order. It lives in the sidebar, and a command will also put it in any note you like.',
		});

		new Setting(el)
			.addButton((button) =>
				button
					.setButtonText('Show me the queue')
					.setCta()
					.onClick(() => {
						this.close();
						void this.onOpenQueue();
					}),
			)
			.addButton((button) =>
				button.setButtonText('Not now').onClick(() => {
					this.close();
					new Notice(`${this.name}: "Open queue" is in the palette whenever you want it.`);
				}),
			);
	}
}

export function welcome(context: Context, name: string): void {
	new Welcome(context.app, name, () => openQueue(context.app)).open();
}
