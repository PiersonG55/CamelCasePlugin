import { Editor, Menu, Notice, Plugin } from 'obsidian';
import { DesktopSpellchecker } from './electron-spellcheck';
import {
	CamelCaseSpellcheckController,
	SpellcheckContextTarget,
} from './editor-extension';
import {
	CamelCaseSpellcheckSettingTab,
	CamelCaseSpellcheckSettings,
	DEFAULT_SETTINGS,
	normalizeSettings,
} from './settings';
import { normalizeWord } from './word-lists';

const DICTIONARY_POLL_INTERVAL_MS = 5_000;
const CORRECTION_MENU_SECTION = 'correction';
const SPELLCHECK_MENU_SECTION = 'spellcheck';

export default class CamelCaseSpellcheckPlugin extends Plugin {
	settings: CamelCaseSpellcheckSettings = { ...DEFAULT_SETTINGS };
	private controller: CamelCaseSpellcheckController | null = null;

	async onload(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());

		const spellchecker = DesktopSpellchecker.create();
		const controller = new CamelCaseSpellcheckController(spellchecker);
		this.controller = controller;
		controller.applySettings(this.settings);

		this.registerEditorExtension(controller.extension);
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor) => {
				this.addSpellingMenuItems(menu, editor);
			}),
		);

		this.addCommand({
			id: 'refresh-spellcheck',
			name: 'Refresh spelling results',
			callback: () => {
				this.controller?.refresh();
			},
		});

		this.addSettingTab(new CamelCaseSpellcheckSettingTab(this.app, this));

		// Parsing the bundled dictionary blocks the UI for tens of milliseconds,
		// so wait until Obsidian has finished loading the workspace.
		this.app.workspace.onLayoutReady(() => {
			if (this.controller !== controller) {
				return;
			}

			spellchecker.loadDictionary();
			controller.refresh();

			this.registerInterval(
				window.setInterval(() => {
					void controller.pollDictionaryChanges();
				}, DICTIONARY_POLL_INTERVAL_MS),
			);
			void controller.pollDictionaryChanges();
		});
	}

	onunload(): void {
		this.controller?.dispose();
		this.controller = null;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.controller?.applySettings(this.settings);
	}

	private addSpellingMenuItems(menu: Menu, editor: Editor): void {
		const target = this.controller?.getContextTarget();
		if (!target || !this.isCurrentTarget(editor, target)) {
			return;
		}

		for (const suggestion of target.suggestions) {
			menu.addItem((item) =>
				item
					.setTitle(`Replace “${target.text}” with “${suggestion}”`)
					.setIcon('lucide-repeat')
					.setSection(CORRECTION_MENU_SECTION)
					.onClick(() => this.replaceTarget(editor, target, suggestion)),
			);
		}

		menu.addItem((item) =>
			item
				.setTitle(`Ignore “${target.text}” in identifiers`)
				.setIcon('lucide-eye-off')
				.setSection(SPELLCHECK_MENU_SECTION)
				.onClick(() => void this.ignoreTarget(target)),
		);

		menu.addItem((item) =>
			item
				.setTitle(`Add “${target.text}” to dictionary`)
				.setIcon('lucide-folder-tree')
				.setSection(SPELLCHECK_MENU_SECTION)
				.setDisabled(!this.controller?.spellchecker.canAddToDictionary)
				.onClick(() => this.addTargetToDictionary(target)),
		);
	}

	private replaceTarget(
		editor: Editor,
		target: SpellcheckContextTarget,
		replacement: string,
	): void {
		if (!this.isCurrentTarget(editor, target)) {
			new Notice('The text changed before the spelling suggestion was applied.');
			return;
		}

		editor.replaceRange(
			replacement,
			editor.offsetToPos(target.from),
			editor.offsetToPos(target.to),
		);
	}

	private async ignoreTarget(target: SpellcheckContextTarget): Promise<void> {
		const word = normalizeWord(target.text);
		if (!this.settings.ignoredWords.includes(word)) {
			this.settings.ignoredWords = [...this.settings.ignoredWords, word].sort();
			await this.saveSettings();
		}
		new Notice(`“${target.text}” will be ignored inside identifiers.`);
	}

	private addTargetToDictionary(target: SpellcheckContextTarget): void {
		if (this.controller?.addWordToDictionary(target.text)) {
			new Notice(`Added “${target.text}” to the spelling dictionary.`);
			return;
		}

		new Notice('Could not add the word to Obsidian’s spelling dictionary.');
	}

	private isCurrentTarget(
		editor: Editor,
		target: SpellcheckContextTarget,
	): boolean {
		return (
			editor.getRange(
				editor.offsetToPos(target.from),
				editor.offsetToPos(target.to),
			) === target.text
		);
	}
}
