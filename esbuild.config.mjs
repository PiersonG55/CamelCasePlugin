import esbuild from 'esbuild';
import process from 'process';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

const prod = process.argv[2] === 'production';
const projectRoot = import.meta.dirname;
const dictionaryDirectory = path.join(projectRoot, 'node_modules', 'dictionary-en');
const thirdPartyNotices = [
	['nspell', path.join(projectRoot, 'node_modules', 'nspell', 'license')],
	[
		'is-buffer',
		path.join(projectRoot, 'node_modules', 'is-buffer', 'LICENSE'),
	],
	[
		'dictionary-en',
		path.join(projectRoot, 'node_modules', 'dictionary-en', 'license'),
	],
]
	.map(([name, licensePath]) => {
		const license = readFileSync(licensePath, 'utf8').trim();
		return `${name}\n${'-'.repeat(name.length)}\n${license}`;
	})
	.join('\n\n');
const banner = `/*!
Camel Case Spellcheck
This is a generated bundle. Source code: src/main.ts

Third-party notices
===================
${thirdPartyNotices.replaceAll('*/', '* /')}
*/
`;
const englishDictionaryPlugin = {
	name: 'english-dictionary',
	setup(build) {
		build.onResolve(
			{ filter: /^camel-case-spellcheck-english-dictionary$/ },
			() => ({ namespace: 'english-dictionary', path: 'dictionary' }),
		);
		build.onLoad(
			{ filter: /.*/, namespace: 'english-dictionary' },
			() => ({
				contents: [
					"import aff from './index.aff';",
					"import dic from './index.dic';",
					'export default { aff, dic };',
				].join('\n'),
				loader: 'js',
				resolveDir: dictionaryDirectory,
			}),
		);
	},
};
const context = await esbuild.context({
	absWorkingDir: projectRoot,
	banner: {
		js: banner,
	},
	entryPoints: [path.join(projectRoot, 'src', 'main.ts')],
	loader: {
		'.aff': 'binary',
		'.dic': 'binary',
	},
	plugins: [englishDictionaryPlugin],
	bundle: true,
	external: [
		'obsidian',
		'electron',
		'@electron/remote',
		'@codemirror/autocomplete',
		'@codemirror/collab',
		'@codemirror/commands',
		'@codemirror/language',
		'@codemirror/lint',
		'@codemirror/search',
		'@codemirror/state',
		'@codemirror/view',
		'@lezer/common',
		'@lezer/highlight',
		'@lezer/lr',
		...builtinModules,
	],
	format: 'cjs',
	target: 'es2021',
	logLevel: 'info',
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	outfile: path.join(projectRoot, 'main.js'),
	minify: prod,
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
