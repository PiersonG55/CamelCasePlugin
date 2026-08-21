import assert from 'node:assert/strict';
import test from 'node:test';
import { scanCompoundIdentifiers, splitIdentifier } from '../src/identifier.ts';

void test('splits camelCase', () => {
	assert.deepEqual(
		splitIdentifier('camelCase').map((part) => part.text),
		['camel', 'Case'],
	);
});

void test('splits PascalCase', () => {
	assert.deepEqual(
		splitIdentifier('PascalCase').map((part) => part.text),
		['Pascal', 'Case'],
	);
});

void test('separates acronyms from surrounding words', () => {
	assert.deepEqual(
		splitIdentifier('parseHTTPResponse').map((part) => part.text),
		['parse', 'HTTP', 'Response'],
	);
	assert.deepEqual(
		splitIdentifier('XMLHttpRequest').map((part) => part.text),
		['XML', 'Http', 'Request'],
	);
});

void test('preserves document offsets for identifiers and parts', () => {
	const [identifier] = scanCompoundIdentifiers('before camelCsae after', 10);
	assert.ok(identifier);
	assert.equal(identifier.from, 17);
	assert.equal(identifier.to, 26);
	assert.deepEqual(identifier.parts, [
		{ from: 17, to: 22, text: 'camel' },
		{ from: 22, to: 26, text: 'Csae' },
	]);
});

void test('does not classify ordinary or non-camel words as compounds', () => {
	assert.deepEqual(
		scanCompoundIdentifiers('hello Hello HTTP abc123 snake_case'),
		[],
	);
});

void test('recognizes a numeric-to-uppercase boundary', () => {
	assert.deepEqual(
		scanCompoundIdentifiers('version2Value')[0]?.parts.map((part) => part.text),
		['version', '2', 'Value'],
	);
});
