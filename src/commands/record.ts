// Writing the exclusions report out as a note.
//
// Reads the vault, writes one file, and that file is yours from then on: it is
// overwritten on purpose every time you ask for it, because a report is a
// snapshot of a record that lives elsewhere. The record is the frontmatter on
// each paper; this is only a view of it.
import { Notice, normalizePath, type TFile } from 'obsidian';
import { excluded, renderReport, type Decided } from '../core/record';
import { isPaper } from '../core/paper-note';
import { reveal } from '../ui/reveal';
import type { Context } from '../context';

const REPORT = 'Excluded papers.md';

/** Every paper in the vault, as the record sees it. */
function decided(context: Context): Decided[] {
	const app = context.app;
	const keyField = context.settings.keyField;

	return app.vault.getMarkdownFiles().flatMap((file) => {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!isPaper(frontmatter, keyField)) return [];

		const text = (key: string) => (typeof frontmatter[key] === 'string' ? frontmatter[key] : null);

		return [
			{
				title: text('title') ?? file.basename,
				authors: text('authors') ?? '',
				year: typeof frontmatter.year === 'number' ? frontmatter.year : null,
				citekey: text('citekey'),
				// A paper with no reading field has not been assessed, which is
				// exactly what untriaged means.
				reading: text('reading') ?? 'untriaged',
				triaged: text('triaged-date'),
				reason: text('reading-reason'),
				path: file.path,
			},
		];
	});
}

/**
 * Write the table of everything ruled out, and open it.
 *
 * Into the vault root as an ordinary note, so it is searchable, linkable and
 * yours to move. The root rather than a folder of the plugin's choosing,
 * because this is an artefact you export rather than a note you keep, and a
 * setting naming a home for one file would be a setting earning very little.
 *
 * Rewritten in place on every run rather than dated and kept: the history
 * lives on the papers, and a folder of near-identical reports would be the
 * sort of thing you stop reading.
 */
export async function writeReport(context: Context): Promise<void> {
	const app = context.app;
	const report = excluded(decided(context));
	const markdown = renderReport(report, new Date().toISOString().slice(0, 10));

	const path = normalizePath(REPORT);

	const existing = app.vault.getFileByPath(path);
	const file: TFile = existing ?? (await app.vault.create(path, markdown));
	if (existing) await app.vault.modify(existing, markdown);

	await reveal(app, file);
	new Notice(`${report.rows.length} of ${report.assessed} assessed papers ruled out.`);
}
