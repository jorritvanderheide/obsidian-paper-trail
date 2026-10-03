import { PluginSettingTab, type App, type SettingDefinition, type SettingDefinitionItem } from 'obsidian';
import { headingCoverage, works } from '../core/stages';
import { sourceChoices, sourceLabel, type LibraryChoice, type Source } from '../core/sources';
import { loadSettings, retireStatusTag, workflowOf } from '../core/settings';
import { readTags, retiredTagCount, type Passes } from '../core/triage';
import { collections, refreshCollections, refreshLibrary } from '../library';
import { suggest } from './prompt';
import { lastContact, probeBetterBibtex } from '../source';
import { connectionStatus, type BetterBibtex } from '../core/connection';
import { decorate } from './view-actions';
import { settingsChanged } from '../context';
import type PaperTrail from '../main';
import type { Settings } from '../core/settings';

type Key = keyof Settings;

/** The written passes, in the order the dropdown offers them: the default first. */
const PASS_OPTIONS: Record<Passes, string> = {
	both: 'Claim and assessment',
	claim: 'Claim only',
	none: 'None',
};

/** What your own library is called in the source list, as Zotero calls it. */
const MY_LIBRARY = 'My library';

/** The control key for one source's triage switch, which is not a settings key. */
const TRIAGE_KEY = /^source-triage-(\d+)$/;

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: PaperTrail,
	) {
		super(app, plugin);
	}

	getControlValue(key: string): unknown {
		const triage = TRIAGE_KEY.exec(key);
		if (triage) return this.plugin.settings.sources[Number(triage[1])]?.triage ?? false;
		return this.plugin.settings[key as Key];
	}

	/** Whether Zotero has been asked for its collections since this tab opened. */
	private asked = false;

	/** Whether that answer is in, so a collection not yet listed is not called missing. */
	private loaded = false;

	/** What Better BibTeX said the last time this tab asked. */
	private betterBibtex: BetterBibtex = null;

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
	 * The source list is the one thing here whose names come from another
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
		// The collection request is also what tells the Connection row whether
		// Zotero is there, so the two are asked together and drawn once.
		void Promise.all([
			refreshCollections(),
			probeBetterBibtex().then((answer) => {
				this.betterBibtex = answer;
			}),
		]).then(() => {
			this.loaded = true;
			this.update();
		});
	}

	/** Closing the tab is what makes the next opening ask again. */
	hide(): void {
		this.asked = false;
		this.loaded = false;
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
		const triage = TRIAGE_KEY.exec(key);
		if (triage) {
			const index = Number(triage[1]);
			await this.saveSources(this.plugin.settings.sources.map((source, n) => (n === index ? { ...source, triage: value === true } : source)));
			return;
		}

		// Against the namespace in force when the tab opened, because the tags
		// already written under it are the ones a later decision has to take back
		// out, and it is the only namespace anything was written under.
		if (key === 'statusTag') {
			this.plugin.settings.retiredStatusTags = retireStatusTag(this.tagsAtOpen ?? this.plugin.settings, String(value));
		}

		(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		this.plugin.settings = loadSettings(this.plugin.settings);

		await this.plugin.saveSettings();
		settingsChanged(this.app);

		// The heading and prompt fields for a pass that is switched off go with it.
		if (key === 'passes') this.update();

		// The title bar is drawn from workspace events, and changing a setting is
		// not one of them. Without this, turning the status pill on does nothing
		// you can see until you happen to switch tabs, which reads as a dead
		// switch. Rendered views pick it up on their next render.
		decorate(this.plugin);
	}

	/**
	 * Save a new list of sources, and read whatever it now needs.
	 *
	 * Nothing cached is thrown away: libraries are held whole, and which papers
	 * a source brings in is worked out from them on every draw. A library or a
	 * collection list not read yet is asked for at once, so the queue fills
	 * rather than waiting for you to come back to Obsidian.
	 */
	private async saveSources(sources: Source[]): Promise<void> {
		this.plugin.settings.sources = sources;
		this.plugin.settings = loadSettings(this.plugin.settings);
		await this.plugin.saveSettings();
		settingsChanged(this.app);
		void refreshLibrary(this.plugin.settings.sources);
		this.update();
	}

	/** The libraries the picker knows about. */
	private libraries(): LibraryChoice[] {
		return [{ group: null, name: MY_LIBRARY, collections: collections(null) }];
	}

	/** Offer everything not already chosen, and add what is picked. */
	private async addSource(): Promise<void> {
		const chosen = this.plugin.settings.sources;
		const picked = await suggest(
			this.app,
			sourceChoices(this.libraries(), chosen),
			(choice) => choice.label,
			'A library or a collection to take papers from',
		);
		if (picked) await this.saveSources([...chosen, picked.source]);
	}

	/**
	 * One row per source, with its triage switch.
	 *
	 * A collection Zotero no longer has keeps its row, named as missing, rather
	 * than disappearing: the row is where it is fixed, and a source that
	 * vanished from the list would look like a setting that did not save.
	 */
	private sourceRows(): SettingDefinition[] {
		const libraries = this.libraries();
		return this.plugin.settings.sources.map((source, index) => {
			const label = sourceLabel(source, libraries);
			const missing = label === null && this.loaded;
			return {
				name: label ?? `${MY_LIBRARY} / ${source.collection}${missing ? ' (not in Zotero)' : ''}`,
				desc: missing
					? "⚠ Zotero doesn't have this collection anymore, so no papers come from it. Delete it here, or add the one you meant."
					: source.triage
						? "Papers from here that you haven't decided about yet go to Triage first."
						: "Papers from here go straight to Reading. Turn this on if other people add papers here, like a lab's reading list, so they go to Triage first.",
				control: { type: 'toggle', key: `source-triage-${index}` },
			};
		});
	}

	/**
	 * How many papers already carry this heading.
	 *
	 * Not a warning about the papers without it, which are the ordinary case:
	 * notes are made with neither heading, and each is written in when a paper
	 * comes to owe it. What the number is worth saying for is renaming this after
	 * papers exist. The old heading is not found any more, so a paper that needs
	 * the section again gets a second heading, and the note ends up with both.
	 */
	private headingStatus(setting: string): string {
		const keyField = this.plugin.settings.keyField;

		const papers = this.app.vault
			.getMarkdownFiles()
			.map((file) => this.app.metadataCache.getFileCache(file))
			.filter((cache) => typeof cache?.frontmatter?.[keyField] === 'string');

		const { found, total } = headingCoverage(papers, setting);
		if (total === 0 || found === 0) return '';

		return ` ${found} of your ${total} papers already use it. If you rename it, those notes keep the old heading, and get a second one when they need the section again.`;
	}

	/**
	 * What the vault still carries from a namespace that has been changed.
	 *
	 * A paper sheds the old tag on its next decision, and a paper you settled
	 * two years ago will not get one, so this says how many are left rather than
	 * letting the rename look complete. The same voice as the heading and source
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
		return ` ⚠ ${left} ${left === 1 ? 'paper' : 'papers'} still ${left === 1 ? 'has' : 'have'} a ${names} tag. Each one loses it the next time you make a decision about that paper.`;
	}

	/**
	 * Whether a pass is written, so its heading and prompt are worth showing.
	 * The values are kept either way, and still used for a paper promoted before
	 * assessments were switched off.
	 */
	private writes(pass: 'claim' | 'assessment'): boolean {
		return works(pass, workflowOf(this.plugin.settings));
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
						name: 'Connection',
						desc: connectionStatus(lastContact(), this.betterBibtex),
						render: (setting) => {
							setting.addExtraButton((button) =>
								button
									.setIcon('refresh-cw')
									.setTooltip('Check again')
									.onClick(() => {
										this.asked = false;
										this.askZotero();
									}),
							);
						},
					},
				],
			},
			{
				type: 'list',
				heading: 'Papers from',
				items: this.sourceRows(),
				emptyState: "Nothing here, so no papers come in from Zotero. Add your library, or a collection in it.",
				onReorder: (from, to) => {
					const sources = [...this.plugin.settings.sources];
					const [moved] = sources.splice(from, 1);
					if (moved) sources.splice(to, 0, moved);
					void this.saveSources(sources);
				},
				onDelete: (index) => void this.saveSources(this.plugin.settings.sources.filter((_, n) => n !== index)),
				addItem: { name: 'Add a library or collection', action: () => void this.addSource() },
			},
			{
				type: 'group',
				items: [
					{
						name: 'Include subcollections',
						desc: 'A collection above also brings in the papers in the collections under it, the way a thesis collection holds one per chapter. A paper in more than one source belongs to the first one in the list. Nothing is copied, and papers outside them that already have a note keep working.',
						control: { type: 'toggle', key: 'subcollections' },
					},
					{
						name: 'Include underlines',
						desc: "Show underlines in a paper's annotations, along with highlights and notes. Turn it off if you underline terms to find your way back to and highlight the passages worth keeping. An underline you've commented on still shows up.",
						control: { type: 'toggle', key: 'underlines' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Vault',
				items: [
					{
						name: 'Template folder',
						desc: "Where Paper.md lives. Paper Trail puts it here when it makes its first paper note, and after that it's yours to edit. {{title}} becomes the paper's title, and {{links}} its links to Zotero and the PDF.",
						control: { type: 'text', key: 'templateFolder' },
					},
					{
						name: 'Papers folder',
						desc: "Where the paper notes go, one note per paper, all in this one folder. What you decided about a paper is in its properties, so there's no need for subfolders.",
						control: { type: 'text', key: 'papersFolder' },
					},
					{
						name: 'Status tag',
						desc:
							'Also write each paper’s reading status as a tag, to browse your papers by tag instead of by folder. "status" gives status/queued, status/dropped and so on. Leave it empty for no tag. The properties stay the real record either way.' +
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
						desc: "The property that holds the Zotero item key, which is what makes a note a paper. If you already have literature notes, set this to the property they use before you start. If you change it later, notes with the old property aren't recognised anymore.",
						control: { type: 'text', key: 'keyField' },
					},
					{
						name: 'Show reading status on papers',
						desc:
							'Show a paper’s status in the title bar while you edit, and at the top of the note in reading view. Click it to change the status. Turn it off if you keep the properties panel open, where you’d see the same word twice.',
						control: { type: 'toggle', key: 'statusPill' },
					},
					{
						name: 'Quieter notifications',
						desc:
							"Only show failures and warnings. You won't be told where a decision put a paper, that a pass is finished, what a refresh found, or that there's nothing left to do.",
						control: { type: 'toggle', key: 'quietNotices' },
					},
					{
						name: 'Written passes',
						desc: "What you write after reading a paper. Claim and assessment: every paper you read gets a claim, and the ones you promote an assessment too. Claim only: there's no third pass. None: a paper is filed as read as soon as you've read it, for when you write by theme rather than by paper. Changing this doesn't change your notes: a paper you already promoted still needs its assessment, and read papers need a claim again if you switch claims back on.",
						control: { type: 'dropdown', key: 'passes', options: PASS_OPTIONS },
					},
					{
						name: 'Claim heading',
						desc: `The heading your claim goes under. It's only added to a note once the paper needs a claim, so a paper you drop never has an empty section.${this.headingStatus(this.plugin.settings.claimHeading)}`,
						control: { type: 'text', key: 'claimHeading' },
						visible: () => this.writes('claim'),
					},
					{
						name: 'Assessment heading',
						desc: `The heading your assessment goes under. Only papers you promote get one, and it's added below the claim when you tick the claim off.${this.headingStatus(this.plugin.settings.assessmentHeading)}`,
						control: { type: 'text', key: 'assessmentHeading' },
						visible: () => this.writes('assessment'),
					},
					{
						name: 'Claim prompt',
						desc: "The question shown faintly under an empty Claim heading. It disappears as soon as you start writing. Leave it empty once you don't need the reminder.",
						control: { type: 'textarea', key: 'claimPrompt', rows: 3, placeholder: 'Empty: no question is shown.' },
						visible: () => this.writes('claim'),
					},
					{
						name: 'Assessment prompt',
						desc: 'The same, under the Assessment heading. The question is never written into the note.',
						control: { type: 'textarea', key: 'assessmentPrompt', rows: 3, placeholder: 'Empty: no question is shown.' },
						visible: () => this.writes('assessment'),
					},
				],
			},
		];
	}
}
