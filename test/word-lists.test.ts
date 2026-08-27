import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import nspell from 'nspell';
import {
	PROGRAMMING_ABBREVIATIONS,
	normalizeWordList,
	parseWordListText,
} from '../src/word-lists.ts';

void test('abbreviations are stored lowercase', () => {
	for (const word of PROGRAMMING_ABBREVIATIONS) {
		assert.equal(word, word.toLowerCase(), word);
		assert.match(word, /^[a-z0-9]+$/u);
	}
});

void test('abbreviations cover identifier parts the dictionary rejects', () => {
	const spellchecker = nspell({
		aff: readFileSync('node_modules/dictionary-en/index.aff', 'utf8'),
		dic: readFileSync('node_modules/dictionary-en/index.dic', 'utf8'),
	});
	for (const word of ['src', 'init', 'num', 'str', 'bool', 'ctx', 'json', 'args']) {
		assert.equal(spellchecker.correct(word), false, `${word} should need the allowlist`);
		assert.ok(PROGRAMMING_ABBREVIATIONS.has(word), word);
	}
});

void test('normalizes persisted word lists', () => {
	assert.deepEqual(
		normalizeWordList(['Foo', ' bar ', 'foo', '', 42, null, 'BAZ']),
		['bar', 'baz', 'foo'],
	);
	assert.deepEqual(normalizeWordList(undefined), []);
});

void test('parses settings text separated by newlines, spaces, or commas', () => {
	assert.deepEqual(parseWordListText('Alpha\nbeta, gamma  delta\n\n'), [
		'alpha',
		'beta',
		'delta',
		'gamma',
	]);
	assert.deepEqual(parseWordListText(''), []);
});
