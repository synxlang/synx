import * as vscode from "vscode";
import { createCompletionItemProvider, createHoverProvider, subscribeDiagnostics } from "./adapter/vscodeProviders";
import { EmbeddedSynxLanguageService } from "./impl/embeddedSynxLanguageService";

export function activate(context: vscode.ExtensionContext): void {
    const service = new EmbeddedSynxLanguageService();

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: "synx" },
            createCompletionItemProvider(service),
        ),
        vscode.languages.registerHoverProvider(
            { language: "synx" },
            createHoverProvider(service),
        ),
    );

    const diagnosticsCollection = vscode.languages.createDiagnosticCollection("synx");
    context.subscriptions.push(
        subscribeDiagnostics(context, service, diagnosticsCollection),
    );
}

export function deactivate(): void {}
