import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import nspell from 'nspell';

const spellchecker = nspell({
	aff: readFileSync('node_modules/dictionary-en/index.aff', 'utf8'),
	dic: readFileSync('node_modules/dictionary-en/index.dic', 'utf8'),
});

void test('accepts the valid components in the reported examples', () => {
	for (const word of [
		'The',
		'Last',
		'Word',
		'Is',
		'These',
		'Are',
		'All',
		'Words',
		'Add',
		'support',
		'for',
		'snake',
		'case',
	]) {
		assert.equal(spellchecker.correct(word), true, word);
	}
});

void test('rejects and suggests corrections for the reported misspellings', () => {
	assert.equal(spellchecker.correct('Mispleled'), false);
	assert.ok(spellchecker.suggest('Mispleled').includes('Misspelled'));
	assert.equal(spellchecker.correct('Givbverish'), false);
	assert.ok(spellchecker.suggest('Givbverish').includes('Gibberish'));
	assert.equal(spellchecker.correct('mispleled'), false);
});
