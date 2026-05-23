import {
  AnyChar,
  ParserNodeKind,
  completeCharRange,
  completeCharSeq,
  completeCharSet,
  completePatternSeq,
  completePatternSet,
} from "./parser_node";
import type {
  CharMatchRange,
  CharMatchSet,
  ParserNode,
  PatternSeq,
  PatternSet,
} from "./parser_node";

function incompletePatternSet(overrides: Partial<PatternSet> = {}): PatternSet {
  return {
    kind: ParserNodeKind.PatternSet,
    name: "",
    sub_nodes: [],
    neg_flags: [],
    charset_flag: false,
    associateby: null,
    ignore: null,
    ...overrides,
  };
}

function literal(value: string) {
  return completeCharSeq({ literal: value });
}

function pair(text: string): [ParserNode, ParserNode] {
  if ([...text].length !== 2) {
    throw new Error(`pair: expected exactly two characters, got ${JSON.stringify(text)}`);
  }
  const chars = [...text];
  return [literal(chars[0]!), literal(chars[1]!)];
}

// Digit=0~9;
export const Digit: CharMatchRange = completeCharRange({ start: "0", end: "9" });

// Letter={a~z;A~Z;"_";OtherLanguageLetter};
export const OtherLanguageLetter: CharMatchRange = completeCharRange({ start: "\u0080" });
export const Letter: CharMatchSet = completeCharSet({
  sub_nodes: [
    completeCharRange({ start: "a", end: "z" }),
    completeCharRange({ start: "A", end: "Z" }),
    completeCharSet({ sub_nodes: "_" }),
    OtherLanguageLetter,
  ],
});

// SymbolChar={Letter;Digit};
export const SymbolChar: CharMatchSet = completeCharSet({ sub_nodes: [Letter, Digit] });

// SpaceChar= \oneof " \t\v\r\n";
export const SpaceChar: CharMatchSet = completeCharSet({ sub_nodes: " \t\v\r\n" });

// Delimiter=";";
export const Delimiter = literal(";");

// LineDelimiter={"\n";"\r\n"};
export const LineDelimiter: PatternSet = completePatternSet({
  sub_nodes: [literal("\n"), literal("\r\n")],
});

// CommentPrefix="\\\\";
export const CommentPrefix = literal("\\\\");

// StringEscapePrefix="\\";
export const StringEscapePrefix = literal("\\");

// Space=SpaceChar+;
export const Space: PatternSeq = completePatternSeq({
  sub_nodes: [SpaceChar],
  sub_quantifiers: "+",
});

// DigitLiteral=Digit+;
export const DigitLiteral: PatternSeq = completePatternSeq({
  sub_nodes: [Digit],
  sub_quantifiers: "+",
  raw: true,
});

// Symbol=\raw (Letter,SymbolChar*);
export const Symbol: PatternSeq = completePatternSeq({
  sub_nodes: [Letter, SymbolChar],
  sub_quantifiers: " *",
  raw: true,
});

// SymbolDotChain=(symbols:Symbol+ \sep ".")=>symbols;
export const SymbolDotChain: PatternSeq = completePatternSeq({
  sub_nodes: [Symbol],
  sub_quantifiers: "+",
  sep: literal("."),
  sub_node_bindings: ["symbols"],
  assignment_map: "symbols",
});

// GeneralSymbol={Symbol;SymbolDotChain};
export const GeneralSymbol: PatternSet = completePatternSet({
  sub_nodes: [Symbol, SymbolDotChain],
});

// Comment=(CommentPrefix,comment:AnyChar*,LineDelimiter?)=>comment;
export const Comment: PatternSeq = completePatternSeq({
  sub_nodes: [CommentPrefix, AnyChar, LineDelimiter],
  sub_quantifiers: " *?",
  sub_node_bindings: [null, "comment", null],
  assignment_map: "comment",
});

// Ignorable={Space;Comment};
export const Ignorable: PatternSet = completePatternSet({
  sub_nodes: [Space, Comment],
});

// Recursive grammar placeholders.
export const Expr: PatternSet = incompletePatternSet();
export const Pattern: PatternSet = incompletePatternSet({
  associateby: pair("()"),
  ignore: Ignorable,
});
export const CharSet: PatternSet = incompletePatternSet({
  associateby: pair("()"),
  ignore: Ignorable,
});
// EscapeChar=("\\", c:AnyChar)=>c;
export const EscapeChar: PatternSeq = completePatternSeq({
  sub_nodes: [StringEscapePrefix, AnyChar],
  sub_quantifiers: "  ",
  sub_node_bindings: [null, "c"],
  assignment_map: "c",
});

// {-EscapeChar; -"\""; AnyChar}
export const NonEscapeChar: PatternSet = completePatternSet({
  sub_nodes: [EscapeChar, literal("\""), AnyChar],
  neg_flags: [true, true, false],
});

export const NonEscapeText: PatternSeq = completePatternSeq({
  sub_nodes: [NonEscapeChar],
  sub_quantifiers: "+",
});

// StringLiteral=(text:{EscapeChar; {-EscapeChar; -"\""; AnyChar}+}* \enclosedby "\"\"")=>text;
export const StringTextPiece: PatternSet = completePatternSet({
  sub_nodes: [EscapeChar, NonEscapeText],
});
export const StringLiteral: PatternSeq = completePatternSeq({
  sub_nodes: [StringTextPiece],
  sub_quantifiers: "*",
  enclosure: [literal("\""), literal("\"")],
  sub_node_bindings: ["text"],
  assignment_map: "text",
});

// GeneralChar={SymbolChar;StringLiteral;};
export const GeneralChar: PatternSet = completePatternSet({
  sub_nodes: [SymbolChar, StringLiteral],
});

// CharRange=(first:GeneralChar, "~", last:GeneralChar)=>[.first=first, .last=last];
export const CharRange: PatternSeq = completePatternSeq({
  sub_nodes: [GeneralChar, literal("~"), GeneralChar],
  sub_quantifiers: "   ",
  sub_node_bindings: ["first", null, "last"],
  assignment_map: new Map([
    ["first", "first"],
    ["last", "last"],
  ]),
});

// FieldAssignment=(".", symbol:Symbol, "=", expr:Expr \ignore Ignorable)=>[.target=symbol, .source=expr];
export const FieldAssignment: PatternSeq = completePatternSeq({
  sub_nodes: [literal("."), Symbol, literal("="), Expr],
  sub_quantifiers: "    ",
  ignore: Ignorable,
  sub_node_bindings: [null, "symbol", null, "expr"],
  assignment_map: new Map([
    ["target", "symbol"],
    ["source", "expr"],
  ]),
});

// Struct=(field_assignments:FieldAssignment* \sep "," \ignore Ignorable \enclosedby "[]")=>field_assignments;
export const Struct: PatternSeq = completePatternSeq({
  sub_nodes: [FieldAssignment],
  sub_quantifiers: "*",
  sep: literal(","),
  ignore: Ignorable,
  enclosure: pair("[]"),
  sub_node_bindings: ["field_assignments"],
  assignment_map: "field_assignments",
});

// ("\\oneof", string:StringLiteral \sep Space)=>string
export const OneOfCharSet: PatternSeq = completePatternSeq({
  sub_nodes: [literal("\\oneof"), StringLiteral],
  sub_quantifiers: "  ",
  sep: Space,
  sub_node_bindings: [null, "string"],
  assignment_map: "string",
});

// Option=(pattern:Pattern, "?")=>pattern;
export const Option: PatternSeq = completePatternSeq({
  sub_nodes: [Pattern, literal("?")],
  sub_quantifiers: "  ",
  sub_node_bindings: ["pattern", null],
  assignment_map: "pattern",
});

// OneOrMany=(pattern:Pattern, "+")=>pattern;
export const OneOrMany: PatternSeq = completePatternSeq({
  sub_nodes: [Pattern, literal("+")],
  sub_quantifiers: "  ",
  sub_node_bindings: ["pattern", null],
  assignment_map: "pattern",
});

// Many=(pattern:Pattern, "*")=>pattern;
export const Many: PatternSeq = completePatternSeq({
  sub_nodes: [Pattern, literal("*")],
  sub_quantifiers: "  ",
  sub_node_bindings: ["pattern", null],
  assignment_map: "pattern",
});

// RawPattern=("\\raw", pattern:Pattern \ignore Ignorable)=>pattern;
export const RawPattern: PatternSeq = completePatternSeq({
  sub_nodes: [literal("\\raw"), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: "pattern",
});

// AssociateByPart=("\\associateby", pattern:Pattern \ignore Ignorable)=>pattern;
export const AssociateByPart: PatternSeq = completePatternSeq({
  sub_nodes: [literal("\\associateby"), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: "pattern",
});

// NegPattern=("-", pattern:Pattern \ignore Ignorable)=>[.pattern=pattern];
export const NegPattern: PatternSeq = completePatternSeq({
  sub_nodes: [literal("-"), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: new Map([["pattern", "pattern"]]),
});

// NonGreedyPattern=(pattern:Pattern, "^")=>pattern;
export const NonGreedyPattern: PatternSeq = completePatternSeq({
  sub_nodes: [Pattern, literal("^")],
  sub_quantifiers: "  ",
  sub_node_bindings: ["pattern", null],
  assignment_map: "pattern",
});

// sepPart=("\\sep", pattern:Pattern \ignore Ignorable)=>pattern;
export const SepPart: PatternSeq = completePatternSeq({
  sub_nodes: [literal("\\sep"), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: "pattern",
});

// IgnorePart=("\\ignore", pattern:Pattern \ignore Ignorable)=>pattern;
export const IgnorePart: PatternSeq = completePatternSeq({
  sub_nodes: [literal("\\ignore"), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: "pattern",
});

// EnclosedbyPart=("\\enclosedby", pattern:Pattern \ignore Ignorable)=>pattern;
export const EnclosedbyPart: PatternSeq = completePatternSeq({
  sub_nodes: [literal("\\enclosedby"), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: "pattern",
});

export const PatternSeqPatterns: PatternSeq = completePatternSeq({
  sub_nodes: [Pattern],
  sub_quantifiers: "+",
  sep: literal(","),
  ignore: Ignorable,
  sub_node_bindings: ["patterns"],
  assignment_map: "patterns",
});

// PatternSeq=((patterns:Pattern+ \sep "," \ignore Ignorable), sep_part:sepPart?, ignore_part:IgnorePart?, enclosedby_part:EnclosedbyPart? \ignore Ignorable)=>...
export const PatternSeqNode: PatternSeq = completePatternSeq({
  sub_nodes: [PatternSeqPatterns, SepPart, IgnorePart, EnclosedbyPart],
  sub_quantifiers: " ???",
  ignore: Ignorable,
  sub_node_bindings: ["patterns", "sep_part", "ignore_part", "enclosedby_part"],
  assignment_map: new Map([
    ["patterns", "patterns"],
    ["sep", "sep_part"],
    ["ignore", "ignore_part"],
    ["enclosedby", "enclosedby_part"],
  ]),
});

export const PatternSetPatterns: PatternSeq = completePatternSeq({
  sub_nodes: [Pattern],
  sub_quantifiers: "*",
  sep: literal(";"),
  ignore: Ignorable,
  sub_node_bindings: ["patterns"],
  assignment_map: "patterns",
});

// PatternSet=((patterns:Pattern* \sep ";" \ignore Ignorable), associateby_part:AssociateByPart?, ignore_part:IgnorePart? \ignore Ignorable \enclosedby "{}")=>...
export const PatternSetNode: PatternSeq = completePatternSeq({
  sub_nodes: [PatternSetPatterns, AssociateByPart, IgnorePart],
  sub_quantifiers: " ??",
  ignore: Ignorable,
  enclosure: pair("{}"),
  sub_node_bindings: ["patterns", "associateby_part", "ignore_part"],
  assignment_map: new Map([
    ["patterns", "patterns"],
    ["associateby", "associateby_part"],
    ["ignore", "ignore_part"],
  ]),
});

// PatternBinding=(symbol:Symbol,":",pattern:Pattern)=>[.symbol=symbol, .pattern=pattern];
export const PatternBinding: PatternSeq = completePatternSeq({
  sub_nodes: [Symbol, literal(":"), Pattern],
  sub_quantifiers: "   ",
  sub_node_bindings: ["symbol", null, "pattern"],
  assignment_map: new Map([
    ["symbol", "symbol"],
    ["pattern", "pattern"],
  ]),
});

// Rule=(pattern:PatternSeq,"=>",returned:Expr)=>[.pattern=pattern, .returned=returned];
export const Rule: PatternSeq = completePatternSeq({
  sub_nodes: [PatternSeqNode, literal("=>"), Expr],
  sub_quantifiers: "   ",
  sub_node_bindings: ["pattern", null, "returned"],
  assignment_map: new Map([
    ["pattern", "pattern"],
    ["returned", "returned"],
  ]),
});

// List=(exprs:Expr* \sep "," \ignore Ignorable \enclosedby "[]")=>exprs;
export const List: PatternSeq = completePatternSeq({
  sub_nodes: [Expr],
  sub_quantifiers: "*",
  sep: literal(","),
  ignore: Ignorable,
  enclosure: pair("[]"),
  sub_node_bindings: ["exprs"],
  assignment_map: "exprs",
});

// Assignment = { (symbol:Symbol, "=", expr:Expr \ignore Ignorable)=>[.target=symbol, .source=expr]; };
export const AssignmentPattern: PatternSeq = completePatternSeq({
  sub_nodes: [Symbol, literal("="), Expr],
  sub_quantifiers: "   ",
  ignore: Ignorable,
  sub_node_bindings: ["symbol", null, "expr"],
  assignment_map: new Map([
    ["target", "symbol"],
    ["source", "expr"],
  ]),
});
export const Assignment: PatternSet = completePatternSet({
  sub_nodes: [AssignmentPattern],
});

// FuncCallArgsList=(args:Expr* \sep "," \ignore Ignorable \enclosedby "()")=>args;
export const FuncCallArgsList: PatternSeq = completePatternSeq({
  sub_nodes: [Expr],
  sub_quantifiers: "*",
  sep: literal(","),
  ignore: Ignorable,
  enclosure: pair("()"),
  sub_node_bindings: ["args"],
  assignment_map: "args",
});

// FuncCallExpr=(func:GeneralSymbol, args_list:FuncCallArgsList \ignore Ignorable)=>[.func=func, .args_list=args_list];
export const FuncCallExpr: PatternSeq = completePatternSeq({
  sub_nodes: [GeneralSymbol, FuncCallArgsList],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: ["func", "args_list"],
  assignment_map: new Map([
    ["func", "func"],
    ["args_list", "args_list"],
  ]),
});

// Keyword={...};
export const Keyword: PatternSet = completePatternSet({
  sub_nodes: [
    literal("\\oneof"),
    literal("\\sep"),
    literal("\\ignore"),
    literal("\\enclosedby"),
    literal("\\associateby"),
    literal("\\raw"),
  ],
});

// CharSet = { CharRange; ("\\oneof", string:StringLiteral \sep Space)=>string; GeneralSymbol; \associateby "()"; \ignore Ignorable; };
CharSet.sub_nodes.push(CharRange, OneOfCharSet, GeneralSymbol);
CharSet.neg_flags.push(false, false, false);

// Pattern={NegPattern;Option;OneOrMany;Many;RawPattern;Rule;PatternBinding; PatternSeq;PatternSet;CharSet;StringLiteral \associateby "()" \ignore Ignorable};
Pattern.sub_nodes.push(
  NegPattern,
  Option,
  OneOrMany,
  Many,
  RawPattern,
  Rule,
  PatternBinding,
  PatternSeqNode,
  PatternSetNode,
  CharSet,
  StringLiteral,
);
Pattern.neg_flags.push(false, false, false, false, false, false, false, false, false, false, false);

// Expr={ Assignment; FuncCallExpr; List; Struct; Pattern; FuncCallArgsList; GeneralSymbol; };
Expr.sub_nodes.push(
  Assignment,
  FuncCallExpr,
  List,
  Struct,
  Pattern,
  FuncCallArgsList,
  GeneralSymbol,
);
Expr.neg_flags.push(false, false, false, false, false, false, false);

// Synx=(expr:Expr* \sep ";" \ignore Ignorable);
export const Synx: PatternSeq = completePatternSeq({
  sub_nodes: [Expr],
  sub_quantifiers: "*",
  sep: Delimiter,
  ignore: Ignorable,
  sub_node_bindings: ["expr"],
});
