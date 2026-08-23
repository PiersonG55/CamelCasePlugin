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

void test('splits snake_case', () => {
	assert.deepEqual(
		splitIdentifier('Add_support_for_snake_case').map((part) => part.text),
		['Add', 'support', 'for', 'snake', 'case'],
	);
	assert.deepEqual(
		scanCompoundIdentifiers('SCREAMING_SNAKE_CASE')[0]?.parts.map(
			(part) => part.text,
		),
		['SCREAMING', 'SNAKE', 'CASE'],
	);
});

void test('supports mixed case and repeated underscore boundaries', () => {
	assert.deepEqual(
		scanCompoundIdentifiers('parse__httpResponse')[0]?.parts.map(
			(part) => part.text,
		),
		['parse', 'http', 'Response'],
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

	const [snakeIdentifier] = scanCompoundIdentifiers('before snake_csae after', 10);
	assert.ok(snakeIdentifier);
	assert.equal(snakeIdentifier.from, 17);
	assert.equal(snakeIdentifier.to, 27);
	assert.deepEqual(snakeIdentifier.parts, [
		{ from: 17, to: 22, text: 'snake' },
		{ from: 23, to: 27, text: 'csae' },
	]);
});

void test('does not classify ordinary words as compounds', () => {
	assert.deepEqual(
		scanCompoundIdentifiers('hello Hello HTTP abc123 snake_ _private'),
		[],
	);
});

void test('recognizes a numeric-to-uppercase boundary', () => {
	assert.deepEqual(
		scanCompoundIdentifiers('version2Value')[0]?.parts.map((part) => part.text),
		['version', '2', 'Value'],
	);
});
