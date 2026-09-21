// What a triage decision leaves on the literature note. Pure, so the exact
// frontmatter a decision produces is testable without an Obsidian running.
import { sortKeys } from './frontmatter';
import { readTags, setAxis } from './vocabulary';

/**
 * How far a paper is going, in Keshav's terms. `untriaged` is the state a new
 * note is stamped with, never chosen.
 *
 * Two of these are intents rather than reports: `queued` says the paper earned
 * a second pass, `pass-three` says it earned a third. What has actually been written
 * is read off the note's headings, so the stage a paper waits at is the pair of
 * the two and neither has to be kept in step with the other.
 */
export type Reading = 'untriaged' | 'dropped' | 'queued' | 'deferred' | 'finished' | 'pass-three';

export interface Triage {
	reading: Reading;
	reason: string | null;
}

/**
 * The question a decision has to answer before it can be written, and the word
 * on the button that writes it.
 *
 * Here rather than at each of the three call sites, because a drop asked for a
 * reason in the triage pane and in the status command and would have grown a
 * third wording the moment the second pass learned to drop too.
 *
 * Only the two that take a paper off the list ask. A deferral is the one worth
 * insisting on: unlike a drop it is a promise to come back, and a promise with
 * no condition attached is how the queue quietly becomes a graveyard.
 */
export function asks(reading: Reading): { question: string; cta: string } | null {
	if (reading === 'dropped') return { question: 'Why is this not worth reading?', cta: 'Drop' };
	if (reading === 'deferred') return { question: 'What has to happen before this is worth another hour?', cta: 'Defer' };
	return null;
}

/**
 * One icon per reading state, written down once.
 *
 * Three places show a state and each had its own answer, or none: the triage
 * pane named `x`, `bookmark` and `check` inline, and the two choosers showed
 * no icon at all, so the same decision looked like three different things.
 *
 * Every name is checked against the set Obsidian bundles rather than the Lucide
 * catalogue, because an icon Obsidian does not ship renders as nothing and says
 * nothing about why.
 *
 * These are also what to put in a tag explorer's folder icons, if you have the
 * status tag turned on. The plugin cannot set those itself: they live in that
 * plugin's own data, and reaching into it would be the same overreach as
 * writing someone's hotkeys.
 */
const ICONS: Record<Reading, string> = {
	untriaged: 'circle-dashed',
	dropped: 'x',
	queued: 'bookmark',
	deferred: 'clock',
	finished: 'check',
	'pass-three': 'book-open-check',
};

export function iconOf(reading: Reading): string {
	return ICONS[reading];
}

/**
 * Where a decision leaves the paper, in terms of the homepage.
 *
 * Named for the stage it lands in rather than the decision just taken: whoever
 * pressed the button already knows what they chose, and what they cannot know
 * is what the block will say about it a second later.
 */
export function landing(reading: Reading): string {
	switch (reading) {
		case 'untriaged':
			return 'Back to Triage, to be assessed again.';
		case 'dropped':
			return 'Dropped, and off the list.';
		case 'queued':
			return 'Queued. It moves to Read.';
		case 'deferred':
			return 'Parked, with the condition on the note.';
		case 'finished':
			return 'Finished. It moves to Write up, for the claim.';
		case 'pass-three':
			return 'Worth a third pass. Write the claim first.';
	}
}

/**
 * What can be decided at the end of the second pass.
 *
 * Keshav's three, in his order: it was enough, come back to it after reading
 * something else, or persevere to the third pass. The fourth is not his and is
 * not optional: an hour in, you sometimes know the paper is not worth
 * finishing, and the honest thing is to record that rather than leave it queued
 * forever or mark it read when it was not.
 */
export const PASS_TWO: { reading: Reading; label: string }[] = [
	{ reading: 'finished', label: 'Enough: I have what I need' },
	{ reading: 'pass-three', label: 'Worth a third pass' },
	{ reading: 'deferred', label: 'Come back to it later' },
	{ reading: 'dropped', label: 'Not worth finishing' },
];

/**
 * Mirror the reading status into a tag, for a vault navigated by tag rather
 * than by folder.
 *
 * Derived, never authoritative. `reading` in the frontmatter stays the value
 * every rule reads; this is a copy of it for the tag pane and for plugins that
 * build a tree from one. Rewritten on every decision, so it cannot drift: edit
 * the tag by hand and the next decision puts it back.
 *
 * A tag as well as the property, not instead of it. A tag is the only thing a
 * tag explorer can see, and `reading` is single-valued where a tag list is not:
 * keeping both makes a paper browsable without letting it be queued and dropped
 * at once.
 *
 * An empty namespace writes nothing, and is the default. A plugin should not
 * put tags in a stranger's notes unasked, and taking them out again would mean
 * editing every file.
 *
 * Only values in this namespace are touched. Every other tag on the note
 * belongs to whoever put it there and is passed through.
 */
export function applyStatusTag(frontmatter: Record<string, unknown>, reading: Reading, namespace: string): void {
	if (namespace.length === 0) return;
	frontmatter.tags = setAxis(readTags(frontmatter.tags), namespace, reading);
}

/**
 * Mutates in place, which is the shape `processFrontMatter` wants.
 *
 * Every field a decision owns is written on every decision, so re-triaging a
 * paper cannot leave part of the previous answer behind.
 *
 * It writes no domain or type tag. Nothing reads either on a paper, and
 * stamping one on every decision would overwrite whatever you had set by hand:
 * a write that buys nothing and costs an edit. The status tag below is the
 * exception, and only because you asked for it by naming a namespace.
 */
export function applyTriage(frontmatter: Record<string, unknown>, triage: Triage, date: string, statusTag = ''): void {
	frontmatter.reading = triage.reading;
	frontmatter['reading-date'] = date;
	applyStatusTag(frontmatter, triage.reading, statusTag);

	// When the first opinion was formed, written once and never again.
	// `reading-date` moves with the status, so on its own it cannot answer "when
	// did I first assess this", which is the question year four asks of a paper
	// whose status has since changed.
	if (typeof frontmatter['triaged-date'] !== 'string') frontmatter['triaged-date'] = date;

	// The reason belongs to the drop. Without the delete, a paper dropped and
	// later queued keeps carrying the sentence saying why it was not worth
	// reading, which is then wrong in the one place it will be trusted.
	if (triage.reason) frontmatter['reading-reason'] = triage.reason;
	else delete frontmatter['reading-reason'];

	sortKeys(frontmatter);
}
