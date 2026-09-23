// What a triage decision leaves on the literature note. Pure, so the exact
// frontmatter a decision produces is testable without an Obsidian running.
import { sortKeys } from './frontmatter';

/**
 * How far a paper is going: what you decided it earns, and nothing about what
 * you have done.
 *
 * One of the two axes, and the older one. It used to carry both, so a list of
 * these was a list of two questions at once: "Queued, worth an hour" is a
 * judgement about the paper and "Summarised, and done with" is a report about
 * you, and picking from one list meant answering whichever the label happened
 * to be about. The chooser offers these five and nothing else.
 */
export type Reading = 'untriaged' | 'queued' | 'promoted' | 'deferred' | 'dropped';

/**
 * How far you have got, which only ever moves forwards.
 *
 * Never chosen from a list. `read` is set by the question at the end of a
 * reading; the other two by the tick on the row that owes them.
 */
export type Progress = 'read' | 'summarised' | 'assessed';

/**
 * Why a paper is filed: the four things that mean nothing is outstanding.
 *
 * Two are judgements about the paper and two are reports about you, which is
 * the split showing through at the one place it should: what you want to know
 * about a filed paper is why it is there, and those are the four reasons.
 */
export type Outcome = 'dropped' | 'deferred' | 'summarised' | 'assessed';

/** Where a paper is: the pair, which is the only thing that answers it. */
export interface State {
	reading: Reading;
	progress: Progress | null;
}

/** The frontmatter key holding the progress half. */
export const PROGRESS_KEY = 'reading-progress';

export const READING_ORDER: readonly Reading[] = ['untriaged', 'queued', 'promoted', 'deferred', 'dropped'];
export const PROGRESS_ORDER: readonly Progress[] = ['read', 'summarised', 'assessed'];

/** A stored progress value, or null for a paper that has not got there. */
export function progressOf(value: unknown): Progress | null {
	if (typeof value !== 'string') return null;
	return PROGRESS_ORDER.find((known) => known === value.trim()) ?? null;
}

/**
 * Where a paper is, read off its frontmatter.
 *
 * The one reading of the two keys, so nothing downstream has to do it twice or
 * differently. A value it does not recognise reads as untriaged: no opinion it
 * can read has been formed, and that is the answer that puts the paper back in
 * front of you, which is the only way it gets fixed.
 *
 * `promoted` with nothing recorded against it counts as read, because promoting
 * a paper to a third pass is something you decide at the end of reading it. It
 * saves the queue offering you a paper to read that you have said is worth
 * arguing with.
 */
export function stateOf(frontmatter: Record<string, unknown> | undefined): State {
	const stored = typeof frontmatter?.reading === 'string' ? frontmatter.reading.trim() : '';
	const progress = progressOf(frontmatter?.[PROGRESS_KEY]);

	const reading = READING_ORDER.find((known) => known === stored) ?? 'untriaged';
	if (reading === 'promoted' && progress === null) return { reading, progress: 'read' };
	return { reading, progress };
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

/**
 * What a decision writes. `progress` left out means leave it as it is, which is
 * what every decision about the paper itself does: dropping a paper you had
 * summarised does not unsummarise it, so un-dropping it returns it to where it
 * was rather than to the start.
 */
export interface Triage {
	reading: Reading;
	reason: string | null;
	progress?: Progress;
}

/** What the tick on each of the two written passes records. */
export const PASS_PROGRESS: Record<'claim' | 'assessment', Progress> = {
	claim: 'summarised',
	assessment: 'assessed',
};

/**
 * The question a decision has to answer before it can be written, and the word
 * on the button that writes it.
 *
 * Here rather than at each of the three call sites, because a drop asked for a
 * reason in the triage dialog and in the status command and would have grown a
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
 * Where a paper is, in one word.
 *
 * Nine of them, for a pair that has five values on one axis and three on the
 * other. That is the point of the split rather than an argument against it: a
 * precise word is what a pill and a filed row want, and a list of nine is what
 * a chooser does not. You read all nine; you pick from five.
 */
export function label({ reading, progress }: State): string {
	if (reading === 'untriaged') return 'Untriaged';
	if (reading === 'deferred') return 'Deferred';
	if (reading === 'dropped') return 'Dropped';

	if (progress === 'assessed') return 'Assessed';
	if (reading === 'promoted') return progress === 'summarised' ? 'Assessing' : 'Promoted';
	if (progress === 'summarised') return 'Summarised';
	return progress === 'read' ? 'Read' : 'Queued';
}

/**
 * One icon per word, keyed by the word itself so the two cannot come to
 * disagree: a state that reads one way and draws another is exactly the bug
 * this table was written down once to stop.
 *
 * Every name is checked against the set Obsidian bundles rather than the Lucide
 * catalogue, because an icon Obsidian does not ship renders as nothing and says
 * nothing about why. `Read` and the Reading section still share `book-open`,
 * which is the one collision left and wants a running app to fix safely.
 */
const ICONS: Record<string, string> = {
	Untriaged: 'circle-dashed',
	Queued: 'bookmark',
	Read: 'book-open',
	Summarised: 'check',
	Promoted: 'book-open-check',
	Assessing: 'pencil',
	Assessed: 'check-check',
	Deferred: 'clock',
	Dropped: 'x',
};

export function iconOf(state: State): string {
	return ICONS[label(state)] ?? 'circle-dashed';
}

/**
 * Where a decision leaves the paper, in terms of the queue.
 *
 * Named for the section it lands in rather than the decision just taken:
 * whoever pressed the button already knows what they chose, and what they
 * cannot know is what the pane will say about it a second later.
 *
 * Where it lands, and not what to do about it, which is a line one of these
 * crossed. Finishing a reading puts the landing and the question on one
 * notice, so "Read. Write what it argues, then tick it off." sat directly
 * above "What does this paper argue? ... Tick it off when you are done." and
 * said the same thing first and worse. The instruction belongs to the task,
 * where it is asked at the heading it is about.
 */
const LANDINGS: Record<string, string> = {
	Untriaged: 'Untriaged, and back in Triage.',
	Queued: 'Queued, and waiting to be read.',
	Read: 'Read, and waiting on a claim.',
	Summarised: 'Summarised, and done with.',
	Promoted: 'Promoted, and owing a claim first.',
	Assessing: 'Summarised, and owing an assessment.',
	Assessed: 'Assessed, and done with.',
	Deferred: 'Deferred, with the condition on the note.',
	Dropped: 'Dropped, and off the list.',
};

export function landing(state: State): string {
	return LANDINGS[label(state)] ?? '';
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
 * The first two record the reading as done, because it is. The last two leave
 * progress alone: a paper you gave up on an hour in has not been read, and one
 * you park keeps whatever it had, so coming back to either returns it to where
 * it was rather than to the start.
 */
export const PASS_TWO: { reading: Reading; progress?: Progress; label: string }[] = [
	{ reading: 'queued', progress: 'read', label: 'Worth summarising' },
	{ reading: 'promoted', progress: 'read', label: 'Worth a third pass' },
	{ reading: 'deferred', label: 'Worth another hour, but not now' },
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
export function applyStatusTag(frontmatter: Record<string, unknown>, state: State, tags: StatusTags): void {
	// A vault that never turned this on, and has nothing to take back out. It
	// must leave the note exactly as found, including having no `tags` key.
	if (tags.current === '' && tags.retired.length === 0) return;

	let list = readTags(frontmatter.tags);
	// Out before in, so renaming a namespace onto one the note already carries
	// cannot drop what was just written.
	for (const namespace of tags.retired) list = setTag(list, namespace, null);
	// The word rather than either half, so the tag says what the pill says and a
	// tag tree has one entry per state rather than two axes to cross-reference.
	if (tags.current !== '') list = setTag(list, tags.current, label(state).toLowerCase());

	// An empty list is no tags rather than `tags: []`, which is a key somebody
	// then has to look at and wonder about.
	if (list.length === 0) delete frontmatter.tags;
	else frontmatter.tags = list;
}

/**
 * Mutates in place, which is the shape `processFrontMatter` wants.
 *
 * Every field a decision owns is written on every decision, so re-deciding a
 * paper cannot leave part of the previous answer behind.
 *
 * Progress is written only when the decision says so. A judgement about the
 * paper leaves what you have done alone: dropping one you had summarised does
 * not unsummarise it, so picking it back up returns it to where it was rather
 * than to the start of the queue.
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
	if (triage.progress !== undefined) frontmatter[PROGRESS_KEY] = triage.progress;

	// Read back rather than assumed, so the tag follows the pair the note now
	// holds however much of it this decision touched.
	applyStatusTag(frontmatter, stateOf(frontmatter), tags);

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
