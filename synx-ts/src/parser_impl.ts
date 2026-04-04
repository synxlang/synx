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
     * Active (node,pos) pairs in current call stack, for duplicate-recursion detection
     *
     * 当前调用栈中的 (node, pos) 对，用于检测重复递归。
     */
    private active_parse_stack: Array<{ node: ParserNode; pos: number }> = [];

    constructor(public config: ParserConfig) { }

    /**
     * Clear error state only. Does not encode success of a parse step; use `setSuccess` to mark success. See class-level Error handling and state.
     *
     * 仅清理错误状态，不表示解析步骤成功；标记成功请用 `setSuccess`。见类级「错误处理与状态」约定。
     */
    clearError(): void {
        this.error = null;
    }

    /**
     * Mark success only; clears error as part of the success state.
     *
     * 仅用于设置成功状态；会清空错误作为成功状态的一部分。
     */
    setSuccess(): void {
        this.clearError();
    }

    /**
     * Set failure state. `error_pos` must be `this.input.pos` at the moment the failure is determined (callers pass it explicitly).
     *
     * 设置失败状态。`error_pos` 必须为判定出错时当时的 `this.input.pos`（由调用方显式传入）。
     */
    setError(error_pos: number, message?: string): void {
        this.error_pos = error_pos;
        this.error = message ?? "Parse match failed";
    }

    /**
     * Read the current error message, or null if none. Prefer `isSuccess()` for success checks.
     *
     * 读取当前错误信息；无错误时为 null。判定成功请用 `isSuccess()`。
     */
    getError(): string | null {
        return this.error;
    }

    /**
     * Use this for success checks; do not substitute `getError() === null`.
     *
     * 判定成功须使用本方法；不要用 `getError() === null` 代替。
     */
    isSuccess(): boolean {
        return this.error === null;
    }

    initParse(input: ParserInput): void {
        this.input = input;
        this.clearError();
        this.active_parse_stack.length = 0;
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
        const ret: ASTNode[] = [];
        let append_returned = (node: ASTNode | null) => {
            if (node !== null) {
                ret.push(node);
            }
        };

        if (CHAR_MATCH_NODE_KINDS.includes(node.kind)) {
            const result = this.parseCharMatchNode(node as CharMatchNode, quantifier, ignored);
            append_returned(result);
            return ret;
        }

        const first = this.parseSingleNode(node, ignored);
        append_returned(first);
        if (!this.isSuccess()) {
            if (quantifier === "?" || quantifier === "*") {
                this.setSuccess();
            }
            return ret;
        }
        if (quantifier === " " || quantifier === "?") {
            return ret;
        }

        for (;;) {
            let n = this.parseSingleNode(node, ignored);
            if (!this.isSuccess()) {
                break;
            }
            append_returned(n);
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
        const pos = this.input.pos;
        if (this.checkDuplicateRecursion(node, pos)) {
            this.setError(this.input.pos, "Infinite recursion detected");
            return null;
        }
        this.active_parse_stack.push({ node, pos });

        let ret: ASTNode | null;
        if (node.kind === ParserNodeKind.CharSeq) {
            ret = this.parseCharSeq(node as CharSeq);
        } else if (node.kind === ParserNodeKind.PatternSet) {
            ret = this.parsePatternSet(node as PatternSet);
        } else if (node.kind === ParserNodeKind.PatternSeq) {
            ret = this.parsePatternSeq(node as PatternSeq);
        } else if (CHAR_MATCH_NODE_KINDS.includes(node.kind)) {
            ret = this.parseCharMatchNode(node as CharMatchNode, " ");
        } else {
            assert.fail(`unimplemented node kind: ${node.kind}`);
        }

        this.active_parse_stack.pop();
        return ret;
    }

    /**
     * Match one of the alternatives in order.
     * For each alternative, parsing always restarts from the same input position.
     *
     * 按顺序匹配备选之一。
     * 每个备选都从相同的输入位置重新开始解析。
     */
    parsePatternSet(node: PatternSet): ASTNode | null {
        const start = this.input.pos;

        for (const alt of node.patterns) {
            const child = this.parseSingleNode(alt);
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
    }

    parsePatternSeq(node: PatternSeq): ASTNode | null {
        const start = this.input.pos;
        const children: Array<ASTNode | ASTNode[]> = [];
        for (let i = 0; i < node.sub_nodes.length; i++) {
            const q = node.sub_quantifiers[i] as Quantifier;
            const sub_node = node.sub_nodes[i];
            let part = this.parseNode(sub_node, q, node.ignore);
            if (!this.isSuccess()) {
                this.input.pos = start;
                return null;
            }

            if (q === " " || q === "?") {
                children.push(...part);
            } else {
                if (part.length > 0) {
                    children.push(part);
                }
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
        };
    }

    parseSingleCharMatchNodeSimple(node: CharMatchNode): CharMatchNode[] {
        if(node.kind === ParserNodeKind.CharMatchSet){
            return this.parseCharMatchSet(node as CharMatchSet);
        }

        if (node.kind === ParserNodeKind.AnyChar) {
            this.parseAnyChar();
        } else if (node.kind === ParserNodeKind.CharMatchRange) {
            this.parseCharMatchRange(node as CharMatchRange);
        }

        if(this.isSuccess()){
            return [node];
        }else{
            return [];
        }
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

    /**
     * Character matching: match according to quantifier and merge into a string, returns an ASTNode (value/raw_value is the matched string); 
     *
     * 字符匹配：按量词匹配并合并为字符串，返回 ASTNode（value/raw_value 为被匹配的字符串）；
     */
    parseCharMatchNode(node: CharMatchNode, quantifier: Quantifier, ignored: ParserNode | null = null): ASTNode | null {
        const mk_char_node = (start: number, end: number): ASTNode => ({
            parser_nodes: [node],
            range: [start, end],
            value: this.input.src.slice(start, end),
            raw_value: this.input.src.slice(start, end),
        });
        
        let match_start = this.parseSingleCharMatchNode(node, ignored);
        if (!this.isSuccess()) {
            if("?*".includes(quantifier)) {
                this.setSuccess();
            }
            return null;
        }

        const { src, pos} = this.input;
        let merged = src.slice(match_start, pos);

        if (quantifier === " " || quantifier === "?") {
            this.setSuccess();
            return {
                parser_nodes: [node],
                range: [match_start, this.input.pos],
                value: merged,
                raw_value: merged,
            };
        }

        for (;;) {
            const matched_start = this.parseSingleCharMatchNode(node, ignored);
            if (!this.isSuccess()) {
                break;
            }
            merged += src.slice(matched_start, this.input.pos);
        }
        this.setSuccess();

        const end = this.input.pos;
        if (ignored === null) {
            return mk_char_node(match_start, end);
        }
        return {
            parser_nodes: [node],
            range: [match_start, end],
            value: merged,
            raw_value: merged,
        };
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
        };
    }

    parseCharMatchSet(node: CharMatchSet): CharMatchNode[] {
        const { src, pos } = this.input;
        const ret = matchChar(src, pos, node);
        if (ret.nodes.length > 0) {
            this.input.pos = ret.new_pos;
            this.setSuccess();
        }else{
            this.setError(this.input.pos);
        }
        return ret.nodes;
    }

    parseCharMatchRange(node: CharMatchRange): void {
        const { src, pos } = this.input;
        const res = matchCharRange(src, pos, node.start, node.end);
        if(res.matched){
            this.input.pos = res.new_pos;
            this.setSuccess();
        }else{
            this.setError(this.input.pos);
        }
    }

    parseAnyChar(): void {
        const { src, pos } = this.input;
        const res = matchAnyChar(src, pos);
        if(res.matched){
            this.input.pos = res.new_pos;
            this.setSuccess();
        }else{
            this.setError(this.input.pos);
        }
    }

    private checkDuplicateRecursion(node: ParserNode, pos: number): boolean {
        for (let i = this.active_parse_stack.length - 1; i >= 0; i--) {
            const frame = this.active_parse_stack[i]!;
            if (frame.pos !== pos) {
                return false;
            }
            if (frame.node === node) {
                return true;
            }
        }
        return false;
    }
}
