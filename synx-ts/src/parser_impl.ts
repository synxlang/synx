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

interface ParseNodeExResult {
    nodes: ASTNode[];
    seps: ASTNode[];
}

/**
 * ============================== EN ==============================
 *
 * Parser implementation class, used by mkParser and tests; not exported as public API.
 *
 * Parse call conventions:
 * - Index:
 *   - On success: before returning, move the parse index to the next unconsumed position after the matched span.
 *   - On failure: restore the index to the initial position.
 *
 * - Error handling and state:
 *   - `clearError` is only for clearing error state (e.g. when a clean slate is required before a call).
 *   - `setSuccess` is only for marking success; if you only need errors cleared without meaning “this step succeeded”, use `clearError`.
 *   - `setError(error_pos, …)` / `getError` set and read failure state; `error_pos` must be `input.pos` at the moment the failure is determined.
 *   - Success must be determined only with `isSuccess()`; do not use any other rule.
 *   - On success, `isSuccess()` is true; on failure, `isSuccess()` is false.
 *
 * - Single parse vs quantified parse:
 *   - `parseSingleNode(node)` parses exactly ONE instance of `node` (no outer quantifier).
 *   - `parseNode(node, quantifier)` is the ONLY place that expands quantifiers for non-char nodes.
 *
 * ============================== 中文 ==============================
 *
 * 解析器实现类，供 mkParser 与测试使用；不作为对外公开 API 导出。
 *
 * 解析调用约定：
 * - 索引：
 *   - 成功：返回前将解析索引移动到已匹配片段之后的下一未消费位置。
 *   - 失败：要求还原索引到初始位置。
 *
 * - 错误处理与状态：
 *   - `clearError` 仅用于清理错误状态（例如调用前需要干净状态时）。
 *   - `setSuccess` 仅用于设置/标记成功状态；若只是要清错误而非表达“本步成功”，应使用 `clearError`。
 *   - `setError(error_pos, …)` / `getError` 设置与读取失败状态；`error_pos` 须为判定出错时的 `input.pos`。
 *   - 是否成功只能用 `isSuccess()` 判定，不得以其他方式。
 *   - 成功时 `isSuccess()` 为真；失败时 `isSuccess()` 为假。
 *
 * - 单次与带量词解析：
 *   - `parseSingleNode(node)` 只解析 `node` 的一次实例（无外层量词）。
 *   - `parseNode(node, quantifier)` 是展开非字符节点量词的唯一位置。
 *
 */
export class ParserImpl implements Parser {
    /**
     * Current parse input and read position (parse state stored on this, child functions read/write through this)
     *
     * 当前解析输入与读位置（解析状态保存在本对象上，子函数经本对象读写）。
     */
    input!: ParserInput;

    private error: string | null = null;
    private error_pos: number = 0;

    /**
     * Supports `PatternSet` left recursion and avoids infinite expansion of the parse.
     *
     * 用于支持 PatternSet 左递归，以及避免无限展开。
     */
    private pattern_set_node_parse_stack: Array<{ node: ParserNode; pos: number; alt_idx:number }> = [];

    constructor(public config: ParserConfig) { }

    clearError(): void {
        this.error = null;
    }

    setSuccess(): void {
        this.clearError();
    }

    setError(error_pos: number, message?: string): void {
        this.error_pos = error_pos;
        this.error = message ?? "Parse match failed";
    }

    getError(): string | null {
        return this.error;
    }

    isSuccess(): boolean {
        return this.error === null;
    }

    initParse(input: ParserInput): void {
        this.input = input;
        this.clearError();
        this.pattern_set_node_parse_stack.length = 0;
    }

    parse(input: ParserInput, root: ParserNode): ParseResult {
        this.initParse(input);
        const ast_nodes = this.parseNode(root, " ");

        if (!this.isSuccess()) {
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
            const ast_nodes = this.parseNode(node, " ");

            if (this.isSuccess()) {
                results.push(...ast_nodes);
            } else {
                this.input.pos = start + 1;
            }
        }

        this.setSuccess();
        return results;
    }

    parseNode(node: ParserNode, quantifier: Quantifier, ignored: ParserNode | null = null): ASTNode[] {
        return this.parseNodeEx(node, quantifier, ignored, null).nodes;
    }

    /**
     * When `sep` is non-null, it is parsed only between successive matches of the same `node` while expanding `*` / `+` (the loop below).
     *
     * 当 `sep` 非 null 时，仅在本函数展开 `*` / `+` 的循环中、于同一 `node` 的相邻两次匹配之间解析分隔符。
     */
    parseNodeEx(
        node: ParserNode,
        quantifier: Quantifier,
        ignored: ParserNode | null = null,
        sep: ParserNode | null = null
    ): ParseNodeExResult {
        const ret: ParseNodeExResult = {
            nodes: [],
            seps: [],
        };
        let push_node = (ast_node: ASTNode | null) => {
            if (ast_node !== null) {
                ret.nodes.push(ast_node);
            }
        };
        let push_sep_node = (sep_node: ASTNode | null) => {
            if (sep_node !== null) {
                ret.seps.push(sep_node);
            }
        };

        if (sep === null && CHAR_MATCH_NODE_KINDS.includes(node.kind)) {
            const result = this.parseCharMatchNode(node as CharMatchNode, quantifier, ignored);
            push_node(result);
            return ret;
        }

        const first = this.parseSingleNode(node, ignored);
        push_node(first);
        if (!this.isSuccess()) {
            if (quantifier === "?" || quantifier === "*") {
                this.setSuccess();
            }
            return ret;
        }
        if (quantifier === " " || quantifier === "?") {
            return ret;
        }


        for (; ;) {
            const sep_retry_pos = this.input.pos;
            let sep_node: ASTNode | null = null;
            if (sep !== null) {
                sep_node = this.parseSingleNode(sep, ignored);
                if (!this.isSuccess()) {
                    this.input.pos = sep_retry_pos;
                    break;
                }
            }

            let n = this.parseSingleNode(node, ignored);
            if (!this.isSuccess()) {
                if (sep !== null) {
                    this.input.pos = sep_retry_pos;
                }
                break;
            }
            push_sep_node(sep_node);
            push_node(n);
        }
        this.setSuccess();
        return ret;
    }

    /**
     * On each failed match, try consuming `ignored` once, and repeat until either the match succeeds or matching cannot succeed even after ignoring.
     *
     * 每次匹配失败时，尝试忽略一次 `ignored` 节点，直到匹配成功或即使忽略也不可能匹配成功
     */
    parseSingleNode(node: ParserNode, ignored: ParserNode | null = null): ASTNode | null {
        if (ignored === null) {
            return this.parseSingleNodeSimple(node);
        }
        const start = this.input.pos;
        for (; ;) {
            const retry_pos = this.input.pos;
            const ret = this.parseSingleNodeSimple(node);
            if (this.isSuccess()) {
                return ret;
            }

            this.input.pos = retry_pos;
            this.parseSingleNodeSimple(ignored);
            if (!this.isSuccess()) {
                this.input.pos = start;
                return ret;
            }
            if (this.input.pos === retry_pos) {
                this.setError(this.input.pos);
                this.input.pos = start;
                return ret;
            }
        }
    }

    parseSingleNodeSimple(node: ParserNode): ASTNode | null {
        if (node.kind === ParserNodeKind.CharSeq) {
            return this.parseCharSeq(node as CharSeq);
        }
        if (node.kind === ParserNodeKind.PatternSet) {
            return this.parsePatternSet(node as PatternSet);
        }
        if (node.kind === ParserNodeKind.PatternSeq) {
            return this.parsePatternSeq(node as PatternSeq);
        }
        if (CHAR_MATCH_NODE_KINDS.includes(node.kind)) {
            return this.parseCharMatchNode(node as CharMatchNode, " ");
        }
        assert.fail(`unimplemented node kind: ${node.kind}`);
    }

    parsePatternSet(node: PatternSet): ASTNode | null {
        const start = this.input.pos;
        let alt_idx = this.getPatternSetNextAltIdx(node, start);
        this.pattern_set_node_parse_stack.push({ node, pos: start, alt_idx });

        try {
            if(alt_idx >= node.patterns.length) {
                this.setError(this.input.pos, "pattern set has no more alternatives");
                return null;
            }

            for (let i = alt_idx; i < node.patterns.length; i++) {
                const child = this.parseSingleNode(node.patterns[i]);
                if (this.isSuccess()) {
                    if (child === null) {
                        return null;
                    }
                    child.parser_nodes.push(node);
                    return child;
                }
                this.input.pos = start;
            }
            assert.ok(!this.isSuccess());
            return null;
        } finally {
            this.pattern_set_node_parse_stack.pop();
        }
    }

    parsePatternSeq(node: PatternSeq): ASTNode | null {
        const start = this.input.pos;
        const children: Array<ASTNode | ASTNode[]> = [];
        const seps: ASTNode[] = [];
        let last_sep_end: number = start;
        for (let i = 0; i < node.sub_nodes.length; i++) {
            const q = node.sub_quantifiers[i] as Quantifier;
            const sub_node = node.sub_nodes[i];
            let res = this.parseNodeEx(sub_node, q, node.ignore, node.sep);
            let child = res.nodes;
            if (!this.isSuccess()) {
                this.input.pos = start;
                return null;
            }

            seps.push(...res.seps);
            if (q === " " || q === "?") {
                children.push(...child);
            } else {
                if (child.length > 0) {
                    children.push(child);
                }
            }

            if (node.sep !== null && this.input.pos > last_sep_end) {   // check last_sep_end for consecutive empty child nodes case
                if (i < node.sub_nodes.length - 1) {
                    const sep = this.parseSingleNode(node.sep, node.ignore);
                    if (!this.isSuccess()) {
                        this.input.pos = start;
                        return null;
                    }
                    if (sep !== null) {
                        seps.push(sep);
                    }
                } else if (node.accept_trailing_sep) {
                    const sep = this.parseSingleNode(node.sep, node.ignore);
                    if (sep !== null) {
                        seps.push(sep);
                    }
                }
                last_sep_end = this.input.pos;
            }
        }

        const value = node.flat
            ? this.input.src.slice(start, this.input.pos)
            : children;

        this.setSuccess();
        return {
            parser_nodes: [node],
            range: [start, this.input.pos],
            value,
            raw_value: children,
            seps,
        };
    }

    /**
     * Character matching: match according to quantifier and merge into a string, returns an ASTNode (value/raw_value is the matched string); 
     *
     * 字符匹配：按量词匹配并合并为字符串，返回 ASTNode（value/raw_value 为被匹配的字符串）；
     */
    parseCharMatchNode(node: CharMatchNode, quantifier: Quantifier, ignored: ParserNode | null = null): ASTNode | null {
        const match_start = this.parseSingleCharMatchNode(node, ignored);
        const make_returned = (end: number, value: string): ASTNode => ({
            parser_nodes: [node],
            range: [match_start, end],
            value: value,
            raw_value: value,
            seps: [],
        });

        if (!this.isSuccess()) {
            if ("?*".includes(quantifier)) {
                this.setSuccess();
            }
            return null;
        }

        const { src, pos } = this.input;
        let merged = src.slice(match_start, pos);

        if (quantifier === " " || quantifier === "?") {
            this.setSuccess();
            return make_returned(this.input.pos, merged);
        }

        for (; ;) {
            const local_match_start = this.parseSingleCharMatchNode(node, ignored);
            if (!this.isSuccess()) {
                break;
            }
            merged += src.slice(local_match_start, this.input.pos);
        }

        this.setSuccess();
        return make_returned(this.input.pos, merged);
    }

    /**
     * On each failed match, try consuming `ignored` once, and repeat until either the match succeeds or matching cannot succeed even after ignoring.
     *
     * 每次匹配失败时，尝试忽略一次 `ignored` 节点，直到匹配成功或即使忽略也不可能匹配成功
     * 返回匹配node的起始匹配位置，失败时返回值为总匹配初始位置
     */
    parseSingleCharMatchNode(node: CharMatchNode, ignored: ParserNode | null): number {
        const start = this.input.pos;
        if (ignored === null) {
            this.parseSingleCharMatchNodeSimple(node);
            return start;
        }

        for (; ;) {
            const retry_pos = this.input.pos;
            this.parseSingleCharMatchNodeSimple(node);
            if (this.isSuccess()) {
                return retry_pos;
            }

            this.input.pos = retry_pos;
            this.parseSingleNodeSimple(ignored);
            if (!this.isSuccess()) {
                this.input.pos = start;
                return start;
            }
            if (this.input.pos === retry_pos) {
                this.setError(this.input.pos);
                this.input.pos = start;
                return start;
            }
        }
    }

    parseSingleCharMatchNodeSimple(node: CharMatchNode): CharMatchNode[] {
        if (node.kind === ParserNodeKind.CharMatchSet) {
            return this.parseCharMatchSet(node as CharMatchSet);
        }

        if (node.kind === ParserNodeKind.AnyChar) {
            this.parseAnyChar();
        } else if (node.kind === ParserNodeKind.CharMatchRange) {
            this.parseCharMatchRange(node as CharMatchRange);
        }

        if (this.isSuccess()) {
            return [node];
        } else {
            return [];
        }
    }

    /**
     * Match a fixed literal once (quantifiers are handled in parseNode, like parsePatternSeq).
     *
     * 匹配固定字面量一次（量词在 parseNode 中处理，与 parsePatternSeq 相同）。
     */
    parseCharSeq(node: CharSeq): ASTNode | null {
        const { src, pos } = this.input;
        const start = pos;
        if (!src.startsWith(node.literal, start)) {
            this.setError(this.input.pos);
            return null;
        }
        const end = start + node.literal.length;
        this.input.pos = end;
        this.setSuccess();
        return {
            parser_nodes: [node],
            range: [start, end],
            value: this.input.src.slice(start, end),
            raw_value: this.input.src.slice(start, end),
            seps: [],
        };
    }

    parseCharMatchSet(node: CharMatchSet): CharMatchNode[] {
        const { src, pos } = this.input;
        const ret = matchChar(src, pos, node);
        if (ret.nodes.length > 0) {
            this.input.pos = ret.new_pos;
            this.setSuccess();
        } else {
            this.setError(this.input.pos);
        }
        return ret.nodes;
    }

    parseCharMatchRange(node: CharMatchRange): void {
        const { src, pos } = this.input;
        const res = matchCharRange(src, pos, node.start, node.end);
        if (res.matched) {
            this.input.pos = res.new_pos;
            this.setSuccess();
        } else {
            this.setError(this.input.pos);
        }
    }

    parseAnyChar(): void {
        const { src, pos } = this.input;
        const res = matchAnyChar(src, pos);
        if (res.matched) {
            this.input.pos = res.new_pos;
            this.setSuccess();
        } else {
            this.setError(this.input.pos);
        }
    }

    private getPatternSetNextAltIdx(node: PatternSet, pos: number): number {
        for (let i = this.pattern_set_node_parse_stack.length - 1; i >= 0; i--) {
            const frame = this.pattern_set_node_parse_stack[i]!;
            if (frame.pos !== pos) {
                return 0;
            }
            if (frame.node === node) {
                return frame.alt_idx + 1;
            }
        }
        return 0;
    }
}
