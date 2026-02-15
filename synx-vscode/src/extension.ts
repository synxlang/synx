import * as vscode from "vscode";
import { createCompletionItemProvider, createHoverProvider, subscribeDiagnostics } from "./adapter/vscodeProviders";
import { LANGUAGE_ID } from "./constants";
import { EmbeddedSynxLanguageService } from "./impl/embeddedSynxLanguageService";

export function activate(context: vscode.ExtensionContext): void {
    const service = new EmbeddedSynxLanguageService();

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: LANGUAGE_ID },
            createCompletionItemProvider(service),
        ),
        vscode.languages.registerHoverProvider(
            { language: LANGUAGE_ID },
            createHoverProvider(service),
        ),
    );

    const diagnosticsCollection = vscode.languages.createDiagnosticCollection(LANGUAGE_ID);
    context.subscriptions.push(
        subscribeDiagnostics(context, service, diagnosticsCollection),
    );
}

export function deactivate(): void {}
