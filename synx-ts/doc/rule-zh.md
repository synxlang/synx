# 代码编写约定

## 命名约定

- 类型使用 `PascalCase`
- 变量使用 `SnakeCase`

## 注释约定

- 注释以 JSDoc 为标准，优先使用 `/** ... */`。
- 注释内容采用英文在上、中文在下的顺序。
- 如果注释不超过三行，中英说明可以连续书写，不需要额外分隔。

```ts
/**
 * Parse a parser node at the current input position.
 * 在当前输入位置解析一个解析节点。
 */
```

- 如果注释超过三行，英文部分和中文部分之间必须使用分隔标记。
- 分隔标记统一使用 `---`。

```ts
/**
 * Parse a parser node at the current input position.
 *
 * The input position may be restored when parsing fails.
 * The returned result records whether an end node is hit.
 *
 * ---
 *
 * 在当前输入位置解析一个解析节点。
 *
 * 解析失败时，输入位置可能会被恢复。
 * 返回结果会记录是否命中了结束节点。
 */
```

- 参数和返回值说明也必须先写完整英文块，再写完整中文块，不能中英逐项交错。

```ts
/**
 * Check whether any end node can match without consuming input.
 *
 * @param ends End node candidates.
 * @returns The matched end node and its index.
 *
 * ---
 *
 * 检查是否有结束节点可以在不消费输入的情况下匹配。
 *
 * @param ends 结束节点候选列表。
 * @returns 命中的结束节点及其索引。
 */
```

## 测试约定

- `unit_test` 目录用于放置单元测试。
- 单元测试应当有明确断言，适合验证稳定、可自动判断的行为。
- `manual_test` 目录用于放置依赖人工观察输出的测试脚本。
- 人工观察脚本应当打印足够多的中间结果和最终结果，方便判断复杂行为是否符合预期。
- 临时、探索性、用于观察边界情况的脚本可以放在 `manual_test/draft` 下。
