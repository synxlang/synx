import {
  AnyChar,
  completeCharRange,
  completeCharSeq,
  completeCharMatchSet,
  completePatternSeq,
  completePatternSet,
} from "./parser_node";
import * as PARSER_NODE_TYPE from "./parser_node";

// Digit=0~9;
export const Digit: PARSER_NODE_TYPE.CharMatchRange = completeCharRange({ name: "Digit", start: "0", end: "9" });

// Letter={a~z;A~Z;"_";OtherLanguageLetter};
export const OtherLanguageLetter: PARSER_NODE_TYPE.CharMatchRange = completeCharRange({ name: "OtherLanguageLetter", start: "\u0080" });
export const Letter: PARSER_NODE_TYPE.CharMatchSet = completeCharMatchSet({
  name: "Letter",
  sub_nodes: [
    completeCharRange({ name: "a~z", start: "a", end: "z" }),
    completeCharRange({ name: "A~Z", start: "A", end: "Z" }),
    completeCharMatchSet({ name: "\"_\"", sub_nodes: "_" }),
    OtherLanguageLetter,
  ],
});

// SymbolChar={Letter;Digit};
export const SymbolChar: PARSER_NODE_TYPE.CharMatchSet = completeCharMatchSet({ name: "SymbolChar", sub_nodes: [Letter, Digit] });

// SpaceChar= \oneof " \t\v\r\n";
export const SpaceChar: PARSER_NODE_TYPE.CharMatchSet = completeCharMatchSet({ name: "SpaceChar", sub_nodes: " \t\v\r\n" });

// Delimiter=";";
export const Delimiter = completeCharSeq({ name: "Delimiter", literal: ";" });

// LineDelimiter={"\n";"\r\n"};
export const LineDelimiter: PARSER_NODE_TYPE.PatternSet = completePatternSet({
  name: "LineDelimiter",
  sub_nodes: [completeCharSeq({ literal: "\n" }), completeCharSeq({ literal: "\r\n" })],
});

// CommentPrefix="\\\\";
export const CommentPrefix = completeCharSeq({ name: "CommentPrefix", literal: "\\\\" });

// StringEscapePrefix="\\";
export const StringEscapePrefix = completeCharSeq({ name: "StringEscapePrefix", literal: "\\" });

// Space=SpaceChar+;
export const Space: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "Space",
  sub_nodes: [SpaceChar],
  sub_quantifiers: "+",
});

// DigitLiteral=Digit+;
export const DigitLiteral: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "DigitLiteral",
  sub_nodes: [Digit],
  sub_quantifiers: "+",
});

// Symbol=\raw (Letter,SymbolChar*);
export const Symbol: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "Symbol",
  sub_nodes: [Letter, SymbolChar],
  sub_quantifiers: " *",
  raw: true,
});

// SymbolDotChain=(symbols:Symbol+ \sep ".")=>symbols;
export const SymbolDotChain: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "SymbolDotChain",
  sub_nodes: [Symbol],
  sub_quantifiers: "+",
  sep: completeCharSeq({ literal: "." }),
  sub_node_bindings: ["symbols"],
  transform: (ctx) => ctx.bindings.symbols,
});

// GeneralSymbol={Symbol;SymbolDotChain};
export const GeneralSymbol: PARSER_NODE_TYPE.PatternSet = completePatternSet({
  name: "GeneralSymbol",
  sub_nodes: [Symbol, SymbolDotChain],
});

// Comment=(CommentPrefix,comment:AnyChar*,LineDelimiter?)=>comment;
export const Comment: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "Comment",
  sub_nodes: [CommentPrefix, AnyChar, LineDelimiter],
  sub_quantifiers: " *?",
  sub_node_bindings: [null, "comment", null],
  transform: (ctx) => ctx.bindings.comment,
});

// Ignorable={Space;Comment};
export const Ignorable: PARSER_NODE_TYPE.PatternSet = completePatternSet({
  name: "Ignorable",
  sub_nodes: [Space, Comment],
});

// Recursive grammar placeholders.
export const Expr = { name: "Expr", sub_nodes: [], neg_flags: [] } as unknown as PARSER_NODE_TYPE.PatternSet;
export const Pattern = {
  name: "Pattern",
  sub_nodes: [],
  neg_flags: [],
  associateby: "()",
  ignore: Ignorable,
} as unknown as PARSER_NODE_TYPE.PatternSet;
export const CharSet = {
  name: "CharSet",
  sub_nodes: [],
  neg_flags: [],
  associateby: "()",
  ignore: Ignorable,
} as unknown as PARSER_NODE_TYPE.PatternSet;
// EscapeChar=("\\", c:AnyChar)=>c;
export const EscapeChar: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "EscapeChar",
  sub_nodes: [StringEscapePrefix, AnyChar],
  sub_quantifiers: "  ",
  sub_node_bindings: [null, "c"],
  transform: (ctx) => ctx.bindings.c,
});

// {-EscapeChar; -"\""; AnyChar}
const NonEscapeChar: PARSER_NODE_TYPE.PatternSet = completePatternSet({
  name: "{-EscapeChar; -\"\\\"\"; AnyChar}",
  sub_nodes: [EscapeChar, completeCharSeq({ literal: "\"" }), AnyChar],
  neg_flags: [true, true, false],
});

const NonEscapeText: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "{-EscapeChar; -\"\\\"\"; AnyChar}+",
  sub_nodes: [NonEscapeChar],
  sub_quantifiers: "+",
});

// StringLiteral=(text:{EscapeChar; {-EscapeChar; -"\""; AnyChar}+}* \enclosedby "\"\"")=>text;
const StringTextPiece: PARSER_NODE_TYPE.PatternSet = completePatternSet({
  name: "{EscapeChar; {-EscapeChar; -\"\\\"\"; AnyChar}+}",
  sub_nodes: [EscapeChar, NonEscapeText],
});
export const StringLiteral: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "StringLiteral",
  sub_nodes: [StringTextPiece],
  sub_quantifiers: "*",
  enclosure: "\"\"",
  sub_node_bindings: ["text"],
  transform: (ctx) => ctx.bindings.text,
});

// CharRangeBound={SymbolChar;StringLiteral};
export const CharRangeBound: PARSER_NODE_TYPE.PatternSet = completePatternSet({
  name: "CharRangeBound",
  sub_nodes: [SymbolChar, StringLiteral],
});

// CharRange=(start:CharRangeBound, "~", end:CharRangeBound)=>[.start=start, .end=end];
export const CharRange: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "CharRange",
  sub_nodes: [CharRangeBound, completeCharSeq({ literal: "~" }), CharRangeBound],
  sub_quantifiers: "   ",
  sub_node_bindings: ["start", null, "end"],
  transform: (ctx) => ({ start: ctx.bindings.start, end: ctx.bindings.end }),
});

// FieldAssignment=(".", symbol:Symbol, "=", expr:Expr \ignore Ignorable)=>[.target=symbol, .source=expr];
export const FieldAssignment: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "FieldAssignment",
  sub_nodes: [completeCharSeq({ literal: "." }), Symbol, completeCharSeq({ literal: "=" }), Expr],
  sub_quantifiers: "    ",
  ignore: Ignorable,
  sub_node_bindings: [null, "symbol", null, "expr"],
  transform: (ctx) => ({ target: ctx.bindings.symbol, source: ctx.bindings.expr }),
});

// Struct=(field_assignments:FieldAssignment* \sep "," \ignore Ignorable \enclosedby "[]")=>field_assignments;
export const Struct: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "Struct",
  sub_nodes: [FieldAssignment],
  sub_quantifiers: "*",
  sep: completeCharSeq({ literal: "," }),
  ignore: Ignorable,
  enclosure: "[]",
  sub_node_bindings: ["field_assignments"],
  transform: (ctx) => ctx.bindings.field_assignments,
});

// ("\\oneof", string:StringLiteral \sep Space)=>string
const OneOfCharSet: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "(\"\\\\oneof\", string:StringLiteral \\sep Space)=>string",
  sub_nodes: [completeCharSeq({ literal: "\\oneof" }), StringLiteral],
  sub_quantifiers: "  ",
  sep: Space,
  sub_node_bindings: [null, "string"],
  transform: (ctx) => ctx.bindings.string,
});

// GreedyQuantifier=\oneof "?+*";
export const GreedyQuantifier: PARSER_NODE_TYPE.CharMatchSet = completeCharMatchSet({ name: "GreedyQuantifier", sub_nodes: "?+*" });

// NonGreedyQuantifier=\raw GreedyQuantifier,"^";
export const NonGreedyQuantifier: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "NonGreedyQuantifier",
  sub_nodes: [GreedyQuantifier, completeCharSeq({ literal: "^" })],
  sub_quantifiers: "  ",
  raw: true,
});

// PatternWithPostfixOp=(pattern:Pattern, op:{NonGreedyQuantifier;GreedyQuantifier});
export const PatternWithPostfixOp: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "PatternWithPostfixOp",
  sub_nodes: [Pattern, completePatternSet({ name: "{NonGreedyQuantifier;GreedyQuantifier}", sub_nodes: [NonGreedyQuantifier, GreedyQuantifier] })],
  sub_quantifiers: "  ",
});

// RawPattern=("\\raw", pattern:Pattern \ignore Ignorable)=>pattern;
export const RawPattern: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "RawPattern",
  sub_nodes: [completeCharSeq({ literal: "\\raw" }), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  transform: (ctx) => ctx.bindings.pattern,
});

// AssociateByPart=("\\associateby", pattern:Pattern \ignore Ignorable)=>pattern;
export const AssociateByPart: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "AssociateByPart",
  sub_nodes: [completeCharSeq({ literal: "\\associateby" }), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  transform: (ctx) => ctx.bindings.pattern,
});

// NegPattern=("-", pattern:Pattern \ignore Ignorable)=>[.pattern=pattern];
export const NegPattern: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "NegPattern",
  sub_nodes: [completeCharSeq({ literal: "-" }), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  transform: (ctx) => ({ pattern: ctx.bindings.pattern }),
});


// SepPart=("\\sep", pattern:Pattern \ignore Ignorable)=>pattern;
export const SepPart: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "SepPart",
  sub_nodes: [completeCharSeq({ literal: "\\sep" }), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  transform: (ctx) => ctx.bindings.pattern,
});

// IgnorePart=({"\\ignore";"\\ignore_include_beginning"}, pattern:Pattern \ignore Ignorable)=>pattern;
const IgnorePartKeyword: PARSER_NODE_TYPE.PatternSet = completePatternSet({
  name: "{\"\\\\ignore\";\"\\\\ignore_include_beginning\"}",
  sub_nodes: [
    completeCharSeq({ literal: "\\ignore_include_beginning" }),
    completeCharSeq({ literal: "\\ignore" }),
  ],
});
export const IgnorePart: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "IgnorePart",
  sub_nodes: [IgnorePartKeyword, Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  transform: (ctx) => ctx.bindings.pattern,
});

// EnclosedbyPart=("\\enclosedby", pattern:Pattern \ignore Ignorable)=>pattern;
export const EnclosedbyPart: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "EnclosedbyPart",
  sub_nodes: [completeCharSeq({ literal: "\\enclosedby" }), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  transform: (ctx) => ctx.bindings.pattern,
});

// PatternBinding=(symbol:Symbol,":",pattern:Pattern)=>[.symbol=symbol, .pattern=pattern];
export const PatternBinding: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "PatternBinding",
  sub_nodes: [Symbol, completeCharSeq({ literal: ":" }), Pattern],
  sub_quantifiers: "   ",
  sub_node_bindings: ["symbol", null, "pattern"],
  transform: (ctx) => ({ symbol: ctx.bindings.symbol, pattern: ctx.bindings.pattern }),
});

const PatternItem: PARSER_NODE_TYPE.PatternSet = completePatternSet({
  name: "{PatternBinding;Pattern}",
  sub_nodes: [PatternBinding, Pattern],
});

const PatternSeqPatterns: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "(patterns:{PatternBinding;Pattern}+ \\sep \",\" \\ignore Ignorable)",
  sub_nodes: [PatternItem],
  sub_quantifiers: "+",
  sep: completeCharSeq({ literal: "," }),
  ignore: Ignorable,
  sub_node_bindings: ["patterns"],
  transform: (ctx) => ctx.bindings.patterns,
});

// PatternSeq=((patterns:{PatternBinding;Pattern}+ \sep "," \ignore Ignorable), sep_part:SepPart?, ignore_part:IgnorePart?, enclosedby_part:EnclosedbyPart? \ignore Ignorable \enclosedby "()")=>...
export const PatternSeq: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "PatternSeq",
  sub_nodes: [PatternSeqPatterns, SepPart, IgnorePart, EnclosedbyPart],
  sub_quantifiers: " ???",
  ignore: Ignorable,
  enclosure: "()",
  sub_node_bindings: ["patterns", "sep_part", "ignore_part", "enclosedby_part"],
  transform: (ctx) => ({ patterns: ctx.bindings.patterns, sep: ctx.bindings.sep_part, ignore: ctx.bindings.ignore_part, enclosedby: ctx.bindings.enclosedby_part }),
});

const PatternSetPatterns: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "(patterns:{PatternBinding;Pattern}* \\sep \";\" \\ignore Ignorable)",
  sub_nodes: [PatternItem],
  sub_quantifiers: "*",
  sep: completeCharSeq({ literal: ";" }),
  ignore: Ignorable,
  sub_node_bindings: ["patterns"],
  transform: (ctx) => ctx.bindings.patterns,
});

// PatternSet=((patterns:{PatternBinding;Pattern}* \sep ";" \ignore Ignorable), ";"?, associateby_part:AssociateByPart?, ignore_part:IgnorePart? \ignore Ignorable \enclosedby "{}")=>...
export const PatternSet: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "PatternSet",
  sub_nodes: [PatternSetPatterns, completeCharSeq({ literal: ";" }), AssociateByPart, IgnorePart],
  sub_quantifiers: " ???",
  ignore: Ignorable,
  enclosure: "{}",
  sub_node_bindings: ["patterns", null, "associateby_part", "ignore_part"],
  transform: (ctx) => ({ patterns: ctx.bindings.patterns, associateby: ctx.bindings.associateby_part, ignore: ctx.bindings.ignore_part }),
});

// Rule=(pattern:PatternSeq,"=>",returned:Expr)=>[.pattern=pattern, .returned=returned];
export const Rule: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "Rule",
  sub_nodes: [PatternSeq, completeCharSeq({ literal: "=>" }), Expr],
  sub_quantifiers: "   ",
  sub_node_bindings: ["pattern", null, "returned"],
  transform: (ctx) => ({ pattern: ctx.bindings.pattern, returned: ctx.bindings.returned }),
});

// List=(exprs:Expr* \sep "," \ignore Ignorable \enclosedby "[]")=>exprs;
export const List: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "List",
  sub_nodes: [Expr],
  sub_quantifiers: "*",
  sep: completeCharSeq({ literal: "," }),
  ignore: Ignorable,
  enclosure: "[]",
  sub_node_bindings: ["exprs"],
  transform: (ctx) => ctx.bindings.exprs,
});

// Assignment=(symbol:Symbol, "=", pattern:Pattern \ignore Ignorable)=>[.target=symbol, .source=pattern];
export const Assignment: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "Assignment",
  sub_nodes: [Symbol, completeCharSeq({ literal: "=" }), Pattern],
  sub_quantifiers: "   ",
  ignore: Ignorable,
  sub_node_bindings: ["symbol", null, "pattern"],
  transform: (ctx) => ({ target: ctx.bindings.symbol, source: ctx.bindings.pattern }),
});

// Keyword={...};
export const Keyword: PARSER_NODE_TYPE.PatternSet = completePatternSet({
  name: "Keyword",
  sub_nodes: [
    completeCharSeq({ literal: "\\oneof" }),
    completeCharSeq({ literal: "\\sep" }),
    completeCharSeq({ literal: "\\enclosedby" }),
    completeCharSeq({ literal: "\\ignore_include_beginning" }),
    completeCharSeq({ literal: "\\ignore" }),
    completeCharSeq({ literal: "\\associateby" }),
    completeCharSeq({ literal: "\\raw" }),
  ],
});

// CharSet = { CharRange; ("\\oneof", string:StringLiteral \sep Space)=>string; \associateby "()"; \ignore Ignorable; };
CharSet.sub_nodes.push(CharRange, OneOfCharSet);
CharSet.neg_flags.push(false, false);
completePatternSet(CharSet);

// Pattern={NegPattern;PatternWithPostfixOp;RawPattern;Rule; PatternSeq;PatternSet;CharSet;StringLiteral;GeneralSymbol \associateby "()" \ignore Ignorable};
Pattern.sub_nodes.push(
  NegPattern,
  PatternWithPostfixOp,
  RawPattern,
  Rule,
  PatternSeq,
  PatternSet,
  CharSet,
  StringLiteral,
  GeneralSymbol,
);
Pattern.neg_flags.push(false, false, false, false, false, false, false, false, false);
completePatternSet(Pattern);

// Expr={ Assignment; List; Struct; Pattern; GeneralSymbol; };
Expr.sub_nodes.push(
  Assignment,
  List,
  Struct,
  Pattern,
  GeneralSymbol,
);
Expr.neg_flags.push(false, false, false, false, false);
completePatternSet(Expr);

// Synx=(exprs:Expr* \sep ";" \ignore_include_beginning Ignorable)=>[.exprs=exprs];
export const Synx: PARSER_NODE_TYPE.PatternSeq = completePatternSeq({
  name: "Synx",
  sub_nodes: [Expr],
  sub_quantifiers: "*",
  sep: Delimiter,
  accept_trailing_sep: true,
  ignore: Ignorable,
  ignore_beginning: true,
  sub_node_bindings: ["exprs"],
  transform: (ctx) => ({ exprs: ctx.bindings.exprs }),
});
