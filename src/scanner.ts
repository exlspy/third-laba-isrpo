export type VarKind =
    | 'list'
    | 'matrix'
    | 'dict'
    | 'set'
    | 'tuple'
    | 'str'
    | 'int'
    | 'range'
    | 'unknown';

export interface Variable {
    name: string;
    kind: VarKind;
    line: number;
}

const assignment = /^\s*([A-Za-z_]\w*)\s*(?::\s*([^=]+?))?\s*=(?!=)\s*(.+?)\s*$/;
const identifier = /[A-Za-z_]\w*/g;

const kindTitles: Record<VarKind, string> = {
    list: 'список',
    matrix: 'список списков',
    dict: 'словарь',
    set: 'множество',
    tuple: 'кортеж',
    str: 'строка',
    int: 'число',
    range: 'range',
    unknown: 'тип не определён'
};

const callKinds: Record<string, VarKind> = {
    list: 'list',
    sorted: 'list',
    dict: 'dict',
    set: 'set',
    tuple: 'tuple',
    str: 'str',
    input: 'str',
    int: 'int',
    len: 'int',
    range: 'range'
};

export function kindTitle(kind: VarKind): string {
    return kindTitles[kind];
}

function kindByAnnotation(annotation: string): VarKind | undefined {
    const text = annotation.trim().toLowerCase();
    if (text.startsWith('list[list')) {
        return 'matrix';
    }
    if (text.startsWith('list')) {
        return 'list';
    }
    if (text.startsWith('dict')) {
        return 'dict';
    }
    if (text.startsWith('set')) {
        return 'set';
    }
    if (text.startsWith('tuple')) {
        return 'tuple';
    }
    if (text === 'str') {
        return 'str';
    }
    if (text === 'int') {
        return 'int';
    }
    return undefined;
}

function kindByValue(value: string): VarKind {
    if (value.startsWith('[[')) {
        return 'matrix';
    }
    if (value.startsWith('[')) {
        return 'list';
    }
    if (value.startsWith('{')) {
        return value === '{}' || value.includes(':') ? 'dict' : 'set';
    }
    if (value.startsWith('(') && value.includes(',')) {
        return 'tuple';
    }
    if (/^[fr]?["']/.test(value)) {
        return 'str';
    }
    if (/^-?\d+$/.test(value)) {
        return 'int';
    }
    const call = /^(\w+)\s*\(/.exec(value);
    if (call && call[1] in callKinds) {
        return callKinds[call[1]];
    }
    if (/\.split\(.*\)$/.test(value) || /\.keys\(\)$/.test(value) || /\.values\(\)$/.test(value)) {
        return 'list';
    }
    return 'unknown';
}

export function findVariables(lines: string[], beforeLine: number): Variable[] {
    const found = new Map<string, Variable>();
    const limit = Math.min(beforeLine, lines.length);
    for (let i = 0; i < limit; i++) {
        const match = assignment.exec(lines[i]);
        if (!match) {
            continue;
        }
        const name = match[1];
        const annotation = match[2];
        const value = match[3];
        let kind = annotation ? kindByAnnotation(annotation) : undefined;
        if (!kind) {
            kind = kindByValue(value);
        }
        found.set(name, { name, kind, line: i });
    }
    return Array.from(found.values()).sort((a, b) => b.line - a.line);
}

export function usedNames(lines: string[]): Set<string> {
    const names = new Set<string>();
    for (const line of lines) {
        for (const match of line.matchAll(identifier)) {
            names.add(match[0]);
        }
    }
    return names;
}
