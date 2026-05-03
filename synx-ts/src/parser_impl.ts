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
 * - CharMatchNode special case: always merge consecutive characters into a single `ASTNode`.
 *
 * ============================== 中文 ==============================
 *
 * '*', '+' 量词时，返回 ASTNode[]，' ' 或 '?' 量词时，返回 ASTNode或null
 * CharMatchNode特殊，总是合并连续的字符。
 * 
 * end_idx：结束节点匹配索引，如果没有匹配到结束节点为-1。
 */
interface ParseNodeResult {
    ast_node_res: ASTNode[] | ASTNode | null;
    seps: ASTNode[];
    end_idx: number;
}

/**
 * end_idx：结束节点匹配索引，如果没有匹配到结束节点为-1。
 */
interface PeekEndNodesResult {
    end_ast_node: ASTNode | null;
    end_idx: number;
}

/**
 * start: 成功时为匹配node的起始匹配位置，失败时为总匹配初始位置
 * end_idx: 结束节点匹配索引，如果没有匹配到结束节点为-1。
 */
interface ParseCharMatchNodeConsecutiveResult {
    start: number;
    end_idx: number;
}

interface ParseCharMatchNodeExResult {
    ast_node_res: ASTNode[] | ASTNode | null;
    end_idx: number;
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
 * 解析调用约定（针对parse开头的函数）：
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
    private parse_records: ASTNode[][] = [];

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

    /**
     * pos为解析结果匹配的开始位置，用于缓存解析结果，避免重复解析。
     */
    recordParse(pos: number, ast_node: ASTNode): void {
        this.parse_records[pos]!.push(ast_node);
    }

    /**
     * 获取pos位置的缓存解析结果，如果没有解析结果返回空数组。
     */
    getParseRecords(pos: number): ASTNode[] {
        return this.parse_records[pos] ?? [];
    }

    /**
     * 返回缓存中搜索到的第一个对应位置包含parser_node的解析结果，如果没有找到返回null。
     */
    findParseRecord(pos: number, parser_node: ParserNode): ASTNode | null {
        const records = this.getParseRecords(pos);
        for (const record of records) {
            if (record.parser_nodes.includes(parser_node)) {
                return record;
            }
        }
        return null;
    }

    initParse(input: ParserInput): void {
        this.input = input;
        this.clearError();
        this.pattern_set_node_parse_stack.length = 0;
        this.parse_records = Array.from({ length: input.src.length + 1 }, () => []);
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
     * 
     * `ends`：
     * - 结束节点列表，非贪婪匹配量词`*`, `+`, `?`时，优先匹配结束节点，若匹配到结束节点则停止匹配返回结果。列表末端的节点优先级最高。
     * - input.pos为不包含ends的结束匹配位置。
     * 
     */
    parseNode(
        node: ParserNode,
        quantifier: Quantifier,
        ignored: ParserNode | null = null,
        sep: ParserNode | null = null,
        ends: ParserNode[] = [],
    ): ParseNodeResult {
        if (ends.length > 0) {
            assert.ok(quantifier !== " ");
        }
        if (sep === null && CHAR_MATCH_NODE_KINDS.includes(node.kind)) {
            const result = this.parseCharMatchNodeEx(node as CharMatchNode, quantifier, ignored, ends);
            return {
                ast_node_res: result.ast_node_res,
                seps: [],
                end_idx: result.end_idx,
            }
        }

        let ret: ParseNodeResult = {
            ast_node_res: null,
            seps: [],
            end_idx: -1,
        };

        let peek_ends = () => {
            let peek_res = this.peekEndNodes(ends, ignored);
            ret.end_idx = peek_res.end_idx;
            return ret.end_idx >= 0;
        }

        if (quantifier === "?" || quantifier === "*") {
            if (peek_ends()) {
                return ret;
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
            ret.ast_node_res = first;
            return ret;
        }

        ret.ast_node_res = [] as ASTNode[];
        let push_node = (ast_node: ASTNode | null) => {
            if (ast_node !== null) {
                (ret.ast_node_res as ASTNode[]).push(ast_node);
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

            if (peek_ends()) {
                if (sep !== null) {
                    this.input.pos = sep_retry_pos;
                }
                break;
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
     * Peek whether any end node matches at the current input position without consuming input. 
     * `ends` is tried from right to left because the last item has the highest priority.
     *
     * 探测当前位置是否能匹配任一结束节点，但不消费输入。
     * `ends` 从右向左尝试，列表末尾节点优先级最高。
     * 此函数不会确保错误状态约定，应当通过返回值中的end_idx判定是否成功。
     */
    peekEndNodes(ends: ParserNode[], ignored: ParserNode | null = null): PeekEndNodesResult {
        const start = this.input.pos;
        let ret: PeekEndNodesResult = {
            end_ast_node: null,
            end_idx: -1,
        };
        for (let i = ends.length - 1; i >= 0; i--) {
            let res = this.parseSingleNode(ends[i], ignored);
            if (this.isSuccess()) {
                ret.end_ast_node = res;
                ret.end_idx = i;
                break;
            }
        }
        this.input.pos = start;
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
            const ends: ParserNode[] = [];
            if (node.greedy_flags[i] === false) {
                for (let j = i + 1; j < node.sub_nodes.length; j++) {
                    ends.push(node.sub_nodes[j]);
                    const qj = node.sub_quantifiers[j] as Quantifier;
                    if (node.greedy_flags[j] || qj === " " || qj === "+") {
                        break;
                    }
                }
            }
            const parse_res = this.parseNode(sub_node, q, node.ignore, node.sep, ends);
            const ast_res = parse_res.ast_node_res;
            if (!this.isSuccess()) {
                this.input.pos = start;
                return null;
            }

            seps.push(...parse_res.seps);
            children.push(ast_res);
            let next_i = i;
            if (parse_res.end_idx >= 0) {
                const end_node_idx = i + 1 + parse_res.end_idx;
                for (let j = i + 1; j < end_node_idx; j++) {
                    const qj = node.sub_quantifiers[j] as Quantifier;
                    children.push(qj === "*" ? [] : null);
                }
                next_i = end_node_idx - 1;
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
            i = next_i;
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
    parseCharMatchNode(
        node: CharMatchNode,
        quantifier: Quantifier,
    ): ASTNode | null {
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

    /**
     * For quantifier `*` and `+`, merge consecutive matched strings, return ASTNode[].
     * 
     * 对于量词`*`和`+`，会合并连续的匹配字符串，返回ASTNode[]。
     */
    parseCharMatchNodeEx(
        node: CharMatchNode,
        quantifier: Quantifier,
        ignored: ParserNode | null,
        ends: ParserNode[] = [],
    ): ParseCharMatchNodeExResult {
        const ret: ParseCharMatchNodeExResult = {
            ast_node_res: null,
            end_idx: -1,
        };
        if (ignored === null && ends.length === 0) {
            ret.ast_node_res = this.parseCharMatchNode(node, quantifier);
            return ret;
        }

        const make_ast_node = (start: number): ASTNode => {
            const end = this.input.pos;
            return {
                parser_nodes: [node],
                range: [start, end],
                value: this.input.src.slice(start, end),
                raw_value: this.input.src.slice(start, end),
                seps: [],
            };
        }

        const single = quantifier === " " || quantifier === "?";
        const match_res = this.parseCharMatchNodeConsecutive(node, ignored, single, ends, quantifier !== "+");
        ret.end_idx = match_res.end_idx;
        if (!this.isSuccess()) {
            if (quantifier === "?" || quantifier === "*") {
                this.setSuccess();
            }
            if (single) {
                return ret;
            }
            ret.ast_node_res = [];
            return ret;
        }

        const first = make_ast_node(match_res.start);
        if (single) {
            ret.ast_node_res = first;
            return ret;
        }

        ret.ast_node_res = [first];
        for (; ;) {
            const match_res = this.parseCharMatchNodeConsecutive(node, ignored, false, ends);
            if (!this.isSuccess()) {
                ret.end_idx = match_res.end_idx;
                break;
            }
            ret.ast_node_res.push(make_ast_node(match_res.start))
            ret.end_idx = match_res.end_idx;
            if (ret.end_idx >= 0) {
                break;
            }
        }
        this.setSuccess();
        return ret;
    }

    /**
     * Match the node many times, on each failed match, try consuming `ignored` once, and repeat until either the match succeeds or matching cannot succeed even after ignoring.
     * 
     * 每次匹配失败时，尝试忽略一次 `ignored` 节点，直到匹配成功或即使忽略也不可能匹配成功。如果匹配成功则重复匹配直到失败。
     * 成功时至少匹配到一次node
     * 返回值参考ParseCharMatchNodeConsecutiveResult定义。
     */
    parseCharMatchNodeConsecutive(
        node: CharMatchNode,
        ignored: ParserNode | null,
        single: boolean,
        ends: ParserNode[] = [],
        first_peek_ends: boolean = true,
    ): ParseCharMatchNodeConsecutiveResult {
        const start = this.input.pos;
        const ret: ParseCharMatchNodeConsecutiveResult = {
            start,
            end_idx: -1,
        };

        let peek_ends = (): boolean => {
            const peek_res = this.peekEndNodes(ends);
            ret.end_idx = peek_res.end_idx;
            return peek_res.end_idx >= 0;
        };

        for (; ;) {
            if (first_peek_ends && peek_ends()) {
                this.setError(this.input.pos);
                return ret;
            }

            const retry_pos = this.input.pos;
            this.parseSingleCharMatchNode(node);
            if (this.isSuccess()) {
                ret.start = retry_pos;
                if (single) {
                    return ret;
                }

                do {
                    if (peek_ends()) {
                        break;
                    }
                    this.parseSingleCharMatchNode(node);
                } while (this.isSuccess());
                this.setSuccess();
                return ret;
            }

            this.input.pos = retry_pos;
            if (ignored === null) {
                this.input.pos = start;
                return ret;
            }
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
