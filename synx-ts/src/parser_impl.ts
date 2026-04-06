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
    ByteSeq,
    PatternSet,
    Quantifier,
} from "./parser_node";
import type { Parser, ParserConfig, ParseResult, ParserInput } from "./parser";
import { ParseResultKind } from "./parser";
import type { ASTNode } from "./parser";

/**
 * ============================== EN ==============================
 *
 * - With `*` / `+` quantifiers, returns `ASTNode[]`; with ` ` / `?`, returns `ASTNode` or `null`.
 * - CharMatchNode special case: with `*` / `+`, merged into a single `ASTNode` only when both `sep` and `PatternSeq.ignore` are absent (`null`); if `sep` is set, or `ignore` is set, use the general path and return `ASTNode[]` (no merge across repeats).
 *
 * ============================== 中文 ==============================
 *
 * '*', '+' 量词时，返回 ASTNode[]，' ' 或 '?' 量词时，返回 ASTNode或null
 * CharMatchNode特殊，'*', '+' 量词时，无sep且无ignore时合并为单个ASTNode；有sep或有ignore时为 ASTNode[]（不合并）
 */
interface ParseNodeResult {
    ast_node_res: ASTNode[] | ASTNode | null;
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
     * Supports `PatternSet` left recursion and avoids infinite expansion.
     *
     * Note: left recursion is limited to a single depth level.
     *
     * Authoring longer infix chains (synx-style; `{…}` alternative order still matters where used):
     *
     * - **Preferred — list with `\sep`, associativity later** — parse a flat list of operands separated by
     *   the operator, then fold (left / right / precedence) in a separate semantic pass:
     *   `Sum=(terms:Term* \sep "+")=>terms;`
     *   Same idea as `SymbolDotChain=(symbols:Symbol* \sep ".")=>symbols;` in the synx grammar.
     *
     * - **Binary `Expr '+' Expr`** — nested tree, workable for chains when both operands are `Expr`:
     *   `Expr={ (Expr,"+",Expr); Term; };`
     *
     * - **Right recursion** — `Expr={ (Term,"+",Expr); Term; };`
     *
     * - **Weak shape** (right side not a full `Expr`) — e.g. `Expr={ (Expr,"+","1"); "1"; };`
     *
     * ---
     *
     * 用于支持 PatternSet 左递归，以及避免无限展开。
     *
     * 注：左递归仅支持单层深度。
     *
     * 若要写「任意长的中缀链」，优先用 synx 式列表 + `\sep`，结合性放到后续分析：
     *
     * - **推荐 — `\sep` 得到列表，再结合性** — 先把被运算符隔开的各项收成列表（或等价结构），再在语义阶段按左结合、右结合或优先级折叠：
     *   `Sum=(terms:Term* \sep "+")=>terms;`
     *   与同文件中 `SymbolDotChain=(symbols:Symbol* \sep ".")=>symbols;` 同一思路。
     *
     * - **二元 `Expr '+' Expr`** — 嵌套树形，两侧都是 `Expr` 时可接长链：
     *   `Expr={ (Expr,"+",Expr); Term; };`
     *
     * - **右递归** — `Expr={ (Term,"+",Expr); Term; };`
     *
     * - **弱形状** — 右侧不是完整 `Expr` 时，例如 `Expr={ (Expr,"+","1"); "1"; };`
     */
    private pattern_set_node_parse_stack: Array<{ node: ParserNode; pos: number; alt_idx: number }> = [];

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
        const parse_node_res = this.parseSingleNode(root);

        if (!this.isSuccess()) {
            return {
                kind: ParseResultKind.Failure,
                ast_nodes: [],
                end_pos: this.input.pos,
            };
        }

        const ast_nodes = Array.isArray(parse_node_res)
            ? parse_node_res
            : parse_node_res === null
                ? []
                : [parse_node_res];

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
            const parse_node_res = this.parseSingleNode(node);

            if (this.isSuccess()) {
                results.push(parse_node_res as ASTNode);
            } else {
                this.input.pos = start + 1;
            }
        }

        this.setSuccess();
        return results;
    }

    /**
     * When `sep` is non-null, it is parsed only between successive matches of the same `node` while expanding `*` / `+` (the loop below).
     *
     * 当 `sep` 非 null 时，仅在本函数展开 `*` / `+` 的循环中、于同一 `node` 的相邻两次匹配之间解析分隔符。
     */
    parseNode(
        node: ParserNode,
        quantifier: Quantifier,
        ignored: ParserNode | null = null,
        sep: ParserNode | null = null
    ): ParseNodeResult {
        if (ignored === null && sep === null && CHAR_MATCH_NODE_KINDS.includes(node.kind)) {
            const result = this.parseCharMatchNode(node as CharMatchNode, quantifier);
            return {
                ast_node_res: result,
                seps: [],
            }
        }

        let first = this.parseSingleNode(node, ignored);
        if (!this.isSuccess()) {
            if (quantifier === "?" || quantifier === "*") {
                this.setSuccess();
            }
            first = null;
        }
        if (quantifier === " " || quantifier === "?") {
            return {
                ast_node_res: first,
                seps: [],
            };
        }

        const ret = {
            ast_node_res: [] as ASTNode[],
            seps: [] as ASTNode[],
        };
        let push_node = (ast_node: ASTNode | null) => {
            if (ast_node !== null) {
                ret.ast_node_res.push(ast_node);
            }
        };
        let push_sep_node = (sep_node: ASTNode | null) => {
            if (sep_node !== null) {
                ret.seps.push(sep_node);
            }
        };
        push_node(first);

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
        if (node.kind === ParserNodeKind.ByteSeq) {
            return this.parseByteSeq(node as ByteSeq);
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
            if (alt_idx >= node.sub_nodes.length) {
                this.setError(this.input.pos, "pattern set has no more alternatives");
                return null;
            }

            for (let i = alt_idx; i < node.sub_nodes.length; i++) {
                const child = this.parseSingleNode(node.sub_nodes[i]);
                if (!this.isSuccess()) {
                    this.input.pos = start;
                    continue;
                }
                if (node.neg_flags[i]) {
                    this.input.pos = start;
                    this.setError(this.input.pos, "negated alternative matched");
                    return null;
                }
                if (child === null) {
                    return null;
                }
                child.parser_nodes.push(node);
                return child;
            }
            assert.ok(!this.isSuccess());
            return null;
        } finally {
            this.pattern_set_node_parse_stack.pop();
        }
    }

    parsePatternSeq(node: PatternSeq): ASTNode | null {
        const start = this.input.pos;
        const children: (ASTNode[] | ASTNode | null)[] = [];
        const seps: ASTNode[] = [];
        let last_sep_end: number = start;
        for (let i = 0; i < node.sub_nodes.length; i++) {
            const q = node.sub_quantifiers[i] as Quantifier;
            const sub_node = node.sub_nodes[i];
            const parse_ex_res = this.parseNode(sub_node, q, node.ignore, node.sep);
            const ast_res = parse_ex_res.ast_node_res;
            if (!this.isSuccess()) {
                this.input.pos = start;
                return null;
            }

            seps.push(...parse_ex_res.seps);
            children.push(ast_res);

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

        const value = node.raw
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
    parseCharMatchNode(node: CharMatchNode, quantifier: Quantifier): ASTNode | null {
        const start = this.input.pos;
        const make_returned = (): ASTNode => {
            this.setSuccess();
            const end = this.input.pos;
            return {
                parser_nodes: [node],
                range: [start, end],
                value: this.input.src.slice(start, end),
                raw_value: this.input.src.slice(start, end),
                seps: [],
            };
        }

        this.parseSingleCharMatchNode(node);
        if (!this.isSuccess()) {
            if ("?*".includes(quantifier)) {
                this.setSuccess();
            }
            return null;
        }

        if (quantifier === " " || quantifier === "?") {
            return make_returned();
        }

        for (; ;) {
            this.parseSingleCharMatchNode(node);
            if (!this.isSuccess()) {
                break;
            }
        }

        return make_returned();
    }

    parseSingleCharMatchNode(node: CharMatchNode): CharMatchNode[] {
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
     * Match a fixed `ByteSeq.literal` once (`startsWith` at current byte offset in the binary-string model).
     * Quantifiers are handled in `parseNode`, like `PatternSeq`.
     *
     * 匹配 `ByteSeq.literal` 一次（在二进制串模型下于当前字节偏移处 `startsWith`）。
     * 量词在 `parseNode` 中处理，与 `PatternSeq` 相同。
     */
    parseByteSeq(node: ByteSeq): ASTNode | null {
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
