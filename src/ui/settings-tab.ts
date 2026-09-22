import { PluginSettingTab, type App, type SettingDefinitionItem } from 'obsidian';
import { parseValues } from '../core/vocabulary';
import { collectionPaths } from '../core/collections';
import { DEFAULT_SETTINGS, loadSettings } from '../core/settings';
import { collections, forgetLibrary, refreshCollections } from '../library';
import { lastContact } from '../source';
import { decorate } from './view-actions';
import type PaperTrail from '../main';
import type { Settings } from '../core/settings';

type Key = keyof Settings;

/** What the scope control offers when nothing is chosen, which is the default. */
const WHOLE_LIBRARY = 'Whole library';

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: PaperTrail,
	) {
		super(app, plugin);
	}

	getControlValue(key: string): unknown {
		if (key === 'domains') return this.plugin.settings.domains.join(', ');
		return this.plugin.settings[key as Key];
	}

	/** Whether Zotero has been asked for its collections since this tab opened. */
	private asked = false;

	/**
	 * Read the collection list, then draw the tab again with it in.
	 *
	 * The scope control is the one thing here whose options come from another
	 * program, and `getSettingDefinitions` is synchronous, so the tab opens with
	 * whatever was cached and fills in a moment later. That is the right way
	 * round: a tab that waited on Zotero would open blank for everyone who does
	 * not have it running, over the one setting they are least likely to be
	 * changing.
	 *
	 * Driven from `getSettingDefinitions` rather than from `display`, which
	 * Obsidian does not call at all once a tab renders declaratively. The flag
	 * is what keeps `update` from asking again and redrawing forever.
	 */
	private askZotero(): void {
		if (this.asked) return;
		this.asked = true;
		void refreshCollections().then(() => this.update());
	}

	/** Closing the tab is what makes the next opening ask again. */
	hide(): void {
		this.asked = false;
		super.hide();
	}

	/**
	 * Write a value back, then put the whole thing through the loader.
	 *
	 * Most controls here are text boxes, and what someone types is untrimmed.
	 * `loadSettings` already knows how to coerce and check all of that, and
	 * running the result through it is what keeps the writer and the loader
	 * from disagreeing: without it a folder typed with a trailing space is
	 * stored verbatim, and the folder the plugin writes to is not the one the
	 * settings appear to name.
	 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'domains') this.plugin.settings.domains = parseValues(value, DEFAULT_SETTINGS.domains);
		else (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;

		this.plugin.settings = loadSettings(this.plugin.settings);

		// Another collection means another set of items, so what is cached is the
		// wrong set rather than a stale one.
		if (key === 'collection') forgetLibrary();

		await this.plugin.saveSettings();

		// The title bar is drawn from workspace events, and changing a setting is
		// not one of them. Without this, turning the status pill on does nothing
		// you can see until you happen to switch tabs, which reads as a dead
		// switch. Rendered views pick it up on their next render.
		decorate(this.plugin);
	}

	/**
	 * Every collection, plus the whole library, plus whatever is stored if it is
	 * neither.
	 *
	 * That last case is the one worth the code. A dropdown silently shows its
	 * first option when the stored value is not among them, so a collection
	 * deleted in Zotero would make this tab claim the scope is something it is
	 * not, and the next thing you changed would save that claim. Keeping the
	 * stored key as an option, named as missing, is what stops the display of a
	 * problem from becoming the problem.
	 */
	private scopeOptions(): Record<string, string> {
		const options: Record<string, string> = { '': WHOLE_LIBRARY };
		for (const { key, path } of collectionPaths(collections())) options[key] = path;

		const chosen = this.plugin.settings.collection;
		if (chosen !== '' && !(chosen in options)) options[chosen] = `${chosen} (not in Zotero)`;
		return options;
	}

	/** What the scope is actually doing, in the same voice the heading checks use. */
	private scopeStatus(): string {
		const chosen = this.plugin.settings.collection;
		const contact = lastContact();

		if (contact !== null && !contact.reachable) return ` ${contact.reason}`;
		if (chosen === '') return '';
		if (collections().some((entry) => entry.key === chosen)) return '';
		// Said here as well as in the queue, because this is where it is fixed.
		return ' ⚠ Zotero has no collection with this key, so no papers are reaching the queue. Pick another, or clear it for the whole library.';
	}

	/**
	 * The two heading settings are the ones that break silently. A stage ends
	 * when its heading has something under it, so a heading no paper has is a
	 * stage no paper ever leaves, and nothing anywhere says why.
	 *
	 * The plugin writes the template, but not the notes made before the setting
	 * was changed, and not a note whose headings someone edited by hand. So the
	 * check is against the papers that actually exist rather than against the
	 * template, which would always agree with itself.
	 */
	private headingStatus(setting: string, stage: string): string {
		const heading = setting.trim().toLowerCase();
		const keyField = this.plugin.settings.keyField;

		const papers = this.app.vault
			.getMarkdownFiles()
			.map((file) => this.app.metadataCache.getFileCache(file))
			.filter((cache) => typeof cache?.frontmatter?.[keyField] === 'string');

		if (papers.length === 0) return '';

		const found = papers.filter((cache) =>
			(cache?.headings ?? []).some((entry) => entry.heading.trim().toLowerCase() === heading),
		).length;

		if (found === papers.length) return ` Found in all ${papers.length} papers.`;
		if (found === 0) return ` ⚠ No paper has this heading, so nothing will ever leave ${stage}.`;
		return ` ⚠ Found in only ${found} of ${papers.length} papers.`;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		this.askZotero();
		return [
			{
				type: 'group',
				heading: 'Zotero',
				items: [
					{
						name: 'Papers from',
						desc:
							'Which part of your Zotero library reaches the queue. The whole library is right when it is the corpus for this vault, and a collection is right when it is not: a Zotero carried through a masters and two side projects is several corpora, and only one of them is this thesis.' +
							' Nothing is copied either way. Papers outside the collection that already have a note keep working, so this narrows what arrives rather than what counts as a paper.' +
							this.scopeStatus(),
						control: { type: 'dropdown', key: 'collection', options: this.scopeOptions() },
					},
					{
						name: 'Triage before reading',
						desc:
							'Off, so a paper you save to Zotero arrives already queued to read. Turn this on if Zotero is where you collect things you have not decided about yet, and the queue will ask first: drop it and say why, queue it, or mark it already read.' +
							' Leave it off if you read the abstract in the browser and only save what you want, because then the deciding has happened and Zotero’s save button was the answer.' +
							' Either way Triage still exists, and still holds any paper you send back to it.',
						control: { type: 'toggle', key: 'triage' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Vault',
				items: [
					{
						name: 'Template folder',
						desc: 'Where Paper.md lives. It is written here the first time a paper note is made, and your edits to it are kept from then on.',
						control: { type: 'text', key: 'templateFolder' },
					},
					{
						name: 'Domains',
						desc: 'The contexts you separate your notes by, comma separated. The question this axis answers is whether a note can end up in the thesis, so lead with the one that can.',
						control: { type: 'text', key: 'domains' },
					},
					{
						name: 'Papers folder',
						desc: 'One note per paper, named for its citation key. Flat: the record is in the frontmatter, not in the filing.',
						control: { type: 'text', key: 'papersFolder' },
					},
					{
						name: 'Status tag',
						desc: 'Mirror each paper’s reading status into a tag, for browsing by tag rather than by folder. "status" gives status/queued, status/dropped and so on. Empty writes no tags. The frontmatter stays the real value either way, so this changes nothing except what a tag explorer can see.',
						control: { type: 'text', key: 'statusTag' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Papers',
				items: [
					{
						name: 'Item key property',
						desc: 'The frontmatter property naming the Zotero item. A note that has it is a paper. Set this once, before you start: point it at the property your existing literature notes already use and they are recognised, but changing it later leaves every note made under the old name unrecognised.',
						control: { type: 'text', key: 'keyField' },
					},
					{
						name: 'Show reading status on papers',
						desc:
							'Puts a paper’s state where you are reading it, and opens the chooser when you click it: in the title bar while you edit, and at the top of the note itself in reading view, embeds and hover previews.' +
							' On, for anyone who keeps the properties panel shut and would otherwise have nowhere to see it while actually reading the paper.' +
							' Turn it off if you keep properties open, where it is the same word twice. It changes nothing that is written either way: the frontmatter is the record.',
						control: { type: 'toggle', key: 'statusPill' },
					},
					{
						name: 'Claim heading',
						desc: `The second pass ends here. A paper leaves Reading once this heading has something under it, so it must match your literature template.${this.headingStatus(this.plugin.settings.claimHeading, 'Reading')}`,
						control: { type: 'text', key: 'claimHeading' },
					},
					{
						name: 'Assessment heading',
						desc: `The third pass ends here, and only papers you promote to it are asked for one.${this.headingStatus(this.plugin.settings.assessmentHeading, 'Assessment')}`,
						control: { type: 'text', key: 'assessmentHeading' },
					},
				],
			},
		];
	}
}
