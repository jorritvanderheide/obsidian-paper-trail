import { PluginSettingTab, type App, type SettingDefinitionItem } from 'obsidian';
import { ROLES, parseValues } from '../core/vocabulary';
import { DEFAULT_SETTINGS, loadSettings } from '../core/settings';
import { forgetLibrary } from '../library';
import type PaperTrail from '../main';
import type { Settings } from '../core/settings';

type Key = keyof Settings;

/**
 * The tag this field actually writes.
 *
 * These three are named for the part they play rather than for the word they
 * write, which is right for a setting and left a gap: someone who saw
 * `type/living` on a note had no way to work out that the field controlling it
 * is called "Kept open". Saying both closes it, and it shows the current value
 * rather than the shipped one, so a renamed axis explains itself.
 */
function writtenAs(value: string): string {
	return `Written as type/${value}.`;
}

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: PaperTrail,
	) {
		super(app, plugin);
	}

	getControlValue(key: string): unknown {
		if (key === 'domains') return this.plugin.settings.domains.join(', ');
		const role = ROLES.find((entry) => key === `type.${entry}`);
		if (role) return this.plugin.settings.types[role];
		return this.plugin.settings[key as Key];
	}

	/**
	 * Write a value back, then put the whole thing through the loader.
	 *
	 * Every control here is a text box, so what arrives is a string even for
	 * the port, and what someone types is untrimmed. `loadSettings` already
	 * knows how to coerce and check all of that, and running the result through
	 * it is what keeps the writer and the loader from disagreeing: without it a
	 * typo in the port is stored verbatim and every Zotero request goes to a
	 * malformed URL, reported as "could not reach Zotero".
	 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		const role = ROLES.find((entry) => key === `type.${entry}`);
		if (key === 'domains') this.plugin.settings.domains = parseValues(value, DEFAULT_SETTINGS.domains);
		else if (role) this.plugin.settings.types[role] = parseValues(value, [DEFAULT_SETTINGS.types[role]])[0] ?? DEFAULT_SETTINGS.types[role];
		else (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;

		this.plugin.settings = loadSettings(this.plugin.settings);

		// The library was read from whatever Zotero was at the old address.
		if (key === 'apiPort' || key === 'dataDir') forgetLibrary();

		await this.plugin.saveSettings();
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
		return [
			{
				type: 'group',
				heading: 'Zotero',
				items: [
					{
						name: 'Data directory',
						desc: 'Where Zotero keeps its storage folder. Empty means the directory Zotero itself is set to.',
						control: { type: 'text', key: 'dataDir' },
					},
					{
						name: 'Local API port',
						desc: '23119 unless you changed it in Zotero. The API needs "Allow other applications on this computer to communicate with Zotero" in Settings > Advanced.',
						control: { type: 'text', key: 'apiPort' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Vault',
				items: [
					{
						name: 'Notes folder',
						desc: 'Where your own notes go. Flat: a title cannot contain a slash.',
						control: { type: 'text', key: 'notesFolder' },
					},
					{
						name: 'Template folder',
						desc: 'Note templates. Missing ones are written here the first time you pick them, and your edits to them are kept.',
						control: { type: 'text', key: 'templateFolder' },
					},
					{
						name: 'Domains',
						desc: 'The contexts you separate your notes by, comma separated. The question this axis answers is whether a note can end up in the thesis, so lead with the one that can.',
						control: { type: 'text', key: 'domains' },
					},
					{
						name: 'Papers folder',
						desc: 'One note per paper, named for its citation key. Flat, like the notes folder.',
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
				heading: 'Editing status',
				items: [
					{
						name: 'Waiting to be filed',
						desc: `A note starts here and appears under File until it is given a domain. ${writtenAs(this.plugin.settings.types.inbox)}`,
						control: { type: 'text', key: 'type.inbox' },
					},
					{
						name: 'Filed',
						desc: `Where the loop ends. Nothing asks about the note again. ${writtenAs(this.plugin.settings.types.filed)}`,
						control: { type: 'text', key: 'type.filed' },
					},
					{
						name: 'Kept open',
						desc: `A note you keep adding to rather than finishing. Skips the loop entirely. ${writtenAs(this.plugin.settings.types.living)}`,
						control: { type: 'text', key: 'type.living' },
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
						name: 'Claim heading',
						desc: `The second pass ends here. A paper leaves Write up once this heading has something under it, so it must match your literature template.${this.headingStatus(this.plugin.settings.claimHeading, 'Write up')}`,
						control: { type: 'text', key: 'claimHeading' },
					},
					{
						name: 'Assessment heading',
						desc: `The third pass ends here, and only papers you promote to one are asked for it.${this.headingStatus(this.plugin.settings.assessmentHeading, 'Third pass')}`,
						control: { type: 'text', key: 'assessmentHeading' },
					},
				],
			},
		];
	}
}
