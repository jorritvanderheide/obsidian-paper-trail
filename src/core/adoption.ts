// Literature notes another plugin made, linked to the papers they are about so
// Paper Trail can take them over.
//
// Matched by citation key, which is the one thing every Zotero plugin for
// Obsidian puts on a note: in a `citekey` property, or in the note's name, with
// or without the `@` the Citations plugin puts in front of it. Linking writes
// the item key and nothing else. The note's first sync does the rest, which is
// why this says beforehand what that sync will replace.
import { replacedKeys, paperFrontmatter } from './paper-note';
import { isPaperItem, parseItemRef, type ApiItem } from './zotero';

/** A note in the vault, as much of it as matching needs. */
export interface Candidate {
	path: string;
	basename: string;
	frontmatter: Record<string, unknown> | undefined;
}

export interface Adoption {
	path: string;
	/** The Zotero item key, which goes under the item key property. */
	key: string;
	/** Properties the note has with other values than Zotero's, which its first sync replaces. */
	replaced: string[];
}

export interface AdoptionPlan {
	adopt: Adoption[];
	/** Notes about a paper that already has a paper note. */
	taken: string[];
	/** Citation keys more than one note was matched by. Every one of those notes is left alone. */
	shared: string[];
	/** Whether Zotero gave any item a citation key, which without Better BibTeX it does not. */
	keyed: boolean;
}

/** The citation keys a note might have been made for, the property first. */
function citekeysOf(note: Candidate): string[] {
	const property = note.frontmatter?.citekey;
	const keys = typeof property === 'string' && property.trim() ? [property.trim()] : [];
	return [...keys, note.basename.replace(/^@/, '')];
}

/**
 * Which notes can be linked, and which are left alone and why.
 *
 * A note that matches nothing is not mentioned. Most of a vault is not
 * literature notes, and listing every daily note that is not a paper would
 * bury the answer.
 *
 * Only a note with no item key property at all is a candidate. One that has
 * the property with something other than text in it is not a paper, but the
 * value is somebody's and this does not overwrite it.
 */
export function planAdoption(notes: Candidate[], items: ApiItem[], keyField: string): AdoptionPlan {
	// Two items with one citation key are left out rather than guessed between.
	const byCitekey = new Map<string, ApiItem | null>();
	for (const item of items.filter(isPaperItem)) {
		const citekey = item.data.citationKey?.trim();
		if (citekey) byCitekey.set(citekey, byCitekey.has(citekey) ? null : item);
	}

	const papers = new Set(
		notes.flatMap((note) => {
			const ref = parseItemRef(note.frontmatter?.[keyField]);
			return ref && ref.groupID === null ? [ref.key] : [];
		}),
	);

	const taken: string[] = [];
	const byItem = new Map<string, { item: ApiItem; notes: Candidate[] }>();
	for (const note of notes) {
		if (note.frontmatter?.[keyField] !== undefined) continue;

		const item = citekeysOf(note)
			.map((citekey) => byCitekey.get(citekey))
			.find((found) => found);
		if (!item) continue;

		if (papers.has(item.key)) {
			taken.push(note.path);
			continue;
		}
		const entry = byItem.get(item.key) ?? { item, notes: [] };
		entry.notes.push(note);
		byItem.set(item.key, entry);
	}

	const adopt: Adoption[] = [];
	const shared: string[] = [];
	for (const { item, notes: matched } of byItem.values()) {
		const [only] = matched;
		if (matched.length > 1 || !only) {
			shared.push(item.data.citationKey?.trim() ?? item.key);
			continue;
		}
		const managed = paperFrontmatter(item, { key: item.key, groupID: null }, only.basename);
		adopt.push({ path: only.path, key: item.key, replaced: replacedKeys(only.frontmatter ?? {}, managed, keyField) });
	}

	return {
		adopt: adopt.sort((a, b) => a.path.localeCompare(b.path)),
		taken: taken.sort(),
		shared: shared.sort(),
		keyed: byCitekey.size > 0,
	};
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
function list(words: string[]): string {
	return words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * What linking will do, said before it does it: one paragraph per thing worth
 * knowing, for a confirmation, or a notice when there is nothing to link.
 */
export function adoptionSummary(plan: AdoptionPlan, keyField: string): string[] {
	const { adopt, taken, shared, keyed } = plan;
	const out: string[] = [];

	if (!keyed) {
		return [
			"Zotero didn't give any of your papers a citation key, so there's nothing to match your notes by. Install Better BibTeX in Zotero, which gives every paper one, and try again.",
		];
	}

	if (adopt.length === 0) {
		out.push(
			"Found no notes to link. Paper Trail looks for notes with a citekey property, or named for a paper's citation key, with or without an @ in front.",
		);
	} else {
		const many = adopt.length > 1;
		out.push(
			`${count(adopt.length, 'note', 'notes')} in your vault ${many ? 'are about papers' : 'is about a paper'} in your Zotero library. Paper Trail adds a ${keyField} property to ${many ? 'each one' : 'it'}, which makes it a paper's note.`,
		);
		out.push(
			"The next time you open one, its title, authors, year, citekey and zotero properties are filled in from Zotero, and its annotations are added at the end. Nothing else in the note changes, so annotations another plugin put in it stay where they are, for you to keep or delete.",
		);

		const replacing = adopt.filter((entry) => entry.replaced.length > 0);
		if (replacing.length > 0) {
			const keys = [...new Set(replacing.flatMap((entry) => entry.replaced))].sort();
			out.push(
				`⚠ ${count(replacing.length, 'note already has', 'notes already have')} ${list(keys)} with other values. Those are replaced with what Zotero has.`,
			);
		}

		out.push(
			`${many ? 'They' : 'It'} show${many ? '' : 's'} up in Triage, because Paper Trail doesn't know yet what you decided. Choose Already read for the papers you've read.`,
		);
	}

	if (taken.length > 0) {
		const many = taken.length > 1;
		out.push(
			`${count(taken.length, 'note is', 'notes are')} about ${many ? 'papers that already have' : 'a paper that already has'} a paper note, so ${many ? "they're" : "it's"} left alone.`,
		);
	}

	if (shared.length > 0) {
		out.push(
			`More than one note matches ${list(shared)}, so those notes are left alone. Merge them into one, and run this again.`,
		);
	}

	return out;
}
