// Keeping frontmatter in a predictable order.
//
// YAML mapping order carries no meaning, so the only question is which order is
// least annoying. Alphabetical wins twice: a key is where you expect it in a
// note you have not opened for a year, and a diff shows what changed rather
// than where a serialiser decided to put things.

/**
 * Sort a frontmatter object's keys in place.
 *
 * In place because `processFrontMatter` hands over the object it will write,
 * and replacing it would be ignored. Deleting and reinserting is how you
 * reorder an object's keys, since insertion order is what gets serialised.
 */
export function sortKeys(frontmatter: Record<string, unknown>): void {
	const sorted = Object.keys(frontmatter).sort();
	const values = { ...frontmatter };

	for (const key of sorted) delete frontmatter[key];
	for (const key of sorted) frontmatter[key] = values[key];
}
