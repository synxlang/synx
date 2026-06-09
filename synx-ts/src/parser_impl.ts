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

enum ParseActionKind {
    IGNORE,
    RECORD,     // 对于字符，相同ParserNode并且连续匹配总是合并到同一range
    REJECT,
}

// [number, number]用于记录连续子字符串
type ParsedValueType = [number, number] | ASTNode | null;

interface ParsedElement {
    slot: number;
    value: ParsedValueType;
}


interface ParseStageResult {
    parsed_elements: ParsedElement[];
}

interface ParseStageAction {
    kind: ParseActionKind;          // REJECT时，next_stage必须为null，整个stage失败
    next_stage: ParseStage | null;  // 非RECORD为null时表示为转移到下一个alt，如果为RECORD并且next_stage为null时表示成功
}

interface ParseStageAlt {
    node: ParserNode;
    value_slot: number;           // 记录的values对应索引
    not_null_success_action: ParseStageAction | null; // null 表示不可能的路径，会直接报错
    null_success_action: ParseStageAction | null; // null 表示不可能的路径，会直接报错
    fail_action: ParseStageAction | null; // null 表示不可能的路径，会直接报错
}

interface ParseStage {
    /**
     * 当前 stage 的候选列表，按顺序线性尝试，如果触发REJECT或则stage失败。
     * 当所有选项尝试后没有触发next_stage或者RECORD时，会尝试ignore_node，进行忽略重试，如果忽略失败也失败。
     * 当stage失败时，回滚到最新的rollback_before为true的stage解析前，没有则整体失败。
     */
    alts: ParseStageAlt[];
    ignore_node: ParserNode | null;
    rollback_before: boolean;
}

enum ParseValueSlot {
    IGNORE,
    SEP,
    LEFT_ENCLOSURE,
    RIGHT_ENCLOSURE,
    SUB_NODE_START,
}

interface PatternSeqParseInfo {
    entry_stage: ParseStage;
    single_child_flags: boolean[];
}

function completeParseStageAction(action: Partial<ParseStageAction>): ParseStageAction {
    assert.ok(action.kind !== undefined);
    if (action.next_stage === undefined) {
        action.next_stage = null;
    }
    return action as ParseStageAction;
}

function completeParseStageAlt(alt: Partial<ParseStageAlt>): ParseStageAlt {
    assert.ok(alt.node !== undefined);
    assert.ok(alt.value_slot !== undefined);
    if (alt.not_null_success_action === undefined) {
        alt.not_null_success_action = null;
    }
    if (alt.null_success_action === undefined) {
        alt.null_success_action = null;
    }
    if (alt.fail_action === undefined) {
        alt.fail_action = completeParseStageAction({ kind: ParseActionKind.IGNORE });
    }
    return alt as ParseStageAlt;
}

function completeParseStage(stage: Partial<ParseStage> | undefined = undefined): ParseStage {
    if (stage === undefined) {
        stage = {};
    }
    if (stage.alts === undefined) {
        stage.alts = [];
    }
    if (stage.ignore_node === undefined) {
        stage.ignore_node = null;
    }
    if (stage.rollback_before === undefined) {
        stage.rollback_before = false;
    }
    return stage as ParseStage;
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
    private pattern_seq_parse_info_cache = new Map<PatternSeq, PatternSeqParseInfo>();
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
            parse_node_res = this.parseSingleNodeSimple(root);
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
            const parse_node_res = this.parseSingleNodeSimple(node);

            if (this.isSuccess()) {
                results.push(parse_node_res as ASTNode);
            } else {
                this.input.pos = start + 1;
            }
        }

        this.setSuccess();
        return results;
    }

    parseStage(stage: ParseStage): ParseStageResult {
        const start = this.input.pos;
        const parsed_elements: ParsedElement[] = [];
        let last_value_node: ParserNode | null = null;
        let current_stage: ParseStage | null = stage;
        type RollbackRecord = {
            pos: number;
            parsed_elements_length: number;
            last_value_node: ParserNode | null;
            last_range_element_right_bound: number | null;
        };
        let rollback_record: RollbackRecord | null = null;

        const is_range_value = (value: ParsedValueType): value is [number, number] => {
            return Array.isArray(value);
        };

        const rollback = (): void => {
            assert.ok(rollback_record !== null);
            this.input.pos = rollback_record.pos;
            parsed_elements.length = rollback_record.parsed_elements_length;
            if (rollback_record.last_range_element_right_bound !== null) {
                const last_element = parsed_elements[parsed_elements.length - 1];
                assert.ok(is_range_value(last_element.value));
                last_element.value[1] = rollback_record.last_range_element_right_bound;
            }
            last_value_node = rollback_record.last_value_node;
        };

        while (current_stage !== null) {
            const stage_start_pos = this.input.pos;

            if (current_stage.rollback_before) {
                const last_element = parsed_elements[parsed_elements.length - 1];
                rollback_record = {
                    pos: stage_start_pos,
                    parsed_elements_length: parsed_elements.length,
                    last_value_node,
                    last_range_element_right_bound: last_element !== undefined && is_range_value(last_element.value)
                        ? last_element.value[1]
                        : null,
                };
            }

            for (; ;) {
                let action: ParseStageAction | null = null;
                const alt_start = this.input.pos;
                for (let i = 0; i < current_stage.alts.length; i++) {
                    const alt: ParseStageAlt = current_stage.alts[i]!;
                    let parsed_value: ParsedValueType = null;

                    if (isGeneralCharMatchNode(alt.node)) {
                        const char_start = this.input.pos;
                        this.parseSingleCharMatchNode(alt.node);
                        if (this.isSuccess()) {
                            assert.ok(this.input.pos > char_start);
                            parsed_value = [char_start, this.input.pos];
                        }
                    } else {
                        parsed_value = this.parseSingleNodeSimple(alt.node);
                    }

                    action = this.isSuccess()
                        ? parsed_value === null
                            ? alt.null_success_action
                            : alt.not_null_success_action
                        : alt.fail_action;
                    assert.ok(action !== null);

                    if (action.kind === ParseActionKind.RECORD) {
                        assert.ok(this.isSuccess(), "use IGNORE instead of RECORD when fail.");
                        const last_element = parsed_elements[parsed_elements.length - 1];
                        let merged = false;
                        if (
                            isGeneralCharMatchNode(alt.node)
                            && last_value_node === alt.node
                            && last_element !== undefined
                            && last_element.slot === alt.value_slot
                        ) {
                            assert.ok(is_range_value(last_element.value) && is_range_value(parsed_value));
                            if (last_element.value[1] === parsed_value[0]) {
                                last_element.value[1] = parsed_value[1];
                                merged = true;
                            }
                        }
                        if (!merged) {
                            parsed_elements.push({ slot: alt.value_slot, value: parsed_value });
                        }
                        last_value_node = alt.node;
                        break;
                    } else if (action.kind === ParseActionKind.IGNORE) {
                        if (action.next_stage !== null) {
                            break;
                        }
                    } else {
                        assert.ok(action.kind === ParseActionKind.REJECT);
                        break;
                    }
                }

                assert.ok(action !== null);
                if (action.next_stage === null) {
                    if (action.kind === ParseActionKind.REJECT) {
                        this.setError(alt_start);
                    } else if (action.kind === ParseActionKind.IGNORE) {
                        if (current_stage.ignore_node !== null) {
                            this.parseSingleNodeSimple(current_stage.ignore_node);
                            if (this.isSuccess()) {
                                continue;
                            }
                        }
                    }
                }

                current_stage = action.next_stage;
                if (!this.isSuccess() && rollback_record !== null) {
                    rollback();
                    this.setSuccess();
                }
                break;
            }
        }

        if (!this.isSuccess()) {
            this.input.pos = start;
        }
        return { parsed_elements };
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

                this.parseSingleNodeSimple(ignored);
                if (!this.isSuccess()) {
                    this.input.pos = start;
                    return complete_return(ret);
                }
                assert.ok(this.input.pos > retry_pos);
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
        } else if (node.kind === ParserNodeKind.PatternSeq) {
            ret = this.parsePatternSeq(node as PatternSeq);
        } else if (isGeneralCharMatchNode(node)) {
            ret = this.parseCharMatchNode(node, " ");
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
        const pattern_set_node_parse_stack_start_length = this.pattern_set_node_parse_stack.length;
        try {
            if (alt_idx >= node.sub_nodes.length) {
                this.setError(this.input.pos, "pattern set has no more alternatives");
                return null;
            }

            const parse_alternative = (): ASTNode | null => {
                let start = this.input.pos;
                for (let i = alt_idx; i < node.sub_nodes.length; i++) {
                    this.profileRecordPatternSetAlternativeEnter(node, node_start, i);
                    const child = this.parseSingleNode(node.sub_nodes[i]);
                    if (!this.isSuccess()) {
                        this.profileRecordPatternSetAlternativeExit(node, node_start, i, false);
                        continue;
                    }
                    if (node.neg_flags[i]) {
                        this.input.pos = start;
                        this.setError(this.input.pos, "negated alternative matched");
                        this.profileRecordPatternSetAlternativeExit(node, node_start, i, false);
                        return null;
                    }
                    assert.ok(child !==null);
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
                this.pattern_set_node_parse_stack.push({ node, pos: this.input.pos, alt_idx });
                return parse_alternative();
            }

            let body:ASTNode|null = null;
            const lefts: ASTNode[] = [];
            for(;;){
                this.pattern_set_node_parse_stack.push({ node, pos: this.input.pos, alt_idx });
                body = parse_alternative();
                if(this.isSuccess()){
                    break;
                }
                let left = this.parseSingleNode(node.associateby[0]);
                if(this.isSuccess()){
                    assert.ok(left !== null);
                    lefts.push(left);
                    continue;
                }
                if(node.ignore === null || lefts.length === 0){
                    this.input.pos = node_start;
                    return null;
                }
                this.parseSingleNodeSimple(node.ignore);
                if(!this.isSuccess()){
                    this.input.pos = node_start;
                    return null;
                }
            }
            assert.ok(body!==null);

            if (lefts.length === 0) {
                return body;
            }

            for (let i = lefts.length - 1; i >= 0; i--) {
                const right = this.parseSingleNode(node.associateby[1], node.ignore);
                if (!this.isSuccess()) {
                    this.input.pos = node_start;
                    return null;
                }
                assert.ok(right !== null);

                body.parser_nodes.push(node);
                body.range = [node_start, this.input.pos];
                if (body.associate_enclosures === null) {
                    body.associate_enclosures = [[lefts[i]], [right]];
                } else {
                    body.associate_enclosures[0].push(lefts[i]);
                    body.associate_enclosures[1].push(right);
                }
            }

            this.recordParse(body.range[0], body);
            this.setSuccess();
            return body;
        } finally {
            this.pattern_set_node_parse_stack.length = pattern_set_node_parse_stack_start_length;
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

    buildPatternSeqStage(node: PatternSeq): ParseStage {
        interface SubNodeStageInfo {
            node: ParserNode;
            slot: number;
            quantifier: ' ' | '?' | '*';
            greedy: boolean;
            try_seq_end: number;    // not included idx
        };
        let sub_node_stage_infos: SubNodeStageInfo[] = [];

        // calc sub_node_stage_infos
        {
            let partial_sub_node_stage_infos: Partial<SubNodeStageInfo>[] = [];
            for (let i = 0; i < node.sub_nodes.length; i++) {
                const quantifier = node.sub_quantifiers[i] as Quantifier;
                const sub_node = node.sub_nodes[i];
                const slot = ParseValueSlot.SUB_NODE_START + i;
                if (quantifier === '+') {
                    partial_sub_node_stage_infos.push({ node: sub_node, slot: slot, quantifier: ' ', greedy: true });
                    partial_sub_node_stage_infos.push({ node: sub_node, slot: slot, quantifier: '*', greedy: node.greedy_flags[i] });
                } else {
                    partial_sub_node_stage_infos.push({ node: sub_node, slot: slot, quantifier: quantifier, greedy: node.greedy_flags[i] });
                }
            }

            let last_try_seq_end = partial_sub_node_stage_infos.length;
            if (node.enclosure !== null) {
                last_try_seq_end += 1;
            }
            for (let i = partial_sub_node_stage_infos.length - 1; i >= 0; i--) {
                let info = partial_sub_node_stage_infos[i];
                if (info.quantifier === ' ') {
                    info.try_seq_end = last_try_seq_end = i + 1;
                } else {
                    info.try_seq_end = last_try_seq_end;
                }
            }
            sub_node_stage_infos = partial_sub_node_stage_infos as SubNodeStageInfo[];
        }


        // calc ParseStage
        let left_enclosure_stage: ParseStage | null = null;
        let right_enclosure_stage: ParseStage | null = null;
        let first_sub_node_stage: ParseStage | null = null;
        let sub_node_stages: ParseStage[] = [];
        let sep_stages: ParseStage[] = [];

        const entry_ignore_node = node.ignore_beginning ? node.ignore : null;

        if (node.enclosure !== null) {
            left_enclosure_stage = completeParseStage({ ignore_node: entry_ignore_node });
            right_enclosure_stage = completeParseStage({ ignore_node: node.ignore });
        }

        let optional_tail_sub_node_min_idx: number = Number.MAX_SAFE_INTEGER;
        if (right_enclosure_stage === null) {
            optional_tail_sub_node_min_idx = node.sub_nodes.length;
            for (let i = node.sub_nodes.length - 1; i >= 0; i--) {
                const q = node.sub_quantifiers[i];
                if ("?*".includes(q)) {
                    optional_tail_sub_node_min_idx = i;
                } else {
                    break;
                }
            }
        }

        const first_match_sub_node_stage_possible_rollback_before = right_enclosure_stage === null
            && sub_node_stage_infos.at(-1)?.quantifier !== ' ';

        if (sub_node_stage_infos.length > 0) {
            first_sub_node_stage = completeParseStage({
                rollback_before: first_match_sub_node_stage_possible_rollback_before
                    && sub_node_stage_infos[0].try_seq_end === sub_node_stage_infos.length,
                ignore_node: left_enclosure_stage === null
                    ? entry_ignore_node
                    : node.ignore
            });
        }

        const sub_node_stage_possible_rollback_before = right_enclosure_stage === null
            && (node.sep === null || node.accept_trailing_sep)
            && sub_node_stage_infos.at(-1)?.quantifier !== ' ';

        for (let i = 0; i < sub_node_stage_infos.length; i++) {
            sub_node_stages.push(completeParseStage({
                rollback_before: sub_node_stage_possible_rollback_before
                    && sub_node_stage_infos[i].try_seq_end === sub_node_stage_infos.length,
                ignore_node: node.ignore
            }));
        }

        const sep_stage_possible_rollback_before = right_enclosure_stage === null
            && (node.accept_trailing_sep || sub_node_stage_infos.at(-1)?.quantifier !== ' ');

        if (node.sep !== null) {
            for (let i = 0; i < sub_node_stage_infos.length; i++) {
                sep_stages.push(completeParseStage({
                    rollback_before: sep_stage_possible_rollback_before
                        && (sub_node_stage_infos[i + 1] ?? sub_node_stage_infos[i]).try_seq_end === sub_node_stage_infos.length,
                    ignore_node: node.ignore,
                }));
            }
        }


        // calc ParseStageAlt
        let left_enclosure_alt: ParseStageAlt | null = null;
        let right_enclosure_alt: ParseStageAlt | null = null;
        let sub_node_alts: ParseStageAlt[] = [];
        let sep_alts: ParseStageAlt[] = [];

        if (node.enclosure !== null) {
            left_enclosure_alt = completeParseStageAlt({
                node: node.enclosure[0],
                value_slot: ParseValueSlot.LEFT_ENCLOSURE,
                not_null_success_action: completeParseStageAction({
                    kind: ParseActionKind.RECORD,
                    next_stage: first_sub_node_stage ?? sub_node_stages[0] ?? null
                }),
            });

            right_enclosure_alt = completeParseStageAlt({
                node: node.enclosure[1],
                value_slot: ParseValueSlot.RIGHT_ENCLOSURE,
                not_null_success_action: completeParseStageAction({
                    kind: ParseActionKind.RECORD
                }),
            });
        }

        function mk_sub_node_alt(sub_node: ParserNode, slot: number, next_stage: ParseStage | null): ParseStageAlt {
            let alt = completeParseStageAlt({
                node: sub_node,
                value_slot: slot,
            });
            alt.not_null_success_action = alt.null_success_action = completeParseStageAction({
                kind: ParseActionKind.RECORD,
                next_stage: next_stage
            });
            return alt;
        }

        function mk_sep_alt(next_stage: ParseStage | null): ParseStageAlt {
            assert.ok(node.sep !== null);
            let alt = completeParseStageAlt({
                node: node.sep,
                value_slot: ParseValueSlot.SEP,
                not_null_success_action: completeParseStageAction({
                    kind: ParseActionKind.RECORD,
                    next_stage: next_stage
                })
            });
            return alt;
        }

        for (let i = 0; i < sub_node_stage_infos.length; i++) {
            const info = sub_node_stage_infos[i];
            const sub_node = info.node;
            const q = info.quantifier;
            let sep_next_stage: ParseStage | null = null;
            let sub_node_next_stage: ParseStage | null = null;
            if (q === '*') {
                sep_next_stage = sub_node_stages[sub_node_alts.length];
            } else {
                sep_next_stage = sub_node_stages[sub_node_alts.length + 1] ?? right_enclosure_stage;
            }
            if (node.sep === null) {
                sub_node_next_stage = sep_next_stage;
            } else {
                sep_alts.push(mk_sep_alt(sep_next_stage));
                if (i === sub_node_stage_infos.length - 1
                    && !node.accept_trailing_sep
                    && ' ?'.includes(q)) {
                    sub_node_next_stage = right_enclosure_stage;
                } else {
                    sub_node_next_stage = sep_stages[sub_node_alts.length];
                }
            }
            const sub_node_alt = mk_sub_node_alt(sub_node, info.slot, sub_node_next_stage);
            sub_node_alts.push(sub_node_alt);
        }

        // assign stage.alts
        if (left_enclosure_stage !== null) {
            assert.ok(left_enclosure_alt !== null);
            left_enclosure_stage.alts.push(left_enclosure_alt);
        }

        if (right_enclosure_stage !== null) {
            assert.ok(right_enclosure_alt !== null);
            right_enclosure_stage.alts.push(right_enclosure_alt);
        }

        let sub_node_alt_candidates: ParseStageAlt[] = [];
        for (let i = 0; i < sub_node_alts.length; i++) {
            const i_start = i;
            for (; i < sub_node_alts.length; i++) {
                const info = sub_node_stage_infos[i];
                if (info.greedy) {
                    break;
                }
            }
            if (i >= sub_node_alts.length) {
                if (right_enclosure_alt !== null) {
                    sub_node_alt_candidates.push(right_enclosure_alt);
                }
                i = sub_node_alts.length - 1;
            }
            for (let j = i; j >= i_start; j--) {
                sub_node_alt_candidates.push(sub_node_alts[j]);
            }
        }
        if (right_enclosure_alt !== null && sub_node_alt_candidates.length < sub_node_alts.length + 1) {
            sub_node_alt_candidates.push(right_enclosure_alt);
        }

        for (let i = 0; i < sub_node_stages.length; i++) {
            const info = sub_node_stage_infos[i];
            let try_cnt = info.try_seq_end - i;
            sub_node_stages[i].alts = sub_node_alt_candidates.slice(0, try_cnt);
            if (i === 0 && first_sub_node_stage !== null) {
                first_sub_node_stage.alts = sub_node_alt_candidates.slice(0, try_cnt);
            }
            sub_node_alt_candidates.splice(sub_node_alt_candidates.findIndex(alt => alt === sub_node_alts[i]), 1);
        }

        for (let i = 0; i < sep_stages.length; i++) {
            let stage = sep_stages[i];
            stage.alts.push(sep_alts[i]);
        }

        if (left_enclosure_stage === null) {
            return first_sub_node_stage ?? sub_node_stages[0];
        } else {
            return left_enclosure_stage;
        }
    }

    buildPatternSeqParseInfo(node: PatternSeq): PatternSeqParseInfo {
        const single_child_flags: boolean[] = [];
        for (let i = 0; i < node.sub_nodes.length; i++) {
            const q = node.sub_quantifiers[i] as Quantifier;
            const sub_node = node.sub_nodes[i];
            single_child_flags.push(
                q === " " || q === "?"
                || (isGeneralCharMatchNode(sub_node) && node.sep === null && node.ignore === null)
            );
        }

        return {
            entry_stage: this.buildPatternSeqStage(node),
            single_child_flags,
        };
    }

    acquirePatternSeqParseInfo(node: PatternSeq): PatternSeqParseInfo {
        const cached = this.pattern_seq_parse_info_cache.get(node);
        if (cached !== undefined) {
            return cached;
        }

        const parse_info = this.buildPatternSeqParseInfo(node);
        this.pattern_seq_parse_info_cache.set(node, parse_info);
        return parse_info;
    }

    parsePatternSeq(node: PatternSeq): ASTNode | null {
        const start = this.input.pos;
        const bindings: Record<string, any> = {};
        const parse_info = this.acquirePatternSeqParseInfo(node);

        const is_range_value = (value: ParsedValueType): value is [number, number] => {
            return Array.isArray(value);
        };

        const make_ast_node = (parser_node: ParserNode, value: ParsedValueType): ASTNode | null => {
            if (value === null) {
                return null;
            }
            if (!is_range_value(value)) {
                return value;
            }
            return {
                parser_nodes: [parser_node],
                range: [value[0], value[1]],
                value: this.input.src.slice(value[0], value[1]),
                raw_value: this.input.src.slice(value[0], value[1]),
                seps: [],
                enclosure: null,
                associate_enclosures: null,
                bindings: {},
            };
        };

        const parse_res = this.parseStage(parse_info.entry_stage);
        if (!this.isSuccess()) {
            this.input.pos = start;
            return null;
        }

        const children: (ASTNode[] | ASTNode | null)[] = [];
        for (let i = 0; i < node.sub_nodes.length; i++) {
            if (parse_info.single_child_flags[i]) {
                children.push(null);
            } else {
                children.push([]);
            }
        }

        const seps: ASTNode[] = [];
        let left_enclosure: ASTNode | null = null;
        let right_enclosure: ASTNode | null = null;
        for (const element of parse_res.parsed_elements) {
            if (element.slot === ParseValueSlot.SEP) {
                assert.ok(node.sep !== null);
                seps.push(make_ast_node(node.sep, element.value)!);
            } else if (element.slot === ParseValueSlot.LEFT_ENCLOSURE) {
                assert.ok(node.enclosure !== null && left_enclosure === null);
                left_enclosure = make_ast_node(node.enclosure[0], element.value)!;
            } else if (element.slot === ParseValueSlot.RIGHT_ENCLOSURE) {
                assert.ok(node.enclosure !== null && right_enclosure === null);
                right_enclosure = make_ast_node(node.enclosure[1], element.value)!;
            } else if (element.slot >= ParseValueSlot.SUB_NODE_START) {
                const i = element.slot - ParseValueSlot.SUB_NODE_START;
                assert.ok(i >= 0 && i < node.sub_nodes.length);
                const sub_node = node.sub_nodes[i];
                const child = make_ast_node(sub_node, element.value);
                if (parse_info.single_child_flags[i]) {
                    children[i] = child;
                } else {
                    assert.ok(Array.isArray(children[i]));
                    children[i].push(child!);
                }
            }
        }

        let body_start: number = start;
        let body_end: number = start;
        for (const child of children) {
            if (child === null) {
                continue;
            }
            if (Array.isArray(child)) {
                if (child.length === 0) {
                    continue;
                }
                body_start = child[0].range[0];
            } else {
                body_start = child.range[0];
            }
            break;
        }

        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];
            if (child === null) {
                continue;
            }
            if (Array.isArray(child)) {
                if (child.length === 0) {
                    continue;
                }
                body_end = child.at(-1)!.range[1];
            } else {
                body_end = child.range[1];
            }
            break;
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
            bindings,
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
     *
     * 匹配 `CharSeq.literal` 一次（在二进制串模型下于当前字节偏移处 `startsWith`）。
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
