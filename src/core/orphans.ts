// Notes carrying tag values the vocabulary no longer knows.
//
// Renaming a value, or removing one, leaves every note that used it holding a
// tag nothing offers and nothing validates. The loop half-heals this by itself,
// because filing a note re-asks for anything invalid, but a note that is
// already filed is never asked again and simply drifts out of every query you
// write. So: say which ones, before the rename rather than after.
import { AXES, isValid, type Axis, type Vocabulary } from './vocabulary';

export interface Orphan {
	path: string;
	title: string;
	axis: Axis;
	value: string;
}

export interface TaggedNote {
	path: string;
	title: string;
	tags: string[];
}

/**
 * Every tag on every note that is not a value its axis knows about.
 *
 * A note can appear more than once: three broken axes are three things to fix,
 * and collapsing them would hide two of them.
 */
export function orphans(notes: TaggedNote[], vocabulary: Vocabulary): Orphan[] {
	const found: Orphan[] = [];

	for (const note of notes) {
		for (const tag of note.tags) {
			const slash = tag.indexOf('/');
			if (slash === -1) continue;

			const axis = tag.slice(0, slash) as Axis;
			if (!AXES.includes(axis)) continue;

			const value = tag.slice(slash + 1);
			if (!isValid(axis, value, vocabulary)) found.push({ path: note.path, title: note.title, axis, value });
		}
	}

	return found;
}

/** Orphans grouped by the tag that caused them, commonest first. */
export function byValue(list: Orphan[]): { tag: string; notes: Orphan[] }[] {
	const groups = new Map<string, Orphan[]>();
	for (const orphan of list) {
		const tag = `${orphan.axis}/${orphan.value}`;
		groups.set(tag, [...(groups.get(tag) ?? []), orphan]);
	}
	return [...groups.entries()]
		.map(([tag, notes]) => ({ tag, notes }))
		.sort((a, b) => b.notes.length - a.notes.length || a.tag.localeCompare(b.tag));
}
