/**
 * VSCode extension providers: register completion, hover, diagnostics with the editor.
 * Uses language service (LSP types) and lspVscodeConvert for conversion only.
 */
import * as vscode from "vscode";
import {
    toDocContext,
    toLspPosition,
    toVscodeHover,
    toVscodeDiagnostic,
    toVscodeCompletionItem,
} from "./lspVscodeConvert";
import type { ISynxLanguageService } from "../language/synxLanguageService";
import { LANGUAGE_ID } from "../constants";

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
            return items.map(toVscodeCompletionItem);
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
            const fallbackRange = new vscode.Range(position, position);
            return toVscodeHover(hover, fallbackRange);
        },
    };
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
        if (doc.languageId !== LANGUAGE_ID) return;
        const diagnostics = service.getDiagnostics(toDocContext(doc));
        collection.set(doc.uri, diagnostics.map(toVscodeDiagnostic));
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            update(e.document);
        }),
    );
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((doc) => {
            update(doc);
        }),
    );
    for (const doc of vscode.workspace.textDocuments) {
        update(doc);
    }
    return new vscode.Disposable(() => collection.dispose());
}
