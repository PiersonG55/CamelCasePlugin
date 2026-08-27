import nspell from 'nspell';
import englishDictionary from 'camel-case-spellcheck-english-dictionary';
import {
	HOST_AND_FILE_SUFFIXES,
	PROGRAMMING_ABBREVIATIONS,
	normalizeWord,
	normalizeWordList,
} from './word-lists';

interface ElectronSession {
	addWordToSpellCheckerDictionary(word: string): boolean;
	getSpellCheckerLanguages?(): string[];
	isSpellCheckerEnabled?(): boolean;
	listWordsInSpellCheckerDictionary?(): Promise<string[]>;
}

interface ElectronWebContents {
	session?: ElectronSession;
}

interface ElectronRemote {
	getCurrentWebContents?(): ElectronWebContents;
}

interface ElectronRendererModule {
	remote?: ElectronRemote;
}

type LocalSpellchecker = ReturnType<typeof nspell>;

/**
 * Checks identifier parts against the bundled English dictionary plus three
 * accepted-word sets: Obsidian's native custom dictionary (mirrored from
 * Electron), the plugin's own ignore list, and the built-in programming
 * abbreviations. The dictionary is parsed once and never rebuilt; all
 * dictionary-like changes are plain set updates.
 */
export class DesktopSpellchecker {
	private readonly cache = new Map<string, boolean>();
	private localSpellchecker: LocalSpellchecker | null = null;
	private nativeCustomWords = new Set<string>();
	private ignoredWords = new Set<string>();
	private acceptProgrammingAbbreviations = true;
	private nativeDictionarySignature = '';

	private constructor(private readonly session: ElectronSession | null) {}

	static create(): DesktopSpellchecker {
		const electron = loadModule<ElectronRendererModule>('electron');
		const modernRemote = loadModule<ElectronRemote>('@electron/remote');
		const remote = modernRemote?.getCurrentWebContents
			? modernRemote
			: (electron?.remote ?? null);

		let session: ElectronSession | null = null;
		try {
			session = remote?.getCurrentWebContents?.().session ?? null;
		} catch {
			// Local checking remains available when the dictionary bridge is absent.
		}

		return new DesktopSpellchecker(session);
	}

	get canAddToDictionary(): boolean {
		return this.session !== null;
	}

	/** False until {@link loadDictionary} has run; nothing is reported as misspelled before then. */
	get isReady(): boolean {
		return this.localSpellchecker !== null;
	}

	/**
	 * Parses the bundled dictionary. This takes tens of milliseconds on the UI
	 * thread, so callers defer it until Obsidian has finished starting up.
	 */
	loadDictionary(): void {
		if (this.localSpellchecker === null) {
			this.localSpellchecker = createEnglishSpellchecker();
			this.clearCache();
		}
	}

	setIgnoredWords(words: Iterable<string>): void {
		this.ignoredWords = new Set(normalizeWordList(words));
		this.clearCache();
	}

	setAcceptProgrammingAbbreviations(enabled: boolean): void {
		if (this.acceptProgrammingAbbreviations !== enabled) {
			this.acceptProgrammingAbbreviations = enabled;
			this.clearCache();
		}
	}

	isWordMisspelled(word: string): boolean {
		if (this.localSpellchecker === null) {
			return false;
		}

		const cached = this.cache.get(word);
		if (cached !== undefined) {
			return cached;
		}

		const isMisspelled =
			!this.isAcceptedWord(word) && !this.localSpellchecker.correct(word);
		this.cache.set(word, isMisspelled);
		return isMisspelled;
	}

	getSuggestions(word: string): string[] {
		return this.localSpellchecker?.suggest(word) ?? [];
	}

	addWordToDictionary(word: string): boolean {
		try {
			const added = this.session?.addWordToSpellCheckerDictionary(word) ?? false;
			if (added) {
				this.nativeCustomWords.add(normalizeWord(word));
				this.clearCache();
			}
			return added;
		} catch {
			return false;
		}
	}

	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Mirrors Electron's spellcheck state and custom dictionary. Returns true when
	 * anything changed since the previous call so callers can refresh decorations.
	 */
	async syncNativeDictionary(): Promise<boolean> {
		let customWords: string[] = [];
		let languages: string[] = ['en-US'];
		let enabled = true;
		try {
			customWords =
				(await this.session?.listWordsInSpellCheckerDictionary?.()) ?? [];
			languages = this.session?.getSpellCheckerLanguages?.() ?? languages;
			enabled = this.session?.isSpellCheckerEnabled?.() ?? enabled;
		} catch {
			// The bundled dictionary remains usable if synchronization fails.
		}

		const normalizedWords = normalizeWordList(customWords);
		const signature = JSON.stringify([enabled, [...languages].sort(), normalizedWords]);
		if (signature === this.nativeDictionarySignature) {
			return false;
		}

		this.nativeDictionarySignature = signature;
		this.nativeCustomWords = new Set(normalizedWords);
		this.clearCache();
		return true;
	}

	private isAcceptedWord(word: string): boolean {
		const normalized = normalizeWord(word);
		return (
			this.ignoredWords.has(normalized) ||
			this.nativeCustomWords.has(normalized) ||
			(this.acceptProgrammingAbbreviations &&
				(PROGRAMMING_ABBREVIATIONS.has(normalized) ||
					HOST_AND_FILE_SUFFIXES.has(normalized)))
		);
	}
}

function createEnglishSpellchecker(): LocalSpellchecker {
	const decoder = new TextDecoder();
	return nspell({
		aff: decoder.decode(englishDictionary.aff),
		dic: decoder.decode(englishDictionary.dic),
	});
}

function loadModule<T>(moduleId: string): T | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- Obsidian exposes Electron runtime modules through CommonJS.
		return require(moduleId) as T;
	} catch {
		return null;
	}
}
