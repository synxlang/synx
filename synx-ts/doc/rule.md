# Coding conventions

## Naming conventions

- Types use `PascalCase`.
- Variables use `SnakeCase`.

## Comment conventions

- Comments follow JSDoc; prefer `/** ... */`.
- Put English first, then Chinese.
- If the comment is at most three lines, English and Chinese may follow each other without an extra block separator.

```ts
/**
 * Parse a parser node at the current input position.
 * 在当前输入位置解析一个解析节点。
 */
```

- If the comment is longer than three lines, the English and Chinese parts require block markers.
- Block markers: English block `============================== EN ==============================`, Chinese block `============================== 中文 ==============================`

```ts
/**
 * ============================== EN ==============================
 *
 * Parse a parser node at the current input position.
 *
 * The input position may be restored when parsing fails.
 * The returned result records whether an end node is hit.
 *
 * ============================== 中文 ==============================
 *
 * 在当前输入位置解析一个解析节点。
 *
 * 解析失败时，输入位置可能会被恢复。
 * 返回结果会记录是否命中了结束节点。
 */
```

- `@param` / `@returns` must also use a full English block first, then a full Chinese block—do not interleave English and Chinese line by line.

```ts
/**
 * ============================== EN ==============================
 *
 * Check whether any end node can match without consuming input.
 *
 * @param ends End node candidates.
 * @returns The matched end node and its index.
 *
 * ============================== 中文 ==============================
 *
 * 检查是否有结束节点可以在不消费输入的情况下匹配。
 *
 * @param ends 结束节点候选列表。
 * @returns 命中的结束节点及其索引。
 */
```

## Testing conventions

- The `unit_test` directory holds unit tests.
- Unit tests should use clear assertions; they suit stable, automatically checkable behavior.
- The `manual_test` directory holds scripts that rely on human inspection of output.
- Those scripts should print enough intermediate and final output to judge whether complex behavior looks right.
- Temporary, exploratory, or edge-case observation scripts may live under `manual_test/draft`.
