// The question for a pass, drawn on the line you would answer it on.
//
// It was a notice, raised every time you arrived at an empty heading. That
// taught the question once and then repeated it at somebody who knew it: by
// the tenth claim it was a popup restating what you were about to type, and a
// popup you learn to ignore takes the ones worth reading down with it.
//
// Before that it was an HTML comment the template left under each heading,
// which sat in every paper ever made, went stale when the wording changed, and
// stayed under the claim after the claim was written.
//
// Drawn rather than written, it has neither fault. It is in no file, so there
// is nothing to go stale or be left behind; it is there when you look at the
// empty section and gone on your first keystroke; and an empty setting turns
// it off for somebody who no longer needs asking.
//
// Wiring only. Which line, and whether at all, is `questionLine` in core.
import { editorInfoField, type TFile } from 'obsidian';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { isPaper } from '../core/paper-note';
import { questionLine } from '../core/stages';
import type { Context } from '../context';

/** Draw again without the text having changed. */
const redraw = StateEffect.define<null>();

class Question extends WidgetType {
	constructor(private readonly text: string) {
		super();
	}

	eq(other: Question): boolean {
		return other.text === this.text;
	}

	// The global helper rather than the document the editor is in: a node made
	// in the main window is adopted by a popout one when the editor inserts it.
	toDOM(): HTMLElement {
		return createSpan({
			cls: 'paper-trail-question',
			text: this.text,
			// Decoration, not content: a screen reader reading the note should read
			// the note.
			attr: { 'aria-hidden': 'true' },
		});
	}

	// Clicks go to the editor, so clicking the question puts the cursor on its
	// line rather than landing on a widget that does nothing.
	ignoreEvent(): boolean {
		return false;
	}
}

/** The editor extension, registered once for every markdown editor. */
export function questions(context: Context) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			private readonly listening: ReturnType<Context['app']['metadataCache']['on']>;

			constructor(private readonly view: EditorView) {
				this.decorations = draw(view, context);

				// Whether this is a paper comes from the metadata cache, and a note a
				// decision has just written is open before the cache has read it.
				// Drawn from the text alone, the question would not appear until you
				// typed, which is also what takes it away.
				this.listening = context.app.metadataCache.on('changed', (file) => {
					if (file === fileOf(this.view)) this.view.dispatch({ effects: redraw.of(null) });
				});
			}

			update(update: ViewUpdate): void {
				const asked = update.transactions.some((tr) => tr.effects.some((effect) => effect.is(redraw)));
				if (update.docChanged || update.viewportChanged || asked) this.decorations = draw(update.view, context);
			}

			destroy(): void {
				context.app.metadataCache.offref(this.listening);
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}

function fileOf(view: EditorView): TFile | null {
	return view.state.field(editorInfoField, false)?.file ?? null;
}

function draw(view: EditorView, context: Context): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const file = fileOf(view);
	const settings = context.settings;

	// Papers only. A note of your own with a heading called Claim is yours, and
	// the plugin has no question to put to it.
	if (!file || !isPaper(context.app.metadataCache.getFileCache(file)?.frontmatter, settings.keyField)) {
		return builder.finish();
	}

	const lines = view.state.doc.toString().split('\n');
	const asks = [
		{ line: questionLine(lines, settings.claimHeading), text: settings.claimPrompt },
		{ line: questionLine(lines, settings.assessmentHeading), text: settings.assessmentPrompt },
	]
		.filter((ask): ask is { line: number; text: string } => ask.line !== null && ask.text !== '')
		// The builder takes ranges in document order, and a note can have its
		// assessment above its claim.
		.sort((a, b) => a.line - b.line);

	for (const { line, text } of asks) {
		const at = view.state.doc.line(line + 1).from;
		builder.add(at, at, Decoration.widget({ widget: new Question(text), side: 1 }));
	}
	return builder.finish();
}
