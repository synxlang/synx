import type { ISynxLanguageService } from "../language/synxLanguageService";
import type {
    DocContext,
    Position,
    CompletionItem,
    HoverContent,
    Diagnostic,
} from "../language/types";

/**
 * Embedded (in-extension) implementation of Synx language support.
 * Stub only: no concrete logic; replace with real implementation (e.g. using synx-ts parser).
 */
export class EmbeddedSynxLanguageService implements ISynxLanguageService {
    getCompletions(_doc: DocContext, _position: Position): CompletionItem[] {
        return [];
    }

    getHover(_doc: DocContext, _position: Position): HoverContent | null {
        return null;
    }

    getDiagnostics(_doc: DocContext): Diagnostic[] {
        return [];
    }
}
