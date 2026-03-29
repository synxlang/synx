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
        
        const lines = doc.text.split('\n');
        
        function offsetToPosition(offset: number): Position {
            let line = 0;
            let char = 0;
            let currentOffset = 0;
            
            for (let i = 0; i < lines.length; i++) {
                const lineLength = lines[i]!.length;
                const lineEnd = currentOffset + lineLength;
                
                if (offset <= lineEnd) {
                    return { line: i, character: offset - currentOffset };
                }
                
                currentOffset = lineEnd + 1;
                if (currentOffset <= offset) {
                    line = i + 1;
                }
            }
            
            return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
        }
        
        return astNodes.map(astNode => {
            const [start, end] = astNode.range;
            return {
                range: {
                    start: offsetToPosition(start),
                    end: offsetToPosition(end),
                },
                tokenType: SemanticTokenType.Symbol,
            };
        });
    }
}
