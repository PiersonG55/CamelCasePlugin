import { HOST_AND_FILE_SUFFIXES } from './word-lists.ts';

export interface IdentifierPart {
	from: number;
	to: number;
	text: string;
}

export interface CompoundIdentifier {
	from: number;
	to: number;
	text: string;
	parts: IdentifierPart[];
}

export interface ScanOptions {
	/** Treat `source.file.input` as a compound identifier. */
	splitOnPeriods: boolean;
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = { splitOnPeriods: true };

const UNDERSCORE_TOKEN_PATTERN = /[\p{L}\p{N}]+(?:_+[\p{L}\p{N}]+)*/gu;
const DELIMITED_TOKEN_PATTERN = /[\p{L}\p{N}]+(?:[._]+[\p{L}\p{N}]+)*/gu;
const IDENTIFIER_PART_PATTERN =
	/[\p{Lu}\p{Lt}]+(?=[\p{Lu}\p{Lt}]\p{Ll})|[\p{Lu}\p{Lt}]?\p{Ll}+|[\p{Lu}\p{Lt}]+|\p{N}+/gu;
const CASE_BOUNDARY_PATTERN =
	/[\p{Ll}\p{N}][\p{Lu}\p{Lt}]|[\p{Lu}\p{Lt}]{2}\p{Ll}/u;
const LETTER_PATTERN = /\p{L}/u;

export function scanCompoundIdentifiers(
	text: string,
	baseOffset = 0,
	options: ScanOptions = DEFAULT_SCAN_OPTIONS,
): CompoundIdentifier[] {
	const identifiers: CompoundIdentifier[] = [];
	const tokenPattern = options.splitOnPeriods
		? DELIMITED_TOKEN_PATTERN
		: UNDERSCORE_TOKEN_PATTERN;

	for (const match of text.matchAll(tokenPattern)) {
		const token = match[0];
		if (!isCompoundToken(token)) {
			continue;
		}

		const tokenOffset = baseOffset + match.index;
		const parts = splitIdentifier(token, tokenOffset);
		// Purely numeric compounds such as 1.2.3 or 1_000_000 have nothing to
		// check, so leave them untouched rather than suppressing native spellcheck.
		if (parts.length < 2 || !parts.some(isSpellcheckablePart)) {
			continue;
		}

		identifiers.push({
			from: tokenOffset,
			to: tokenOffset + token.length,
			text: token,
			parts,
		});
	}

	return identifiers;
}

export function splitIdentifier(token: string, baseOffset = 0): IdentifierPart[] {
	const parts: IdentifierPart[] = [];

	for (const match of token.matchAll(IDENTIFIER_PART_PATTERN)) {
		const text = match[0];
		const from = baseOffset + match.index;
		parts.push({ from, to: from + text.length, text });
	}

	return parts;
}

export function isSpellcheckablePart(part: IdentifierPart): boolean {
	return LETTER_PATTERN.test(part.text);
}

function isCompoundToken(token: string): boolean {
	if (CASE_BOUNDARY_PATTERN.test(token) || token.includes('_')) {
		return true;
	}

	const lastPeriod = token.lastIndexOf('.');
	if (lastPeriod === -1) {
		return false;
	}

	// A dotted token with no other identifier signal is ambiguous. Hostnames
	// and filenames (example.com, notes.pdf) are left to native spellcheck,
	// which already skips them; anything else (source.file.input) is treated
	// as an identifier.
	return !HOST_AND_FILE_SUFFIXES.has(token.slice(lastPeriod + 1).toLowerCase());
}
