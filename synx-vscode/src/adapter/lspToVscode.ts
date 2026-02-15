/**
 * Dedicated conversion layer: LSP types (vscode-languageserver-types) ↔ VSCode API types.
 * Single place for all protocol/editor type mapping; used by vscodeProviders and testable in isolation.
 */
import * as vscode from "vscode";
import { MarkupContent } from "vscode-languageserver-types";
import type {
    DocContext,
    Position,
    Range,
    CompletionItem,
    Hover,
    Diagnostic,
    DiagnosticSeverity,
} from "../language/types";

// --- VSCode → LSP (inputs to language service) ---

export function toDocContext(document: vscode.TextDocument): DocContext {
    return { text: document.getText() };
}

export function toLspPosition(vscodePos: vscode.Position): Position {
    return { line: vscodePos.line, character: vscodePos.character };
}

// --- LSP → VSCode (outputs from language service) ---

export function toVscodeRange(lspRange: Range): vscode.Range {
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

export function toVscodeHover(
    lspHover: Hover,
    fallbackRange: vscode.Range,
): vscode.Hover {
    const contents = hoverContentsToMarkdown(lspHover.contents);
    const range =
        lspHover.range !== undefined ? toVscodeRange(lspHover.range) : fallbackRange;
    return new vscode.Hover(contents, range);
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

export function toVscodeDiagnostic(lspDiagnostic: Diagnostic): vscode.Diagnostic {
    const range = toVscodeRange(lspDiagnostic.range);
    return new vscode.Diagnostic(
        range,
        lspDiagnostic.message,
        toVscodeDiagnosticSeverity(lspDiagnostic.severity),
    );
}

export function toVscodeCompletionItem(lspItem: CompletionItem): vscode.CompletionItem {
    const item = new vscode.CompletionItem(lspItem.label);
    if (lspItem.insertText !== undefined) item.insertText = lspItem.insertText;
    if (lspItem.detail !== undefined) item.detail = lspItem.detail;
    const range =
        lspItem.textEdit && "range" in lspItem.textEdit
            ? lspItem.textEdit.range
            : undefined;
    if (range !== undefined) item.range = toVscodeRange(range);
    return item;
}
