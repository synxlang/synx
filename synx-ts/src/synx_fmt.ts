import type { ASTNode } from "./parser";
import {
  ParserNodeKind,
  type CharSeq,
  type CharMatchNode,
  type CharMatchRange,
  type CharMatchSet,
  type ParserNode,
  type PatternSeq,
  type PatternSet,
} from "./parser_node";

type StringifyTarget = ParserNode | ASTNode | unknown;

type SeenState = {
  parser_nodes: WeakMap<object, number>;
  ast_nodes: WeakMap<object, number>;
  stack: WeakSet<object>;
  next_id: number;
};

/**
 * Stringifies parser nodes and AST nodes for readable diagnostics.
 * 将解析节点和 AST 节点转成便于诊断阅读的字符串。
 */
export class SynxFmt {
  static stringify(value: StringifyTarget): string {
    const seen: SeenState = {
      parser_nodes: new WeakMap<object, number>(),
      ast_nodes: new WeakMap<object, number>(),
      stack: new WeakSet<object>(),
      next_id: 1,
    };
    return stringifyValue(value, seen);
  }
}

function stringifyValue(value: unknown, seen: SeenState): string {
  if (isParserNode(value)) {
    return stringifyParserNode(value, seen);
  }
  if (isASTNode(value)) {
    return stringifyASTNode(value, seen);
  }
  if (Array.isArray(value)) {
    return stringifyArray(value, seen);
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  return stringifyPlainObject(value as Record<string, unknown>, seen);
}

function stringifyParserNode(node: ParserNode, seen: SeenState): string {
  return withObjectRef(node, seen.parser_nodes, seen, "ParserNode", (id) => {
    switch (node.kind) {
      case ParserNodeKind.AnyChar:
        return `#${id} AnyChar`;
      case ParserNodeKind.CharMatchRange:
        return stringifyCharMatchRange(node as CharMatchRange, id);
      case ParserNodeKind.CharMatchSet:
        return stringifyCharMatchSet(node as CharMatchSet, id, seen);
      case ParserNodeKind.PatternSeq:
        return stringifyPatternSeq(node as PatternSeq, id, seen);
      case ParserNodeKind.CharSeq:
        return stringifyCharSeq(node as CharSeq, id);
      case ParserNodeKind.PatternSet:
        return stringifyPatternSet(node as PatternSet, id, seen);
      default:
        return `#${id} UnknownParserNode(${stringifyPlainObject(node as unknown as Record<string, unknown>, seen)})`;
    }
  });
}

function stringifyCharMatchRange(node: CharMatchRange, id: number): string {
  return `#${id} CharMatchRange(${quote(node.start)}~${quote(node.end)})`;
}

function stringifyCharMatchSet(node: CharMatchSet, id: number, seen: SeenState): string {
  if (typeof node.sub_nodes === "string") {
    return `#${id} CharMatchSet(${quote(node.sub_nodes)})`;
  }
  return `#${id} CharMatchSet(${stringifyArray(node.sub_nodes, seen)})`;
}

function stringifyCharSeq(node: CharSeq, id: number): string {
  return `#${id} CharSeq(${quote(node.literal)})`;
}

function stringifyPatternSeq(node: PatternSeq, id: number, seen: SeenState): string {
  return [
    `#${id} PatternSeq(`,
    indentLines([
      `sub_nodes: ${stringifyArray(node.sub_nodes, seen)},`,
      `sub_quantifiers: ${quote(node.sub_quantifiers)},`,
      `raw: ${String(node.raw)},`,
      `sep: ${stringifyNullable(node.sep, seen)},`,
      `accept_trailing_sep: ${String(node.accept_trailing_sep)},`,
      `ignore: ${stringifyNullable(node.ignore, seen)},`,
      `greedy_flags: ${stringifyArray(node.greedy_flags, seen)},`,
      `enclosure: ${stringifyNullableTuple(node.enclosure, seen)},`,
    ]),
    ")",
  ].join("\n");
}

function stringifyPatternSet(node: PatternSet, id: number, seen: SeenState): string {
  return [
    `#${id} PatternSet(`,
    indentLines([
      `sub_nodes: ${stringifyArray(node.sub_nodes, seen)},`,
      `neg_flags: ${stringifyArray(node.neg_flags, seen)},`,
    ]),
    ")",
  ].join("\n");
}

function stringifyASTNode(node: ASTNode, seen: SeenState): string {
  return withObjectRef(node, seen.ast_nodes, seen, "ASTNode", (id) => {
    return [
      `#${id} ASTNode(`,
      indentLines([
        `parser_nodes: ${stringifyArray(node.parser_nodes, seen)},`,
        `range: ${stringifyArray(node.range, seen)},`,
        `value: ${stringifyValue(node.value, seen)},`,
        `raw_value: ${stringifyValue(node.raw_value, seen)},`,
        `seps: ${stringifyArray(node.seps, seen)},`,
        `enclosure: ${stringifyNullableTuple(node.enclosure, seen)},`,
        `associate_enclosures: ${stringifyNullableTuple(node.associate_enclosures, seen)},`,
        `bindings: ${stringifyPlainObject(node.bindings, seen)},`,
      ]),
      ")",
    ].join("\n");
  });
}

function withObjectRef(
  object: object,
  refs: WeakMap<object, number>,
  seen: SeenState,
  label: string,
  body: (id: number) => string,
): string {
  const existing_id = refs.get(object);
  if (existing_id !== undefined) {
    if (seen.stack.has(object)) {
      return `#${existing_id} ${label}<recursive>`;
    }
    return `#${existing_id} ${label}<ref>`;
  }

  const id = seen.next_id++;
  refs.set(object, id);
  seen.stack.add(object);
  try {
    return body(id);
  } finally {
    seen.stack.delete(object);
  }
}

function stringifyArray(values: readonly unknown[], seen: SeenState): string {
  if (values.length === 0) {
    return "[]";
  }
  const rendered = values.map((value) => stringifyValue(value, seen));
  if (rendered.every((value) => !value.includes("\n")) && rendered.join(", ").length <= 100) {
    return `[${rendered.join(", ")}]`;
  }
  return ["[", indentLines(rendered.map((value) => `${value},`)), "]"].join("\n");
}

function stringifyPlainObject(value: Record<string, unknown>, seen: SeenState): string {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return "{}";
  }
  return [
    "{",
    indentLines(entries.map(([key, item]) => `${key}: ${stringifyValue(item, seen)},`)),
    "}",
  ].join("\n");
}

function stringifyNullable(value: ParserNode | null, seen: SeenState): string {
  return value === null ? "null" : stringifyParserNode(value, seen);
}

function stringifyNullableTuple<T extends unknown>(value: [T, T] | null, seen: SeenState): string {
  return value === null ? "null" : stringifyArray(value, seen);
}

function indentLines(lines: string[]): string {
  return lines
    .join("\n")
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function isParserNode(value: unknown): value is ParserNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof (value as { kind: unknown }).kind === "number" &&
    (value as { kind: number }).kind >= ParserNodeKind.AnyChar &&
    (value as { kind: number }).kind < ParserNodeKind.ParserNodeKindEnd
  );
}

function isASTNode(value: unknown): value is ASTNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "parser_nodes" in value &&
    "range" in value &&
    "value" in value &&
    "raw_value" in value &&
    "seps" in value &&
    "enclosure" in value &&
    "associate_enclosures" in value &&
    "bindings" in value
  );
}
