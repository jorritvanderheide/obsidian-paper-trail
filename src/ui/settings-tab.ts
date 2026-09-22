import { PluginSettingTab, type App, type SettingDefinitionItem } from 'obsidian';
import { headingCoverage } from '../core/stages';
import { collectionPaths } from '../core/collections';
import { loadSettings, retireStatusTag } from '../core/settings';
import { readTags, retiredTagCount } from '../core/triage';
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
		// Worked out before the new value lands, because it is the old namespace
		// it needs: the tags already written under it are the ones a later
		// decision has to take back out.
		if (key === 'statusTag') {
			this.plugin.settings.retiredStatusTags = retireStatusTag(this.plugin.settings, String(value));
		}

		(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
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
	 * How many papers already carry this heading.
	 *
	 * Not a warning any more. A paper without the heading is the ordinary case:
	 * notes are made without either, and the heading is written in the first
	 * time you go to write under it. What the number is still worth saying is
	 * the one hazard left, which is renaming this after papers exist. The old
	 * heading is not found, so a second one is written above it, and the note
	 * ends up with both.
	 */
	private headingStatus(setting: string): string {
		const keyField = this.plugin.settings.keyField;

		const papers = this.app.vault
			.getMarkdownFiles()
			.map((file) => this.app.metadataCache.getFileCache(file))
			.filter((cache) => typeof cache?.frontmatter?.[keyField] === 'string');

		const { found, total } = headingCoverage(papers, setting);
		if (total === 0 || found === 0) return '';

		return ` ${found} of your ${total} papers already use it; renaming it now would leave those behind and write a second heading above them.`;
	}

	/**
	 * What the vault still carries from a namespace that has been changed.
	 *
	 * A paper sheds the old tag on its next decision, and a paper you settled
	 * two years ago will not get one, so this says how many are left rather than
	 * letting the rename look complete. The same voice as the heading and scope
	 * checks, for the same reason: a setting that disagrees with the vault should
	 * say so where it is fixed.
	 */
	private statusTagStatus(): string {
		const { keyField, retiredStatusTags } = this.plugin.settings;
		if (retiredStatusTags.length === 0) return '';

		const papers = this.app.vault
			.getMarkdownFiles()
			.map((file) => this.app.metadataCache.getFileCache(file)?.frontmatter)
			.filter((frontmatter) => typeof frontmatter?.[keyField] === 'string')
			.map((frontmatter) => readTags(frontmatter?.tags));

		const left = retiredTagCount(papers, retiredStatusTags);
		if (left === 0) return '';

		const names = retiredStatusTags.map((namespace) => `${namespace}/`).join(', ');
		return ` ⚠ ${left} ${left === 1 ? 'paper' : 'papers'} still ${left === 1 ? 'carries' : 'carry'} ${names}. Each one sheds it the next time you decide anything about that paper.`;
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
						name: 'Papers folder',
						desc: 'One note per paper, named for its citation key. Flat: the record is in the frontmatter, not in the filing.',
						control: { type: 'text', key: 'papersFolder' },
					},
					{
						name: 'Status tag',
						desc:
							'Mirror each paper’s reading status into a tag, for browsing by tag rather than by folder. "status" gives status/queued, status/dropped and so on. Empty writes no tags. The frontmatter stays the real value either way, so this changes nothing except what a tag explorer can see.' +
							this.statusTagStatus(),
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
						name: 'Quieter notifications',
						desc:
							'Stops Paper Trail saying what you can already see: where a decision put a paper, that a pass is finished, that the pile is empty. Each of those follows something you pressed, and the queue has already moved to show it.' +
							' Failures are always shown, and so is the question asked when you land at a heading, which is what tells you what goes there.',
						control: { type: 'toggle', key: 'quietNotices' },
					},
					{
						name: 'Claim heading',
						desc: `What the second pass is written under. A paper is made without it: the heading is written in above the highlights at the moment the paper comes to owe a claim, so a paper you drop never carries an empty one. What ends the pass is the tick beside the button, not what you type here.${this.headingStatus(this.plugin.settings.claimHeading)}`,
						control: { type: 'text', key: 'claimHeading' },
					},
					{
						name: 'Assessment heading',
						desc: `What the third pass is written under, and only papers you promote are asked for one. Written in the same way as the claim, below it, when the claim is ticked off, and ended by the tick beside the button.${this.headingStatus(this.plugin.settings.assessmentHeading)}`,
						control: { type: 'text', key: 'assessmentHeading' },
					},
				],
			},
		];
	}
}
