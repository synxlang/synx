import * as vscode from "vscode";
import type { ISynxLanguageService } from "../language/synxLanguageService";
import type { Range } from "../language/types";

/**
 * Adapt editor-agnostic types to VSCode.
 * Converts DocContext/Position/Range from and to vscode.TextDocument / vscode.Position / vscode.Range.
 */
function toDocContext(document: vscode.TextDocument): { text: string } {
    return { text: document.getText() };
}

function toPosition(document: vscode.TextDocument, pos: vscode.Position): { offset: number } {
    return { offset: document.offsetAt(pos) };
}

function toVscodeRange(document: vscode.TextDocument, range: Range): vscode.Range {
    return new vscode.Range(
        document.positionAt(range.startOffset),
        document.positionAt(range.endOffset),
    );
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
            const pos = toPosition(document, position);
            const items = service.getCompletions(doc, pos);
            return items.map((item) => {
                const vscodeItem = new vscode.CompletionItem(item.label);
                if (item.insertText !== undefined) vscodeItem.insertText = item.insertText;
                if (item.detail !== undefined) vscodeItem.detail = item.detail;
                if (item.range !== undefined) {
                    vscodeItem.range = toVscodeRange(document, item.range);
                }
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
            const pos = toPosition(document, position);
            const hover = service.getHover(doc, pos);
            if (hover === null) return null;
            const contents = new vscode.MarkdownString(hover.contents);
            const range =
                hover.range !== undefined
                    ? toVscodeRange(document, hover.range)
                    : new vscode.Range(position, position);
            return new vscode.Hover(contents, range);
        },
    };
}

function toVscodeDiagnosticSeverity(
    sev: "error" | "warning" | "info" | undefined,
): vscode.DiagnosticSeverity {
    switch (sev) {
        case "error":
            return vscode.DiagnosticSeverity.Error;
        case "warning":
            return vscode.DiagnosticSeverity.Warning;
        case "info":
            return vscode.DiagnosticSeverity.Information;
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
                const range = toVscodeRange(doc, d.range);
                return new vscode.Diagnostic(range, d.message, toVscodeDiagnosticSeverity(d.severity));
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
