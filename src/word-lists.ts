/**
 * Abbreviations that are common inside code identifiers but absent from the
 * English dictionary. Matching is case-insensitive, so `JSON`, `Json`, and
 * `json` are all accepted. Keep every entry lowercase.
 */
export const PROGRAMMING_ABBREVIATIONS: ReadonlySet<string> = new Set([
	'abbr', 'abs', 'acc', 'accum', 'ack', 'addr', 'adj', 'alloc', 'alt', 'ansi',
	'api', 'app', 'arg', 'args', 'arr', 'ascii', 'async', 'attr', 'attrs', 'auth',
	'auto', 'avg', 'bg', 'bin', 'bool', 'btn', 'buf', 'calc', 'cb', 'cfg', 'char',
	'chars', 'chk', 'cls', 'cmd', 'cmp', 'cnt', 'col', 'cols', 'concat', 'cond',
	'config', 'configs', 'conn', 'const', 'coord', 'coords', 'cpu', 'crc', 'csv',
	'ctor', 'ctrl', 'ctx', 'cur', 'curr', 'cwd', 'db', 'dbg', 'dec', 'def',
	'del', 'delim', 'dep', 'deps', 'desc', 'dest', 'dev', 'dict', 'diff', 'dir',
	'dirs', 'dist', 'div', 'dns', 'doc', 'docs', 'dom', 'dst', 'dtype', 'elem',
	'elems', 'elt', 'endian', 'enum', 'env', 'eof', 'eol', 'err', 'esc', 'eval',
	'exe', 'exec', 'expr', 'ext', 'fd', 'fifo', 'fmt', 'fn', 'fns', 'fs', 'func',
	'funcs', 'gid', 'gpu', 'gui', 'guid', 'hdr', 'hex', 'href', 'html', 'http',
	'https', 'iface', 'idx', 'img', 'impl', 'impls', 'inc', 'incr', 'info', 'init',
	'inode', 'io', 'ip', 'iter', 'js', 'json', 'jsx', 'kb', 'len', 'lhs', 'lib',
	'libs', 'lifo', 'lru', 'lst', 'max', 'mb', 'mem', 'metadata', 'mgr', 'mid',
	'min', 'misc', 'mkdir', 'mod', 'msg', 'msgs', 'mtime', 'multi', 'mutex', 'nav',
	'nil', 'num', 'nums', 'obj', 'objs', 'op', 'ops', 'opt', 'opts', 'os', 'param',
	'params', 'parens', 'pct', 'pid', 'pkg', 'pos', 'pref', 'prefs', 'prev',
	'proc', 'prop', 'props', 'proto', 'ptr', 'pwd', 'px', 'py', 'qty', 'rc',
	'readonly', 'rect', 'ref', 'refs', 'regex', 'regexp', 'repo', 'repos', 'req',
	'res', 'resp', 'ret', 'rgb', 'rgba', 'rhs', 'rmdir', 'rpc', 'rtl', 'sdk',
	'sec', 'secs', 'sep', 'seq', 'sess', 'sha', 'sig', 'sqrt', 'src', 'srv',
	'ssl', 'std', 'stderr', 'stdin', 'stdout', 'str', 'strs', 'struct', 'sub',
	'substr', 'svg', 'sym', 'sync', 'sys', 'tbl', 'tcp', 'temp', 'tmp', 'tpl',
	'ts', 'tsx', 'ttl', 'tx', 'txt', 'typeof', 'udp', 'ui', 'uid', 'uint',
	'unicode', 'upsert', 'uri', 'url', 'urls', 'usr', 'utf', 'util', 'utils',
	'uuid', 'val', 'vals', 'var', 'vars', 'vec', 'ver', 'vm', 'vs', 'wip', 'ws',
	'xml', 'xs', 'yaml', 'yml', 'ys',
]);

/**
 * Normalizes a word for case-insensitive matching against the accepted-word
 * sets. Identifier parts are always lowercase, Capitalized, or ALL CAPS, so
 * lowercasing lets one entry cover every position a word can take inside an
 * identifier.
 */
export function normalizeWord(word: string): string {
	return word.trim().toLowerCase();
}

/**
 * Normalizes a user-supplied or persisted word list: drops non-strings and
 * blanks, lowercases, removes duplicates, and sorts.
 */
export function normalizeWordList(words: Iterable<unknown> | null | undefined): string[] {
	const normalized = new Set<string>();
	for (const word of words ?? []) {
		if (typeof word !== 'string') {
			continue;
		}
		const value = normalizeWord(word);
		if (value.length > 0) {
			normalized.add(value);
		}
	}
	return [...normalized].sort();
}

/** Parses free text from the settings tab: words separated by whitespace or commas. */
export function parseWordListText(text: string): string[] {
	return normalizeWordList(text.split(/[\s,]+/u));
}
