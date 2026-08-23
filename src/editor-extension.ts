import { syntaxTree } from '@codemirror/language';
import { Extension, Range, StateEffect } from '@codemirror/state';
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
} from '@codemirror/view';
import { DesktopSpellchecker } from './electron-spellcheck';
import {
	CompoundIdentifier,
	IdentifierPart,
	isSpellcheckablePart,
	scanCompoundIdentifiers,
} from './identifier';

export interface SpellcheckContextTarget extends IdentifierPart {
	suggestions: string[];
}

const refreshSpellcheckEffect = StateEffect.define<null>();
const EXCLUDED_SYNTAX_PATTERN =
	/code|comment|frontmatter|html|url|autolink|linkmark/i;
const CONTEXT_TARGET_LIFETIME_MS = 2_000;
const SPELLCHECK_DEBOUNCE_MS = 600;

interface DocumentRange {
	from: number;
	to: number;
}

const suppressNativeSpellcheck = Decoration.mark({
	attributes: { spellcheck: 'false' },
	class: 'camel-case-spellcheck-token',
});

const misspellingDecoration = Decoration.mark({
	class: 'camel-case-spellcheck-error',
});

export class CamelCaseSpellcheckController {
	readonly extension: Extension;

	private readonly views = new Set<EditorView>();
	private contextTarget: (SpellcheckContextTarget & { capturedAt: number }) | null =
		null;
	private dictionarySignature: string | null = null;
	private dictionaryPollInProgress = false;

	constructor(readonly spellchecker: DesktopSpellchecker) {
		const views = this.views;

		this.extension = ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;
				private debounceTimer: number | null = null;
				private deferredRanges: readonly DocumentRange[] = [];

				constructor(private readonly view: EditorView) {
					views.add(view);
					this.decorations = buildDecorations(view, spellchecker);
				}

				update(update: ViewUpdate): void {
					if (update.docChanged) {
						this.deferredRanges = getChangedRanges(update);
						this.scheduleSpellcheck();
					}

					const refreshRequested = update.transactions.some((transaction) =>
						transaction.effects.some((effect) =>
							effect.is(refreshSpellcheckEffect),
						),
					);

					if (update.docChanged || update.viewportChanged || refreshRequested) {
						this.decorations = buildDecorations(
							update.view,
							spellchecker,
							this.deferredRanges,
						);
					}
				}

				destroy(): void {
					if (this.debounceTimer !== null) {
						window.clearTimeout(this.debounceTimer);
					}
					views.delete(this.view);
				}

				private scheduleSpellcheck(): void {
					if (this.debounceTimer !== null) {
						window.clearTimeout(this.debounceTimer);
					}

					this.debounceTimer = window.setTimeout(() => {
						this.debounceTimer = null;
						this.deferredRanges = [];
						this.view.dispatch({
							effects: refreshSpellcheckEffect.of(null),
						});
					}, SPELLCHECK_DEBOUNCE_MS);
				}
			},
			{
				decorations: (plugin) => plugin.decorations,
				eventHandlers: {
					contextmenu: (event, view) => {
						this.captureContextTarget(event, view);
						return false;
					},
					focus: (_event, view) => {
						spellchecker.clearCache();
						view.dispatch({ effects: refreshSpellcheckEffect.of(null) });
						return false;
					},
				},
			},
		);
	}

	getContextTarget(): SpellcheckContextTarget | null {
		if (
			!this.contextTarget ||
			Date.now() - this.contextTarget.capturedAt > CONTEXT_TARGET_LIFETIME_MS
		) {
			return null;
		}

		return this.contextTarget;
	}

	addWordToDictionary(word: string): boolean {
		const added = this.spellchecker.addWordToDictionary(word);
		if (added) {
			this.refreshAllViews();
		}
		return added;
	}

	refresh(): void {
		this.spellchecker.clearCache();
		this.refreshAllViews();
	}

	async pollDictionaryChanges(): Promise<void> {
		if (this.dictionaryPollInProgress) {
			return;
		}

		this.dictionaryPollInProgress = true;
		try {
			const signature = await this.spellchecker.getDictionarySignature();
			if (signature === this.dictionarySignature) {
				return;
			}

			this.dictionarySignature = signature;
			this.spellchecker.clearCache();
			this.refreshAllViews();
		} finally {
			this.dictionaryPollInProgress = false;
		}
	}

	dispose(): void {
		this.views.clear();
		this.contextTarget = null;
	}

	private captureContextTarget(event: MouseEvent, view: EditorView): void {
		this.contextTarget = null;
		if (!isEditorSpellcheckEnabled(view)) {
			return;
		}

		const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
		if (position === null) {
			return;
		}

		const line = view.state.doc.lineAt(position);
		const identifier = scanCompoundIdentifiers(line.text, line.from).find(
			(candidate) => position >= candidate.from && position <= candidate.to,
		);
		if (!identifier || isExcludedSyntax(view, identifier.from)) {
			return;
		}

		const part = findPartAt(identifier, position);
		if (
			!part ||
			!isSpellcheckablePart(part) ||
			!this.spellchecker.isWordMisspelled(part.text)
		) {
			return;
		}

		this.contextTarget = {
			...part,
			capturedAt: Date.now(),
			suggestions: this.spellchecker.getSuggestions(part.text).slice(0, 5),
		};
	}

	private refreshAllViews(): void {
		for (const view of this.views) {
			view.dispatch({ effects: refreshSpellcheckEffect.of(null) });
		}
	}
}

function buildDecorations(
	view: EditorView,
	spellchecker: DesktopSpellchecker,
	deferredRanges: readonly DocumentRange[] = [],
): DecorationSet {
	if (!isEditorSpellcheckEnabled(view)) {
		return Decoration.none;
	}

	const ranges: Range<Decoration>[] = [];
	const seenIdentifiers = new Set<number>();
	for (const visibleRange of view.visibleRanges) {
		const scanFrom = view.state.doc.lineAt(visibleRange.from).from;
		const scanTo = view.state.doc.lineAt(visibleRange.to).to;
		const visibleText = view.state.doc.sliceString(
			scanFrom,
			scanTo,
		);

		for (const identifier of scanCompoundIdentifiers(
			visibleText,
			scanFrom,
		)) {
			if (
				identifier.to <= visibleRange.from ||
				identifier.from >= visibleRange.to ||
				seenIdentifiers.has(identifier.from) ||
				isExcludedSyntax(view, identifier.from)
			) {
				continue;
			}
			seenIdentifiers.add(identifier.from);

			ranges.push(suppressNativeSpellcheck.range(identifier.from, identifier.to));
			if (intersectsAnyRange(identifier, deferredRanges)) {
				continue;
			}

			for (const part of identifier.parts) {
				if (
					isSpellcheckablePart(part) &&
					spellchecker.isWordMisspelled(part.text)
				) {
					ranges.push(misspellingDecoration.range(part.from, part.to));
				}
			}
		}
	}

	return Decoration.set(ranges, true);
}

function getChangedRanges(update: ViewUpdate): DocumentRange[] {
	const ranges: DocumentRange[] = [];
	update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
		ranges.push({ from: fromB, to: toB });
	});
	return ranges;
}

function intersectsAnyRange(
	identifier: CompoundIdentifier,
	ranges: readonly DocumentRange[],
): boolean {
	return ranges.some(
		(range) => identifier.from <= range.to && identifier.to >= range.from,
	);
}

function isEditorSpellcheckEnabled(view: EditorView): boolean {
	return view.contentDOM.spellcheck;
}

function isExcludedSyntax(view: EditorView, position: number): boolean {
	const resolvedNode = syntaxTree(view.state).resolveInner(position, 1);
	let node: typeof resolvedNode | null = resolvedNode;
	while (node) {
		if (EXCLUDED_SYNTAX_PATTERN.test(node.type.name)) {
			return true;
		}
		node = node.parent;
	}

	return false;
}

function findPartAt(
	identifier: CompoundIdentifier,
	position: number,
): IdentifierPart | null {
	const exactPart = identifier.parts.find(
		(part) => position >= part.from && position < part.to,
	);
	if (exactPart) {
		return exactPart;
	}

	return position === identifier.to
		? (identifier.parts[identifier.parts.length - 1] ?? null)
		: null;
}
