import { VarKind } from './scanner';
import { itemName, uniqueName } from './names';

export interface LoopVariant {
    id: string;
    label: string;
}

export interface LoopLine {
    depth: number;
    text: string;
}

export interface LoopRequest {
    collection: string;
    kind: VarKind;
    variant: string;
    used: Set<string>;
}

export interface RangeResult {
    expression?: string;
    error?: string;
}

const sequenceVariants: LoopVariant[] = [
    { id: 'plain', label: 'по элементам' },
    { id: 'enumerate', label: 'по элементам с индексом (enumerate)' },
    { id: 'reversed', label: 'в обратном порядке (reversed)' },
    { id: 'index', label: 'по индексам (range(len(...)))' }
];

const variants: Record<VarKind, LoopVariant[]> = {
    list: sequenceVariants,
    tuple: sequenceVariants,
    unknown: sequenceVariants,
    set: [
        { id: 'plain', label: 'по элементам' },
        { id: 'sorted', label: 'по элементам в отсортированном порядке' }
    ],
    matrix: [
        { id: 'plain', label: 'по строкам' },
        { id: 'nested', label: 'по всем элементам (вложенный цикл)' },
        { id: 'nestedIndex', label: 'по всем элементам с индексами i, j' }
    ],
    dict: [
        { id: 'keys', label: 'по ключам' },
        { id: 'values', label: 'по значениям' },
        { id: 'items', label: 'по парам ключ-значение (items)' }
    ],
    str: [
        { id: 'plain', label: 'по символам' },
        { id: 'enumerate', label: 'по символам с индексом' },
        { id: 'words', label: 'по словам (split)' }
    ],
    int: [
        { id: 'count', label: 'от 0 до значения (range)' },
        { id: 'countdown', label: 'от значения до 1 (обратный отсчёт)' }
    ],
    range: [
        { id: 'plain', label: 'по значениям range' }
    ]
};

export function variantsFor(kind: VarKind): LoopVariant[] {
    return variants[kind];
}

function isIdentifier(text: string): boolean {
    return /^[A-Za-z_]\w*$/.test(text);
}

export function buildLoop(request: LoopRequest): LoopLine[] {
    const { collection, variant, used } = request;
    const lines: LoopLine[] = [];
    const header = (text: string, depth = 0) => lines.push({ depth, text: `for ${text}:` });

    const element = (fallback: string) =>
        isIdentifier(collection) ? itemName(collection, used, fallback) : uniqueName(fallback, used);

    switch (variant) {
        case 'plain':
            if (request.kind === 'range') {
                header(`${uniqueName('i', used)} in ${collection}`);
            } else {
                header(`${element('item')} in ${collection}`);
            }
            break;
        case 'enumerate': {
            const index = uniqueName('i', used);
            header(`${index}, ${element('item')} in enumerate(${collection})`);
            break;
        }
        case 'reversed':
            header(`${element('item')} in reversed(${collection})`);
            break;
        case 'sorted':
            header(`${element('item')} in sorted(${collection})`);
            break;
        case 'index':
            header(`${uniqueName('i', used)} in range(len(${collection}))`);
            break;
        case 'nested': {
            const row = uniqueName('row', used);
            header(`${row} in ${collection}`);
            header(`${uniqueName('item', used)} in ${row}`, 1);
            break;
        }
        case 'nestedIndex': {
            const i = uniqueName('i', used);
            const j = uniqueName('j', used);
            header(`${i} in range(len(${collection}))`);
            header(`${j} in range(len(${collection}[${i}]))`, 1);
            break;
        }
        case 'keys':
            header(`${uniqueName('key', used)} in ${collection}`);
            break;
        case 'values':
            header(`${uniqueName('value', used)} in ${collection}.values()`);
            break;
        case 'items': {
            const key = uniqueName('key', used);
            const value = uniqueName('value', used);
            header(`${key}, ${value} in ${collection}.items()`);
            break;
        }
        case 'words':
            header(`${uniqueName('word', used)} in ${collection}.split()`);
            break;
        case 'count':
            header(`${uniqueName('i', used)} in range(${collection})`);
            break;
        case 'countdown':
            header(`${uniqueName('i', used)} in range(${collection}, 0, -1)`);
            break;
    }
    return lines;
}

export function parseRange(input: string): RangeResult {
    const parts = input.split(',').map(part => part.trim());
    if (parts.length < 1 || parts.length > 3 || parts.some(part => part === '')) {
        return { error: 'Нужно от 1 до 3 значений через запятую' };
    }
    const numbers = parts.map(part => (/^-?\d+$/.test(part) ? Number(part) : undefined));
    const allNumbers = numbers.every(n => n !== undefined);

    if (parts.length === 3 && numbers[2] === 0) {
        return { error: 'Шаг не может быть равен нулю' };
    }
    if (allNumbers) {
        const start = parts.length === 1 ? 0 : numbers[0]!;
        const stop = parts.length === 1 ? numbers[0]! : numbers[1]!;
        const step = parts.length === 3 ? numbers[2]! : 1;
        if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
            return { error: 'С такими границами цикл не выполнится ни разу' };
        }
    }

    if (parts.length === 3 && parts[2] === '1') {
        parts.pop();
    }
    if (parts.length === 2 && parts[0] === '0') {
        parts.shift();
    }
    return { expression: `range(${parts.join(', ')})` };
}
