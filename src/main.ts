import { debounce, Notice, Plugin } from 'obsidian';
import { createFromTemplate } from './commands/notes';
import { next } from './commands/workflow';
import { insertCitation } from './commands/citations';
import { refreshPaper, syncOnOpen } from './commands/papers';
import { findOrphans } from './commands/orphans';
import { writeReport } from './commands/record';
import { setReading } from './commands/reading';
import { insertBlock, welcome } from './commands/setup';
import { retag } from './commands/tags';
import { loadSettings, type Settings } from './core/settings';
import { PASS_ONE_VIEW, PassOneView } from './ui/pass-one-view';
import { SettingsTab } from './ui/settings-tab';
import { WORKFLOW_BLOCK, WorkflowBlock } from './ui/workflow-block';
import { openQueue, QUEUE_VIEW, QueueView } from './ui/queue';
import { decorate, undecorate } from './ui/view-actions';

export default class PaperTrail extends Plugin {
	settings!: Settings;

	async onload() {
		// No saved data means this is the first load after installing. Saving it
		// immediately is what makes the welcome show once rather than every time.
		const saved: unknown = await this.loadData();
		this.settings = loadSettings(saved);
		if (saved === null) await this.saveSettings();

		this.addSettingTab(new SettingsTab(this.app, this));

		// Opening a paper is what refreshes it, so that the common case needs no
		// command and cannot be forgotten. It writes only when Zotero actually
		// has something different, and says nothing when Zotero is not there.
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file) void syncOnOpen(this, file);
				this.decorate();
			}),
		);
		// A note that is already open does not fire file-open again, which is
		// exactly when you want the button: you annotated in Zotero and came
		// back to the tab you left. `layout-change` also covers the editing and
		// reading toggle, which rebuilds the button away.
		this.registerEvent(this.app.workspace.on('layout-change', () => this.decorate()));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.decorate()));
		// Whether a note is a paper is read from the metadata cache, and a note
		// that has just been created is not in it yet: a note written by a triage
		// decision opened with its buttons hidden until you switched tabs and
		// back. This is the cache catching up, which is when the answer changes.
		this.registerEvent(this.app.metadataCache.on('changed', () => this.decorate()));
		this.app.workspace.onLayoutReady(() => this.decorate());
		this.registerView(PASS_ONE_VIEW, (leaf) => new PassOneView(leaf));
		this.registerView(QUEUE_VIEW, (leaf) => new QueueView(leaf, this));
		this.addRibbonIcon('stamp', 'Open queue', () => void openQueue(this.app));
		this.registerMarkdownCodeBlockProcessor(WORKFLOW_BLOCK, (_source, el, ctx) => {
			ctx.addChild(new WorkflowBlock(el, this));
		});

		this.command('open-queue', 'Open queue', () => openQueue(this.app));
		this.command('insert-block', 'Insert queue block', () => insertBlock(this));
		this.command('next', 'Next', () => next(this));
		this.command('refresh-paper', 'Refresh paper from Zotero', () => refreshPaper(this));
		this.command('add-note', 'Add note', () => createFromTemplate(this));
		this.command('retag', 'Retag note', () => retag(this));
		this.command('excluded', 'Export excluded papers', () => writeReport(this));
		this.command('find-orphans', 'Find tags nothing recognises', () => Promise.resolve(findOrphans(this)));
		this.command('set-reading', 'Set reading status', () => setReading(this));
		this.command('insert-citation', 'Insert citation', () => insertCitation(this));

		if (saved === null) this.app.workspace.onLayoutReady(() => welcome(this, this.manifest.name));
	}

	onunload() {
		this.unloaded = true;
		undecorate(this.app);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private unloaded = false;

	/**
	 * Deferred, and coalesced.
	 *
	 * Deferred because toggling between editing and reading rebuilds a markdown
	 * view's actions, and `layout-change` fires before that happens: decorating
	 * on the spot adds the button to a header Obsidian is about to clear, which
	 * is why it would otherwise survive one mode and not the other.
	 *
	 * Coalesced because opening a note fires three of these events in a row and
	 * only the last one is looking at the finished workspace.
	 */
	private readonly decorate = debounce(() => {
		if (this.unloaded) return;
		decorate(this);
	}, 20, true);

	/**
	 * Every command failure becomes a notice. An unhandled rejection here is
	 * swallowed, which makes a command that threw look identical to one that
	 * quietly decided to do nothing: the worst possible thing to debug.
	 */
	private command(id: string, name: string, run: () => Promise<void>) {
		this.addCommand({
			id,
			name,
			callback: () => {
				run().catch((error: unknown) => {
					console.error(`paper-trail:${id}`, error);
					new Notice(error instanceof Error ? error.message : String(error));
				});
			},
		});
	}
}
