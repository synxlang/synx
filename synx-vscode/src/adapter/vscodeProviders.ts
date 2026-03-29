/**
 * VSCode extension providers: register completion, hover, diagnostics, semantic tokens with the editor.
 * Uses language service (LSP types) and lspVscodeConvert for conversion only.
 */
import * as vscode from "vscode";
import {
    toDocContext,
    toLspPosition,
    toVscodeHover,
    toVscodeDiagnostic,
    toVscodeCompletionItem,
    toVscodeRange,
} from "./lspVscodeConvert";
import type { ISynxLanguageService } from "../language/synxLanguageService";
import { LANGUAGE_ID } from "../constants";
import { SemanticTokenType } from "../language/types";

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

export function createSemanticTokensProvider(
    service: ISynxLanguageService,
    legend: vscode.SemanticTokensLegend,
): vscode.DocumentSemanticTokensProvider {
    const tokenTypeIndex = legend.tokenTypes.indexOf(SemanticTokenType.Symbol);
    
    return {
        async provideDocumentSemanticTokens(
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.SemanticTokens> {
            const builder = new vscode.SemanticTokensBuilder(legend);
            const doc = toDocContext(document);
            const tokens = service.getSemanticTokens(doc);
            
            for (const semanticToken of tokens) {
                const range = toVscodeRange(semanticToken.range);
                
                for (let line = range.start.line; line <= range.end.line; line++) {
                    const lineStart = line === range.start.line ? range.start.character : 0;
                    const lineEnd = line === range.end.line ? range.end.character : document.lineAt(line).range.end.character;
                    
                    if (lineStart < lineEnd) {
                        builder.push(
                            line,
                            lineStart,
                            lineEnd - lineStart,
                            tokenTypeIndex,
                            0
                        );
                    }
                }
            }
            
            return builder.build();
        },
    };
}

/**
 * Subscribes to document changes and updates of given diagnostic collection
 * using the language service. Call from activate() and dispose() returned Disposable.
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
