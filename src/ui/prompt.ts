// A text prompt and a chooser. Both resolve to null when dismissed, so a caller
// can tell "cancelled" from "chose something" without exceptions.
//
// The chooser is the command palette's own component, which is what every list
// of options in this plugin is: a box to type in, and the options under it.
import { FuzzySuggestModal, Modal, Setting, setIcon, type App, type ButtonComponent, type FuzzyMatch } from 'obsidian';

/**
 * One line of a chooser, with its icon and what choosing it does under it.
 *
 * Shared, so every chooser in the plugin draws a line the same way, including
 * the deferral's, which is not one of these.
 */
export function renderChoice(el: HTMLElement, text: string, description?: string, icon?: string): void {
	// The icon on the left edge rather than above the words, so a list of
	// decisions scans down one column the way the triage dialog's buttons do.
	if (icon) {
		el.addClass('paper-trail-suggestion');
		setIcon(el.createDiv({ cls: 'paper-trail-suggestion-icon' }), icon);
	}

	const lines = icon ? el.createDiv({ cls: 'paper-trail-suggestion-lines' }) : el;
	lines.createDiv({ text });
	if (description) lines.createEl('small', { cls: 'paper-trail-suggestion-desc', text: description });
}

class Suggester<T> extends FuzzySuggestModal<T> {
	private result: T | null = null;

	constructor(
		app: App,
		private readonly items: T[],
		private readonly text: (item: T) => string,
		private readonly done: (item: T | null) => void,
		private readonly describe?: (item: T) => string,
		private readonly icon?: (item: T) => string,
	) {
		super(app);
	}

	getItems(): T[] {
		return this.items;
	}

	getItemText(item: T): string {
		return this.text(item);
	}

	/**
	 * One line, or two when the caller can say what a choice will do.
	 *
	 * Recording a judgement is the case that wants the second line: picking a
	 * file is a question of finding the right one, but picking "worth a third
	 * pass" is a question of what happens next, and that should not be something
	 * you have to remember.
	 */
	renderSuggestion(match: FuzzyMatch<T>, el: HTMLElement): void {
		if (!this.describe && !this.icon) {
			super.renderSuggestion(match, el);
			return;
		}

		renderChoice(el, this.text(match.item), this.describe?.(match.item), this.icon?.(match.item));
	}

	// Only records. SuggestModal does not guarantee that onChooseItem runs before
	// close(), and when close() wins, resolving from onClose hands back null for a
	// choice that was actually made: the command then returns silently and looks
	// like it did nothing at all.
	onChooseItem(item: T): void {
		this.result = item;
	}

	onClose(): void {
		window.setTimeout(() => this.done(this.result), 0);
	}
}

export function suggest<T>(
	app: App,
	items: T[],
	text: (item: T) => string,
	placeholder: string,
	describe?: (item: T) => string,
	icon?: (item: T) => string,
): Promise<T | null> {
	return new Promise((resolve) => {
		const modal = new Suggester(app, items, text, resolve, describe, icon);
		modal.setPlaceholder(placeholder);
		modal.open();
	});
}


export interface PromptOptions {
	/** The confirm button's text. It names the outcome, so it differs per caller. */
	cta?: string;
}

class Prompt extends Modal {
	private value = '';
	private submitted = false;
	private button: ButtonComponent | null = null;

	constructor(
		app: App,
		private readonly label: string,
		private readonly cta: string,
		private readonly done: (value: string | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.label);

		const input = this.contentEl.createEl('input', { cls: 'paper-trail-prompt-input', attr: { type: 'text' } });
		input.addEventListener('input', () => {
			this.value = input.value;
			this.check();
		});

		// On the modal's scope rather than the input's, so Enter still submits
		// when focus has not landed in the field. That was the original bug: an
		// unfocused prompt looked exactly like a command that had done nothing.
		this.scope.register([], 'Enter', (event) => {
			event.preventDefault();
			this.submit();
			return false;
		});

		new Setting(this.contentEl).addButton((button) => {
			this.button = button;
			button
				.setButtonText(this.cta)
				.setCta()
				.onClick(() => this.submit());
		});

		this.check();
		window.setTimeout(() => input.focus(), 0);
	}

	/**
	 * Whether there is anything to submit. An empty answer is not an answer: the
	 * two questions this asks are why a paper was dropped and what a deferral is
	 * waiting on, and a blank is the one reply neither can take.
	 */
	private check(): boolean {
		const ready = this.value.trim().length > 0;
		this.button?.setDisabled(!ready);
		return ready;
	}

	private submit(): void {
		if (this.submitted || !this.check()) return;
		this.submitted = true;
		this.done(this.value.trim());
		this.close();
	}

	onClose(): void {
		if (!this.submitted) this.done(null);
	}
}

export function prompt(app: App, label: string, options: PromptOptions = {}): Promise<string | null> {
	return new Promise((resolve) => new Prompt(app, label, options.cta ?? 'OK', resolve).open());
}
