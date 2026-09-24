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

import type { StatusTags } from './triage';

/**
 * Stamped on every save, and bumped when a saved key is renamed or its meaning
 * changes. Never for adding or removing one: an absent key already falls back
 * to its default, and a key nothing reads any more is dropped by the loader,
 * which builds a fresh object out of the names it knows rather than editing the
 * saved one.
 *
 * The stamp is here before the first release because it is the one thing that
 * cannot be added afterwards: a rename later on needs to know what it is
 * looking at, and by then the data is already on disk unlabelled. There is no
 * migration step yet, and writing an empty one to hold the place would only be
 * guessing at the shape of a rename nobody has made. The first one reads
 * `data.version` in `loadSettings` and moves the value it is about to drop.
 */
export const SETTINGS_VERSION = 1;

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
	 * Whether a paper Zotero holds and the vault has no note for arrives to be
	 * triaged, or arrives already queued to read.
	 *
	 * Off, so it arrives queued. One of the few settings here with an opinion in
	 * it rather than an address, and it earns the exception by recording
	 * something only you can know: what putting an item in Zotero means to you.
	 *
	 * For a lot of people it means "I have read the abstract and I want this",
	 * because the abstract was on the page in front of them and the connector
	 * button was the decision. Making those people re-take it, one paper at a
	 * time, in a dialog, is asking them to record a judgement they have already
	 * made. Turn this on and the queue asks first; leave it off and Zotero's
	 * save button is the first pass.
	 *
	 * Off also takes Untriaged out of the status chooser, since nothing in a
	 * workflow without triage would ever take a paper back out of it. Triage
	 * itself still exists, for a note that arrives with no `reading` on it.
	 */
	triage: boolean;
	/**
	 * Zotero collection key the queue draws papers from, or empty for the whole
	 * library.
	 *
	 * An address, and the one that decides whether this is usable by anybody
	 * whose Zotero predates the thesis: a library carried through a masters and
	 * two side projects is not one corpus, and a Triage list opening with three
	 * thousand rows is not a queue.
	 *
	 * It scopes what turns up and nothing else, and copies nothing. A note that
	 * already exists for a paper outside the collection is still a paper, still
	 * refreshes, and still sits in whatever stage it reached, so moving
	 * something out of a collection in Zotero cannot strand its note here.
	 */
	collection: string;

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
	triage: false,
	collection: '',
	papersFolder: 'Literature',
	statusTag: '',
	retiredStatusTags: [],
	templateFolder: 'Templates',
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
		'What does this paper argue, and what does it sit with or against? One or two sentences of your own; Insert citation makes the link.',
	assessmentPrompt: 'Where does it strain? What is it assuming? What is the evidence actually doing?',
};

/** A saved string, trimmed, or the default when it is missing or blank. */
function text(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function loadSettings(raw: unknown): Settings {
	const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
	return {
		version: SETTINGS_VERSION,
		keyField: text(data.keyField, DEFAULT_SETTINGS.keyField),
		statusPill: typeof data.statusPill === 'boolean' ? data.statusPill : DEFAULT_SETTINGS.statusPill,
		quietNotices: typeof data.quietNotices === 'boolean' ? data.quietNotices : DEFAULT_SETTINGS.quietNotices,
		triage: typeof data.triage === 'boolean' ? data.triage : DEFAULT_SETTINGS.triage,
		// Two fields where empty is meaningful rather than missing, so neither can
		// go through `text`: an empty collection means the whole library, and an
		// empty status tag means write no tags.
		collection: typeof data.collection === 'string' ? data.collection.trim() : DEFAULT_SETTINGS.collection,
		papersFolder: text(data.papersFolder, DEFAULT_SETTINGS.papersFolder),
		statusTag: typeof data.statusTag === 'string' ? data.statusTag.trim() : DEFAULT_SETTINGS.statusTag,
		retiredStatusTags: namespaces(data.retiredStatusTags),
		templateFolder: text(data.templateFolder, DEFAULT_SETTINGS.templateFolder),
		claimHeading: text(data.claimHeading, DEFAULT_SETTINGS.claimHeading),
		assessmentHeading: text(data.assessmentHeading, DEFAULT_SETTINGS.assessmentHeading),
		// Empty is meaningful here as well: it is how you say you know what goes
		// under the heading by now and would rather not be asked.
		claimPrompt: typeof data.claimPrompt === 'string' ? data.claimPrompt.trim() : DEFAULT_SETTINGS.claimPrompt,
		assessmentPrompt:
			typeof data.assessmentPrompt === 'string' ? data.assessmentPrompt.trim() : DEFAULT_SETTINGS.assessmentPrompt,
	};
}

/** A saved list of namespaces, trimmed and deduplicated, blanks dropped. */
function namespaces(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const cleaned = value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim());
	return [...new Set(cleaned.filter((entry) => entry.length > 0))].sort();
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
