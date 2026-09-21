// Asking for a decision.
//
// A search box is the right shape for picking out of hundreds and the wrong one
// for choosing between four, where the work is weighing the options rather than
// finding them. So: every option visible at once, each with the consequence
// written under it, and nothing to type.
//
// Used wherever a judgement is recorded without a paper in front of you, so
// that deciding always looks like deciding.
import { Modal, type App } from 'obsidian';

export interface Choice<T> {
	value: T;
	label: string;
	/** What happens if you pick this. Shown under the label, not hidden in a tooltip. */
	description?: string;
}

class Decision<T> extends Modal {
	private result: T | null = null;

	constructor(
		app: App,
		private readonly question: string,
		private readonly choices: Choice<T>[],
		private readonly done: (value: T | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.question);

		const list = this.contentEl.createDiv({ cls: 'paper-trail-choices' });
		for (const choice of this.choices) {
			const button = list.createEl('button', { cls: 'paper-trail-choice' });
			button.createSpan({ cls: 'paper-trail-choice-label', text: choice.label });
			if (choice.description) button.createSpan({ cls: 'paper-trail-choice-desc', text: choice.description });

			button.addEventListener('click', () => {
				this.result = choice.value;
				this.close();
			});
		}

		// The first option is focused, so the whole thing is answerable from the
		// keyboard: arrow or tab to the one you want, enter to take it, escape to
		// abandon it. Escape leaves the result null, which every caller reads as
		// "changed my mind" rather than as a choice.
		list.querySelector<HTMLElement>('button')?.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		window.setTimeout(() => this.done(this.result), 0);
	}
}

/** Resolves to the chosen value, or null when the question was dismissed. */
export function choose<T>(app: App, question: string, choices: Choice<T>[]): Promise<T | null> {
	return new Promise((resolve) => new Decision(app, question, choices, resolve).open());
}
