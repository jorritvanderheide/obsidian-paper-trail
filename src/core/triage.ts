// What a triage decision leaves on the literature note. Pure, so the exact
// frontmatter a decision produces is testable without an Obsidian running.
import { sortKeys } from './frontmatter';

/**
 * Values this field used to hold, mapped to what they are called now.
 *
 * `pass-three` named a stage called Third pass, which is now Assessment, and a
 * value nothing in the interface says any more is one you meet only in your own
 * frontmatter and in a `status/` tag, wondering what it meant.
 *
 * Read through `currentReading`, written in the new spelling, and old notes are
 * never rewritten: a promoted paper you finished last year keeps saying
 * `pass-three` and goes on behaving exactly as it did. Its tag corrects itself
 * the next time you decide anything about it. Rewriting the vault to tidy a
 * word would be a worse trade than carrying this table.
 */
const RENAMED: Record<string, string> = { 'pass-three': 'promoted' };

/** What a stored `reading` value is called now. Unknown values pass through. */
export function currentReading(value: string): string {
	return RENAMED[value] ?? value;
}

/**
 * How far a paper is going, in Keshav's terms. `untriaged` is the state a new
 * note is stamped with, never chosen.
 *
 * Two of these are intents rather than reports: `queued` says the paper earned
 * a second pass, `promoted` says it earned a third. What has actually been
 * written is read off the note's headings, so the stage a paper waits at is the
 * pair of the two and neither has to be kept in step with the other.
 */
export type Reading = 'untriaged' | 'dropped' | 'queued' | 'deferred' | 'finished' | 'promoted';

/**
 * The reading values in the order a paper passes through them, which is the
 * order any list of all six is shown in.
 *
 * It is the queue read downwards: untriaged is Triage, queued is Reading,
 * finished and promoted are Claim and then Assessment, and the last two are
 * the ways out. A chooser offering the same six states in some other order
 * than the pane you were just looking at makes you read all six every time,
 * which for a list you reach for to correct a mistake is the whole cost of it.
 *
 * Declaration order on the type above is not it, and cannot be: that order is
 * arbitrary and nothing can depend on it. This is the one that is meant.
 */
export const READING_ORDER: readonly Reading[] = ['untriaged', 'queued', 'finished', 'promoted', 'deferred', 'dropped'];

/**
 * A stored `reading` as one of the six states, reading anything else as
 * untriaged.
 *
 * Three places asked this and two of them answered differently, which is what
 * it is here to stop: a paper whose `reading` says something no version of this
 * plugin ever wrote showed "Untriaged" in its title bar, no state at all in its
 * rendered note, and appeared in no section of the queue. Invisible, and lying
 * about it in one of the two places you could still see it.
 *
 * Untriaged rather than nothing, because that is what the value means to the
 * machine: no opinion it can read has been formed. It is also the answer that
 * puts the paper back in front of you, which is the only way the frontmatter
 * gets fixed.
 *
 * Not a hypothetical. `RENAMED` exists because values get renamed, and a value
 * renamed in some future version is exactly this to the version before it.
 */
export function readingOf(value: unknown): Reading {
	if (typeof value !== 'string') return 'untriaged';
	const current = currentReading(value);
	return READING_ORDER.find((known) => known === current) ?? 'untriaged';
}

/**
 * The state a paper arrives in, which is what putting it in Zotero meant.
 *
 * `untriaged` when the queue is to ask first. `queued` when it is not, because
 * then the first pass already happened: on the publisher's page, on the
 * abstract, with the connector button as the answer. Recording that as
 * untriaged would ask for a judgement that has been made.
 */
export function arrivalReading(triage: boolean): Reading {
	return triage ? 'untriaged' : 'queued';
}

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
	promoted: 'book-open-check',
};

export function iconOf(reading: Reading): string {
	return ICONS[reading];
}

/**
 * The state as a word, for a pill or a row that has to say which one this is.
 *
 * Capitalising the stored value rather than carrying a table of display names,
 * because the six values are already written as the words they should read as.
 * A table would be six more strings to keep level with `Reading` for no gain,
 * and the day one of them needs a name of its own is the day `RENAMED` says so.
 */
export function label(reading: Reading): string {
	return reading.charAt(0).toUpperCase() + reading.slice(1);
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
			return 'Queued, and waiting to be read.';
		case 'deferred':
			return 'Parked, with the condition on the note.';
		case 'finished':
			return 'Read. Write what it argues and it is done.';
		case 'promoted':
			return 'Worth a third pass. The claim comes first.';
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
 *
 * The first is worded as his test rather than as an outcome. "You should be
 * able to summarize the main thrust of the paper, with supporting evidence, to
 * someone else" is what ends a second pass, so the button claims exactly that
 * and the next screen asks you to make good on it. The label it replaced said
 * "Enough: I have what I need", which is completion language for a paper that
 * then does not leave, and the difference is the whole reason this stage was
 * confusing.
 */
export const PASS_TWO: { reading: Reading; label: string }[] = [
	{ reading: 'finished', label: 'I can summarise it' },
	{ reading: 'promoted', label: 'Worth a third pass' },
	{ reading: 'deferred', label: 'Come back to it later' },
	{ reading: 'dropped', label: 'Not worth finishing' },
];

/** Frontmatter `tags` as a list, whatever shape it was written in. */
export function readTags(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((tag): tag is string => typeof tag === 'string');
	if (typeof value === 'string') return value.split(/[,\s]+/).filter(Boolean);
	return [];
}

/**
 * Replace the value in one tag namespace, or drop the namespace with null.
 *
 * Every tag outside the namespace is passed through untouched, which is the
 * whole contract: the only namespace this plugin writes is the one you named
 * in the status tag setting, and everything else on the note belongs to
 * whoever put it there.
 *
 * Sorted on the way out, because the Linter sorts tag arrays ascending and a
 * note that comes back already sorted does not show up as a diff the next time
 * it runs.
 */
export function setTag(tags: string[], namespace: string, value: string | null): string[] {
	const rest = tags.filter((tag) => !tag.startsWith(`${namespace}/`));
	if (value !== null) rest.push(`${namespace}/${value}`);
	return rest.sort();
}

/**
 * Which tag namespaces the plugin writes, and which it used to.
 *
 * `retired` is what makes the mirror honest across a change of setting. The
 * namespace is a name someone chose, so it can be changed or cleared, and a
 * tag the plugin has stopped maintaining does not stop being read: rename
 * `literature` to `status` and a paper you later drop still says
 * `literature/queued`, which is no longer stale, it is false.
 *
 * A list rather than one previous name, because the setting can be changed
 * more than once and the papers carrying the first name do not heal when you
 * pick a third.
 */
export interface StatusTags {
	/** The namespace to write, or empty for none. */
	current: string;
	/** Namespaces written under an older setting, to be taken back out. */
	retired: readonly string[];
}

/** A vault that has never had the status tag turned on. */
export const NO_STATUS_TAGS: StatusTags = { current: '', retired: [] };

/**
 * How many of these notes carry a tag in a namespace no longer written.
 *
 * For the settings tab to say so. A paper heals on its next decision, and a
 * paper you settled two years ago will not get one, so the honest thing is to
 * report the number rather than to claim the rename was complete.
 */
export function retiredTagCount(noteTags: string[][], retired: readonly string[]): number {
	if (retired.length === 0) return 0;
	return noteTags.filter((tags) => tags.some((tag) => retired.some((namespace) => tag.startsWith(`${namespace}/`)))).length;
}

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
export function applyStatusTag(frontmatter: Record<string, unknown>, reading: Reading, tags: StatusTags): void {
	// A vault that never turned this on, and has nothing to take back out. It
	// must leave the note exactly as found, including having no `tags` key.
	if (tags.current === '' && tags.retired.length === 0) return;

	let list = readTags(frontmatter.tags);
	// Out before in, so renaming a namespace onto one the note already carries
	// cannot drop what was just written.
	for (const namespace of tags.retired) list = setTag(list, namespace, null);
	if (tags.current !== '') list = setTag(list, tags.current, reading);

	// An empty list is no tags rather than `tags: []`, which is a key somebody
	// then has to look at and wonder about.
	if (list.length === 0) delete frontmatter.tags;
	else frontmatter.tags = list;
}

/**
 * Mutates in place, which is the shape `processFrontMatter` wants.
 *
 * Every field a decision owns is written on every decision, so re-triaging a
 * paper cannot leave part of the previous answer behind.
 *
 * The status tag is the only tag it writes, and only because you asked for it
 * by naming a namespace. Every other tag on the note is somebody's own filing
 * and is passed through: stamping one on every decision would overwrite what
 * you had set by hand, a write that buys nothing and costs an edit.
 */
export function applyTriage(
	frontmatter: Record<string, unknown>,
	triage: Triage,
	date: string,
	tags: StatusTags = NO_STATUS_TAGS,
): void {
	frontmatter.reading = triage.reading;
	frontmatter['reading-date'] = date;
	applyStatusTag(frontmatter, triage.reading, tags);

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
