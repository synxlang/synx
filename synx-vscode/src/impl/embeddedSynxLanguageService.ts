import type { ISynxLanguageService } from "../language/synxLanguageService";
import type {
    DocContext,
    Position,
    CompletionItem,
    Hover,
    Diagnostic,
    SemanticToken,
} from "../language/types";
import { ParserImpl, Symbol } from "@synxlang/parser";
import { SemanticTokenType } from "../language/types";
import { TextDocument } from "vscode-languageserver-textdocument";

/**
 * Embedded (in-extension) implementation of Synx language support.
 */
export class EmbeddedSynxLanguageService implements ISynxLanguageService {
    private parser: ParserImpl;
    
    constructor() {
        this.parser = new ParserImpl({ parser_nodes: [] });
    }

    getCompletions(_doc: DocContext, _position: Position): CompletionItem[] {
        return [];
    }

    getHover(_doc: DocContext, _position: Position): Hover | null {
        return null;
    }

    getDiagnostics(_doc: DocContext): Diagnostic[] {
        return [];
    }

    getSemanticTokens(doc: DocContext): SemanticToken[] {
        const astNodes = this.parser.parseAll({ src: doc.text, pos: 0 }, Symbol);

        // Use LSP TextDocument's offset<->position conversion (handles CRLF and edge cases correctly).
        const textDoc = TextDocument.create("inmemory://synx", "synx", 0, doc.text);
        
        return astNodes.map(astNode => {
            const [start, end] = astNode.range;
            return {
                range: {
                    start: textDoc.positionAt(start),
                    end: textDoc.positionAt(end),
                },
                tokenType: SemanticTokenType.Symbol,
            };
        });
    }
}
