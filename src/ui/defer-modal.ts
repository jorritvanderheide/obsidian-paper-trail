// Deferring a paper: what has to happen first, and when to look again.
//
// A deferral is the one decision that is a promise rather than an ending, so it
// asks two things. The condition, in your words, because it is the record's
// reason and the only thing that can say "after my exams". And the way back the
// plugin can check for itself: a date, or another paper being read.
//
// In a chooser, like every other decision, rather than a form. That bends the
// chooser a little: the box you type in is the answer rather than a search, and
// the list under it never narrows. A handful of fixed lines needs no search,
// and one more dialog that looks like the rest beats a form that looked like
// nothing else in the plugin.
//
// The box is a shortcut rather than a gate. The list is drawn exactly as the
// status chooser draws its own, whatever is typed, and a date picked with the
// box empty asks for the condition after. Fading the list until you typed was
// tried, and a list that is faint for a reason it does not state looks broken.
//
// Wiring only. The ways back, the dates they come to and which papers can be
// waited for are decided in core; this puts them in front of somebody.
import { SuggestModal, type App } from 'obsidian';
import { LOOK_AGAIN, lookAgainLine, type LookAgain } from '../core/triage';
import { prompt, renderChoice, suggest } from './prompt';

/** A paper a deferral can wait for. */
export interface Waitable {
	key: string;
	title: string;
}

/** What a deferral was given. */
export interface Deferral {
	reason: string;
	lookAgain: LookAgain;
	after: Waitable | null;
}

/** A way back, and the condition typed above it when it was chosen. */
interface Picked {
	preset: LookAgain;
	reason: string;
}

class WayBack extends SuggestModal<LookAgain> {
	private picked: Picked | null = null;

	constructor(
		app: App,
		private readonly presets: LookAgain[],
		private readonly today: string,
		private readonly written: string,
		private readonly done: (picked: Picked | null) => void,
	) {
		super(app);
		// A sentence for the record rather than a search, so it is spell-checked
		// the way the rest of your writing is.
		this.inputEl.spellcheck = true;
	}

	onOpen(): void {
		// Typed as maybe a promise, and in fact synchronous: it empties the box
		// and draws the list before it returns, which is what the line below needs.
		void super.onOpen();
		// Opening empties the box, and coming back from choosing a paper should
		// not cost you what you had written.
		if (this.written) {
			this.inputEl.value = this.written;
			this.inputEl.trigger('input');
		}
	}

	/** Every way back, always: what is typed is the condition, not a search. */
	getSuggestions(): LookAgain[] {
		return this.presets;
	}

	renderSuggestion(preset: LookAgain, el: HTMLElement): void {
		renderChoice(el, preset.label, lookAgainLine(preset, this.today), preset.icon);
	}

	// Only records, and `onClose` answers. The chooser closes before it calls
	// this, so answering here would come after the close had answered null.
	onChooseSuggestion(preset: LookAgain): void {
		this.picked = { preset, reason: this.inputEl.value.trim() };
	}

	onClose(): void {
		window.setTimeout(() => this.done(this.picked), 0);
	}
}

function wayBack(app: App, presets: LookAgain[], question: string, today: string, written: string): Promise<Picked | null> {
	return new Promise((resolve) => {
		const modal = new WayBack(app, presets, today, written, resolve);
		modal.setPlaceholder(question);
		modal.open();
	});
}

/**
 * Ask for a deferral's terms. Null when escaped, which abandons the deferral.
 *
 * The condition can be typed above the list, and when it was not it is asked
 * for once a date is picked, the way a drop asks why. A date does not need it
 * to come back, but the record does: it is the only thing that can say "after
 * my exams". Waiting on a paper needs neither, because the paper is the
 * condition.
 *
 * Every question after the first goes back to the first when escaped, with
 * what you had typed still in it, rather than abandoning the deferral.
 */
export async function askDeferral(
	app: App,
	question: string,
	cta: string,
	waitable: Waitable[],
	today: string,
): Promise<Deferral | null> {
	// With nothing unread there is nothing to wait for, and a line offering it
	// would open an empty list.
	const presets = LOOK_AGAIN.filter((preset) => !preset.after || waitable.length > 0);

	let written = '';
	for (;;) {
		const picked = await wayBack(app, presets, question, today, written);
		if (!picked) return null;
		written = picked.reason;

		if (picked.preset.after) {
			const paper = await suggest(app, waitable, (entry) => entry.title, 'Which paper does this wait for?');
			// "After I have read" that paper is the condition when you have not
			// written your own: asking for it again in words would be asking twice.
			if (paper) return { reason: written || `After I have read ${paper.title}`, lookAgain: picked.preset, after: paper };
			continue;
		}

		const reason = written || (await prompt(app, question, { cta }));
		if (reason) return { reason, lookAgain: picked.preset, after: null };
	}
}
