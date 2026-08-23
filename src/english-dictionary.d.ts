declare module 'camel-case-spellcheck-english-dictionary' {
	interface BundledDictionary {
		aff: Uint8Array;
		dic: Uint8Array;
	}

	const dictionary: BundledDictionary;
	export default dictionary;
}
