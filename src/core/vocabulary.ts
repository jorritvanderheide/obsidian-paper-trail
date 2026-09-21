// The tag axes, in one place. Suggesters, validation and the workflow queries
// all read from here.
//
// There are two, and the plugin owns an axis only because the workflow reads
// it. `type` is structural: the state machine is written in terms of inbox,
// filed and living, so its parts are fixed and only the words are yours.
// `domain` is "which of my contexts is this", per-person by definition, so its
// values are a setting.
//
// Provenance deliberately gets no axis. Whose claim this is, the vault already
// answers twice over: a note naming a Zotero item is someone else's work, and
// inside a note it is the citation on a sentence that says whose the sentence
// is. A tag would be a worse copy of both, and at the wrong grain, since the
// unit of that question is the sentence rather than the note.

/**
 * Separates corpora, not topics. The question it answers is whether a note can
 * end up in the thesis, which is why the shipped default leads with research.
 * Override the values in the settings.
 */
export const DOMAIN = ['research', 'teaching', 'admin', 'personal'] as const;

/**
 * The three parts a `type` value can play. The workflow reads the role, never
 * the word, so the words are yours: call them new, sorted and evergreen if you
 * like. There are exactly three because the machine has room for exactly three,
 * and a fourth value nothing reads would be a tag you could set by hand anyway.
 */
export const ROLES = ['inbox', 'filed', 'living'] as const;
export type Role = (typeof ROLES)[number];

/** Which word plays which part. The default names them after the parts. */
export type Types = Record<Role, string>;

export const TYPE: Types = { inbox: 'inbox', filed: 'filed', living: 'living' };

/** The part this value plays, or null when it plays none. */
export function roleOf(types: Types, value: string | null): Role | null {
	if (value === null) return null;
	return ROLES.find((role) => types[role] === value) ?? null;
}

/** The three axes, as values, so a tag can be checked against them. */
export const AXES = ['domain', 'type'] as const;
export type Axis = (typeof AXES)[number];

export type Domain = (typeof DOMAIN)[number];


/** Values where a bare capital gives the wrong word, because they are acronyms. */
const LABELS: Record<string, string> = { ai: 'AI', phd: 'PhD' };

export function label(value: string): string {
	return LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Whether a tag is a valid value on its axis. Exact match, not `startsWith`:
 * nested values like `domain/phd/wp1` are refused rather than silently accepted,
 * because nothing offers them and a typo would only surface as a split tag tree.
 */
/** The values allowed on each axis, for a given configuration. */
export interface Vocabulary {
	domains: readonly string[];
	types: Types;
}

export const DEFAULT_VOCABULARY: Vocabulary = { domains: DOMAIN, types: TYPE };

export function valuesOn(axis: Axis, vocabulary: Vocabulary): readonly string[] {
	if (axis === 'domain') return vocabulary.domains;
	return ROLES.map((role) => vocabulary.types[role]);
}

export function isValid(axis: Axis, value: string, vocabulary: Vocabulary = DEFAULT_VOCABULARY): boolean {
	return valuesOn(axis, vocabulary).includes(value);
}

/**
 * Read a value list out of a setting. It is free text because it is a list
 * of someone's own contexts, so this is the only place that decides what counts
 * as a usable tag value.
 *
 * Nested values are flattened rather than refused: a slash in a domain would
 * split the tag tree in a way nothing offers and nothing validates, and
 * silently dropping what someone typed is worse than correcting it.
 */
export function parseValues(value: unknown, fallback: readonly string[]): string[] {
	const raw = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? (value as unknown[]) : [];

	const cleaned = raw
		.map((entry) => (typeof entry === 'string' ? entry : ''))
		.map((entry) => entry.trim().toLowerCase().replace(/\s+/g, '-'))
		.map((entry) => entry.replace(/[^a-z0-9-]/g, ''))
		.map((entry) => entry.replace(/^-+|-+$/g, ''))
		.filter((entry) => entry.length > 0);

	// An empty list would leave filing with nothing to offer, which is worse
	// than ignoring what was typed.
	const unique = [...new Set(cleaned)];
	return unique.length > 0 ? unique : [...fallback];
}

/** The axis value carried in a note's tag list, if it carries one. */
export function axisValue(tags: string[], axis: Axis): string | null {
	const prefix = `${axis}/`;
	for (const tag of tags) {
		if (tag.startsWith(prefix)) return tag.slice(prefix.length);
	}
	return null;
}

/**
 * Replace the value on one axis, or drop the axis with null. Sorted on the way
 * out, because the Linter sorts tag arrays ascending and a note that comes back
 * already sorted does not show up as a diff the next time it runs.
 */
/**
 * A plain string rather than an `Axis`, because one caller is not an axis: the
 * derived `status/` tag names its own namespace in a setting, since the
 * workflow never reads it and a vault may already use that word.
 */
export function setAxis(tags: string[], axis: string, value: string | null): string[] {
	const rest = tags.filter((tag) => !tag.startsWith(`${axis}/`));
	if (value !== null) rest.push(`${axis}/${value}`);
	return rest.sort();
}

/** Frontmatter `tags` as a list, whatever shape it was written in. */
export function readTags(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((tag): tag is string => typeof tag === 'string');
	if (typeof value === 'string') return value.split(/[,\s]+/).filter(Boolean);
	return [];
}

/**
 * The `type` a new note must end up carrying.
 *
 * Filing is the ordering principle: everything you write joins the loop and
 * leaves it once it has a domain. A template may opt out by declaring a living
 * type, but it has to say so, and a template that declares nothing the
 * vocabulary knows joins the loop rather than falling outside it. A note
 * nothing ever asks about again is a note you lose, and the point of the inbox
 * is that losing one has to be a decision.
 */
export function typeForNewNote(tags: string[], types: Types): string {
	const value = axisValue(tags, 'type');
	return value !== null && roleOf(types, value) !== null ? value : types.inbox;
}
