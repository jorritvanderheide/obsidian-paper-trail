// Pick an item from your Zotero library, to cite it.
//
// It opens on what you added most recently rather than on an empty list,
// because the paper you are writing about is often one you saved not long ago,
// and an empty box asks you to remember a title before it will show you
// anything.
import { SuggestModal, type App } from 'obsidian';
import { authorNames, isPaperItem, itemYear, type ApiItem } from '../core/zotero';
import { messageOf } from './notify';
import { recentItems, searchItems } from '../source';

const MIN_QUERY = 2;

/** How many recent items an empty box offers. Enough to recognise what you just saved, not a library browser. */
const RECENT = 15;

/**
 * A way out of the picker that is not picking something.
 *
 * Offered in the modal's own footer bar, which is where Obsidian puts the
 * keyboard hints for its quick switcher, so it reads as part of the furniture
 * rather than as a feature bolted to the bottom of a list. It costs no room in
 * the results and it is visible every time, which is what a rare action needs.
 */
export interface Escape {
	/** How the footer describes it, after the chord. */
	purpose: string;
	run(): void;
}

class ItemPicker extends SuggestModal<ApiItem> {
	private result: ApiItem | null = null;
	private recent: ApiItem[] | null = null;

	constructor(
		app: App,
		private readonly done: (item: ApiItem | null) => void,
		escape?: Escape,
	) {
		super(app);
		this.setPlaceholder('Search your Zotero library, or pick one you added recently');
		this.emptyStateText = 'Nothing in your Zotero library yet.';

		if (escape) {
			this.setInstructions([
				{ command: '↵', purpose: 'insert' },
				{ command: '⇧↵', purpose: escape.purpose },
			]);
			// Closing first, then handing over: the escape opens something of its
			// own, and two dialogs fighting over focus is how you lose a click.
			this.scope.register(['Shift'], 'Enter', () => {
				this.close();
				escape.run();
				return false;
			});
		}
	}

	async getSuggestions(query: string): Promise<ApiItem[]> {
		const text = query.trim();
		const searching = text.length >= MIN_QUERY;

		try {
			const items = searching ? await searchItems(text) : await this.recentlyAdded();
			this.emptyStateText = searching ? 'No matching items.' : 'Nothing in your Zotero library yet.';
			return items.filter(isPaperItem);
		} catch (error) {
			// The modal is the only surface here, so the reason belongs in it.
			this.emptyStateText = messageOf(error);
			return [];
		}
	}

	/**
	 * Fetched once per opening. The modal is open for a few seconds and the
	 * library cannot change underneath it, so typing one letter and deleting it
	 * again should not cost two more round trips. A failure leaves the field
	 * unset, which means the next keystroke tries again.
	 */
	private async recentlyAdded(): Promise<ApiItem[]> {
		this.recent ??= await recentItems(RECENT);
		return this.recent;
	}

	renderSuggestion(item: ApiItem, el: HTMLElement): void {
		el.createDiv({ text: item.data.title || item.key });

		// The citation key earns its place on the line: it is what the note will
		// be called and what a citation inserts, so seeing it is how you know
		// you picked the right one of two papers with the same first author.
		const byline = [authorNames(item).join(', '), itemYear(item), item.data.citationKey?.trim()].filter(Boolean).join(' · ');
		if (byline) el.createEl('small', { cls: 'paper-trail-picker-byline', text: byline });
	}

	// Records only. SuggestModal does not guarantee this runs before close().
	onChooseSuggestion(item: ApiItem): void {
		this.result = item;
	}

	onClose(): void {
		window.setTimeout(() => this.done(this.result), 0);
	}
}

/**
 * Resolves to the chosen item, or null when the picker was dismissed.
 *
 * Taking the escape resolves null too, and that is deliberate rather than
 * sloppy: the escape owns everything that happens next, so the caller's job is
 * simply to stop. Making this a three-way answer would put a union type through
 * every call site to describe a branch only one of them has.
 */
export function pickItem(app: App, escape?: Escape): Promise<ApiItem | null> {
	return new Promise((resolve) => new ItemPicker(app, resolve, escape).open());
}
