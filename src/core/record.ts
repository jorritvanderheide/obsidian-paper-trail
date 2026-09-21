// Reading the record back.
//
// `reading`, `reading-date`, `triaged-date` and `reading-reason` have been
// written on every decision since the beginning and read by nothing. The README
// has been promising the table they make up for just as long:
//
//   Four years later that is the table of everything you excluded and why,
//   which is a methods section you wrote one line at a time.
//
// Until this file that table did not exist, and every other thing the plugin
// does is machinery serving a record nobody could read.
//
// Plain markdown rather than a Dataview query, because the reason to want it is
// to put it in a thesis appendix or send it to a supervisor, and neither of
// those has your plugins installed.

/** One paper, as the record sees it. */
export interface Decided {
	title: string;
	authors: string;
	year: number | null;
	citekey: string | null;
	reading: string;
	/** When the first opinion was formed, which is the date a methods section wants. */
	triaged: string | null;
	reason: string | null;
	path: string;
}

/** The states that mean a paper was considered and is not being read. */
const EXCLUDED = new Set(['dropped', 'deferred']);

export interface Report {
	rows: Decided[];
	/** How many papers have been assessed at all, excluded or not. */
	assessed: number;
}

/**
 * Everything ruled out, oldest decision first.
 *
 * Oldest first because the question it answers is how a corpus was narrowed,
 * and that reads forwards. Papers with no date sort last rather than being
 * dropped: an undated decision is still a decision, and hiding it would make
 * the count disagree with the table under it.
 */
export function excluded(papers: Decided[]): Report {
	const rows = papers
		.filter((paper) => EXCLUDED.has(paper.reading))
		.sort((a, b) => (a.triaged ?? '9999').localeCompare(b.triaged ?? '9999') || a.title.localeCompare(b.title));

	const assessed = papers.filter((paper) => paper.reading !== 'untriaged').length;
	return { rows, assessed };
}

/** A cell that cannot break the table it sits in. */
function cell(value: string | number | null): string {
	if (value === null || value === '') return '';
	// A pipe in a title ends the column early and silently shifts every later
	// one, which in a table meant to be read years from now is a lie rather
	// than a glitch.
	return String(value).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

/**
 * The report as a markdown document.
 *
 * `date` is passed in rather than read from the clock, so the same input always
 * gives the same output and this stays testable.
 */
export function renderReport(report: Report, date: string): string {
	const { rows, assessed } = report;

	const lines = [
		'# Excluded papers',
		'',
		`${rows.length} of ${assessed} assessed ${assessed === 1 ? 'paper has' : 'papers have'} been ruled out. Generated ${date}.`,
		'',
	];

	if (rows.length === 0) {
		lines.push('Nothing has been dropped or deferred yet.', '');
		return lines.join('\n');
	}

	lines.push(
		'| Paper | Authors | Year | Decided | On | Why |',
		'| --- | --- | --- | --- | --- | --- |',
		...rows.map((row) => {
			const cells = [
				// Linked by path, so the table is a way back into the vault and not
				// just a list of titles you then have to search for.
				`[[${row.path.replace(/\.md$/, '')}\\|${cell(row.title)}]]`,
				cell(row.authors),
				cell(row.year),
				cell(row.reading),
				cell(row.triaged),
				cell(row.reason),
			];
			return `| ${cells.join(' | ')} |`;
		}),
		'',
	);

	return lines.join('\n');
}
