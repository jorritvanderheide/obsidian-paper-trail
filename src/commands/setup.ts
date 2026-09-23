// Getting started, without writing anything into anybody's vault.
//
// The queue lives in the sidebar, which costs no file, so the first run opens
// that rather than writing a homepage into somebody's vault. The block is
// there for anyone who would rather have the queue on a dashboard of their
// own; it has to be asked for, and it goes where you put the cursor.
import { MarkdownView, Modal, Notice, Setting, type App } from 'obsidian';
import { WORKFLOW_BLOCK } from '../ui/workflow-block';
import { library, refreshLibrary } from '../library';
import { lastContact } from '../source';
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
		new Notice('Switch to editing view and put the cursor where the queue should go.');
		return;
	}

	view.editor.replaceSelection(`\`\`\`${WORKFLOW_BLOCK}\n\`\`\`\n`);
	return Promise.resolve();
}

/**
 * Shown once, on the first load after installing.
 *
 * Not a tour. Whoever installed this read the pitch to get here, and four steps
 * of prose restating it is an advert that goes stale the first time a button
 * moves: two of the steps this replaces described a pane that had already
 * stopped working that way.
 *
 * What a first run actually owes someone is the one thing the plugin cannot do
 * for them and cannot guess. Everything here comes from Zotero over a local API
 * that has to be switched on in its settings, and until it is, the queue is not
 * short, it is empty, and nothing distinguishes that from a plugin that does
 * not work. So this asks Zotero, in front of them, and either says how many
 * items it found or says exactly which switch is off.
 *
 * It describes state rather than steps, which is also why it cannot go stale.
 */
class Welcome extends Modal {
	private status!: HTMLElement;
	private retry!: HTMLElement;

	constructor(
		app: App,
		private readonly name: string,
		private readonly collection: string,
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
		el.createEl('p', {
			cls: 'paper-trail-welcome-body',
			text: 'Your library stays in Zotero. Everything it holds that this vault has no note for turns up in the queue, and nothing is written until you decide on one.',
		});

		this.status = el.createDiv({ cls: 'paper-trail-welcome-status' });

		const buttons = new Setting(el);
		// Made now and hidden, rather than added when the check fails: a button
		// that appears under the cursor a second after the dialog opens is one
		// you press by accident.
		buttons.addButton((button) => {
			this.retry = button.buttonEl;
			button.setButtonText('Try again').onClick(() => void this.check());
		});
		buttons.addButton((button) =>
			button
				.setButtonText('Show me the queue')
				.setCta()
				.onClick(() => {
					this.close();
					void this.onOpenQueue();
				}),
		);

		void this.check();
	}

	/**
	 * Ask Zotero, and say what it said.
	 *
	 * Through `refreshLibrary`, which is the same call the queue makes, so a
	 * dialog that reports success is reporting the request the pane behind it is
	 * about to depend on rather than a separate one that happens to agree.
	 */
	private async check(): Promise<void> {
		this.say('Asking Zotero…', false);
		await refreshLibrary(this.collection);

		// Null is unreachable here rather than "nobody has asked", because the
		// call above is the asking. Reading it the same way the queue's offline
		// banner does keeps one sentence for one state.
		const contact = lastContact();
		if (contact === null || !contact.reachable) {
			this.say(contact?.reason ?? 'Zotero is not answering. Is it running?', true);
			return;
		}

		const count = library().length;
		this.say(
			count === 0
				? 'Zotero is answering, and its library is empty. Add papers to it and they turn up in the queue.'
				: `Zotero is answering: ${count.toLocaleString('en')} ${count === 1 ? 'item' : 'items'} in your library, ready for the queue.`,
			false,
		);
	}

	/** One line, and the retry only when pressing it would do something. */
	private say(text: string, warning: boolean): void {
		this.status.empty();
		this.status.toggleClass('paper-trail-welcome-warning', warning);
		this.status.createSpan({ text });
		this.retry.toggle(warning);
	}
}

export function welcome(context: Context, name: string): void {
	new Welcome(context.app, name, context.settings.collection, () => openQueue(context.app)).open();
}
