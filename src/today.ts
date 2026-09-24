// The date, as the vault writes it and as a deferral is compared against.
//
// Local, not UTC. This used to be `toISOString().slice(0, 10)`, which is the
// date in Greenwich: anywhere east of it, a decision made just after midnight
// was stamped with yesterday, and anywhere west, one made in the evening with
// tomorrow. For `reading-date` that was a day off in a record; for a deferral
// due on a date it would bring a paper back a day early or late.
//
// Its own file because it reads the clock, which `core/` may not, and both the
// commands and the queue need the same answer.

/** Today as `YYYY-MM-DD`, in the timezone of the machine Obsidian runs on. */
export function today(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
