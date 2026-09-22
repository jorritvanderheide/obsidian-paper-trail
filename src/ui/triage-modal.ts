// The first pass, in a dialog: what Zotero already knows, and three buttons.
//
// This replaced a pane that read the PDF. It showed the introduction, the
// section outline, the conclusion and how much of the bibliography the vault
// already held, all from the text Zotero extracts beside each attachment.
//
// It was cut because the text is only sometimes there. Run over a real shelf,
// the outline came through on four papers out of four and read cleanly, but
// the introduction on two, the conclusion on one, and a usable reference list
// on one. Not because the extraction garbles anything: the papers that failed
// are magazine pieces and short columns that have no Conclusion heading to
// find. A first-pass reader that answers three questions out of four with "this
// paper has no introduction heading" is a pane of apologies, and it cost the
// plugin a dependency on Zotero's storage folder, a data-directory setting, an
// attachment cache and about nine hundred lines to say them.
//
// What is left is the half that never fails, because it is not extracted at
// all: Zotero's own record. The abstract here is the publisher's, off the item,
// and title, venue and year come with it. That is what Keshav's first pass is
// mostly made of, and it is what the twenty seconds are actually spent on.
import { Modal, setIcon, type App } from 'obsidian';
import { iconOf, type Reading } from '../core/triage';
import { notify } from './notify';

/** What Zotero hands over without anything being opened. */
export interface Brief {
	abstract: string | null;
	venue: string | null;
	year: number | null;
}

export interface Triaged {
	title: string;
	brief: Brief;
	/** Why the brief is empty, said in the dialog rather than a notice that scrolls away. */
	problem: string | null;
}

/**
 * What the first pass can end in. Keshav's own question is binary, read on or
 * do not, and the third button is the honest extra: some of what you triage
 * turns out to be something you have already read.
 */
const DECISIONS: { reading: Reading; label: string; hint: string }[] = [
	{
		reading: 'dropped',
		label: 'Drop',
		hint: 'Assessed and not going further. Asks why, so the exclusion is on the record.',
	},
	{
		reading: 'queued',
		label: 'Queue',
		hint: 'Worth a real read. Goes on the reading list.',
	},
	{
		reading: 'finished',
		label: 'Already read',
		// Not "this one is done", which is what it used to say and what the paper
		// then was not: `finished` skips the reading list and lands in Claim,
		// still owing a summary. `landing` says so a second later, and a hint
		// disagreeing with it is the wrong one of the two.
		hint: 'Read already, so it skips the reading list. Goes to Claim, to be summarised.',
	},
];

/**
 * One paper, one decision.
 *
 * A modal rather than the tab this replaced, and the swap is most of the point.
 * A tab had to be found, reused, revealed and detached, and it took editor space
 * for as long as the sitting lasted. A dialog is the shape of the thing: it is
 * in front of you until you answer it, and answering it is the only way out.
 *
 * It does not close on a decision. Triage is a sitting rather than a series of
 * interruptions, so the caller feeds it the next paper and the dialog stays up
 * until the pile is empty. Forty papers is forty answers, not forty dialogs.
 */
export class TriageModal extends Modal {
	constructor(
		app: App,
		private loaded: Triaged,
		private decide: (reading: Reading) => Promise<void>,
		private readonly onClosed: () => void,
	) {
		super(app);
	}

	/**
	 * Point the open dialog at the next paper, without it ever having shut.
	 *
	 * Both halves, and that is the whole of it. This used to take the paper to
	 * show and keep the handler it was built with, which was bound to the first
	 * paper of the sitting: from the second decision on, the dialog displayed one
	 * paper and wrote to another, and the queue never moved past the second.
	 * Whatever a sitting shows and whatever it writes are one thing.
	 */
	show(loaded: Triaged, decide: (reading: Reading) => Promise<void>): void {
		this.loaded = loaded;
		this.decide = decide;
		this.render();
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		// Escaping abandons the sitting, not the paper: nothing is written and it
		// is still in Triage. Nothing needs stopping, because nothing here drives
		// the sitting; a decision does, and there will not be another. This only
		// lets the caller forget the dialog so the next one opens a new one.
		this.onClosed();
	}

	private render(): void {
		const { title, brief, problem } = this.loaded;
		this.setTitle(title);

		const el = this.contentEl;
		el.empty();
		el.addClass('paper-trail-triage');

		// Venue and year sit under the title because between them they settle a
		// surprising number of papers before the abstract is even read.
		const byline = [brief.venue, brief.year].filter(Boolean).join(' · ');
		if (byline) el.createEl('p', { cls: 'paper-trail-triage-meta', text: byline });

		// The decision stays available either way. A paper whose record cannot be
		// read is still one you can drop, queue or mark read from its title and
		// what you know, and refusing to ask leaves it stuck in Triage with
		// `next` offering it again every time.
		if (problem) el.createEl('p', { cls: 'paper-trail-triage-problem', text: problem });

		if (brief.abstract) el.createEl('p', { cls: 'paper-trail-triage-abstract', text: brief.abstract });
		else el.createEl('p', { cls: 'paper-trail-triage-empty', text: 'Zotero has no abstract for this item.' });

		this.decisions(el);
	}

	private decisions(parent: HTMLElement): void {
		const row = parent.createDiv({ cls: 'paper-trail-triage-decisions' });
		for (const decision of DECISIONS) {
			const button = row.createEl('button', { attr: { 'aria-label': decision.hint } });
			setIcon(button.createSpan(), iconOf(decision.reading));
			button.createSpan({ text: decision.label });
			button.addEventListener('click', () => {
				this.answer(decision).catch((error: unknown) => {
					notify(error, 'triage');
				});
			});
		}
	}

	/**
	 * Hand the decision over and do nothing else.
	 *
	 * Whether a decision owes an answer before it can be written, what to ask for
	 * it, what to say afterwards and which paper comes next all belong to the
	 * command. The dialog used to say what had happened itself, which put its
	 * notice after the one announcing the end of the sitting: the conclusion
	 * arrived before the thing it was concluding.
	 *
	 * A drop asks why in a prompt of its own, which stacks on top of this one
	 * rather than replacing it. That is why the reason dialog can be escaped
	 * without losing your place in the pile.
	 */
	private async answer(decision: (typeof DECISIONS)[number]): Promise<void> {
		await this.decide(decision.reading);
	}
}
