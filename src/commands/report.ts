// Writing the exclusions report out as a note.
//
// Reads the vault, writes one file, and that file is yours from then on: it is
// overwritten on purpose every time you ask for it, because a report is a
// snapshot of a record that lives elsewhere. The record is the frontmatter on
// each paper; this is only a view of it.
import { Notice, normalizePath, type TFile } from 'obsidian';
import { decidedOf, excluded, isReport, renderReport, type Decided } from '../core/record';
import { today } from './reading';
import { settle } from '../ui/editing';
import { reveal } from '../ui/reveal';
import type { Context } from '../context';

const REPORT = 'Excluded papers.md';

/** Every paper in the vault, as the record sees it. The reading is core's. */
function decided(context: Context): Decided[] {
	const app = context.app;

	return app.vault
		.getMarkdownFiles()
		.map((file) => decidedOf(app.metadataCache.getFileCache(file)?.frontmatter, file, context.settings.keyField))
		.filter((paper): paper is Decided => paper !== null);
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
 *
 * Rewritten only when the file at that path is a report, though. A fixed name
 * in the vault root is a name somebody else may have used first, and
 * "Excluded papers" is a plausible thing to call a note you wrote by hand.
 * Refusing is the same answer `createPaperNote` gives a colliding note, for
 * the same reason.
 */
export async function writeReport(context: Context): Promise<void> {
	const app = context.app;
	const report = excluded(decided(context));
	const markdown = renderReport(report, today());

	const path = normalizePath(REPORT);

	const existing = app.vault.getFileByPath(path);
	if (existing && !isReport(app.metadataCache.getFileCache(existing)?.frontmatter)) {
		throw new Error(
			`${path} already exists and was not written by Paper Trail.\n` +
				'Delete it, or rename it out of the way, and try again.',
		);
	}

	if (existing) await settle(app, existing);
	const file: TFile = existing ?? (await app.vault.create(path, markdown));
	if (existing) await app.vault.process(existing, () => markdown);

	await reveal(app, file);
	new Notice(`Ruled out ${report.rows.length} of the ${report.considered} papers decided on.`);
}
