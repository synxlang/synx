/**
 * Editor-agnostic types for Synx language support.
 * Used by both embedded (VSCode) and future LSP adapter; no dependency on vscode.
 */

/** Document context passed to language service (offset-based for parsing). */
export interface DocContext {
    /** Full document text. */
    text: string;
}

/** Range as character offsets [start, end). */
export interface Range {
    startOffset: number;
    endOffset: number;
}

/** Position as character offset. */
export interface Position {
    offset: number;
}

/** A single completion suggestion. */
export interface CompletionItem {
    label: string;
    insertText?: string;
    detail?: string;
    /** Range to replace when applying this completion; if omitted, editor chooses. */
    range?: Range;
}

/** Hover content. */
export interface HoverContent {
    contents: string;
    range?: Range;
}

/** Diagnostic severity. */
export type DiagnosticSeverity = "error" | "warning" | "info";

/** A single diagnostic (error/warning/info). */
export interface Diagnostic {
    range: Range;
    message: string;
    severity?: DiagnosticSeverity;
}
