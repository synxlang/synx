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
 * ParserImpl conventions (keep these stable to avoid redundant logic):
 *
 * - Single vs quantified parse:
 *   - `parseSingleNode(node)` parses exactly ONE instance of `node` (no outer quantifier).
 *   - `parseNode(node, quantifier)` is the ONLY place that expands quantifiers for non-char nodes.
 *
 * - Error handling and state:
 *   - `clearError` is only for clearing error state (e.g. before a call when the slate must be clean).
 *   - `setSuccess` is only for marking success; do not use it as a generic “reset” when you only need error cleared—use `clearError` in that case.
 *   - `setError` / `getError` set and read the failure message.
 *   - Determine success only with `isSuccess()`; do not use any other means.
 *   - On success, `isSuccess()` is true (no pending error); on failure, error state must be set (non-null) and `isSuccess()` is false.
 *   - To reliably read this call's error state after return, the caller must `clearError` before invoking. If you only check `isSuccess()` and do not need `getError()`, `clearError` beforehand is not required.
 *
 * - Unknown kinds:
 *   - Unknown / unhandled `ParserNodeKind` is NOT allowed and fails fast via `assert.fail(...)`.
 *
 * - Index:
 *   - On success: before returning, advance the parse index to the next unconsumed position after the matched span.
 *   - On failure: the index is not guaranteed unless the function explicitly documents otherwise.
 *
 * ============================== 中文 ==============================
 *
 * 解析器实现类，供 mkParser 与测试使用；不作为对外公开 API 导出。
 *
 * ParserImpl 约定（保持不变，避免重复逻辑）：
 *
 * - 单次与带量词解析：
 *   - `parseSingleNode(node)` 只解析 `node` 的一次实例（无外层量词）。
 *   - `parseNode(node, quantifier)` 是展开非字符节点量词的唯一位置。
 *
 * - 错误处理与状态：
 *   - `clearError` 仅用于清理错误状态（例如调用前需要干净状态时）。
 *   - `setSuccess` 仅用于设置/标记成功状态；若只是要清错误而非表达“本步成功”，应使用 `clearError`。
 *   - `setError` / `getError` 设置与读取失败信息。
 *   - 是否成功只能用 `isSuccess()` 判定，不得以其他方式。
 *   - 成功时 `isSuccess()` 为真（无待处理错误）；失败时须有错误状态且 `isSuccess()` 为假。
 *   - 若要在返回后正确取得本次调用的错误状态，调用者须在调用前 `clearError`。但如果不需要`getError`而是只检查`isSuccess`，则不需要`clearError`。
 *
 * - 未知 kind：
 *   - 不允许未知或未处理的 `ParserNodeKind`，通过 `assert.fail(...)` 快速失败。
 *
 * - 索引：
 *   - 成功：返回前将解析索引移动到已匹配片段之后的下一未消费位置。
 *   - 失败：索引位置不做保证，除非函数另有明确约定。
 */
export class ParserImpl implements Parser {
    /**
     * Current parse input and read position (parse state stored on this, child functions read/write through this)
     *
     * 当前解析输入与读位置（解析状态保存在本对象上，子函数经本对象读写）。
     */
    input!: ParserInput;
    private error: string | null = null;
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
     * Set failure state with an optional message.
     *
     * 设置失败状态，可选用消息。
     */
    setError(message?: string): void {
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
        let retry_pos = this.input.pos;
        const first = this.parseSingleNode(node);
        append_returned(first);
        if (!this.isSuccess()) {
            if (quantifier === " " || quantifier === "+") {
                this.setError();
            } else {
                this.setSuccess();
                this.input.pos = retry_pos;
            }
            return ret;
        }

        if (quantifier === " " || quantifier === "?") {
            return ret;
        }

        for (; ;) {
            retry_pos = this.input.pos;
            let n = this.parseSingleNode(node);
            if (this.isSuccess()) {
                append_returned(n);
                continue;
            }
            this.input.pos = retry_pos;
            if (ignored === null) {
                break;
            }
            this.consumeIgnored(ignored);
            n = this.parseSingleNode(node);
            if (!this.isSuccess()) {
                this.input.pos = retry_pos;
                break;
            }
            append_returned(n);
        }
        this.setSuccess();
        return ret;
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

    parseSingleNode(node: ParserNode): ASTNode | null {
        const pos = this.input.pos;
        if (this.checkDuplicateRecursion(node, pos)) {
            this.setError("Infinite recursion detected");
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
            assert.fail(`Unknown node kind: ${node.kind}`);
        }

        this.active_parse_stack.pop();
        return ret;
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
            if (quantifier === " " || quantifier === "+") {
                this.setError();
            }else{
                this.setSuccess();
            }
            return null;
        }
        if (quantifier === " " || quantifier === "?") {
            this.setSuccess();
            return mk_char_node(start, this.input.pos);
        }
        for (;;) {
            const retry_pos = this.input.pos;
            if (try_one()) {
                continue;
            }
            this.input.pos = retry_pos;
            if (ignored === null) {
                break;
            }
            this.consumeIgnored(ignored);
            if (!try_one()) {
                this.input.pos = retry_pos;
                break;
            }
        }
        this.setSuccess();
        return mk_char_node(start, this.input.pos);
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
            this.setError();
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
            this.input.pos = start;

            const child = this.parseSingleNode(alt);
            if (this.isSuccess()) {
                if (child === null) {
                    return null;
                }
                child.parser_nodes.push(node);
                return child;
            }
        }
        assert.ok(!this.isSuccess());
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
     *
     * 将序列解析一次：按顺序用对应的 sub_quantifier 解析每个 sub_node。
     * `value` / `raw_value`：当 sub_quantifier 为 ` ` 或 `?` 时，子 AST 节点摊平进列表；
     * 当为 `*` 或 `+` 时，占一格 `ASTNode[]`（该 sub_node 的多次匹配），不向序列子列表摊平。
     * 若 `flat` 为 true，则 `value` 为匹配的子串；否则 `value` 与 `raw_value` 一致。
     */
    parsePatternSeq(node: PatternSeq): ASTNode | null {
        const start = this.input.pos;
        const children: Array<ASTNode | ASTNode[]> = [];
        for (let i = 0; i < node.sub_nodes.length; i++) {
            const q = node.sub_quantifiers[i] as Quantifier;
            const sub_node = node.sub_nodes[i]!;
            const retry_pos = this.input.pos;
            let part = this.parseNode(sub_node, q, node.ignore);
            let ignore_and_retry:boolean = false;
            if(node.ignore !== null && i > 0){
                ignore_and_retry = !this.isSuccess() || (part.length === 0 && "?*".includes(q));
            }
            if(ignore_and_retry){
                this.input.pos = retry_pos;
                this.consumeIgnored(node.ignore);
                part = this.parseNode(sub_node, q, node.ignore);
            }
            if(!this.isSuccess()){
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
}
