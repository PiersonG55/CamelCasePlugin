import {
	App,
	PluginSettingTab,
	SettingDefinitionItem,
	debounce,
} from 'obsidian';
import type CamelCaseSpellcheckPlugin from './main';
import { normalizeWordList, parseWordListText } from './word-lists';

export interface CamelCaseSpellcheckSettings {
	/** Treat `source.file.input` as a compound identifier. */
	splitOnPeriods: boolean;
	acceptProgrammingAbbreviations: boolean;
	/** Lowercase, sorted, unique. Never underlined inside identifiers. */
	ignoredWords: string[];
}

export const DEFAULT_SETTINGS: CamelCaseSpellcheckSettings = {
	splitOnPeriods: true,
	acceptProgrammingAbbreviations: true,
	ignoredWords: [],
};

/** Builds settings from persisted plugin data, tolerating missing or malformed fields. */
export function normalizeSettings(data: unknown): CamelCaseSpellcheckSettings {
	const record =
		typeof data === 'object' && data !== null
			? (data as Record<string, unknown>)
			: {};
	return {
		splitOnPeriods:
			typeof record.splitOnPeriods === 'boolean'
				? record.splitOnPeriods
				: DEFAULT_SETTINGS.splitOnPeriods,
		acceptProgrammingAbbreviations:
			typeof record.acceptProgrammingAbbreviations === 'boolean'
				? record.acceptProgrammingAbbreviations
				: DEFAULT_SETTINGS.acceptProgrammingAbbreviations,
		ignoredWords: normalizeWordList(
			Array.isArray(record.ignoredWords) ? record.ignoredWords : [],
		),
	};
}

const SAVE_DEBOUNCE_MS = 500;

export class CamelCaseSpellcheckSettingTab extends PluginSettingTab {
	private readonly saveIgnoredWords = debounce(
		() => void this.plugin.saveSettings(),
		SAVE_DEBOUNCE_MS,
		true,
	);

	constructor(
		app: App,
		private readonly plugin: CamelCaseSpellcheckPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Split identifiers on periods',
				desc: 'Check dotted names such as source.file.input part by part. Hostnames and filenames such as example.com and notes.pdf are left to Obsidian’s native spellcheck.',
				control: {
					type: 'toggle',
					key: 'splitOnPeriods',
					defaultValue: DEFAULT_SETTINGS.splitOnPeriods,
				},
			},
			{
				name: 'Accept common programming abbreviations',
				desc: 'Treat abbreviations and file extensions such as src, init, num, JSON, and css as correctly spelled when they appear inside identifiers.',
				control: {
					type: 'toggle',
					key: 'acceptProgrammingAbbreviations',
					defaultValue: DEFAULT_SETTINGS.acceptProgrammingAbbreviations,
				},
			},
			{
				name: 'Ignored words',
				desc: 'Words that are never underlined inside identifiers, one per line. Matching is case-insensitive. Right-click an underlined part to add words here.',
				control: {
					type: 'textarea',
					key: 'ignoredWords',
					rows: 8,
					placeholder: 'One word per line',
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		switch (key) {
			case 'splitOnPeriods':
				return this.plugin.settings.splitOnPeriods;
			case 'acceptProgrammingAbbreviations':
				return this.plugin.settings.acceptProgrammingAbbreviations;
			case 'ignoredWords':
				return this.plugin.settings.ignoredWords.join('\n');
			default:
				return undefined;
		}
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		switch (key) {
			case 'splitOnPeriods':
				this.plugin.settings.splitOnPeriods = Boolean(value);
				await this.plugin.saveSettings();
				return;
			case 'acceptProgrammingAbbreviations':
				this.plugin.settings.acceptProgrammingAbbreviations = Boolean(value);
				await this.plugin.saveSettings();
				return;
			case 'ignoredWords':
				this.plugin.settings.ignoredWords = parseWordListText(String(value));
				this.saveIgnoredWords();
				return;
			default:
				return;
		}
	}
}
