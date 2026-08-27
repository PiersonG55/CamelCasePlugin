import assert from 'node:assert/strict';
import test from 'node:test';
import { ChangeSet } from '@codemirror/state';
import {
	getChangedRanges,
	intersectsAnyRange,
	mapDocumentRanges,
} from '../src/ranges.ts';

const DOC = 'first camelCsae middle snake_csae last';

void test('reports changed ranges in new-document coordinates', () => {
	const changes = ChangeSet.of({ from: 6, to: 6, insert: 'XX' }, DOC.length);
	assert.deepEqual(getChangedRanges(changes), [{ from: 6, to: 8 }]);
});

void test('shifts deferred ranges past an earlier insertion', () => {
	const changes = ChangeSet.of({ from: 0, insert: 'XXX' }, DOC.length);
	assert.deepEqual(mapDocumentRanges([{ from: 23, to: 33 }], changes), [
		{ from: 26, to: 36 },
	]);
});

void test('grows a deferred range when typing at its end', () => {
	const changes = ChangeSet.of({ from: 15, insert: 'd' }, DOC.length);
	assert.deepEqual(mapDocumentRanges([{ from: 6, to: 15 }], changes), [
		{ from: 6, to: 16 },
	]);
});

void test('keeps earlier deferred ranges while a second edit happens elsewhere', () => {
	const firstEdit = ChangeSet.of({ from: 15, insert: 'd' }, DOC.length);
	let deferred = getChangedRanges(firstEdit);
	const secondEdit = ChangeSet.of({ from: 0, insert: 'Y' }, firstEdit.newLength);
	deferred = [
		...mapDocumentRanges(deferred, secondEdit),
		...getChangedRanges(secondEdit),
	];
	assert.deepEqual(deferred, [
		{ from: 16, to: 17 },
		{ from: 0, to: 1 },
	]);
	assert.ok(intersectsAnyRange({ from: 7, to: 17 }, deferred));
	assert.ok(!intersectsAnyRange({ from: 24, to: 34 }, deferred));
});

void test('treats touching ranges as intersecting', () => {
	assert.ok(intersectsAnyRange({ from: 5, to: 10 }, [{ from: 10, to: 12 }]));
	assert.ok(intersectsAnyRange({ from: 5, to: 10 }, [{ from: 2, to: 5 }]));
	assert.ok(!intersectsAnyRange({ from: 5, to: 10 }, [{ from: 11, to: 12 }]));
});
