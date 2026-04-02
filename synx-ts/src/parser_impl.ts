import assert from "assert";
import { matchChar, matchCharRange, matchAnyChar, CharMatchSetResult } from "./parser_matcher";
import {
    ParserNode,
    ParserNodeKind,
    CHAR_MATCH_NODE_KINDS,
    CharMatchNode,
    CharMatchRange,
    CharMatchSet,
    PatternSeq,
    CharSeq,
    PatternSet,
    Quantifier,
} from "./parser_node";
import type { Parser, ParserConfig, ParseResult, ParserInput } from "./parser";
import { ParseResultKind } from "./parser";
import type { ASTNode } from "./parser";

/**
 * ParserImpl conventions (keep these stable to avoid redundant logic):
 *
 * - Single vs quantified parse:
 *   - `parseSingleNode(node)` parses exactly ONE instance of `node` (no outer quantifier).
 *   - `parseNode(node, quantifier)` is the ONLY place that expands quantifiers for non-char nodes.
 *
 * - Error handling:
 *   - Use only `setError`, `setSuccess`, and `getError`. A successful path must end with no pending error (`getError() === null`).
 *
 * - Unknown kinds:
 *   - Unknown / unhandled `ParserNodeKind` is NOT allowed and fails fast via `assert.fail(...)`.
 */
/** Parser implementation class, used by mkParser and tests; not exported as public API */
export class ParserImpl implements Parser {
    /** Current parse input and read position (parse state stored on this, child functions read/write through this) */
    input!: ParserInput;
    private last_error: string | null = null;
    /** Active (node,pos) pairs in current call stack, for infinite recursion detection */
    private active_parse_stack: Array<{ node: ParserNode; pos: number }> = [];

    constructor(public config: ParserConfig) {}

    /** Current parse error message, or `null` if the last completed operation left no failure pending. */
    getError(): string | null {
        return this.last_error;
    }

    /** Clear parse error; call when the current operation succeeded and must not leave a stale failure. */
    setSuccess(): void {
        this.last_error = null;
    }

    /** Record match failure without throwing; caller should return null / [] etc. */
    setError(message?: string): void {
        this.last_error = message ?? "Parse match failed";
    }

    initParse(input: ParserInput): void {
        this.input = input;
        this.setSuccess();
        this.active_parse_stack.length = 0;
    }

    parse(input: ParserInput, root: ParserNode): ParseResult {
        this.initParse(input);
        const ast_nodes = this.parseNode(root, " ");
        
        if (this.getError() !== null) {
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
            this.setSuccess();
            const ast_nodes = this.parseNode(node, " ");
            
            if (this.getError() === null) {
                results.push(...ast_nodes);
            } else {
                this.input.pos = start + 1;
            }
        }
        
        return results;
    }

    parseNode(node: ParserNode, quantifier: Quantifier, ignored: ParserNode | null = null): ASTNode[] {
        if (CHAR_MATCH_NODE_KINDS.includes(node.kind)) {
            const result = this.parseCharMatchNode(node as CharMatchNode, quantifier, ignored);
            return result === null ? [] : [result];
        }
        const first = this.parseSingleNode(node);
        if (first === null) {
            if (quantifier === " " || quantifier === "+") this.setError();
            return [];
        }
        if (quantifier === " " || quantifier === "?") return [first];
        const out: ASTNode[] = [first];
        for (;;) {
            const retry_pos = this.input.pos;
            this.consumeIgnored(ignored);
            const n = this.parseSingleNode(node);
            if (n === null) {
                this.input.pos = retry_pos;
                this.setSuccess();
                break;
            }
            out.push(n);
        }
        return out;
    }

    private isRecursiveCall(node: ParserNode, pos: number): boolean {
        for (let i = this.active_parse_stack.length - 1; i >= 0; i--) {
            const frame = this.active_parse_stack[i]!;
            if (frame.node === node && frame.pos === pos) {
                return true;
            }
        }
        return false;
    }

    parseSingleNode(node: ParserNode): ASTNode | null {
        const pos = this.input.pos;
        if (this.isRecursiveCall(node, pos)) {
            this.setError("Infinite recursion detected");
            return null;
        }
        this.active_parse_stack.push({ node, pos });

        let out: ASTNode | null;
        if (node.kind === ParserNodeKind.CharSeq) {
            out = this.parseCharSeq(node as CharSeq);
        } else if (node.kind === ParserNodeKind.PatternSet) {
            out = this.parsePatternSet(node as PatternSet);
        } else if (node.kind === ParserNodeKind.PatternSeq) {
            out = this.parsePatternSeq(node as PatternSeq);
        } else if (CHAR_MATCH_NODE_KINDS.includes(node.kind)) {
            out = this.parseCharMatchNode(node as CharMatchNode, " ");
        } else {
            assert.fail(`Unknown node kind: ${node.kind}`);
        }

        this.active_parse_stack.pop();
        return out;
    }

    /** Character matching: match according to quantifier and merge into a string, returns an ASTNode (value/raw_value is the matched string); returns null on failure */
    parseCharMatchNode(node: CharMatchNode, quantifier: Quantifier, ignored: ParserNode | null = null): ASTNode | null {
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
        for (;;) {
            const retry_pos = this.input.pos;
            if (ignored !== null) {
                this.consumeIgnored(ignored);
            }
            if (!try_one()) {
                this.input.pos = retry_pos;
                this.setSuccess();
                break;
            }
        }
        return mk_char_node(start, this.input.pos);
    }

    /** Match a fixed literal once (quantifiers are handled in parseNode, like parsePatternSeq). */
    parseCharSeq(node: CharSeq): ASTNode | null {
        if (node.literal.length === 0) {
            return null;
        }
        const { src, pos } = this.input;
        const start = pos;
        if (!src.startsWith(node.literal, start)) {
            return null;
        }
        this.input.pos = start + node.literal.length;
        const end = this.input.pos;
        return {
            parser_nodes: [node],
            range: [start, end],
            value: this.input.src.slice(start, end),
            raw_value: this.input.src.slice(start, end),
        };
    }

    /**
     * Match one of the alternatives in order.
     */
    parsePatternSet(node: PatternSet): ASTNode | null {
        const start = this.input.pos;

        for (const alt of node.patterns) {
            // Always restart from the same position for each alternative.
            this.input.pos = start;

            const child = this.parseSingleNode(alt);
            if (child !== null) {
                child.parser_nodes.push(node);
                return child;
            }
        }
        return null;
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

    private consumeIgnored(node: ParserNode | null): void {
        if (node === null) return;
        this.parseNode(node, "*");
        this.setSuccess();
    }
    /**
     * Match a sequence once: parse each sub_node in order using the corresponding sub_quantifier.
     * `value` / `raw_value`: for sub_quantifier ` ` or `?`, child AST nodes are flattened into the list;
     * for `*` / `+`, one slot holds `ASTNode[]` (the repetitions for that sub-node) without flattening.
     * If `flat` is true, `value` is the matched substring; otherwise `value` mirrors `raw_value`.
     */
    parsePatternSeq(node: PatternSeq): ASTNode | null {
        const start = this.input.pos;
        const children: Array<ASTNode | ASTNode[]> = [];
        for (let i = 0; i < node.sub_nodes.length; i++) {
            const q = node.sub_quantifiers[i] as Quantifier;
            const part = this.parseNode(node.sub_nodes[i]!, q, node.ignore);
            if ((q === " " || q === "+") && part.length === 0) {
                this.setError();
                return null;
            }
            if (q === " " || q === "?") {
                children.push(...part);
            } else {
                // `*` / `+`: keep repetitions grouped (do not flatten into the seq's child list).
                if (part.length > 0) {
                    children.push(part);
                }
            }

            if (i + 1 < node.sub_nodes.length) {
                this.consumeIgnored(node.ignore);
            }
        }

        const value = node.flat 
            ? this.input.src.slice(start, this.input.pos)
            : children;

        return {
            parser_nodes: [node],
            range: [start, this.input.pos],
            value,
            raw_value: children,
        };
    }
}
