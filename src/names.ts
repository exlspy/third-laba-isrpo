const keywords = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
    'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
    'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
]);

const irregular: Record<string, string> = {
    data: 'item',
    people: 'person',
    children: 'child',
    men: 'man',
    women: 'woman',
    mice: 'mouse',
    indices: 'index',
    matrix: 'row',
    matrices: 'matrix',
    grid: 'row',
    table: 'row',
    text: 'char',
    word: 'char',
    line: 'char',
    string: 'char',
    s: 'ch'
};

export function singular(name: string): string {
    const lower = name.toLowerCase();
    if (lower in irregular) {
        return irregular[lower];
    }
    if (name.length > 4 && name.endsWith('ies')) {
        return name.slice(0, -3) + 'y';
    }
    if (/(ss|us|is)$/.test(name)) {
        return name;
    }
    if (/(ches|shes|xes|ses|zes)$/.test(name)) {
        return name.slice(0, -2);
    }
    if (name.length > 2 && name.endsWith('s')) {
        return name.slice(0, -1);
    }
    return name;
}

export function uniqueName(base: string, used: Set<string>): string {
    let name = base;
    let number = 2;
    while (used.has(name) || keywords.has(name)) {
        name = base + number;
        number++;
    }
    used.add(name);
    return name;
}

export function itemName(collection: string, used: Set<string>, fallback: string): string {
    const base = singular(collection);
    if (base === collection || keywords.has(base)) {
        return uniqueName(fallback, used);
    }
    return uniqueName(base, used);
}
