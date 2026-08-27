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
	DEFAULT_SCAN_OPTIONS,
	IdentifierPart,
	ScanOptions,
	isSpellcheckablePart,
	scanCompoundIdentifiers,
} from './identifier';
import {
	DocumentRange,
	getChangedRanges,
	intersectsAnyRange,
	mapDocumentRanges,
} from './ranges';
import type { CamelCaseSpellcheckSettings } from './settings';

export interface SpellcheckContextTarget extends IdentifierPart {
	suggestions: string[];
}

const refreshSpellcheckEffect = StateEffect.define<null>();
const EXCLUDED_SYNTAX_PATTERN =
	/code|comment|frontmatter|html|url|autolink|linkmark/i;
const CONTEXT_TARGET_LIFETIME_MS = 2_000;
const SPELLCHECK_DEBOUNCE_MS = 600;

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
	private scanOptions: ScanOptions = { ...DEFAULT_SCAN_OPTIONS };

	constructor(readonly spellchecker: DesktopSpellchecker) {
		const views = this.views;
		const getScanOptions = (): ScanOptions => this.scanOptions;

		this.extension = ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;
				private debounceTimer: number | null = null;
				/**
				 * Ranges edited since the last debounce fired, kept in current
				 * document coordinates. Identifiers touching them are not checked
				 * until the user pauses, so half-typed words are not underlined.
				 */
				private deferredRanges: readonly DocumentRange[] = [];

				constructor(private readonly view: EditorView) {
					views.add(view);
					this.decorations = buildDecorations(view, spellchecker, getScanOptions());
				}

				update(update: ViewUpdate): void {
					if (update.docChanged) {
						this.deferredRanges = [
							...mapDocumentRanges(this.deferredRanges, update.changes),
							...getChangedRanges(update.changes),
						];
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
							getScanOptions(),
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

	applySettings(settings: CamelCaseSpellcheckSettings): void {
		this.scanOptions = { splitOnPeriods: settings.splitOnPeriods };
		this.spellchecker.setIgnoredWords(settings.ignoredWords);
		this.spellchecker.setAcceptProgrammingAbbreviations(
			settings.acceptProgrammingAbbreviations,
		);
		this.refreshAllViews();
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
		if (await this.spellchecker.syncNativeDictionary()) {
			this.refreshAllViews();
		}
	}

	dispose(): void {
		this.views.clear();
		this.contextTarget = null;
	}

	private captureContextTarget(event: MouseEvent, view: EditorView): void {
		this.contextTarget = null;
		if (!isEditorSpellcheckEnabled(view) || !this.spellchecker.isReady) {
			return;
		}

		const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
		if (position === null) {
			return;
		}

		const line = view.state.doc.lineAt(position);
		const identifier = scanCompoundIdentifiers(
			line.text,
			line.from,
			this.scanOptions,
		).find(
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
	scanOptions: ScanOptions,
	deferredRanges: readonly DocumentRange[] = [],
): DecorationSet {
	// Until the dictionary is loaded, leave native spellcheck fully in charge
	// rather than suppressing it on identifiers that cannot be checked yet.
	if (!isEditorSpellcheckEnabled(view) || !spellchecker.isReady) {
		return Decoration.none;
	}

	const ranges: Range<Decoration>[] = [];
	const seenIdentifiers = new Set<number>();
	for (const visibleRange of view.visibleRanges) {
		const scanFrom = view.state.doc.lineAt(visibleRange.from).from;
		const scanTo = view.state.doc.lineAt(visibleRange.to).to;
		const visibleText = view.state.doc.sliceString(scanFrom, scanTo);

		for (const identifier of scanCompoundIdentifiers(
			visibleText,
			scanFrom,
			scanOptions,
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
