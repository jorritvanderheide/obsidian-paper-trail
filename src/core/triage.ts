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
 * to be about. The chooser offers these five, less any that would leave the
 * paper where it is, and one more for a paper that has been read: `READ_AGAIN`.
 */
export type Reading = 'untriaged' | 'queued' | 'promoted' | 'deferred' | 'dropped';

/**
 * How far you have got. It moves forwards, except when you send a paper back
 * to be read again, which clears it.
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
const PROGRESS_KEY = 'reading-progress';

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
	/**
	 * Left alone when absent, written when given, and cleared by null, which
	 * only sending a paper back to be read again does.
	 */
	progress?: Progress | null;
	/** When a deferral comes back, as an ISO date. Only a deferral carries one. */
	until?: string | null;
	/** The Zotero key of the paper a deferral waits for. Only a deferral carries one. */
	after?: string | null;
}

/** The frontmatter keys a deferral comes back by, written and read only here. */
const UNTIL_KEY = 'reading-until';
const AFTER_KEY = 'reading-after';

/** An ISO date, which is the only shape a date is compared in. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * When a deferral comes back, read off its frontmatter.
 *
 * Both optional, and a 1.0 deferral has neither, which reads as a paper parked
 * until you act: exactly what it was when it was written. A date that is not
 * `YYYY-MM-DD` is read as no date rather than guessed at, because dates are
 * compared as text, and a hand-typed `2026-1-5` would compare wrongly for ever.
 */
export function deferralOf(frontmatter: Record<string, unknown> | undefined): { until: string | null; after: string | null } {
	const text = (key: string): string | null => {
		const value = frontmatter?.[key];
		return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
	};
	const until = text(UNTIL_KEY);
	return { until: until !== null && ISO_DATE.test(until) ? until : null, after: text(AFTER_KEY) };
}

/**
 * What a paper earns once you tick off a pass on it.
 *
 * The judgement it already had, with one exception. A deferral that has come
 * back is still marked deferred, because coming back writes nothing, and the
 * tick is the first thing written after it. Ticking a claim is working on the
 * paper, which is picking it up; keeping it deferred would put a paper you had
 * just summarised back in Deferred, with its reason taken off and no way back.
 */
export function resumed(reading: Reading): Reading {
	return reading === 'deferred' ? 'queued' : reading;
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
 * The icon for a judgement on its own, whatever has been done to the paper.
 *
 * For the chooser, where each line offers a judgement and the line under it
 * says where the paper lands. `iconOf` answers for the pair, so asked about
 * each option on a paper already assessed it drew the Assessed mark on Queued
 * and on Promoted alike: two options that looked like the paper rather than
 * like themselves.
 */
export function judgementIcon(reading: Reading): string {
	return iconOf({ reading, progress: null });
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
 * said the same thing first and worse. The instruction belongs at the heading
 * it is about, which is where it is drawn.
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

/**
 * Whether a judgement is worth offering at all, to a paper this far along, in a
 * vault working this way.
 *
 * Untriaged only with triage on. With it off, Triage is not a stage you work:
 * a paper sent there sits in a section that is otherwise hidden, waiting on a
 * dialog nothing in your workflow opens. What you meant was almost always
 * Queued, and offering both is offering the wrong one beside the right one.
 *
 * Promoted only once the paper has been read. Worth a third pass is the
 * verdict of a second one, which is where Keshav puts it and where finishing a
 * reading asks it. On a paper you have not read it is a guess, and it would
 * leave the paper in Reading all the same.
 */
export function offered(reading: Reading, triage: boolean, progress: Progress | null): boolean {
	if (reading === 'untriaged') return triage;
	if (reading === 'promoted') return progress !== null;
	return true;
}

/**
 * Whether a decision would move a paper anywhere you could see.
 *
 * For the chooser, which should not offer a line that leaves the paper where
 * it is. It did: on an assessed paper, Queued rewrote `reading` from promoted
 * to queued, and nothing on screen changed, because once the assessment is
 * written the question of whether it was worth one has been answered by
 * doing it. Promoted did the same, being the value already there.
 *
 * Compared by label, because the label is where a paper is as far as
 * everything drawn from it is concerned: the pill, the section, the Filed
 * row and the status tag. Two states with one label look the same in all of
 * them. It also takes the current state out of its own list, which is right:
 * choosing where a paper already is is not a choice.
 */
export function moves(from: State, to: State, due = false): boolean {
	// A deferral that has come back is back in a stage, so deferring it again
	// takes it out of that stage, though the word on it stays Deferred.
	if (due && to.reading === 'deferred') return true;
	return label(from) !== label(to);
}

export function landing(state: State): string {
	return LANDINGS[label(state)] ?? '';
}

/**
 * What can be decided at the end of the second pass.
 *
 * Keshav's three: it was enough, persevere to the third pass, or come back to
 * it after reading something else. The fourth is not his and is
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

/** One way to say when a deferred paper should come back. */
export interface LookAgain {
	label: string;
	icon: string;
	days?: number;
	months?: number;
	/** Once another paper has been read, chosen next, rather than on a date. */
	after?: true;
}

/**
 * When a deferral comes back, as the deferral chooser offers it, in its order.
 *
 * A date, because it is the one condition the plugin can always check, and
 * "look at this again in three months" makes sense whatever the real condition
 * is. Presets rather than a calendar, because the date is a nudge and not an
 * appointment: nobody knows which Tuesday they will be ready for a paper.
 *
 * Or another paper, for a deferral whose condition is a reading: it comes back
 * once that one has been read, or dropped. That one is first when it is
 * offered, which is only when something unread is left to wait for, because it
 * is Keshav's own deferral: come back to this after reading something else.
 *
 * No date is still offered, and it is the honest someday. It is last, and
 * whatever is first comes back by itself, because the first line of a chooser
 * is the one Enter takes, and a deferral that never comes back should be one
 * somebody chose.
 */
export const LOOK_AGAIN: readonly LookAgain[] = [
	{ label: 'After reading another paper', icon: 'book-open', after: true },
	{ label: 'In 2 weeks', icon: 'calendar', days: 14 },
	{ label: 'In a month', icon: 'calendar', months: 1 },
	{ label: 'In 3 months', icon: 'calendar', months: 3 },
	{ label: 'In 6 months', icon: 'calendar', months: 6 },
	{ label: 'No date', icon: 'calendar-off' },
];

/**
 * The date a preset comes to from `today`, or null for no date.
 *
 * Worked on the date alone, in UTC, so no timezone can move it a day. A month
 * on from the 31st lands on the last day of a shorter month rather than
 * spilling into the next one: 31 January plus a month is the end of February.
 */
export function lookAgain(preset: LookAgain, today: string): string | null {
	if (preset.days === undefined && preset.months === undefined) return null;

	const [year = 1970, month = 1, day = 1] = today.split('-').map(Number);
	if (preset.months !== undefined) {
		const first = new Date(Date.UTC(year, month - 1 + preset.months, 1));
		const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
		first.setUTCDate(Math.min(day, last));
		return first.toISOString().slice(0, 10);
	}
	return new Date(Date.UTC(year, month - 1, day + (preset.days ?? 0))).toISOString().slice(0, 10);
}

/**
 * What to say after a deferral that has a way back, or null when it has none.
 *
 * `after` is the other paper's title rather than its key: the key is what is
 * stored, and the title is what anybody would recognise.
 */
export function deferredLanding(until: string | null, after: string | null): string | null {
	if (until !== null && after !== null) return `Deferred until ${until}, or until you have read ${after}.`;
	if (until !== null) return `Deferred until ${until}.`;
	if (after !== null) return `Deferred until you have read ${after}.`;
	return null;
}

/**
 * The line under a way back in the chooser: where choosing it leaves the paper.
 *
 * The date itself for a preset, since "in 3 months" is only useful once you
 * know when that is. In the words the notice will use once it is chosen, so the
 * chooser and the notice after it say the same thing.
 */
export function lookAgainLine(preset: LookAgain, today: string): string {
	const after = preset.after ? 'a paper you choose' : null;
	return deferredLanding(lookAgain(preset, today), after) ?? 'Deferred until you pick it back up.';
}

/**
 * Sending a paper back to be read, which none of the five judgements can do.
 *
 * A judgement leaves progress alone, and it has to: a paper deferred halfway
 * through its claim returns to Claim when you queue it again, not to the
 * start. The same rule made queueing a summarised paper do nothing at all. It
 * went to Queued, stayed summarised, and so stayed in Filed, which is right
 * about the record and wrong about what somebody picking "Queued" on a paper
 * they have finished almost always wants, which is to read it again.
 *
 * Two meanings, so two options, and this one says which. It clears progress
 * and nothing else: the claim and the assessment are prose, and stay in the
 * note to be read against on the way back through.
 *
 * Offered only to a paper that has progress to clear.
 */
export const READ_AGAIN = {
	reading: 'queued',
	progress: null,
	label: 'Queued, read it again',
	icon: 'rotate-ccw',
} as const;

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
	if (triage.progress === null) delete frontmatter[PROGRESS_KEY];
	else if (triage.progress !== undefined) frontmatter[PROGRESS_KEY] = triage.progress;

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

	// When a deferral comes back, which only a deferral carries. Any other
	// decision takes both off: a paper queued again is waiting for nothing, and a
	// date left behind would bring it back later from nowhere. Deferring again
	// replaces them, and one left empty is removed rather than kept from before.
	const deferred = triage.reading === 'deferred';
	for (const [key, value] of [
		[UNTIL_KEY, triage.until],
		[AFTER_KEY, triage.after],
	] as const) {
		if (deferred && value) frontmatter[key] = value;
		else delete frontmatter[key];
	}

	sortKeys(frontmatter);
}
