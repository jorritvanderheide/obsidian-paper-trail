// Pick an item from your Zotero library, to cite it.
//
// It opens on what you added most recently rather than on an empty list,
// because the paper you are writing about is often one you saved not long ago,
// and an empty box asks you to remember a title before it will show you
// anything.
import { SuggestModal, type App } from 'obsidian';
import { authorNames, isPaperItem, itemYear, newestFirst, type ApiItem } from '../core/zotero';
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

/** What was picked, and whether Tab asked to add a page to it. */
export interface Picked {
	item: ApiItem;
	withPage: boolean;
}

class ItemPicker extends SuggestModal<ApiItem> {
	private result: ApiItem | null = null;
	private withPage = false;
	private recent: ApiItem[] | null = null;
	/** How many suggestions the last search gave, so Tab with none chooses nothing. */
	private shown = 0;

	constructor(
		app: App,
		/** Your own library and the groups to search as well, as null and group ids. */
		private readonly libraries: (number | null)[],
		private readonly done: (picked: Picked | null) => void,
		escape?: Escape,
	) {
		super(app);
		this.setPlaceholder('Search your Zotero library, or pick one you added recently');
		this.emptyStateText = 'Nothing in your Zotero library yet.';

		// Tab rather than a second list or a field under this one: picking the
		// paper is the same move either way, and a page is one key more.
		// Nothing listed yet, a search still out, is nothing to choose: marking
		// the picker would make the next Enter ask for a page too.
		this.scope.register([], 'Tab', (event) => {
			if (this.shown === 0) return false;
			this.withPage = true;
			this.selectActiveSuggestion(event);
			return false;
		});

		this.setInstructions([
			{ command: '↵', purpose: 'insert' },
			{ command: 'tab', purpose: 'insert with a page' },
			...(escape ? [{ command: '⇧↵', purpose: escape.purpose }] : []),
		]);

		if (escape) {
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
			const items = searching ? (await this.everywhere((group) => searchItems(text, group))).flat() : await this.recentlyAdded();
			this.emptyStateText = searching ? 'Nothing matches.' : 'Nothing in your Zotero library yet.';
			const papers = items.filter(isPaperItem);
			this.shown = papers.length;
			return papers;
		} catch (error) {
			// The modal is the only surface here, so the reason belongs in it.
			this.emptyStateText = messageOf(error);
			this.shown = 0;
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
		this.recent ??= newestFirst(await this.everywhere((group) => recentItems(RECENT, group)), RECENT);
		return this.recent;
	}

	/**
	 * Ask every library, and settle for the ones that answer. A group you have
	 * left answers with an error, and that is no reason to find nothing in your
	 * own library; only all of them failing is worth saying.
	 */
	private async everywhere(ask: (group: number | null) => Promise<ApiItem[]>): Promise<ApiItem[][]> {
		const results = await Promise.allSettled(this.libraries.map(ask));
		const answered = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
		if (answered.length === 0 && results[0]?.status === 'rejected') throw results[0].reason;
		return answered;
	}

	renderSuggestion(item: ApiItem, el: HTMLElement): void {
		el.createDiv({ text: item.data.title || item.key });

		// The citation key earns its place on the line: it is what the note will
		// be called and what a citation inserts, so seeing it is how you know
		// you picked the right one of two papers with the same first author.
		// And the group, for a paper that is in one, since the same paper can be
		// in your library and the lab's.
		const group = item.library?.type === 'group' ? item.library.name : undefined;
		const byline = [authorNames(item).join(', '), itemYear(item), item.data.citationKey?.trim(), group].filter(Boolean).join(' · ');
		if (byline) el.createEl('small', { cls: 'paper-trail-picker-byline', text: byline });
	}

	// Records only. SuggestModal does not guarantee this runs before close().
	onChooseSuggestion(item: ApiItem): void {
		this.result = item;
	}

	// Read inside the timeout, not before it: onChooseSuggestion can run after
	// close(), and reading here would report a choice as nothing picked.
	onClose(): void {
		window.setTimeout(() => this.done(this.result ? { item: this.result, withPage: this.withPage } : null), 0);
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
export function pickItem(app: App, libraries: (number | null)[], escape?: Escape): Promise<Picked | null> {
	return new Promise((resolve) => new ItemPicker(app, libraries, resolve, escape).open());
}
