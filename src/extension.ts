import * as vscode from 'vscode';
import { findVariables, usedNames, kindTitle, VarKind } from './scanner';
import { variantsFor, buildLoop, parseRange, LoopLine } from './builder';

interface Target {
    expression: string;
    kind: VarKind;
}

type TargetItem = vscode.QuickPickItem & {
    varKind?: VarKind;
    action?: 'range' | 'manual';
};

type VariantItem = vscode.QuickPickItem & {
    id: string;
};

function pythonEditor(): vscode.TextEditor | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('Нет открытого файла');
        return undefined;
    }
    if (editor.document.languageId !== 'python') {
        vscode.window.showWarningMessage('For Generator работает только с файлами Python');
        return undefined;
    }
    return editor;
}

function documentLines(document: vscode.TextDocument): string[] {
    return document.getText().split(/\r?\n/);
}

function indentOf(text: string): string {
    const match = /^\s*/.exec(text);
    return match ? match[0] : '';
}

function indentUnit(editor: vscode.TextEditor): string {
    const insertSpaces = editor.options.insertSpaces !== false;
    const tabSize = Number(editor.options.tabSize) || 4;
    return insertSpaces ? ' '.repeat(tabSize) : '\t';
}

function indentForNewLine(lines: string[], lineNumber: number, unit: string): string {
    for (let i = Math.min(lineNumber, lines.length - 1); i >= 0; i--) {
        const text = lines[i];
        if (text.trim() === '') {
            continue;
        }
        const indent = indentOf(text);
        return text.trimEnd().endsWith(':') ? indent + unit : indent;
    }
    return '';
}

function render(loop: LoopLine[], base: string, unit: string): string[] {
    return loop.map(line => base + unit.repeat(line.depth) + line.text);
}

async function chooseTarget(lines: string[], cursorLine: number): Promise<Target | undefined> {
    const variables = findVariables(lines, cursorLine);
    const items: TargetItem[] = variables.map(variable => ({
        label: variable.name,
        description: kindTitle(variable.kind),
        detail: `строка ${variable.line + 1}`,
        varKind: variable.kind
    }));
    items.push(
        { label: 'range(...)', description: 'цикл по числам', action: 'range' },
        { label: 'Другое выражение', description: 'ввести вручную', action: 'manual' }
    );

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'По чему будет идти цикл?'
    });
    if (!picked) {
        return undefined;
    }

    if (picked.action === 'range') {
        const text = await vscode.window.showInputBox({
            prompt: 'Границы range: stop  |  start, stop  |  start, stop, step',
            value: '10',
            validateInput: value => parseRange(value).error
        });
        if (text === undefined) {
            return undefined;
        }
        return { expression: parseRange(text).expression!, kind: 'range' };
    }

    if (picked.action === 'manual') {
        const text = await vscode.window.showInputBox({
            prompt: 'Выражение, по которому будет идти цикл',
            placeHolder: 'например: my_list или obj.children'
        });
        if (!text || text.trim() === '') {
            return undefined;
        }
        return { expression: text.trim(), kind: 'unknown' };
    }

    return { expression: picked.label, kind: picked.varKind! };
}

async function chooseVariant(kind: VarKind): Promise<string | undefined> {
    const variants = variantsFor(kind);
    if (variants.length === 1) {
        return variants[0].id;
    }
    const items: VariantItem[] = variants.map(variant => ({ label: variant.label, id: variant.id }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Какой цикл нужен?' });
    return picked ? picked.id : undefined;
}

async function insertLoop(): Promise<void> {
    const editor = pythonEditor();
    if (!editor) {
        return;
    }
    const document = editor.document;
    const lines = documentLines(document);
    const position = editor.selection.active;

    const target = await chooseTarget(lines, position.line);
    if (!target) {
        return;
    }
    const variant = await chooseVariant(target.kind);
    if (!variant) {
        return;
    }

    const loop = buildLoop({
        collection: target.expression,
        kind: target.kind,
        variant,
        used: usedNames(lines)
    });

    const unit = indentUnit(editor);
    const base = indentForNewLine(lines, position.line, unit);
    const bodyIndent = base + unit.repeat(loop.length);
    const text = render(loop, base, unit).join('\n') + '\n' + bodyIndent;

    const line = document.lineAt(position.line);
    let firstLoopLine = position.line;
    if (line.isEmptyOrWhitespace) {
        await editor.edit(edit => edit.replace(line.range, text));
    } else {
        await editor.edit(edit => edit.insert(line.range.end, '\n' + text));
        firstLoopLine++;
    }

    const cursor = new vscode.Position(firstLoopLine + loop.length, bodyIndent.length);
    editor.selection = new vscode.Selection(cursor, cursor);
}

async function wrapSelection(): Promise<void> {
    const editor = pythonEditor();
    if (!editor) {
        return;
    }
    const document = editor.document;
    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showWarningMessage('Сначала выделите строки, которые нужно обернуть в цикл');
        return;
    }

    const firstLine = selection.start.line;
    let lastLine = selection.end.line;
    if (selection.end.character === 0 && lastLine > firstLine) {
        lastLine--;
    }

    const lines = documentLines(document);
    const selected = lines.slice(firstLine, lastLine + 1);

    const target = await chooseTarget(lines, firstLine);
    if (!target) {
        return;
    }
    const variant = await chooseVariant(target.kind);
    if (!variant) {
        return;
    }

    const loop = buildLoop({
        collection: target.expression,
        kind: target.kind,
        variant,
        used: usedNames(lines)
    });

    const unit = indentUnit(editor);
    const notEmpty = selected.filter(text => text.trim() !== '');
    const base = notEmpty.length
        ? notEmpty.map(indentOf).reduce((a, b) => (a.length <= b.length ? a : b))
        : indentOf(lines[firstLine]);
    const extra = unit.repeat(loop.length);

    const body = selected.map(text => (text.trim() === '' ? '' : base + extra + text.slice(base.length)));
    const result = render(loop, base, unit).concat(body).join('\n');

    const range = new vscode.Range(firstLine, 0, lastLine, lines[lastLine].length);
    await editor.edit(edit => edit.replace(range, result));
}

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('forGenerator.insertLoop', insertLoop),
        vscode.commands.registerCommand('forGenerator.wrapSelection', wrapSelection)
    );
}

export function deactivate(): void {}
