// Pick a passage you annotated, to quote it: the paper first, then the passage.
//
// From the paper notes rather than from Zotero: these are the papers you have
// decided about, it works with Zotero closed, and the note is what the
// citation links to. Two lists rather than one, because the paper is usually
// what you already know, and a passage is easier to find among one paper's
// than among all of them.
import { FuzzySuggestModal, type App, type FuzzyMatch, type TFile } from 'obsidian';
import type { SyncedPassage } from '../core/paper-note';

/** A paper note and the passages synced into it. */
export interface AnnotatedPaper {
	file: TFile;
	title: string;
	/** Authors and year, as the note's properties have them. */
	byline: string;
	passages: SyncedPassage[];
}

/**
 * A fuzzy list that resolves once it is closed, to what was chosen or null.
 *
 * The choice is recorded and read on close, inside a timeout, because
 * `onChooseItem` can run after `close()`, as in the item picker.
 */
abstract class Picker<T> extends FuzzySuggestModal<T> {
	private result: T | null = null;

	constructor(
		app: App,
		private readonly items: T[],
		private readonly done: (picked: T | null) => void,
	) {
		super(app);
		this.emptyStateText = 'Nothing matches.';
	}

	getItems(): T[] {
		return this.items;
	}

	onChooseItem(item: T): void {
		this.result = item;
	}

	onClose(): void {
		window.setTimeout(() => this.done(this.result), 0);
	}
}

class PaperPicker extends Picker<AnnotatedPaper> {
	constructor(app: App, papers: AnnotatedPaper[], done: (picked: AnnotatedPaper | null) => void) {
		super(app, papers, done);
		this.setPlaceholder('Which paper are you quoting?');
		this.setInstructions([{ command: '↵', purpose: 'show its annotations' }]);
	}

	getItemText(paper: AnnotatedPaper): string {
		return `${paper.title} ${paper.byline} ${paper.file.basename}`;
	}

	renderSuggestion({ item }: FuzzyMatch<AnnotatedPaper>, el: HTMLElement): void {
		el.createDiv({ text: item.title });
		const count = `${item.passages.length} ${item.passages.length === 1 ? 'annotation' : 'annotations'}`;
		const byline = [item.byline, item.file.basename, count].filter(Boolean).join(' · ');
		el.createEl('small', { cls: 'paper-trail-picker-byline', text: byline });
	}
}

class PassagePicker extends Picker<SyncedPassage> {
	constructor(app: App, paper: AnnotatedPaper, done: (picked: SyncedPassage | null) => void) {
		super(app, paper.passages, done);
		this.setPlaceholder(`Search the annotations in ${paper.file.basename}`);
		this.setInstructions([{ command: '↵', purpose: 'insert as a quote' }]);
	}

	getItemText(passage: SyncedPassage): string {
		return passage.text;
	}

	renderSuggestion(match: FuzzyMatch<SyncedPassage>, el: HTMLElement): void {
		super.renderSuggestion(match, el);
		if (match.item.page) el.createEl('small', { cls: 'paper-trail-picker-byline', text: `p. ${match.item.page}` });
	}
}

/** Resolves to the chosen paper, or null when the picker was dismissed. */
export function pickPaper(app: App, papers: AnnotatedPaper[]): Promise<AnnotatedPaper | null> {
	return new Promise((resolve) => new PaperPicker(app, papers, resolve).open());
}

/** Resolves to the chosen passage, or null when the picker was dismissed. */
export function pickPassage(app: App, paper: AnnotatedPaper): Promise<SyncedPassage | null> {
	return new Promise((resolve) => new PassagePicker(app, paper, resolve).open());
}
