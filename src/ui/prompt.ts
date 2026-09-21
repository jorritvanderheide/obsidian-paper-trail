// A text prompt and a chooser. Both resolve to null when dismissed, so a caller
// can tell "cancelled" from "chose something" without exceptions.
//
// The chooser is the command palette's own component, which is what every list
// of options in this plugin is: a box to type in, and the options under it.
import { FuzzySuggestModal, Modal, Setting, setIcon, type App, type ButtonComponent, type FuzzyMatch } from 'obsidian';

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

		// The icon on the left edge rather than above the words, so a list of
		// decisions scans down one column the way the triage pane's buttons do.
		if (this.icon) {
			el.addClass('paper-trail-suggestion');
			setIcon(el.createDiv({ cls: 'paper-trail-suggestion-icon' }), this.icon(match.item));
		}

		const lines = this.icon ? el.createDiv({ cls: 'paper-trail-suggestion-lines' }) : el;
		lines.createDiv({ text: this.text(match.item) });
		if (this.describe) lines.createEl('small', { cls: 'paper-trail-suggestion-desc', text: this.describe(match.item) });
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

/** Returns why the value is unusable, or null when it is fine. */
export type Validate = (value: string) => string | null;

export interface PromptOptions {
	/** The confirm button's text. It names the outcome, so it differs per caller. */
	cta?: string;
	validate?: Validate;
}

class Prompt extends Modal {
	private value = '';
	private submitted = false;
	private error!: HTMLElement;
	private button: ButtonComponent | null = null;

	constructor(
		app: App,
		private readonly label: string,
		private readonly cta: string,
		private readonly validate: Validate,
		private readonly done: (value: string | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.label);

		const input = this.contentEl.createEl('input', { cls: 'paper-trail-prompt-input', attr: { type: 'text' } });
		this.error = this.contentEl.createDiv({ cls: 'paper-trail-prompt-error' });
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
	 * Report the problem while it is still cheap to fix. An empty field is not an
	 * error yet, it is just not submittable, so the message stays quiet until
	 * there is something to complain about.
	 */
	private check(): boolean {
		const value = this.value.trim();
		const message = value.length === 0 ? null : this.validate(value);
		this.error.setText(message ?? '');
		this.button?.setDisabled(value.length === 0 || message !== null);
		return value.length > 0 && message === null;
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
	return new Promise((resolve) => new Prompt(app, label, options.cta ?? 'OK', options.validate ?? (() => null), resolve).open());
}

class Info extends Modal {
	constructor(
		app: App,
		private readonly heading: string,
		private readonly body: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.heading);
		for (const line of this.body.split('\n')) this.contentEl.createEl('p', { text: line });
	}
}

/** For output worth reading rather than a Notice that slides away, like export warnings. */
export function info(app: App, heading: string, body: string): void {
	new Info(app, heading, body).open();
}
