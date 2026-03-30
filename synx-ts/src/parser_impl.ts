import { matchChar, matchCharRange, matchAnyChar, CharMatchSetResult } from "./parser_matcher";
import {
    ParserNode,
    ParserNodeKind,
    CHAR_MATCH_NODE_KINDS,
    CharMatchNode,
    CharMatchRange,
    CharMatchSet,
    PatternSeq,
    Quantifier,
} from "./parser_node";
import type { Parser, ParserConfig, ParseResult, ParserInput } from "./parser";
import { ParseResultKind } from "./parser";
import type { ASTNode } from "./parser";

/** Parser implementation class, used by mkParser and tests; not exported as public API */
export class ParserImpl implements Parser {
    /** Current parse input and read position (parse state stored on this, child functions read/write through this) */
    input!: ParserInput;
    /** Error message recorded on the last match failure, used by parse() to return Failure, etc. */
    last_error: string | null = null;

    constructor(public config: ParserConfig) {}

    /** Record match failure error without throwing exception; caller should return null / [] etc. */
    setError(message?: string): void {
        this.last_error = message ?? "Parse match failed";
    }

    initParse(input: ParserInput): void {
        this.input = input;
        this.last_error = null;
    }

    parse(input: ParserInput, root: ParserNode): ParseResult {
        this.initParse(input);
        const ast_nodes = this.parseNode(root, " ");
        
        if (this.last_error !== null) {
            return {
                kind: ParseResultKind.Failure,
                ast_nodes: [],
                end_pos: this.input.pos,
            };
        }
        
        return {
            kind: ParseResultKind.Success,
            ast_nodes,
            end_pos: this.input.pos,
        };
    }

    parseAll(input: ParserInput, node: ParserNode): ASTNode[] {
        this.initParse(input);
        const results: ASTNode[] = [];
        
        while (this.input.pos < this.input.src.length) {
            const start = this.input.pos;
            this.last_error = null;
            const ast_nodes = this.parseNode(node, " ");
            
            if (this.last_error === null) {
                results.push(...ast_nodes);
            } else {
                this.input.pos = start + 1;
            }
        }
        
        return results;
    }

    parseNode(node: ParserNode, quantifier: Quantifier): ASTNode[] {
        if (CHAR_MATCH_NODE_KINDS.includes(node.kind)) {
            const result = this.parseCharMatchNode(node as CharMatchNode, quantifier);
            return result === null ? [] : [result];
        }
        if (node.kind === ParserNodeKind.PatternSeq) {
            const first = this.parsePatternSeq(node as PatternSeq);
            if (first === null) {
                if (quantifier === " " || quantifier === "+") this.setError();
                return [];
            }
            if (quantifier === " " || quantifier === "?") return [first];
            const out: ASTNode[] = [first];
            for (;;) {
                const n = this.parsePatternSeq(node as PatternSeq);
                if (n === null) break;
                out.push(n);
            }
            return out;
        }
        this.setError("Unknown node kind");
        return [];
    }

    /** Character matching: match according to quantifier and merge into a string, returns an ASTNode (value/raw_value is the matched string); returns null on failure */
    parseCharMatchNode(node: CharMatchNode, quantifier: Quantifier): ASTNode | null {
        const mk_char_node = (start: number, end: number): ASTNode => ({
            parser_nodes: [node],
            range: [start, end],
            value: this.input.src.slice(start, end),
            raw_value: this.input.src.slice(start, end),
        });

        const try_one = (): boolean => {
            if (node.kind === ParserNodeKind.AnyChar) {
                return this.matchAnyChar();
            }
            if (node.kind === ParserNodeKind.CharMatchRange) 
                return this.matchCharMatchRange(node as CharMatchRange);
            const res = this.matchCharMatchSet(node as CharMatchSet);
            if (res.nodes.length === 0) return false;
            this.input.pos = res.new_pos;
            return true;
        };

        const start = this.input.pos;
        if (!try_one()) {
            if (quantifier === " " || quantifier === "+") this.setError();
            return null;
        }
        if (quantifier === " " || quantifier === "?") return mk_char_node(start, this.input.pos);
        while (try_one()) {}
        return mk_char_node(start, this.input.pos);
    }

    matchCharMatchRange(node: CharMatchRange): boolean {
        const { src, pos } = this.input;
        const res = matchCharRange(src, pos, node.start, node.end);
        if (res.matched) this.input.pos = res.new_pos;
        return res.matched;
    }

    matchCharMatchSet(node: CharMatchSet): CharMatchSetResult {
        const { src, pos } = this.input;
        return matchChar(src, pos, node);
    }

    matchAnyChar(): boolean {
        const { src, pos } = this.input;
        const res = matchAnyChar(src, pos);
        if (res.matched) this.input.pos = res.new_pos;
        return res.matched;
    }

    /** Match a sequence once: parse each sub_node in order using the corresponding sub_quantifier; raw_value / value is an array of child AST nodes */
    parsePatternSeq(node: PatternSeq): ASTNode | null {
        const start = this.input.pos;
        const children: ASTNode[] = [];
        for (let i = 0; i < node.sub_nodes.length; i++) {
            const q = node.sub_quantifiers[i] as Quantifier;
            const part = this.parseNode(node.sub_nodes[i], q);
            if ((q === " " || q === "+") && part.length === 0) {
                this.setError();
                return null;
            }
            children.push(...part);
        }
        return {
            parser_nodes: [node],
            range: [start, this.input.pos],
            value: children,
            raw_value: children,
        };
    }
}
