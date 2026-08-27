import type { ChangeDesc } from '@codemirror/state';

export interface DocumentRange {
	from: number;
	to: number;
}

/** Ranges of the new document touched by a change set. */
export function getChangedRanges(changes: ChangeDesc): DocumentRange[] {
	const ranges: DocumentRange[] = [];
	changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
		ranges.push({ from: fromB, to: toB });
	});
	return ranges;
}

/**
 * Maps ranges expressed in the pre-change document into the post-change
 * document. Edits touching a range's edge grow the range, so an identifier
 * under construction stays deferred as the user keeps typing at its end.
 */
export function mapDocumentRanges(
	ranges: readonly DocumentRange[],
	changes: ChangeDesc,
): DocumentRange[] {
	return ranges.map((range) => ({
		from: changes.mapPos(range.from, -1),
		to: changes.mapPos(range.to, 1),
	}));
}

/** True when the ranges overlap or touch. */
export function intersectsAnyRange(
	target: DocumentRange,
	ranges: readonly DocumentRange[],
): boolean {
	return ranges.some(
		(range) => target.from <= range.to && target.to >= range.from,
	);
}
