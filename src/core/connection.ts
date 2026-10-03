// What the settings tab says about Zotero: whether it answers, and whether
// Better BibTeX is there to name papers for their citation keys.

/**
 * Whether Zotero answered the last time anything asked it something, and what
 * it said if it did not. Null until something has asked.
 */
export type Contact = { reachable: true } | { reachable: false; reason: string } | null;

/** What Better BibTeX said when asked whether it is there, or null when nobody could ask. */
export type BetterBibtex = 'ready' | 'starting' | 'missing' | null;

/**
 * One sentence for the state of both, in the order you would fix them.
 *
 * Zotero first, because without it nothing else can be asked: a Better BibTeX
 * that did not answer from a Zotero that is closed is not missing. A Zotero
 * that refused is the same, since Better BibTeX answers on the same port
 * whether the local API is on or not, and the refusal is the thing to fix.
 *
 * Better BibTeX missing is not a warning. It is optional, and the sentence says
 * what you get without it rather than telling you to install it.
 */
export function connectionStatus(contact: Contact, betterBibtex: BetterBibtex): string {
	if (contact === null) return 'Asking Zotero…';
	if (!contact.reachable) return contact.reason;

	switch (betterBibtex) {
		case 'ready':
			return 'Zotero is answering, and Better BibTeX is installed, so papers are named for their citation keys.';
		case 'starting':
			return 'Zotero is answering. Better BibTeX is still starting, so check again in a moment.';
		case 'missing':
			return "Zotero is answering. Better BibTeX isn't installed, so papers are named for author, title and year, and Insert citation won't work.";
		case null:
			return 'Zotero is answering.';
	}
}
