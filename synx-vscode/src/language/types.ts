import type { Range } from "vscode-languageserver-types";

/**
 * Editor-agnostic types for Synx language support.
 * Re-exports LSP types from vscode-languageserver-types; only DocContext is custom (document text for embedded use).
 */
export type {
    Position,
    Range,
    CompletionItem,
    Hover,
    Diagnostic,
    DiagnosticSeverity,
} from "vscode-languageserver-types";

/** Document context passed to language service (full text; LSP would use URI + server-held content). */
export interface DocContext {
    /** Full document text. */
    text: string;
}

/** Semantic token types for Synx language */
export const enum SemanticTokenType {
    Symbol = 'symbol',
}

/** Semantic token data */
export interface SemanticToken {
    /** Token range in the document */
    range: Range;
    /** Token type */
    tokenType: SemanticTokenType;
}
