// The triage pane: Keshav's whole first pass, in the order it gets expensive
// to skip. Abstract, introduction, outline, conclusion, and how much of the
// bibliography you already have.
//
// It draws in two steps rather than offering two depths. What Zotero already
// knows arrives first and settles most papers in about twenty seconds; the rest
// follows a moment later without being asked for. Gating that behind a button
// would confuse two costs: reading the outline is expensive and you decline it
// by not reading, while fetching it is a disk read and a scan that nobody
// should have to ask for.
//
// Not a reader either way: the point is to come out with an answer, and to
// write it down.
import { ItemView, Notice, setIcon, type WorkspaceLeaf } from 'obsidian';
import type { PassOne } from '../core/passOne';
import { landing, type Reading } from '../core/triage';
import { label } from '../core/vocabulary';
import type { Glance } from '../core/references';

export const PASS_ONE_VIEW = 'paper-trail-pass-one';

/** What Zotero hands over without anything being opened. */
export interface Brief {
	abstract: string | null;
	venue: string | null;
	year: number | null;
}

/** What reading the extracted text adds, once it has been asked for. */
export interface Full {
	result: PassOne;
	seen: Glance;
}

interface Loaded {
	title: string;
	brief: Brief;
	/** Why the brief is empty, said in the pane rather than in a notice that scrolls away. */
	problem: string | null;
}

export interface Handlers {
	/** Write the decision. False means the question behind it went unanswered. */
	decide(reading: Reading): Promise<boolean>;
	/** Read the extracted text. Throws what it cannot do, for the pane to show. */
	full(): Promise<Full>;
}

/**
 * What the first pass can end in. Keshav's own question is binary, read on or
 * do not, and the third button is the honest extra: some of what you triage
 * turns out to be something you have already read.
 */
const DECISIONS: { reading: Reading; label: string; icon: string; hint: string }[] = [
	{
		reading: 'dropped',
		label: 'Drop',
		icon: 'x',
		hint: 'Assessed and not going further. Asks why, so the exclusion is on the record.',
	},
	{
		reading: 'queued',
		label: 'Queue',
		icon: 'bookmark',
		hint: 'Worth a real read. Goes on the reading list.',
	},
	{
		reading: 'finished',
		label: 'Already read',
		icon: 'check',
		hint: 'Skip the queue: this one is done.',
	},
];

export class PassOneView extends ItemView {
	private loaded: Loaded | null = null;
	private handlers: Handlers | null = null;
	/** The deeper pass, once it has been asked for and arrived. */
	private full: Full | null = null;
	private loading = false;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return PASS_ONE_VIEW;
	}

	getDisplayText(): string {
		return this.loaded ? `Triage: ${this.loaded.title}` : 'Triage';
	}

	getIcon(): string {
		return 'scan-eye';
	}

	show(loaded: Loaded, handlers: Handlers): void {
		this.loaded = loaded;
		this.handlers = handlers;
		// A new paper starts with none of the last one's reading.
		this.full = null;
		this.loading = false;
		this.render();

		// Then read the rest, without waiting for it.
		void this.read();
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('paper-trail-pass-one');

		if (!this.loaded) {
			root.createEl('p', { text: 'Run triage from a literature note.' });
			return;
		}
		const { title, brief, problem } = this.loaded;
		const full = this.full;

		root.createEl('h2', { text: title });

		// Venue and year sit under the title because between them they settle a
		// surprising number of papers before the abstract is even read.
		const byline = [brief.venue, brief.year].filter(Boolean).join(' · ');
		if (byline) root.createEl('p', { cls: 'paper-trail-pass-one-meta', text: byline });

		// The decision stays available either way. A paper whose text cannot be
		// read is still one you can drop, queue or mark read from its title and
		// what you know, and refusing to ask leaves it stuck in Triage with
		// `next` offering it again every time.
		if (problem) root.createEl('p', { cls: 'paper-trail-pass-one-problem', text: problem });

		// Zotero's own abstract first, because it is there without opening
		// anything and it is the one the publisher wrote. The extracted one is
		// the fallback for an item whose record has no abstract at all.
		this.abstract(root, brief, full);

		if (full) this.deeper(root, full);
		else if (this.loading) this.waiting(root);

		this.decisions(root);
	}

	private abstract(parent: HTMLElement, brief: Brief, full: Full | null): void {
		if (brief.abstract) {
			parent.createEl('h3', { text: 'Abstract' });
			parent.createEl('p', { text: brief.abstract });
			return;
		}
		this.section(parent, 'Abstract', full?.result.abstract ?? [], 'Zotero has no abstract for this item.');
	}

	/** Keshav's remaining three inputs, plus what the length actually is. */
	private deeper(parent: HTMLElement, full: Full): void {
		const { result, seen } = full;
		parent.createEl('p', {
			cls: 'paper-trail-pass-one-meta',
			text: `${result.words.toLocaleString('en')} words, about ${result.minutes} min at reading speed`,
		});

		this.section(parent, 'Introduction', result.introduction, 'This paper has no introduction heading.');
		this.outline(parent, result);
		this.section(parent, 'Conclusion', result.conclusion, 'This paper has no conclusion heading.');
		this.references(parent, seen);
	}

	/** Said while the rest is on its way, so the pane is never silently short. */
	private waiting(parent: HTMLElement): void {
		parent.createEl('p', { cls: 'paper-trail-pass-one-empty', text: 'Reading the full text…' });
	}

	/**
	 * Read the extracted text and show what it adds.
	 *
	 * Started from `show` and never waited for: the abstract is already on
	 * screen by the time this runs, and it settles most papers on its own, so
	 * the outline arriving a moment later costs nothing. Blocking on it would
	 * put an empty pane in front of every decision.
	 */
	private async read(): Promise<void> {
		const handlers = this.handlers;
		const loaded = this.loaded;
		if (!handlers || this.loading) return;

		this.loading = true;
		this.render();
		try {
			const full = await handlers.full();
			// The pane may have moved on to another paper while this was out.
			if (this.loaded !== loaded) return;
			this.full = full;
		} catch (error) {
			// Shown in the pane rather than thrown away: the paper is still
			// decidable on its abstract, and this says why there is no more.
			if (this.loaded === loaded && loaded) loaded.problem = error instanceof Error ? error.message : String(error);
		} finally {
			if (this.loaded === loaded) {
				this.loading = false;
				this.render();
			}
		}
	}

	private section(parent: HTMLElement, heading: string, paragraphs: string[], empty: string): void {
		parent.createEl('h3', { text: heading });
		if (paragraphs.length === 0) {
			parent.createEl('p', { cls: 'paper-trail-pass-one-empty', text: empty });
			return;
		}
		for (const paragraph of paragraphs) parent.createEl('p', { text: paragraph });
	}

	private outline(parent: HTMLElement, result: PassOne): void {
		parent.createEl('h3', { text: 'Outline' });
		if (result.outline.length === 0) {
			parent.createEl('p', { cls: 'paper-trail-pass-one-empty', text: 'No headings came through the extraction.' });
			return;
		}
		const list = parent.createEl('ul', { cls: 'paper-trail-pass-one-outline' });
		for (const heading of result.outline) {
			list.createEl('li', { text: heading.text, attr: { 'data-level': String(heading.level) } });
		}
	}

	/**
	 * The last thing Keshav's first pass does. One line of arithmetic, then the
	 * papers themselves, because a reference you dropped two years ago is the
	 * most useful thing that can appear on this pane, and it can only appear
	 * because the drop was written down at the time.
	 */
	private references(parent: HTMLElement, seen: Glance): void {
		parent.createEl('h3', { text: 'References' });

		if (seen.total === 0) {
			parent.createEl('p', { cls: 'paper-trail-pass-one-empty', text: 'No reference list came through the extraction.' });
			return;
		}

		const had = seen.known.length;
		parent.createEl('p', {
			text: `${seen.total} ${seen.total === 1 ? 'entry' : 'entries'}, ${had === 0 ? 'none' : had} already in your vault.`,
		});

		const list = parent.createEl('ul', { cls: 'paper-trail-pass-one-seen' });
		for (const paper of seen.known) {
			const item = list.createEl('li');
			item.createSpan({ text: paper.titles[0] ?? paper.path });
			item.createSpan({ cls: 'paper-trail-pass-one-status', text: label(paper.reading ?? 'untriaged') });
		}
	}

	private decisions(parent: HTMLElement): void {
		parent.createEl('h3', { text: 'Decision' });
		const row = parent.createDiv({ cls: 'paper-trail-pass-one-decisions' });
		for (const decision of DECISIONS) {
			const button = row.createEl('button', { attr: { 'aria-label': decision.hint } });
			setIcon(button.createSpan(), decision.icon);
			button.createSpan({ text: decision.label });
			button.addEventListener('click', () => {
				this.decide(decision).catch((error: unknown) => {
					console.error('paper-trail:pass-one decide', error);
					new Notice(error instanceof Error ? error.message : String(error));
				});
			});
		}
	}

	private async decide(decision: (typeof DECISIONS)[number]): Promise<void> {
		const loaded = this.loaded;
		const handlers = this.handlers;
		if (!loaded || !handlers) return;

		// Whether a decision owes an answer before it can be written, and what to
		// ask for it, belongs to core rather than to a pane: three places record
		// decisions, and a rule known in one of them is a rule the other two
		// forget. False here means the question went unanswered, so nothing was
		// written and the pane stays open on the paper.
		if (!(await handlers.decide(decision.reading))) return;

		// The pane stays. What happens next is the command's to decide: another
		// paper to assess, or nothing left and it closes itself.
		new Notice(`${loaded.title}\n${landing(decision.reading)}`);
	}
}
