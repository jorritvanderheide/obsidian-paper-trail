// The ```paper-trail``` block: the queue, on a note of your own.
//
// A shell around `renderQueue`, which the sidebar uses too. Everything that
// decides what appears and what a button does lives in core and in
// commands/workflow.ts, so the two surfaces cannot drift apart.
import { MarkdownRenderChild, debounce } from 'obsidian';
import { renderQueue } from './queue';
import type { Context } from '../context';

/**
 * The fence that renders the queue block.
 *
 * Here rather than in `core/`, beside the processor registered for it, because
 * a code fence name is not a template and the two have to agree: the command
 * that inserts the block writes this word, and Obsidian calls back on it. It
 * was reachable by two import paths while it lived among the templates, which
 * is one more than a single constant should have.
 */
export const WORKFLOW_BLOCK = 'paper-trail';

export class WorkflowBlock extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private readonly context: Context,
	) {
		super(containerEl);
	}

	/**
	 * Coalesced for the same reason the sidebar's is: one save fires one event,
	 * but a sync or a git pull fires one per file.
	 *
	 * The block only listens while the note holding it is on screen, so unlike
	 * the sidebar this is never a background cost.
	 */
	private readonly redraw = debounce(() => renderQueue(this.containerEl, this.context), 200, true);

	onload(): void {
		renderQueue(this.containerEl, this.context);
		// Redraw when the vault changes underneath, so acting on a row makes it
		// leave the list without a manual refresh.
		this.registerEvent(this.context.app.metadataCache.on('changed', this.redraw));
		this.registerEvent(this.context.app.vault.on('delete', this.redraw));
		this.registerEvent(this.context.app.vault.on('rename', this.redraw));
		// And when the workspace does, because one thing here depends on it: the
		// Zotero warning is drawn only when the sidebar is not up to carry it.
		// Without this, collapsing the sidebar would leave the block still
		// deferring to a pane that has gone, and the news nowhere.
		this.registerEvent(this.context.app.workspace.on('layout-change', this.redraw));
	}
}
