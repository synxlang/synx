import assert from "assert";
import { matchChar, matchCharRange, matchAnyChar } from "./parser_matcher";
import {
    ParserNode,
    ParserNodeKind,
    CharMatchNode,
    GeneralCharMatchNode,
    isGeneralCharMatchNode,
    CharMatchRange,
    CharMatchSet,
    PatternSeq,
    CharSeq,
    PatternSet,
    Quantifier,
} from "./parser_node";
import type {
    ParserConfig,
    ParseProfiling,
    ParseResult,
    ParserInput,
    ParseSingleNodeProfiling,
    PatternSetAlternativeProfiling,
    ASTNode,
} from "./common";
import { ParseResultKind } from "./common";
import type { Parser } from "./parser";

class ParseTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ParseTimeoutError";
    }
}

const PARSE_STEP_EXIT_SUCCESS = -1;
const PARSE_STEP_EXIT_FAILURE = -2;

interface ParseStepAction {
    // Next graph step. Negative values are exits: -1 success, -2 failure.
    next_step_idx: number;
    // Pop this many successful ParsedStep entries; popping also restores input.
    pop_value_cnt: number;
}

function completeParseStepAction(
    partial: Partial<ParseStepAction> & { next_step_idx: number },
): ParseStepAction {
    return Object.assign(partial, {
        next_step_idx: partial.next_step_idx,
        pop_value_cnt: partial.pop_value_cnt ?? 0,
    }) as ParseStepAction;
}

interface ParseStep {
    parser_node: ParserNode;
    value_idx: number;              // 赋值的对应数组，-1为不赋值

    empty_success_action: ParseStepAction;
    non_empty_success_action: ParseStepAction;
    fail_action: ParseStepAction;
}

interface ParseStepGraph {
    steps: ParseStep[];
}

interface ParsedStep {
    step_idx: number;
    value_idx: number;
    value: ASTNode | null;
    input_start: number;
    input_end: number;
}

interface ParseStepGraphResult {
    parsed_steps: ParsedStep[];
    values: (ASTNode | null)[][];
    exit_step_idx: number;
}

/**
 * ============================== EN ==============================
 *
 * - With `*` / `+` quantifiers, returns `ASTNode[]`; with ` ` / `?`, returns `ASTNode` or `null`.
 * - GeneralCharMatchNode special case: when `ignored` is null, repeated character matches are merged into one `ASTNode`;
 *   when `ignored` is non-null, `*` / `+` returns `ASTNode[]` so separated runs remain observable.
 * - `end_idx` is the matched end-node index, or `-1` if no end node matched.
 *
 * ============================== 中文 ==============================
 *
 * `*`、`+` 量词时返回 `ASTNode[]`；`' '` 或 `?` 量词时返回 `ASTNode` 或 `null`。
 * GeneralCharMatchNode 特殊处理：`ignored` 为空时，重复字符匹配会合并为一个 `ASTNode`；
 * `ignored` 非空时，`*` / `+` 返回 `ASTNode[]`，以保留被 ignored 分隔的多段结果。
 * `end_idx` 为结束节点匹配索引；未匹配到结束节点时为 `-1`。
 */
interface ParseNodeResult {
    ast_node_res: ASTNode[] | ASTNode | null;
    seps: ASTNode[];
    end_idx: number;
}

/**
 * ============================== EN ==============================
 *
 * Result of peeking end nodes.
 * `end_idx` is the matched end-node index, or `-1` if no end node matched.
 *
 * ============================== 中文 ==============================
 *
 * 探测结束节点的结果。
 * `end_idx` 为结束节点匹配索引；未匹配到结束节点时为 `-1`。
 */
interface PeekEndNodesResult {
    end_ast_node: ASTNode | null;
    end_idx: number;
}

/**
 * ============================== EN ==============================
 *
 * `start` is the matched node start position on success, or the whole-match start position on failure.
 * `end_idx` is the matched end-node index, or `-1` if no end node matched.
 *
 * ============================== 中文 ==============================
 *
 * `start` 成功时为匹配 `node` 的起始匹配位置，失败时为总匹配初始位置。
 * `end_idx` 为结束节点匹配索引；未匹配到结束节点时为 `-1`。
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
 * Parse-call conventions (for functions whose names start with `parse`):
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
 * - `ends` parameter:
 *   - Used for non-greedy matching: prefer matching nodes in the `ends` list; the last item in the list has the highest priority.
 *   - If a node in `ends` matches, stop matching and return the current result.
 *   - `ends` does not consume input (matching is probed without advancing the read position).
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
 * - ends 参数：
 *   - 用于非贪婪匹配，优先匹配 ends 列表中的节点，列表末端的节点优先级最高。
 *   - 如果匹配到 ends 列表中的节点，则停止匹配并返回当前结果。
 *   - ends不消耗输入。
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
    private parse_single_node_stack: Array<{ node: ParserNode; pos: number; profile_record?: ParseSingleNodeProfiling }> = [];
    private profiling: ParseProfiling = this.profileCreate();
    private parse_start_time_ms: number = 0;
    private debug_next_report_time_ms: number = 0;
    private debug_last_report_time_ms: number = 0;
    private debug_last_report_enter_count: number = 0;
    private readonly debug_report_interval_ms: number = 5000;
    private readonly debug_check_interval: number = 1024;
    private profile_node_ids = new WeakMap<ParserNode, number>();
    private profile_next_node_id: number = 1;

    /**
     * ============================== EN ==============================
     *
     * Supports `PatternSet` left recursion and avoids infinite expansion.
     *
     * Note: left recursion is limited to a single depth level.
     *
     * For writing arbitrarily long infix chains, prefer synx-style lists with `\sep`, and handle associativity later:
     *
     * - **Preferred — list with `\sep`, then associativity** — first collect operands separated by the operator into a list,
     *   then fold by left associativity, right associativity, or precedence in the semantic phase:
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
     * ============================== 中文 ==============================
     *
     * 用于支持 PatternSet 左递归，以及避免无限展开。
     *
     * 注：左递归仅支持单层深度。
     *
     * 若要写「任意长的中缀链」，优先用 synx 式列表 + `\sep`，结合性放到后续分析：
     *
     * - **推荐 — `\sep` 得到列表，再结合性** — 先把被运算符隔开的各项收成列表（或等价结构），
     *   再在语义阶段按左结合、右结合或优先级折叠：
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

    private parserNodeDebugName(node: ParserNode): string {
        const kind_name = ParserNodeKind[node.kind] ?? `ParserNodeKind(${node.kind})`;
        const name = "name" in node ? node.name : "";
        return name !== "" ? `${kind_name}(${name})` : kind_name;
    }

    private formatParseSingleNodeStack(): string {
        if (this.config.debug !== true || this.parse_single_node_stack.length === 0) {
            return "";
        }
        const lines = this.parse_single_node_stack.map((frame, idx) => {
            return `${"  ".repeat(idx)}${idx}: ${this.parserNodeDebugName(frame.node)} @ ${frame.pos}`;
        });
        return `\nparseSingleNode stack:\n${lines.join("\n")}`;
    }

    private profileCreate(): ParseProfiling {
        return {
            parse_elapsed_s: 0,
            parse_single_node_enter_count: 0,
            parse_single_node_max_depth: 0,
            parse_single_node_by_node_pos: new Map(),
            pattern_set_alternative_by_node_pos_alt: new Map(),
        };
    }

    getParseProfiling(): ParseProfiling {
        return this.profiling;
    }

    private profileGetNodeId(node: ParserNode): number {
        let id = this.profile_node_ids.get(node);
        if (id === undefined) {
            id = this.profile_next_node_id;
            this.profile_next_node_id += 1;
            this.profile_node_ids.set(node, id);
        }
        return id;
    }

    private profileParseSingleNodeKey(node: ParserNode, pos: number): string {
        return `${this.profileGetNodeId(node)}:${pos}`;
    }

    private profilePatternSetAlternativeKey(node: PatternSet, pos: number, alt_idx: number): string {
        return `${this.profileGetNodeId(node)}:${pos}:${alt_idx}`;
    }

    private profileGetOrCreateParseSingleNode(node: ParserNode, pos: number): ParseSingleNodeProfiling {
        const key = this.profileParseSingleNodeKey(node, pos);
        let record = this.profiling.parse_single_node_by_node_pos.get(key);
        if (record === undefined) {
            record = {
                node,
                pos,
                enter_count: 0,
                success_count: 0,
                success_null_count: 0,
                failure_count: 0,
            };
            this.profiling.parse_single_node_by_node_pos.set(key, record);
        }
        return record;
    }

    private profileGetOrCreatePatternSetAlternative(node: PatternSet, pos: number, alt_idx: number): PatternSetAlternativeProfiling {
        const key = this.profilePatternSetAlternativeKey(node, pos, alt_idx);
        let record = this.profiling.pattern_set_alternative_by_node_pos_alt.get(key);
        if (record === undefined) {
            record = {
                node,
                pos,
                alt_idx,
                enter_count: 0,
                success_count: 0,
                failure_count: 0,
            };
            this.profiling.pattern_set_alternative_by_node_pos_alt.set(key, record);
        }
        return record;
    }

    private profileRecordParseSingleNodeEnter(node: ParserNode, pos: number): void {
        if (this.config.debug !== true) {
            this.checkParseTimeout();
            return;
        }
        this.profiling.parse_single_node_enter_count += 1;
        this.profiling.parse_single_node_max_depth = Math.max(
            this.profiling.parse_single_node_max_depth,
            this.parse_single_node_stack.length,
        );
        const record = this.profileGetOrCreateParseSingleNode(node, pos);
        record.enter_count += 1;
        this.parse_single_node_stack[this.parse_single_node_stack.length - 1].profile_record = record;
        if (this.profiling.parse_single_node_enter_count % this.debug_check_interval === 0) {
            this.checkParseTimeoutAndMaybeReport();
        }
    }

    private profileRecordParseSingleNodeExit(node: ParserNode, pos: number, ret: ASTNode | null): void {
        if (this.config.debug !== true) {
            return;
        }
        const stack_record = this.parse_single_node_stack[this.parse_single_node_stack.length - 1];
        const record = stack_record?.profile_record ?? this.profileGetOrCreateParseSingleNode(node, pos);
        if (this.isSuccess()) {
            if (ret === null) {
                record.success_null_count += 1;
            } else {
                record.success_count += 1;
            }
        } else {
            record.failure_count += 1;
        }
    }

    private profileRecordPatternSetAlternativeEnter(node: PatternSet, pos: number, alt_idx: number): void {
        if (this.config.debug !== true) {
            return;
        }
        this.profileGetOrCreatePatternSetAlternative(node, pos, alt_idx).enter_count += 1;
    }

    private profileRecordPatternSetAlternativeExit(node: PatternSet, pos: number, alt_idx: number, success: boolean): void {
        if (this.config.debug !== true) {
            return;
        }
        const record = this.profileGetOrCreatePatternSetAlternative(node, pos, alt_idx);
        if (success) {
            record.success_count += 1;
        } else {
            record.failure_count += 1;
        }
    }

    private profileFormatTopParseSingleNode(limit: number): string {
        const records = Array.from(this.profiling.parse_single_node_by_node_pos.values())
            .sort((a, b) => b.enter_count - a.enter_count)
            .slice(0, limit);
        if (records.length === 0) {
            return "";
        }
        const lines = records.map((record, idx) => {
            return `${idx}: ${this.parserNodeDebugName(record.node)} @ ${record.pos}`
                + ` enter=${record.enter_count}`
                + ` success=${record.success_count}`
                + ` success_null=${record.success_null_count}`
                + ` failure=${record.failure_count}`;
        });
        return `\nparseSingleNode profiling top ${records.length}:\n${lines.join("\n")}`;
    }

    private profileFormatTopPatternSetAlternative(limit: number): string {
        const records = Array.from(this.profiling.pattern_set_alternative_by_node_pos_alt.values())
            .sort((a, b) => b.enter_count - a.enter_count)
            .slice(0, limit);
        if (records.length === 0) {
            return "";
        }
        const lines = records.map((record, idx) => {
            const alt = record.node.sub_nodes[record.alt_idx];
            const alt_name = alt === undefined ? "<out-of-range>" : this.parserNodeDebugName(alt);
            return `${idx}: ${this.parserNodeDebugName(record.node)} @ ${record.pos} alt=${record.alt_idx} ${alt_name}`
                + ` enter=${record.enter_count}`
                + ` success=${record.success_count}`
                + ` failure=${record.failure_count}`;
        });
        return `\nPatternSet alternative profiling top ${records.length}:\n${lines.join("\n")}`;
    }

    private profileFormatSummary(): string {
        if (this.config.debug !== true) {
            return "";
        }
        return "\nparse profiling:"
            + `\nparse elapsed_s: ${this.profiling.parse_elapsed_s.toFixed(3)}`
            + `\nparseSingleNode enter count: ${this.profiling.parse_single_node_enter_count}`
            + `\nparseSingleNode max depth: ${this.profiling.parse_single_node_max_depth}`
            + this.profileFormatTopParseSingleNode(20)
            + this.profileFormatTopPatternSetAlternative(20);
    }

    private formatDebugProgress(now_ms: number): string {
        const elapsed_ms = Math.max(1, now_ms - this.parse_start_time_ms);
        const recent_elapsed_ms = Math.max(1, now_ms - this.debug_last_report_time_ms);
        const elapsed_s = elapsed_ms / 1000;
        this.profileRecordElapsed(now_ms);
        const total_entries = this.profiling.parse_single_node_enter_count;
        const recent_entries = total_entries - this.debug_last_report_enter_count;
        const total_rate = total_entries * 1000 / elapsed_ms;
        const recent_rate = recent_entries * 1000 / recent_elapsed_ms;
        return "\nparse debug progress:"
            + `\nelapsed_s: ${elapsed_s.toFixed(3)}`
            + `\nparseSingleNode enter count: ${total_entries}`
            + `\nparseSingleNode enter/s: ${total_rate.toFixed(2)}`
            + `\nrecent enter/s: ${recent_rate.toFixed(2)}`
            + this.formatParseSingleNodeStack()
            + this.profileFormatSummary();
    }

    private checkParseTimeout(now_ms: number = Date.now()): void {
        if (this.config.timeout_s === undefined) {
            return;
        }
        const elapsed_ms = now_ms - this.parse_start_time_ms;
        const timeout_ms = this.config.timeout_s * 1000;
        if (elapsed_ms <= timeout_ms) {
            return;
        }
        const message = `parse timeout exceeded (${this.config.timeout_s}s)`
            + this.formatDebugProgress(now_ms);
        this.setError(this.input.pos, message);
        throw new ParseTimeoutError(message);
    }

    private checkParseTimeoutAndMaybeReport(): void {
        const now_ms = Date.now();
        this.checkParseTimeout(now_ms);
        if (this.config.debug !== true) {
            return;
        }
        if (now_ms < this.debug_next_report_time_ms) {
            return;
        }
        console.error(this.formatDebugProgress(now_ms));
        this.debug_last_report_time_ms = now_ms;
        this.debug_last_report_enter_count = this.profiling.parse_single_node_enter_count;
        this.debug_next_report_time_ms = now_ms + this.debug_report_interval_ms;
    }

    private assertConsumed(start: number, node: ParserNode): void {
        if (this.input.pos > start) {
            return;
        }
        const near = this.input.src.slice(start, Math.min(this.input.src.length, start + 80));
        assert.fail(
            `parseSingleNode: ${this.parserNodeDebugName(node)} matched without consuming input at pos ${start}\n${near}\n^${this.formatParseSingleNodeStack()}${this.profileFormatSummary()}`,
        );
    }

    private profileRecordElapsed(now_ms: number = Date.now()): void {
        if (this.parse_start_time_ms === 0) {
            this.profiling.parse_elapsed_s = 0;
            return;
        }
        this.profiling.parse_elapsed_s = Math.max(0, now_ms - this.parse_start_time_ms) / 1000;
    }

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
     * Record a parse result by its matched start position to avoid repeated parsing.
     * 按解析结果的匹配起始位置缓存解析结果，避免重复解析。
     */
    recordParse(pos: number, ast_node: ASTNode): void {
        this.parse_records[pos].push(ast_node);
    }

    /**
     * Get cached parse results at `pos`; return an empty array if no result exists.
     * 获取 `pos` 位置的缓存解析结果；如果没有解析结果则返回空数组。
     */
    getParseRecords(pos: number): ASTNode[] {
        return this.parse_records[pos] ?? [];
    }

    /**
     * Find the first cached result at `pos` whose `parser_nodes` contains `parser_node`.
     * 返回缓存中 `pos` 位置第一个包含 `parser_node` 的解析结果；如果没有找到则返回 `null`。
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
        this.parse_single_node_stack.length = 0;
        this.profiling = this.profileCreate();
        this.parse_start_time_ms = Date.now();
        this.debug_next_report_time_ms = this.parse_start_time_ms + this.debug_report_interval_ms;
        this.debug_last_report_time_ms = this.parse_start_time_ms;
        this.debug_last_report_enter_count = 0;
        this.parse_records = Array.from({ length: input.src.length + 1 }, () => []);
    }

    parse(input: ParserInput, root: ParserNode): ParseResult {
        this.initParse(input);
        let parse_node_res: ASTNode[] | ASTNode | null = null;
        try {
            parse_node_res = this.parseSingleNode(root);
        } catch (err) {
            this.profileRecordElapsed();
            if (err instanceof ParseTimeoutError) {
                return {
                    kind: ParseResultKind.Failure,
                    ast_nodes: [],
                    end_pos: this.input.pos,
                    error: this.getError() ?? err.message,
                };
            }
            throw err;
        }
        this.profileRecordElapsed();

        if (!this.isSuccess()) {
            return {
                kind: ParseResultKind.Failure,
                ast_nodes: [],
                end_pos: this.input.pos,
                error: this.getError() ?? undefined,
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
     * Execute a small parse state graph.
     * Negative transitions are exits: -1 success, -2 failure.
     */
    private parseStepGraph(graph: ParseStepGraph, ignored: ParserNode | null): ParseStepGraphResult {
        const graph_start = this.input.pos;
        const value_count = graph.steps.reduce((max_idx, step) => Math.max(max_idx, step.value_idx), -1) + 1;
        const result: ParseStepGraphResult = {
            parsed_steps: [],
            values: Array.from({ length: value_count }, () => []),
            exit_step_idx: -1,
        };

        const rollbackParsedSteps = (count: number): void => {
            for (let i = 0; i < count; i++) {
                const parsed = result.parsed_steps.pop();
                assert.ok(parsed !== undefined, "parseStepGraph: rollback exceeds parsed step stack");
                if (parsed.value_idx >= 0) {
                    const values = result.values[parsed.value_idx];
                    const popped = values.pop();
                    assert.strictEqual(popped, parsed.value);
                }
                this.input.pos = parsed.input_start;
            }
        };

        const exit = (idx: number): ParseStepGraphResult => {
            assert.ok(idx === PARSE_STEP_EXIT_SUCCESS || idx === PARSE_STEP_EXIT_FAILURE);
            if (idx === PARSE_STEP_EXIT_SUCCESS) {
                this.setSuccess();
            } else {
                this.input.pos = graph_start;
            }
            return result;
        };

        let step_idx = 0;
        while (step_idx >= 0) {
            assert.ok(step_idx < graph.steps.length, `parseStepGraph: invalid step index ${step_idx}`);
            const step = graph.steps[step_idx];
            const input_start = this.input.pos;
            const value = this.parseSingleNode(step.parser_node, ignored);
            let action: ParseStepAction;
            if (this.isSuccess()) {
                const input_end = this.input.pos;
                action = value === null ? step.empty_success_action : step.non_empty_success_action;
                if (step.value_idx >= 0) {
                    assert.ok(value !== null, "parseStepGraph: value_idx >= 0 requires a non-null value");
                    result.values[step.value_idx].push(value);
                }
                result.parsed_steps.push({
                    step_idx,
                    value_idx: step.value_idx,
                    value,
                    input_start,
                    input_end,
                });
            } else {
                action = step.fail_action;
            }

            // `pop_value_cnt` rolls back successful steps. Because each parsed step stores
            // its input_start, popping values also restores the consumed input.
            rollbackParsedSteps(action.pop_value_cnt);
            if (action.next_step_idx < 0) {
                result.exit_step_idx = step_idx;
                return exit(action.next_step_idx);
            }
            step_idx = action.next_step_idx;
        }

        return exit(PARSE_STEP_EXIT_SUCCESS);
    }

    private addParseStepMatch(
        steps: ParseStep[],
        parser_node: ParserNode,
        value_idx: number,
        non_empty_success_action: ParseStepAction,
        empty_success_action: ParseStepAction,
        fail_action: ParseStepAction,
    ): number {
        const match_idx = steps.length;
        steps.push({
            parser_node,
            value_idx,
            empty_success_action,
            non_empty_success_action,
            fail_action,
        });
        return match_idx;
    }

    /**
     * ============================== EN ==============================
     *
     * When `sep` is non-null, it is parsed only between successive matches of the same `node` while expanding `*` / `+` (the loop below).
     *
     * `ends` is the end-node list. For non-greedy `*`, `+`, and `?`, end nodes are tried before the current node;
     * if any end node matches, parsing stops and returns the current result. The last item in `ends` has the highest priority.
     * When an end node matches, `input.pos` is the end position that excludes the end node.
     *
     * ============================== 中文 ==============================
     *
     * 当 `sep` 非 null 时，仅在本函数展开 `*` / `+` 的循环中、于同一 `node` 的相邻两次匹配之间解析分隔符。
     *
     * `ends` 为结束节点列表。非贪婪匹配量词 `*`、`+`、`?` 时，优先匹配结束节点；
     * 如果匹配到结束节点，则停止匹配并返回当前结果。列表末端的节点优先级最高。
     * 匹配到结束节点时，`input.pos` 为不包含 `ends` 的结束匹配位置。
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
        if (sep === null && isGeneralCharMatchNode(node)) {
            const result = this.parseCharMatchNodeEx(node, quantifier, ignored, ends);
            return {
                ast_node_res: result.ast_node_res,
                seps: [],
                end_idx: result.end_idx,
            }
        }

        const ret: ParseNodeResult = {
            ast_node_res: null,
            seps: [],
            end_idx: -1,
        };
        const NODE_VALUE_IDX = 0;
        const SEP_VALUE_IDX = 1;
        const PLACEHOLDER_STEP_IDX = -999;
        const steps: ParseStep[] = [];
        const end_step_to_end_idx = new Map<number, number>();

        const addEndProbeChain = (success_pop_value_cnt: number, all_failed_action: ParseStepAction): number => {
            assert.ok(ends.length > 0);
            const first_idx = steps.length;
            const end_match_idxs: number[] = [];
            for (let i = ends.length - 1; i >= 0; i--) {
                const match_idx = this.addParseStepMatch(
                    steps,
                    ends[i],
                    -1,
                    completeParseStepAction({ next_step_idx: PARSE_STEP_EXIT_SUCCESS, pop_value_cnt: success_pop_value_cnt }),
                    completeParseStepAction({ next_step_idx: PARSE_STEP_EXIT_SUCCESS, pop_value_cnt: success_pop_value_cnt }),
                    completeParseStepAction({ next_step_idx: PLACEHOLDER_STEP_IDX }),
                );
                end_match_idxs.push(match_idx);
                end_step_to_end_idx.set(match_idx, i);
            }
            for (let i = 0; i < end_match_idxs.length - 1; i++) {
                steps[end_match_idxs[i]].fail_action = completeParseStepAction({ next_step_idx: end_match_idxs[i + 1] });
            }
            steps[end_match_idxs[end_match_idxs.length - 1]].fail_action = all_failed_action;
            return first_idx;
        };

        if (quantifier === " " || quantifier === "?") {
            const node_fail_action = completeParseStepAction({ next_step_idx: quantifier === "?" ? PARSE_STEP_EXIT_SUCCESS : PARSE_STEP_EXIT_FAILURE });
            if (quantifier === "?" && ends.length > 0) {
                addEndProbeChain(1, completeParseStepAction({ next_step_idx: PLACEHOLDER_STEP_IDX }));
            }
            const node_idx = this.addParseStepMatch(
                steps,
                node,
                NODE_VALUE_IDX,
                completeParseStepAction({ next_step_idx: PARSE_STEP_EXIT_SUCCESS }),
                completeParseStepAction({ next_step_idx: PARSE_STEP_EXIT_SUCCESS }),
                node_fail_action,
            );
            if (quantifier === "?" && ends.length > 0) {
                const last_end_match_idx = node_idx - 1;
                steps[last_end_match_idx].fail_action = completeParseStepAction({ next_step_idx: node_idx });
            }
        } else {
            let first_node_idx = -1;
            let repeat_node_idx = -1;
            let sep_idx = -1;
            let initial_end_chain_last_match_idx = -1;

            if (quantifier === "*" && ends.length > 0) {
                addEndProbeChain(1, completeParseStepAction({ next_step_idx: PLACEHOLDER_STEP_IDX }));
                initial_end_chain_last_match_idx = steps.length - 1;
            }

            const need_first_node = quantifier === "+" || sep !== null;
            if (need_first_node) {
                first_node_idx = this.addParseStepMatch(
                    steps,
                    node,
                    NODE_VALUE_IDX,
                    completeParseStepAction({ next_step_idx: PLACEHOLDER_STEP_IDX }),
                    completeParseStepAction({ next_step_idx: PLACEHOLDER_STEP_IDX }),
                    completeParseStepAction({ next_step_idx: quantifier === "+" ? PARSE_STEP_EXIT_FAILURE : PARSE_STEP_EXIT_SUCCESS }),
                );
            }

            const repeatNodeFailAction = sep === null
                ? completeParseStepAction({ next_step_idx: PARSE_STEP_EXIT_SUCCESS })
                : completeParseStepAction({ next_step_idx: PARSE_STEP_EXIT_SUCCESS, pop_value_cnt: 1 });

            repeat_node_idx = this.addParseStepMatch(
                steps,
                node,
                NODE_VALUE_IDX,
                completeParseStepAction({ next_step_idx: PLACEHOLDER_STEP_IDX }),
                completeParseStepAction({ next_step_idx: PLACEHOLDER_STEP_IDX }),
                repeatNodeFailAction,
            );

            if (initial_end_chain_last_match_idx >= 0) {
                steps[initial_end_chain_last_match_idx].fail_action = completeParseStepAction({ next_step_idx: first_node_idx >= 0 ? first_node_idx : repeat_node_idx });
            }

            if (sep !== null) {
                sep_idx = this.addParseStepMatch(
                    steps,
                    sep,
                    SEP_VALUE_IDX,
                    completeParseStepAction({ next_step_idx: PLACEHOLDER_STEP_IDX }),
                    completeParseStepAction({ next_step_idx: PLACEHOLDER_STEP_IDX }),
                    completeParseStepAction({ next_step_idx: PARSE_STEP_EXIT_SUCCESS }),
                );
            }

            const makeRepeatStart = (after_sep: boolean): number => {
                if (ends.length === 0) {
                    return repeat_node_idx;
                }
                return addEndProbeChain(
                    after_sep ? 2 : 1,
                    completeParseStepAction({ next_step_idx: repeat_node_idx }),
                );
            };

            const repeat_start_idx = makeRepeatStart(false);
            const after_node_success_idx = sep_idx >= 0 ? sep_idx : repeat_start_idx;
            steps[repeat_node_idx].non_empty_success_action = completeParseStepAction({ next_step_idx: after_node_success_idx });
            steps[repeat_node_idx].empty_success_action = steps[repeat_node_idx].non_empty_success_action;
            if (first_node_idx >= 0) {
                steps[first_node_idx].non_empty_success_action = completeParseStepAction({ next_step_idx: after_node_success_idx });
                steps[first_node_idx].empty_success_action = steps[first_node_idx].non_empty_success_action;
            }
            if (sep_idx >= 0) {
                const after_sep_idx = makeRepeatStart(true);
                steps[sep_idx].non_empty_success_action = completeParseStepAction({ next_step_idx: after_sep_idx });
                steps[sep_idx].empty_success_action = steps[sep_idx].non_empty_success_action;
            }
        }

        const result = this.parseStepGraph({ steps }, ignored);
        ret.end_idx = result.exit_step_idx >= 0 ? end_step_to_end_idx.get(result.exit_step_idx) ?? -1 : -1;
        if (!this.isSuccess()) {
            return ret;
        }
        ret.ast_node_res = quantifier === " " || quantifier === "?"
            ? result.values[NODE_VALUE_IDX]?.[0] ?? null
            : (result.values[NODE_VALUE_IDX] ?? []) as ASTNode[];
        ret.seps = (result.values[SEP_VALUE_IDX] ?? []) as ASTNode[];
        return ret;
    }

    /**
     * ============================== EN ==============================
     *
     * Peek whether any end node matches at the current input position without consuming input. 
     * `ends` is tried from right to left because the last item has the highest priority.
     * This function does not guarantee the error-state convention; use `end_idx` in the return value to determine success.
     *
     * ============================== 中文 ==============================
     *
     * 探测当前位置是否能匹配任一结束节点，但不消费输入。
     * `ends` 从右向左尝试，列表末尾节点优先级最高。
     * 此函数不会确保错误状态约定，应当通过返回值中的 `end_idx` 判定是否成功。
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
        const start = this.input.pos;
        if (this.config.debug === true) {
            this.parse_single_node_stack.push({ node, pos: start });
            this.profileRecordParseSingleNodeEnter(node, start);
        } else {
            this.checkParseTimeout();
        }
        try {
            const complete_return = (ret: ASTNode | null): ASTNode | null => {
                if (this.isSuccess() && ret !== null) {
                    this.assertConsumed(start, node);
                }
                this.profileRecordParseSingleNodeExit(node, start, ret);
                return ret;
            };
            if (ignored === null) {
                return complete_return(this.parseSingleNodeSimple(node));
            }
            for (; ;) {
                const retry_pos = this.input.pos;
                const ret = this.parseSingleNodeSimple(node);
                if (this.isSuccess()) {
                    return complete_return(ret);
                }

                this.input.pos = retry_pos;
                this.parseSingleNodeSimple(ignored);
                if (!this.isSuccess()) {
                    this.input.pos = start;
                    return complete_return(ret);
                }
                if (this.input.pos === retry_pos) {
                    this.setError(this.input.pos);
                    this.input.pos = start;
                    return complete_return(ret);
                }
            }
        } finally {
            if (this.config.debug === true) {
                this.parse_single_node_stack.pop();
            }
        }
    }

    parseSingleNodeSimple(node: ParserNode): ASTNode | null {
        const start = this.input.pos;
        const cached = this.findParseRecord(start, node);
        if (cached !== null) {
            this.input.pos = cached.range[1];
            this.setSuccess();
            return cached;
        }

        let ret: ASTNode | null;
        if (node.kind === ParserNodeKind.CharSeq) {
            ret = this.parseCharSeq(node as CharSeq);
        } else if (isGeneralCharMatchNode(node)) {
            ret = this.parseCharMatchNode(node, " ");
        } else if (node.kind === ParserNodeKind.PatternSeq) {
            ret = this.parsePatternSeq(node as PatternSeq);
        } else if (node.kind === ParserNodeKind.PatternSet) {
            ret = this.parsePatternSet(node as PatternSet);
        } else {
            assert.fail("unimplemented node kind");
        }

        if (this.isSuccess() && node.kind !== ParserNodeKind.PatternSet) {
            assert.ok(ret !== null, "parseSingleNodeSimple succeeded with null ASTNode");
            this.recordParse(start, ret);
        }
        return ret;
    }

    parsePatternSet(node: PatternSet): ASTNode | null {
        const node_start = this.input.pos;
        let alt_idx = this.getPatternSetNextAltIdx(node, node_start);
        this.pattern_set_node_parse_stack.push({ node, pos: node_start, alt_idx });

        try {
            if (alt_idx >= node.sub_nodes.length) {
                this.setError(this.input.pos, "pattern set has no more alternatives");
                return null;
            }

            const parse_alternative = (start: number): ASTNode | null => {
                for (let i = alt_idx; i < node.sub_nodes.length; i++) {
                    this.profileRecordPatternSetAlternativeEnter(node, node_start, i);
                    const child = this.parseSingleNode(node.sub_nodes[i]);
                    if (!this.isSuccess()) {
                        this.input.pos = start;
                        this.profileRecordPatternSetAlternativeExit(node, node_start, i, false);
                        continue;
                    }
                    if (node.neg_flags[i]) {
                        this.input.pos = start;
                        this.setError(this.input.pos, "negated alternative matched");
                        this.profileRecordPatternSetAlternativeExit(node, node_start, i, false);
                        return null;
                    }
                    if (child === null) {
                        this.profileRecordPatternSetAlternativeExit(node, node_start, i, false);
                        return null;
                    }
                    if (!child.parser_nodes.includes(node)) {
                        child.parser_nodes.push(node);
                    }
                    if (alt_idx === 0) {
                        // Only alt_idx=0 covers the full alternative list. Later alternatives
                        // are left-recursion fallback results and must not populate the
                        // ordinary (node, pos) success memo.
                        this.recordParse(child.range[0], child);
                    }
                    this.profileRecordPatternSetAlternativeExit(node, node_start, i, true);
                    return child;
                }
                assert.ok(!this.isSuccess());
                return null;
            };

            if (node.associateby === null || alt_idx !== 0) {
                return parse_alternative(node_start);
            }

            const direct = parse_alternative(node_start);
            if (this.isSuccess()) {
                return direct;
            }

            this.input.pos = node_start;
            const left = this.parseSingleNode(node.associateby[0], node.ignore);
            if (!this.isSuccess()) {
                this.input.pos = node_start;
                return null;
            }
            if (this.input.pos === node_start) {
                this.setError(this.input.pos, "associateby left boundary matched empty");
                this.input.pos = node_start;
                return null;
            }

            const inner = this.parseSingleNode(node);
            if (!this.isSuccess()) {
                this.input.pos = node_start;
                return null;
            }

            const right = this.parseSingleNode(node.associateby[1], node.ignore);
            if (!this.isSuccess()) {
                this.input.pos = node_start;
                return null;
            }
            assert.ok(left !== null && inner !== null && right !== null);

            inner.parser_nodes.push(node);
            inner.range = [node_start, this.input.pos];
            if (inner.associate_enclosures === null) {
                inner.associate_enclosures = [[left], [right]];
            } else {
                inner.associate_enclosures[0].push(left);
                inner.associate_enclosures[1].push(right);
            }
            this.recordParse(inner.range[0], inner);
            this.setSuccess();
            return inner;

        } finally {
            this.pattern_set_node_parse_stack.pop();
        }
    }

    /**
     * Match a `charset_flag` PatternSet as `GeneralCharSet`: rejecting branches are probes, normal branches consume one Char.
     * 按 `GeneralCharSet` 匹配 `charset_flag` PatternSet：否定分支只探测拒绝，普通分支消费一个字符。
     */
    parseCharMatchPatternSet(node: PatternSet): ParserNode[] {
        const start = this.input.pos;
        let alt_idx = this.getPatternSetNextAltIdx(node, start);
        this.pattern_set_node_parse_stack.push({ node, pos: start, alt_idx });

        try {
            if (alt_idx >= node.sub_nodes.length) {
                this.setError(this.input.pos, "pattern set has no more alternatives");
                return [];
            }

            for (let i = alt_idx; i < node.sub_nodes.length; i++) {
                this.profileRecordPatternSetAlternativeEnter(node, start, i);
                const sub_node = node.sub_nodes[i];
                let matched_nodes: ParserNode[] = [];
                if (node.neg_flags[i]) {
                    this.parseSingleNode(sub_node);
                } else {
                    assert.ok(isGeneralCharMatchNode(sub_node));
                    matched_nodes = this.parseSingleCharMatchNode(sub_node);
                }

                if (!this.isSuccess()) {
                    this.input.pos = start;
                    this.profileRecordPatternSetAlternativeExit(node, start, i, false);
                    continue;
                }
                if (node.neg_flags[i]) {
                    this.input.pos = start;
                    this.setError(start, "charset reject pattern matched");
                    this.profileRecordPatternSetAlternativeExit(node, start, i, false);
                    return [];
                }
                matched_nodes.push(node);
                this.profileRecordPatternSetAlternativeExit(node, start, i, true);
                return matched_nodes;
            }

            assert.ok(!this.isSuccess());
            return [];
        } finally {
            this.pattern_set_node_parse_stack.pop();
        }
    }

    parsePatternSeq(node: PatternSeq): ASTNode | null {
        const start = this.input.pos;
        const children: (ASTNode[] | ASTNode | null)[] = [];
        const seps: ASTNode[] = [];
        let left_enclosure: ASTNode | null = null;
        let right_enclosure: ASTNode | null = null;
        const bindings: Record<string, any> = {};

        const push_child = (child: ASTNode[] | ASTNode | null): void => {
            children.push(child);
        };

        if (node.enclosure !== null) {
            const left = this.parseSingleNode(node.enclosure[0], node.ignore);
            if (!this.isSuccess() || left === null) {
                this.input.pos = start;
                return null;
            }
            left_enclosure = left;
        }

        const body_start = this.input.pos;
        let last_sep_end: number = body_start;
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
                if (i === node.sub_nodes.length - 1 && node.enclosure !== null) {
                    ends.push(node.enclosure[1]);
                }
            }
            const parse_res = this.parseNode(sub_node, q, node.ignore, node.sep, ends);
            const ast_res = parse_res.ast_node_res;
            if (!this.isSuccess()) {
                this.input.pos = start;
                return null;
            }

            seps.push(...parse_res.seps);
            push_child(ast_res);
            let next_i = i;
            if (parse_res.end_idx >= 0) {
                const end_node_idx = i + 1 + parse_res.end_idx;
                for (let j = i + 1; j < end_node_idx; j++) {
                    const qj = node.sub_quantifiers[j] as Quantifier;
                    push_child(qj === "*" ? [] : null);
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

        const body_end = this.input.pos;
        if (node.enclosure !== null) {
            const right = this.parseSingleNode(node.enclosure[1], node.ignore);
            if (!this.isSuccess() || right === null) {
                this.input.pos = start;
                return null;
            }
            right_enclosure = right;
        }

        if (node.sub_node_bindings !== null) {
            for (let i = 0; i < node.sub_node_bindings.length; i++) {
                const binding = node.sub_node_bindings[i];
                const isolated = node.sub_node_isolated_scope_flags?.[i] ?? true;
                if (!isolated) {
                    const child = children[i];
                    assert.ok(!Array.isArray(child), "non-isolated repeated PatternSeq binding scope is not implemented yet");
                    if (child !== null) {
                        Object.assign(bindings, child.bindings);
                    }
                }
                if (binding === null) {
                    continue;
                }
                assert.ok(!Object.prototype.hasOwnProperty.call(bindings, binding), `duplicate PatternSeq binding: ${binding}`);
                bindings[binding] = children[i];
            }
        }

        let value: any = node.raw
            ? this.input.src.slice(body_start, body_end)
            : children;
        if (node.assignment_map !== null) {
            if (typeof node.assignment_map === "string") {
                if (Object.prototype.hasOwnProperty.call(bindings, node.assignment_map)) {
                    value = bindings[node.assignment_map];
                }
            } else {
                value = {};
                for (const [target, source] of node.assignment_map) {
                    if (Object.prototype.hasOwnProperty.call(bindings, source)) {
                        value[target] = bindings[source];
                    }
                }
            }
        }

        this.setSuccess();
        return {
            parser_nodes: [node],
            range: [start, this.input.pos],
            value,
            raw_value: children,
            seps,
            enclosure: node.enclosure !== null
                ? [left_enclosure!, right_enclosure!]
                : null,
            associate_enclosures: null,
            bindings: bindings,
        };
    }

    /**
     * Character matching: match according to quantifier and merge into a string, returns an ASTNode (value/raw_value is the matched string); 
     *
     * 字符匹配：按量词匹配并合并为字符串，返回 `ASTNode`（`value` / `raw_value` 为被匹配的字符串）。
     */
    parseCharMatchNode(
        node: GeneralCharMatchNode,
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
                enclosure: null,
                associate_enclosures: null,
                bindings: {},
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
     * ============================== EN ==============================
     *
     * Extended CharMatch parsing used by parseNode.
     *
     * Return shape convention:
     * - When ignored is null, return a single merged ASTNode for matched runs with `*` / `+` quantifiers.
     * - If non-greedy ends stops a `*` quantifier before any character is consumed, return null.
     * - When ignored is non-null, return ASTNode[] for `*` / `+` quantifiers so runs split by ignored text stay separate;
     *   zero matched runs are represented as [].
     *
     * ============================== 中文 ==============================
     *
     * parseNode 使用的扩展字符匹配。
     *
     * 返回形状约定：
     * - ignored 为空时，量词为 `*` 或 `+` 的匹配返回合并后的单个 ASTNode。
     * - 非贪婪 ends 让 `*` 量词在消费任何字符前停止时，返回 null。
     * - ignored 非空时，量词为 `*` 或 `+` 的匹配返回 ASTNode[]，以保留被 ignored 文本分隔的多段结果；
     *   零段匹配表示为 []。
     */
    parseCharMatchNodeEx(
        node: GeneralCharMatchNode,
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
                enclosure: null,
                associate_enclosures: null,
                bindings: {},
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
            if (ignored !== null) {
                ret.ast_node_res = [];
            }
            return ret;
        }

        const first = make_ast_node(match_res.start);
        if (single) {
            ret.ast_node_res = first;
            return ret;
        }

        if (ignored === null) {
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
     * ============================== EN ==============================
     *
     * Match `node` many times. On each failed match, try consuming `ignored` once until matching succeeds or cannot succeed even after ignoring.
     * If matching succeeds, keep matching until failure. On success, at least one `node` is matched.
     * See `ParseCharMatchNodeConsecutiveResult` for the return value.
     *
     * ============================== 中文 ==============================
     *
     * 多次匹配 `node`。每次匹配失败时，尝试忽略一次 `ignored` 节点，直到匹配成功，或即使忽略也不可能匹配成功。
     * 如果匹配成功，则重复匹配直到失败。成功时至少匹配到一次 `node`。
     * 返回值参考 `ParseCharMatchNodeConsecutiveResult` 定义。
     */
    parseCharMatchNodeConsecutive(
        node: GeneralCharMatchNode,
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

    parseSingleCharMatchNode(node: GeneralCharMatchNode): ParserNode[] {
        if (node.kind === ParserNodeKind.CharMatchSet) {
            return this.parseCharMatchSet(node as CharMatchSet);
        }
        if (node.kind === ParserNodeKind.PatternSet) {
            return this.parseCharMatchPatternSet(node as PatternSet);
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
     * Match a fixed `CharSeq.literal` once (`startsWith` at current byte offset in the binary-string model).
     * Quantifiers are handled in `parseNode`, like `PatternSeq`.
     *
     * 匹配 `CharSeq.literal` 一次（在二进制串模型下于当前字节偏移处 `startsWith`）。
     * 量词在 `parseNode` 中处理，与 `PatternSeq` 相同。
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
            enclosure: null,
            associate_enclosures: null,
            bindings: {},
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
