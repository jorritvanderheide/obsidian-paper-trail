// Pick a passage you annotated, to quote it.
//
// From the paper notes rather than from Zotero: these are the papers you have
// decided about, it works with Zotero closed, and the note is what the
// citation links to. Fuzzy over the passage and the paper's name together, so
// "okafor care" finds Okafor's line about care.
import { FuzzySuggestModal, renderMatches, type App, type FuzzyMatch, type TFile } from 'obsidian';
import type { SyncedPassage } from '../core/paper-note';

export interface PickedPassage extends SyncedPassage {
	file: TFile;
}

class AnnotationPicker extends FuzzySuggestModal<PickedPassage> {
	private result: PickedPassage | null = null;

	constructor(
		app: App,
		private readonly passages: PickedPassage[],
		private readonly done: (picked: PickedPassage | null) => void,
	) {
		super(app);
		this.setPlaceholder('Search your annotations, or the paper they are from');
		this.emptyStateText = 'Nothing matches.';
		this.setInstructions([{ command: '↵', purpose: 'insert as a quote' }]);
	}

	getItems(): PickedPassage[] {
		return this.passages;
	}

	getItemText(passage: PickedPassage): string {
		return `${passage.text} ${passage.file.basename}`;
	}

	// The searched text is the passage and the name run together, so the matches
	// are split at the join: the passage on the first line, the name in the
	// byline under it, each with its own highlights.
	renderSuggestion({ item, match }: FuzzyMatch<PickedPassage>, el: HTMLElement): void {
		const cut = item.text.length + 1;
		const inText = match.matches
			.filter(([start]) => start < item.text.length)
			.map(([start, end]): [number, number] => [start, Math.min(end, item.text.length)]);
		renderMatches(el.createDiv(), item.text, inText);

		const byline = el.createEl('small', { cls: 'paper-trail-picker-byline' });
		const inName = match.matches.filter(([, end]) => end > cut).map(([start, end]): [number, number] => [Math.max(start, cut) - cut, end - cut]);
		renderMatches(byline, item.file.basename, inName);
		if (item.page) byline.appendText(` · p. ${item.page}`);
	}

	// Records only, as in the item picker: this can run after close().
	onChooseItem(passage: PickedPassage): void {
		this.result = passage;
	}

	onClose(): void {
		window.setTimeout(() => this.done(this.result), 0);
	}
}

/** Resolves to the chosen passage, or null when the picker was dismissed. */
export function pickPassage(app: App, passages: PickedPassage[]): Promise<PickedPassage | null> {
	return new Promise((resolve) => new AnnotationPicker(app, passages, resolve).open());
}
