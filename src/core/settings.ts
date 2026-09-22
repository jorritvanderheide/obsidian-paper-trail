// Settings are addresses, not opinions.
//
// What lives here is the set of names the plugin would otherwise hardcode: a
// folder, a heading, a frontmatter property. Getting one of those wrong breaks
// something silently, so each is worth a field.
//
// What deliberately does not live here: the tag axis, the workflow stages,
// the `reading` vocabulary. Those are the product. Making them
// configurable would turn an opinionated workflow into a rules engine that asks
// the user to invent one, which is what Dataview already is.

import { DOMAIN, parseValues, type Vocabulary } from './vocabulary';

/**
 * Bumped when a saved key is renamed or its meaning changes, never for adding
 * one: an absent key already falls back to its default.
 *
 * Data written before versioning existed has no `version` at all, which reads
 * as 0. Establishing that baseline now is the point; doing it after people have
 * saved settings means guessing what their data was.
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
	 * Whether a paper Zotero holds and the vault has no note for arrives to be
	 * triaged, or arrives already queued to read.
	 *
	 * Off, so it arrives queued. This is the one setting here with an opinion in
	 * it rather than an address, and it earns the exception the same way
	 * `domains` does: it records something only you can know, which is what
	 * putting an item in Zotero means to you.
	 *
	 * For a lot of people it means "I have read the abstract and I want this",
	 * because the abstract was on the page in front of them and the connector
	 * button was the decision. Making those people re-take it, one paper at a
	 * time, in a dialog, is asking them to record a judgement they have already
	 * made. Turn this on and the queue asks first; leave it off and Zotero's
	 * save button is the first pass.
	 *
	 * Nothing about the stage changes either way. Triage still exists, still
	 * holds anything you send back to it, and still writes the same record.
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
	 * An address rather than an opinion, and configurable where the other axes
	 * are not, for one reason: nothing in the workflow reads this tag. `reading`
	 * in the frontmatter stays the value every rule uses, so setting or clearing
	 * this cannot change what the plugin does, only what a tag explorer can see.
	 *
	 * Empty by default. Navigating by tag is a real way to work and not the
	 * common one, and a plugin that wrote tags into a stranger's notes unasked
	 * would leave them editing every file to undo it.
	 *
	 * Naming the namespace rather than taking a yes or no is what keeps it from
	 * colliding with a `status/` a vault already uses for something else.
	 */
	statusTag: string;
	/** Values on the `domain/` axis. Per-person by definition, so not in code. */
	domains: string[];
	/** Where the paper template is kept, and seeded to when it is missing. */
	templateFolder: string;
	/**
	 * The heading a literature note is finished under. A paper leaves Reading
	 * once this has anything below it, so renaming it in the paper template
	 * without changing it here would keep every read paper on the list forever.
	 */
	claimHeading: string;
	/**
	 * The heading the third pass is finished under. A paper promoted to a third
	 * pass leaves the list once this has anything below it, which is the same
	 * trick the claim heading plays one pass earlier.
	 */
	assessmentHeading: string;

}

export const DEFAULT_SETTINGS: Settings = {
	version: SETTINGS_VERSION,
	keyField: 'zotero-key',
	statusPill: true,
	triage: false,
	collection: '',
	papersFolder: 'Literature',
	statusTag: '',
	domains: [...DOMAIN],
	templateFolder: 'Templates',
	claimHeading: 'Claim',
	assessmentHeading: 'Assessment',
};

/** A saved string, trimmed, or the default when it is missing or blank. */
function text(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function loadSettings(raw: unknown): Settings {
	const data = migrate((typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>) as Partial<
		Record<keyof Settings, unknown>
	>;
	return {
		version: SETTINGS_VERSION,
		keyField: text(data.keyField, DEFAULT_SETTINGS.keyField),
		statusPill: typeof data.statusPill === 'boolean' ? data.statusPill : DEFAULT_SETTINGS.statusPill,
		triage: typeof data.triage === 'boolean' ? data.triage : DEFAULT_SETTINGS.triage,
		// Two fields where empty is meaningful rather than missing, so neither can
		// go through `text`: an empty collection means the whole library, and an
		// empty status tag means write no tags.
		collection: typeof data.collection === 'string' ? data.collection.trim() : DEFAULT_SETTINGS.collection,
		papersFolder: text(data.papersFolder, DEFAULT_SETTINGS.papersFolder),
		statusTag: typeof data.statusTag === 'string' ? data.statusTag.trim() : DEFAULT_SETTINGS.statusTag,
		domains: parseValues(data.domains, DOMAIN),
		templateFolder: text(data.templateFolder, DEFAULT_SETTINGS.templateFolder),
		claimHeading: text(data.claimHeading, DEFAULT_SETTINGS.claimHeading),
		assessmentHeading: text(data.assessmentHeading, DEFAULT_SETTINGS.assessmentHeading),
	};
}

/**
 * Bring saved data up to the current version.
 *
 * Nothing to do yet, and that is the useful state to be in: the shape is
 * recorded, so the first rename has somewhere obvious to go instead of
 * silently dropping whatever people had set.
 *
 * Migrations run in order and each one moves the data forward a single step,
 * so a vault that skipped three releases arrives by the same path as one that
 * skipped none.
 */
export function migrate(data: Record<string, unknown>): Record<string, unknown> {
	const from = typeof data.version === 'number' ? data.version : 0;
	if (from >= SETTINGS_VERSION) return data;

	const out = { ...data };
	// for (let v = from; v < SETTINGS_VERSION; v++) { ... }
	out.version = SETTINGS_VERSION;
	return out;
}

/** The vocabulary these settings describe, for validation and for pickers. */
export function vocabularyOf(settings: Settings): Vocabulary {
	return { domains: settings.domains };
}
