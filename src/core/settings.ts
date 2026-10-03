// Settings are addresses, not opinions.
//
// What lives here is the set of names the plugin would otherwise hardcode: a
// folder, a heading, a frontmatter property. Getting one of those wrong breaks
// something silently, so each is worth a field.
//
// What deliberately does not live here: the workflow stages and the `reading`
// vocabulary. Those are the product. Making them configurable would turn an
// opinionated workflow into a rules engine that asks the user to invent one,
// which is what Dataview already is.
//
// A stage can be switched off, which is not the same thing: triage, source by
// source, and `passes` take stages away and never add, rename or reorder one,
// so every rule about what a stage means still holds wherever the stage is
// worked.

import { PASSES, type Passes, type StatusTags, type Workflow } from './triage';
import { sameSource, type Source } from './sources';

/**
 * Stamped on every save, and bumped when a saved key is renamed or its meaning
 * changes. Never for adding or removing one: an absent key already falls back
 * to its default, and a key nothing reads any more is dropped by the loader,
 * which builds a fresh object out of the names it knows rather than editing the
 * saved one.
 *
 * The stamp was there before the first release because it is the one thing
 * that cannot be added afterwards: a rename later on needs to know what it is
 * looking at, and by then the data is already on disk unlabelled.
 *
 * 2: `collection` and `triage` became `sources`, one place with its own
 * triage switch, which `sourcesOf` reads either way.
 */
export const SETTINGS_VERSION = 2;

export interface Settings {
	version: number;
	/**
	 * Frontmatter property holding the Zotero item key, written and read at both
	 * ends. Its point is adoption: aim it at whatever your existing literature
	 * notes already use and they are recognised without being rewritten.
	 *
	 * Changing it after papers exist does not migrate them, and nothing can: the
	 * old notes stop being papers, so the command that would fix them cannot
	 * find them either.
	 */
	keyField: string;
	/**
	 * Whether a paper's reading state is shown in its own title bar.
	 *
	 * On, and the one thing here that is a preference about chrome rather than
	 * about the workflow. It changes nothing the plugin does and nothing it
	 * writes: the frontmatter is the record either way, and this is a second
	 * place to read it for anyone who keeps the properties panel shut.
	 *
	 * Off if you keep properties open, where it would be the same word twice.
	 */
	statusPill: boolean;
	/**
	 * Whether to stop saying what you can already see.
	 *
	 * Off, and the second thing here that is a preference about chrome rather
	 * than about the workflow. It silences everything that is neither a failure
	 * nor a warning: where a decision put a paper, that a pass is finished, what
	 * a refresh found, that nothing is left to do.
	 *
	 * It never silences a failure, because a plugin that fails quietly is a
	 * plugin that looks broken, and never a warning, which is a failure of the
	 * thing you asked for: no paper open, no citation key. The price is a
	 * command with nothing to do saying nothing, Next on an empty queue or a
	 * refresh that found no change, and turning it on is asking to pay it.
	 */
	quietNotices: boolean;
	/**
	 * Which written passes follow a reading: none, the claim, or the claim and,
	 * for papers you promote, the assessment.
	 *
	 * Both, and the second setting here with an opinion in it. It earns the
	 * exception the way triage does: what a reading is for is yours to know.
	 * Somebody who annotates in Zotero and writes by theme rather than by paper
	 * has nothing to put under a Claim heading, and a queue that keeps asking for
	 * one is a queue they stop opening.
	 *
	 * It changes what is offered and nothing that is written. A paper already
	 * promoted still owes its assessment, and a read paper waits on a claim again
	 * the moment claims are turned back on.
	 */
	passes: Passes;
	/**
	 * Where the queue draws papers from: libraries and collections, read top to
	 * bottom, and whether a paper from each arrives to be triaged.
	 *
	 * Addresses, and the ones that decide whether this is usable by anybody whose
	 * Zotero predates the thesis: a library carried through a masters and two
	 * side projects is not one corpus, and a Triage list opening with three
	 * thousand rows is not a queue.
	 *
	 * The triage switch on each is the one opinion, and it earns the exception
	 * by recording something only you can know: what putting an item there
	 * means. For your own saves it is usually "I have read the abstract and I
	 * want this", because the connector button was the decision, and making you
	 * re-take it one paper at a time is asking for a judgement already made. A
	 * lab's reading list is the opposite: somebody else put it there. Off for a
	 * source, and Zotero's save button is the first pass; on, and the queue asks
	 * first. With it off everywhere, Untriaged leaves the status chooser, since
	 * nothing would ever take a paper back out of it.
	 *
	 * They scope what turns up and nothing else, and copy nothing. A note that
	 * already exists for a paper outside them is still a paper, still refreshes,
	 * and still sits in whatever stage it reached, so moving something out of a
	 * collection in Zotero cannot strand its note here.
	 */
	sources: Source[];
	/**
	 * Whether a collection under Papers from includes the collections under it.
	 *
	 * On, because a thesis collection is usually a tree, a chapter or a question
	 * to a branch, and a queue showing only what was filed at the top of it
	 * looked like a queue missing papers for no reason.
	 */
	subcollections: boolean;
	/**
	 * Whether underlines are synced along with highlights.
	 *
	 * On, so every annotation comes through. Another opinion rather than an
	 * address, and it earns the exception the way triage does: what an underline
	 * means is yours to know. For some people it is a passage like any other, and
	 * for others it marks a term to find their way back to, and a note quoting
	 * "trust" and "verified" between the passages buries them.
	 *
	 * Off leaves out an underline with no comment, and nothing else. It changes
	 * no stored value, only what the next sync draws in the annotations region.
	 */
	underlines: boolean;

	/** Flat folder holding one note per paper, named for its citation key. */
	papersFolder: string;
	/**
	 * Tag namespace to mirror a paper's reading status into, or empty for none.
	 *
	 * An address rather than an opinion, and the only tag the plugin writes, for
	 * one reason: nothing in the workflow reads it. `reading` in the frontmatter
	 * stays the value every rule uses, so setting or clearing this cannot change
	 * what the plugin does, only what a tag explorer can see.
	 *
	 * Empty by default. Navigating by tag is a real way to work and not the
	 * common one, and a plugin that wrote tags into a stranger's notes unasked
	 * would leave them editing every file to undo it.
	 *
	 * Naming the namespace rather than taking a yes or no is what keeps it from
	 * colliding with a `status/` a vault already uses for something else.
	 */
	statusTag: string;
	/**
	 * Namespaces `statusTag` has held before, so the tags written under them can
	 * be taken back out.
	 *
	 * Not shown in the settings tab, because it is not a thing to set: it is the
	 * plugin remembering what it wrote. Without it the mirror is only honest
	 * while the setting never changes, and a paper decided under `literature`
	 * and later dropped under `status` goes on saying `literature/queued`, which
	 * is not stale but false.
	 *
	 * Written when the setting changes, and read on every decision, so a paper
	 * sheds the old namespace the next time you rule on it. Which leaves a gap:
	 * a paper you never decide on again keeps what it has. The settings tab says
	 * how many those are rather than pretending the rename was complete.
	 */
	retiredStatusTags: string[];
	/** Where the paper template is kept, and seeded to when it is missing. */
	templateFolder: string;
	/**
	 * The heading the second pass is written under. It is written into a paper
	 * when the paper comes to owe a claim, and it is where the pencil puts the
	 * cursor; the tick beside the pencil ends the pass, not what is under it.
	 */
	claimHeading: string;
	/**
	 * The heading the third pass is written under, and only papers you promote
	 * are asked for one. The same bargain as the claim heading: it places the
	 * cursor, and the tick ends the pass.
	 */
	assessmentHeading: string;
	/**
	 * The question drawn faintly on the empty line under the Claim heading,
	 * until something is written there. Empty draws nothing.
	 *
	 * A setting, where the rest of this list is addresses rather than opinions,
	 * because it is the text under a heading whose name is already one. Somebody
	 * who calls the section Summary is asking a different question from the one
	 * written for Claim, and has to be able to say so.
	 */
	claimPrompt: string;
	/** The same, under the Assessment heading. */
	assessmentPrompt: string;
}

export const DEFAULT_SETTINGS: Settings = {
	version: SETTINGS_VERSION,
	keyField: 'zotero-key',
	statusPill: true,
	quietNotices: false,
	passes: 'both',
	sources: [{ group: null, collection: '', triage: false }],
	subcollections: true,
	underlines: true,
	papersFolder: 'Literature',
	statusTag: '',
	retiredStatusTags: [],
	templateFolder: 'Templates/Paper Trail',
	claimHeading: 'Claim',
	assessmentHeading: 'Assessment',
	// Two questions, because the second is only answerable here. A literature
	// review is a claim about a field rather than a list of papers: who agrees
	// with whom, what is assumed in common, where the gap is. Those are edges
	// between papers, and having just said what a paper claims is exactly when
	// you know whether it contradicts something you read in March.
	//
	// It names Insert citation because the link is not a thing you would guess
	// your way to. With Better BibTeX a note is named for its citation key, so
	// typing `[[` finds papers by key and not by the title you remember.
	claimPrompt:
		'What does this paper argue, and which other work does it agree or disagree with? One or two sentences, in your own words. Insert citation makes the link.',
	assessmentPrompt: "Where doesn't it hold up? What does it take for granted? What does the evidence actually show?",
};

/**
 * Default prompts a released version shipped and this one no longer does.
 *
 * Settings are saved whole, defaults included, so a vault that never touched a
 * prompt still holds the wording it was installed with, and a new default
 * would only ever reach new vaults. A saved prompt that is exactly one of
 * these is read as the current default instead. One somebody wrote is kept as
 * written, and so is an empty one.
 */
const RETIRED_PROMPTS: Record<'claimPrompt' | 'assessmentPrompt', readonly string[]> = {
	// 1.0.0 to 1.4.1.
	claimPrompt: [
		'What does this paper argue, and what does it sit with or against? One or two sentences of your own; Insert citation makes the link.',
	],
	assessmentPrompt: ['Where does it strain? What is it assuming? What is the evidence actually doing?'],
};

/** A saved prompt, trimmed, with a retired default read as the current one. Empty is kept. */
function prompt(value: unknown, key: 'claimPrompt' | 'assessmentPrompt'): string {
	if (typeof value !== 'string') return DEFAULT_SETTINGS[key];
	const saved = value.trim();
	return RETIRED_PROMPTS[key].includes(saved) ? DEFAULT_SETTINGS[key] : saved;
}

/** A saved string, trimmed, or the default when it is missing or blank. */
function text(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/**
 * The sources, from either shape the settings have been saved in.
 *
 * Version 1 had one `collection`, empty for the whole library, and one
 * `triage` switch for everything, and both become the one source. A saved list
 * is kept as it is, empty included: with nothing under Papers from the queue
 * has nothing from Zotero, and that is a choice somebody made, which the queue
 * says rather than undoes.
 */
function sourcesOf(data: Record<string, unknown>): Source[] {
	if (!Array.isArray(data.sources)) {
		return [{ group: null, collection: typeof data.collection === 'string' ? data.collection.trim() : '', triage: data.triage === true }];
	}

	const out: Source[] = [];
	for (const entry of data.sources as unknown[]) {
		if (typeof entry !== 'object' || entry === null) continue;
		const { group, collection, triage } = entry as Record<string, unknown>;
		// A group is a positive whole number, and anything else names no library.
		if (group !== null && !(typeof group === 'number' && Number.isInteger(group) && group > 0)) continue;

		const source: Source = { group, collection: typeof collection === 'string' ? collection.trim() : '', triage: triage === true };
		if (!out.some((kept) => sameSource(kept, source))) out.push(source);
	}
	return out;
}

export function loadSettings(raw: unknown): Settings {
	const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	return {
		version: SETTINGS_VERSION,
		keyField: text(data.keyField, DEFAULT_SETTINGS.keyField),
		statusPill: typeof data.statusPill === 'boolean' ? data.statusPill : DEFAULT_SETTINGS.statusPill,
		quietNotices: typeof data.quietNotices === 'boolean' ? data.quietNotices : DEFAULT_SETTINGS.quietNotices,
		passes: PASSES.find((known) => known === data.passes) ?? DEFAULT_SETTINGS.passes,
		sources: sourcesOf(data),
		subcollections: typeof data.subcollections === 'boolean' ? data.subcollections : DEFAULT_SETTINGS.subcollections,
		underlines: typeof data.underlines === 'boolean' ? data.underlines : DEFAULT_SETTINGS.underlines,
		papersFolder: text(data.papersFolder, DEFAULT_SETTINGS.papersFolder),
		// Empty is meaningful rather than missing, so this cannot go through
		// `text`: an empty status tag means write no tags.
		statusTag: typeof data.statusTag === 'string' ? data.statusTag.trim() : DEFAULT_SETTINGS.statusTag,
		retiredStatusTags: namespaces(data.retiredStatusTags),
		templateFolder: text(data.templateFolder, DEFAULT_SETTINGS.templateFolder),
		claimHeading: text(data.claimHeading, DEFAULT_SETTINGS.claimHeading),
		assessmentHeading: text(data.assessmentHeading, DEFAULT_SETTINGS.assessmentHeading),
		// Empty is meaningful here as well: it is how you say you know what goes
		// under the heading by now and would rather not be asked.
		claimPrompt: prompt(data.claimPrompt, 'claimPrompt'),
		assessmentPrompt: prompt(data.assessmentPrompt, 'assessmentPrompt'),
	};
}

/** A saved list of namespaces, trimmed and deduplicated, blanks dropped. */
function namespaces(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const cleaned = value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim());
	return [...new Set(cleaned.filter((entry) => entry.length > 0))].sort();
}

/**
 * The stages this vault works, as every rule about what is outstanding wants
 * them.
 *
 * Triage is worked when any source triages. That is what decides whether
 * Untriaged is offered and whether its section shows while empty; which stage
 * a paper with no note goes to is its own source's to say.
 */
export function workflowOf(settings: Pick<Settings, 'sources' | 'passes'>): Workflow {
	return { triage: settings.sources.some((source) => source.triage), passes: settings.passes };
}

/** The namespaces to write and to take back out, as `applyStatusTag` wants them. */
export function statusTagsOf(settings: Settings): StatusTags {
	return { current: settings.statusTag, retired: settings.retiredStatusTags };
}

/**
 * The retired list after changing the status tag to `next`.
 *
 * The namespace being left behind joins the list, and the one being taken up
 * leaves it: picking `literature` again after a spell on `status` means those
 * tags are wanted, not owed a removal.
 *
 * `from` is the setting as it stood before the edit began, not before the last
 * keystroke. The settings text box reports every keystroke, and retiring the
 * value one keystroke back retired every prefix typed on the way to a new
 * name: `s`, `st`, `sta`, `stat` and `statu` on the way to `status`. Each went
 * on the list of namespaces stripped from a paper at its next decision, which
 * would take out somebody's own `stat/` tags along with nothing the plugin
 * ever wrote. The only namespace it wrote under is the one in force before the
 * edit, so that is the only one retired.
 */
export function retireStatusTag(from: Pick<Settings, 'statusTag' | 'retiredStatusTags'>, next: string): string[] {
	const retired = new Set(from.retiredStatusTags);
	retired.add(from.statusTag);
	retired.delete(next.trim());
	retired.delete('');
	return [...retired].sort();
}
