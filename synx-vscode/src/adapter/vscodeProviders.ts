import * as vscode from "vscode";
import { MarkupContent, MarkedString } from "vscode-languageserver-types";
import type { ISynxLanguageService } from "../language/synxLanguageService";
import type { DocContext, Position, Range, DiagnosticSeverity } from "../language/types";
import type { Hover } from "../language/types";

/**
 * Adapt editor-agnostic LSP types to VSCode.
 * Converts between vscode.TextDocument/Position/Range and LSP DocContext/Position/Range.
 */
function toDocContext(document: vscode.TextDocument): DocContext {
    return { text: document.getText() };
}

function toLspPosition(vscodePos: vscode.Position): Position {
    return { line: vscodePos.line, character: vscodePos.character };
}

function toVscodeRange(lspRange: Range): vscode.Range {
    return new vscode.Range(
        lspRange.start.line,
        lspRange.start.character,
        lspRange.end.line,
        lspRange.end.character,
    );
}

function hoverContentsToMarkdown(contents: Hover["contents"]): vscode.MarkdownString {
    if (typeof contents === "string") return new vscode.MarkdownString(contents);
    if (MarkupContent.is(contents)) return new vscode.MarkdownString(contents.value);
    if (Array.isArray(contents)) {
        const parts = contents.map((c) =>
            typeof c === "string" ? c : c.value,
        );
        return new vscode.MarkdownString(parts.join("\n\n"));
    }
    return new vscode.MarkdownString(contents.value);
}

export function createCompletionItemProvider(
    service: ISynxLanguageService,
): vscode.CompletionItemProvider {
    return {
        provideCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position,
        ): vscode.CompletionItem[] {
            const doc = toDocContext(document);
            const pos = toLspPosition(position);
            const items = service.getCompletions(doc, pos);
            return items.map((item) => {
                const vscodeItem = new vscode.CompletionItem(item.label);
                if (item.insertText !== undefined) vscodeItem.insertText = item.insertText;
                if (item.detail !== undefined) vscodeItem.detail = item.detail;
                const range = item.textEdit && "range" in item.textEdit
                    ? item.textEdit.range
                    : undefined;
                if (range !== undefined) vscodeItem.range = toVscodeRange(range);
                return vscodeItem;
            });
        },
    };
}

export function createHoverProvider(service: ISynxLanguageService): vscode.HoverProvider {
    return {
        provideHover(
            document: vscode.TextDocument,
            position: vscode.Position,
        ): vscode.Hover | null {
            const doc = toDocContext(document);
            const pos = toLspPosition(position);
            const hover = service.getHover(doc, pos);
            if (hover === null) return null;
            const contents = hoverContentsToMarkdown(hover.contents);
            const range =
                hover.range !== undefined
                    ? toVscodeRange(hover.range)
                    : new vscode.Range(position, position);
            return new vscode.Hover(contents, range);
        },
    };
}

function toVscodeDiagnosticSeverity(
    sev: DiagnosticSeverity | undefined,
): vscode.DiagnosticSeverity {
    switch (sev) {
        case 1:
            return vscode.DiagnosticSeverity.Error;
        case 2:
            return vscode.DiagnosticSeverity.Warning;
        case 3:
            return vscode.DiagnosticSeverity.Information;
        case 4:
            return vscode.DiagnosticSeverity.Hint;
        default:
            return vscode.DiagnosticSeverity.Error;
    }
}

/**
 * Subscribes to document changes and updates the given diagnostic collection
 * using the language service. Call from activate() and dispose the returned Disposable.
 */
export function subscribeDiagnostics(
    context: vscode.ExtensionContext,
    service: ISynxLanguageService,
    collection: vscode.DiagnosticCollection,
): vscode.Disposable {
    function update(doc: vscode.TextDocument): void {
        if (doc.languageId !== "synx") return;
        const diagnostics = service.getDiagnostics(toDocContext(doc));
        collection.set(
            doc.uri,
            diagnostics.map((d) => {
                const range = toVscodeRange(d.range);
                return new vscode.Diagnostic(
                    range,
                    d.message,
                    toVscodeDiagnosticSeverity(d.severity),
                );
            }),
        );
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            update(e.document);
        }),
    );
    for (const doc of vscode.workspace.textDocuments) {
        update(doc);
    }
    return new vscode.Disposable(() => collection.dispose());
}
