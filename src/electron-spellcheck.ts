import nspell from 'nspell';
import englishDictionary from 'camel-case-spellcheck-english-dictionary';

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

interface CachedResult {
	expiresAt: number;
	isMisspelled: boolean;
}

const CACHE_LIFETIME_MS = 60_000;

export class DesktopSpellchecker {
	private readonly cache = new Map<string, CachedResult>();
	private localSpellchecker = createEnglishSpellchecker();
	private customWordsSignature = '';

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

	isWordMisspelled(word: string): boolean {
		const now = Date.now();
		const cached = this.cache.get(word);
		if (cached && cached.expiresAt > now) {
			return cached.isMisspelled;
		}

		const isMisspelled = !this.localSpellchecker.correct(word);
		this.cache.set(word, {
			expiresAt: now + CACHE_LIFETIME_MS,
			isMisspelled,
		});
		return isMisspelled;
	}

	getSuggestions(word: string): string[] {
		return this.localSpellchecker.suggest(word);
	}

	addWordToDictionary(word: string): boolean {
		try {
			const added = this.session?.addWordToSpellCheckerDictionary(word) ?? false;
			if (added) {
				this.localSpellchecker.add(word);
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

	async getDictionarySignature(): Promise<string> {
		let customWords: string[] = [];
		try {
			customWords =
				(await this.session?.listWordsInSpellCheckerDictionary?.()) ?? [];
		} catch {
			// The local base dictionary remains usable if synchronization fails.
		}

		const sortedCustomWords = [...customWords].sort();
		const customWordsSignature = JSON.stringify(sortedCustomWords);
		if (customWordsSignature !== this.customWordsSignature) {
			this.customWordsSignature = customWordsSignature;
			this.localSpellchecker = createEnglishSpellchecker();
			for (const word of sortedCustomWords) {
				this.localSpellchecker.add(word);
			}
			this.clearCache();
		}

		const languages = this.session?.getSpellCheckerLanguages?.() ?? ['en-US'];
		const enabled = this.session?.isSpellCheckerEnabled?.() ?? true;
		return JSON.stringify([enabled, [...languages].sort(), sortedCustomWords]);
	}
}

function createEnglishSpellchecker(): ReturnType<typeof nspell> {
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
