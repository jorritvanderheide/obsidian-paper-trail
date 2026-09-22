// The reading state at the top of a rendered paper, rather than in its title bar.
//
// A hover preview builds a fresh render of the file and knows nothing about the
// pane it was summoned from, so chrome can never appear in one. The only things
// that can are the file's own content, which is not ours to write, and whatever
// a markdown post-processor adds while the document is being rendered. That is
// what this is.
//
// It buys reading view, embeds and hover previews, and it cannot buy Live
// Preview, where post-processors do not run over the document as a whole. The
// title bar keeps that case, and stands down in reading view so the state is
// never claimed twice at once.
//
// It goes under the paper's title, where the title has just said which paper
// this is.
//
// Wiring only. What the states are and what each one means is core's.
import { MarkdownRenderChild, setIcon, type MarkdownPostProcessor, type TFile } from 'obsidian';
import { currentReading, iconOf, label, landing, READING_ORDER, type Reading } from '../core/triage';
import { isPaper } from '../core/paper-note';
import { setReading } from '../commands/reading';
import type { Context } from '../context';

/**
 * Put the state's mark and word in an element.
 *
 * Shared with the title bar so the two surfaces cannot come to say the same
 * state differently. It empties and refills rather than rebuilding, so a click
 * handler on the element itself survives a redraw.
 */
export function fillPill(el: HTMLElement, reading: Reading): void {
	const words = label(reading);
	el.empty();
	setIcon(el.createSpan({ cls: 'paper-trail-status-icon' }), iconOf(reading));
	el.createSpan({ cls: 'paper-trail-status-word', text: words });
	el.setAttribute('aria-label', `${words}. ${landing(reading)}`);
}

/**
 * The state of the paper at a path, or null when there is no paper there.
 *
 * A missing `reading` reads as untriaged, which is what it means: no opinion has
 * been formed. A value no version of this plugin wrote reads as nothing at all,
 * rather than being shown as a seventh state.
 */
function readingAt(context: Context, path: string): { file: TFile; reading: Reading } | null {
	const file = context.app.vault.getFileByPath(path);
	if (!file) return null;

	const frontmatter = context.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!isPaper(frontmatter, context.settings.keyField)) return null;

	const value = typeof frontmatter.reading === 'string' ? currentReading(frontmatter.reading) : 'untriaged';
	const reading = READING_ORDER.find((known) => known === value);
	return reading ? { file, reading } : null;
}

/**
 * One pill, under one rendered paper's title.
 *
 * A post-processor is handed every block of the note, so every block gets one of
 * these and only the one holding the title has anywhere to put it. The rest
 * cost a bare component with no listeners, which is cheaper than working out
 * which block is which: that is not knowable from the context it is given.
 */
class NoteStatus extends MarkdownRenderChild {
	private pill: HTMLElement | null = null;

	constructor(
		el: HTMLElement,
		private readonly context: Context,
		private readonly path: string,
	) {
		super(el);
	}

	onload(): void {
		this.place();
	}

	/**
	 * Under the paper's title, above its links.
	 *
	 * Anchored to the heading inside the block this was handed, rather than to
	 * the container the block sits in. That is the difference between needing
	 * the element to be in the document and not: a post-processor can be given
	 * a block before it is inserted, and walking up from one that is not there
	 * yet finds nothing and has nowhere to try again from.
	 *
	 * It also reads better. The title says which paper; the state belongs with
	 * it, not floating above everything in a space the document does not own.
	 */
	private place(): boolean {
		const heading = this.containerEl.querySelector('h1');
		if (!heading) return false;

		// Every block of the note is handed to the processor, and a note could
		// have a second first-level heading. One pill per title.
		if (heading.nextElementSibling?.hasClass('paper-trail-note-status')) return true;

		// Made by the block, so it belongs to the block's document: that matters
		// the day somebody pops a note out into a window of its own.
		const pill = this.containerEl.createDiv({ cls: 'paper-trail-note-status' });
		heading.insertAdjacentElement('afterend', pill);

		pill.addEventListener('click', () => {
			const found = readingAt(this.context, this.path);
			if (found) void setReading(this.context, found.file);
		});
		this.pill = pill;

		this.draw();
		// A decision taken anywhere else reaches it: the queue, the title bar, the
		// palette, or a sync pulling one in from another machine.
		this.registerEvent(
			this.context.app.metadataCache.on('changed', (file) => {
				if (file.path === this.path) this.draw();
			}),
		);
		return true;
	}

	onunload(): void {
		this.pill?.remove();
	}

	private draw(): void {
		const pill = this.pill;
		if (!pill) return;

		const found = readingAt(this.context, this.path);
		pill.toggle(found !== null);
		if (found) fillPill(pill, found.reading);
	}
}

/** The processor to register, or a no-op while the pill is switched off. */
export function noteStatus(context: Context): MarkdownPostProcessor {
	return (el, ctx) => {
		if (!context.settings.statusPill) return;
		if (readingAt(context, ctx.sourcePath) === null) return;
		ctx.addChild(new NoteStatus(el, context, ctx.sourcePath));
	};
}
