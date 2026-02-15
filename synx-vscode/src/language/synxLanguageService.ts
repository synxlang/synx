import type {
    DocContext,
    Position,
    CompletionItem,
    HoverContent,
    Diagnostic,
} from "./types";

/**
 * Editor-agnostic interface for Synx language support.
 * Implemented by embedded (in-extension) logic; same interface can be backed by LSP later.
 */
export interface ISynxLanguageService {
    getCompletions(doc: DocContext, position: Position): CompletionItem[];

    getHover(doc: DocContext, position: Position): HoverContent | null;

    getDiagnostics(doc: DocContext): Diagnostic[];
}
