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

const IDENTIFIER_TOKEN_PATTERN = /[\p{L}\p{N}]+(?:_+[\p{L}\p{N}]+)*/gu;
const IDENTIFIER_PART_PATTERN =
	/[\p{Lu}\p{Lt}]+(?=[\p{Lu}\p{Lt}]\p{Ll})|[\p{Lu}\p{Lt}]?\p{Ll}+|[\p{Lu}\p{Lt}]+|\p{N}+/gu;
const CASE_BOUNDARY_PATTERN =
	/[\p{Ll}\p{N}][\p{Lu}\p{Lt}]|[\p{Lu}\p{Lt}]{2}\p{Ll}/u;
const LETTER_PATTERN = /\p{L}/u;

export function scanCompoundIdentifiers(
	text: string,
	baseOffset = 0,
): CompoundIdentifier[] {
	const identifiers: CompoundIdentifier[] = [];

	for (const match of text.matchAll(IDENTIFIER_TOKEN_PATTERN)) {
		const token = match[0];
		const matchIndex = match.index;
		if (!CASE_BOUNDARY_PATTERN.test(token) && !token.includes('_')) {
			continue;
		}

		const tokenOffset = baseOffset + matchIndex;
		const parts = splitIdentifier(token, tokenOffset);
		if (parts.length < 2) {
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
