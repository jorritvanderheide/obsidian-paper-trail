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
	/** Zotero data directory. Empty means: ask Zotero's prefs.js, then ~/Zotero. */
	dataDir: string;
	/** Port of Zotero's local API. */
	apiPort: number;

	/** Flat folder holding your own notes. */
	notesFolder: string;
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
	/** Where the note templates are kept, and seeded to when they are missing. */
	templateFolder: string;
	/**
	 * The heading a literature note is finished under. A paper leaves Write up
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

	/** Item ref to the attachment its text was last read from, to skip the API next time. */
	attachments: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
	version: SETTINGS_VERSION,
	keyField: 'zotero-key',
	dataDir: '',
	apiPort: 23119,
	notesFolder: 'Notes',
	papersFolder: 'Literature',
	statusTag: '',
	domains: [...DOMAIN],
	templateFolder: 'Templates/Notes',
	claimHeading: 'Claim',
	assessmentHeading: 'Assessment',
	attachments: {},
};

function record<T>(value: unknown, isValue: (entry: unknown) => entry is T): Record<string, T> {
	if (typeof value !== 'object' || value === null) return {};
	return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, T] => isValue(entry[1])));
}

const isString = (value: unknown): value is string => typeof value === 'string';

/** A saved string, trimmed, or the default when it is missing or blank. */
function text(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function loadSettings(raw: unknown): Settings {
	const data = migrate((typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>) as Partial<
		Record<keyof Settings, unknown>
	>;
	const port = Number(data.apiPort);
	return {
		version: SETTINGS_VERSION,
		keyField: text(data.keyField, DEFAULT_SETTINGS.keyField),
		// The one field where empty is meaningful: it means "ask Zotero".
		dataDir: typeof data.dataDir === 'string' ? data.dataDir.trim() : DEFAULT_SETTINGS.dataDir,
		apiPort: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_SETTINGS.apiPort,
		notesFolder: text(data.notesFolder, DEFAULT_SETTINGS.notesFolder),
		papersFolder: text(data.papersFolder, DEFAULT_SETTINGS.papersFolder),
		// The one other field where empty is meaningful: it means "write no tags".
		statusTag: typeof data.statusTag === 'string' ? data.statusTag.trim() : DEFAULT_SETTINGS.statusTag,
		domains: parseValues(data.domains, DOMAIN),
		templateFolder: text(data.templateFolder, DEFAULT_SETTINGS.templateFolder),
		claimHeading: text(data.claimHeading, DEFAULT_SETTINGS.claimHeading),
		assessmentHeading: text(data.assessmentHeading, DEFAULT_SETTINGS.assessmentHeading),
		attachments: record(data.attachments, isString),
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
