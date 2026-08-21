import { Editor, Menu, Notice, Plugin } from 'obsidian';
import { DesktopSpellchecker } from './electron-spellcheck';
import {
	CamelCaseSpellcheckController,
	SpellcheckContextTarget,
} from './editor-extension';

const DICTIONARY_POLL_INTERVAL_MS = 5_000;
const CORRECTION_MENU_SECTION = 'correction';
const SPELLCHECK_MENU_SECTION = 'spellcheck';

export default class CamelCaseSpellcheckPlugin extends Plugin {
	private controller: CamelCaseSpellcheckController | null = null;

	onload(): void {
		const spellchecker = DesktopSpellchecker.create();
		this.controller = new CamelCaseSpellcheckController(spellchecker);

		this.registerEditorExtension(this.controller.extension);
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

		this.registerInterval(
			window.setInterval(() => {
				void this.controller?.pollDictionaryChanges();
			}, DICTIONARY_POLL_INTERVAL_MS),
		);

		void this.controller.pollDictionaryChanges();
	}

	onunload(): void {
		this.controller?.dispose();
		this.controller = null;
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

		menu.addItem((item) => {
			item
				.setTitle(`Add “${target.text}” to dictionary`)
				.setIcon('lucide-folder-tree')
				.setSection(SPELLCHECK_MENU_SECTION)
				.setDisabled(!this.controller?.spellchecker.canAddToDictionary)
				.onClick(() => this.addTargetToDictionary(target));
		});
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
