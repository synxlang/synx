import type {
    DocContext,
    Position,
    CompletionItem,
    Hover,
    Diagnostic,
} from "./types";

/**
 * Editor-agnostic interface for Synx language support.
 * Implemented by embedded (in-extension) logic; same interface can be backed by LSP later.
 * Uses vscode-languageserver-types (Position, Range, CompletionItem, Hover, Diagnostic).
 */
export interface ISynxLanguageService {
    getCompletions(doc: DocContext, position: Position): CompletionItem[];

    getHover(doc: DocContext, position: Position): Hover | null;

    getDiagnostics(doc: DocContext): Diagnostic[];
}
