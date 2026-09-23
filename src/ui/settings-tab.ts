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
	 * The status tag as it stood when this tab opened, which is the namespace
	 * the plugin has actually been writing under. A change is retired against
	 * this rather than against the value one keystroke earlier; see
	 * `retireStatusTag` for what that used to cost.
	 */
	private tagsAtOpen: Pick<Settings, 'statusTag' | 'retiredStatusTags'> | null = null;

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
		this.tagsAtOpen = null;
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
		// Against the namespace in force when the tab opened, because the tags
		// already written under it are the ones a later decision has to take back
		// out, and it is the only namespace anything was written under.
		if (key === 'statusTag') {
			this.plugin.settings.retiredStatusTags = retireStatusTag(this.tagsAtOpen ?? this.plugin.settings, String(value));
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

		return ` ${found} of your ${total} papers already use it: renaming it leaves those behind, and gives each a second heading when it next needs one.`;
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
		const { statusTag, retiredStatusTags } = this.plugin.settings;
		this.tagsAtOpen ??= { statusTag, retiredStatusTags: [...retiredStatusTags] };
		return [
			{
				type: 'group',
				heading: 'Zotero',
				items: [
					{
						name: 'Papers from',
						desc:
							'Which part of your Zotero library reaches the queue. A collection is right when your Zotero holds more than this thesis: nothing is copied either way, and papers outside it that already have a note keep working.' +
							this.scopeStatus(),
						control: { type: 'dropdown', key: 'collection', options: this.scopeOptions() },
					},
					{
						name: 'Triage before reading',
						desc:
							'Off, so a paper you save to Zotero arrives already queued to read. Turn it on if Zotero is where you put things you have not decided about, and each one comes up first with its abstract: drop it and say why, queue it, or mark it already read.',
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
							'Mirror each paper’s reading status into a tag, for browsing by tag rather than by folder. "status" gives status/queued and status/dropped, empty writes none, and the frontmatter stays the real value either way.' +
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
						desc: 'The frontmatter property naming the Zotero item, and what makes a note a paper. Set it once before you start, pointed at whatever your existing literature notes use: changing it later leaves every note made under the old name unrecognised.',
						control: { type: 'text', key: 'keyField' },
					},
					{
						name: 'Show reading status on papers',
						desc:
							'Shows a paper’s state in the title bar while you edit and at the top of the note in reading view, and opens the chooser when you click it. Turn it off if you keep the properties panel open, where it is the same word twice.',
						control: { type: 'toggle', key: 'statusPill' },
					},
					{
						name: 'Quieter notifications',
						desc:
							'Stops Paper Trail saying what you can already see: where a decision put a paper, that a pass is finished, that the pile is empty. Failures are always shown.',
						control: { type: 'toggle', key: 'quietNotices' },
					},
					{
						name: 'Claim heading',
						desc: `What the second pass is written under. The heading is written in when a paper comes to owe a claim, so one you drop never carries an empty section.${this.headingStatus(this.plugin.settings.claimHeading)}`,
						control: { type: 'text', key: 'claimHeading' },
					},
					{
						name: 'Assessment heading',
						desc: `What the third pass is written under, and only papers you promote are asked for one. It arrives the same way, below the claim, when the claim is ticked off.${this.headingStatus(this.plugin.settings.assessmentHeading)}`,
						control: { type: 'text', key: 'assessmentHeading' },
					},
					{
						name: 'Claim prompt',
						desc: 'Shown faintly on the empty line under the Claim heading, and gone as soon as you start writing. Leave it empty once you no longer need asking.',
						control: { type: 'textarea', key: 'claimPrompt', rows: 3, placeholder: 'Empty: nothing is shown.' },
					},
					{
						name: 'Assessment prompt',
						desc: 'The same, under the Assessment heading. Nothing is written into the note either way.',
						control: { type: 'textarea', key: 'assessmentPrompt', rows: 3, placeholder: 'Empty: nothing is shown.' },
					},
				],
			},
		];
	}
}
