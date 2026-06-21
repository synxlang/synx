import {
  AnyChar,
  completeCharRange,
  completeCharSeq,
  completeCharSet,
  completePatternSeq,
  completePatternSet,
} from "./parser_node";
import type {
  CharMatchRange,
  CharMatchSet,
  PatternSeq,
  PatternSet,
} from "./parser_node";

// Digit=0~9;
export const Digit: CharMatchRange = completeCharRange({ name: "Digit", start: "0", end: "9" });

// Letter={a~z;A~Z;"_";OtherLanguageLetter};
export const OtherLanguageLetter: CharMatchRange = completeCharRange({ name: "OtherLanguageLetter", start: "\u0080" });
export const Letter: CharMatchSet = completeCharSet({
  name: "Letter",
  sub_nodes: [
    completeCharRange({ name: "a~z", start: "a", end: "z" }),
    completeCharRange({ name: "A~Z", start: "A", end: "Z" }),
    completeCharSet({ name: "\"_\"", sub_nodes: "_" }),
    OtherLanguageLetter,
  ],
});

// SymbolChar={Letter;Digit};
export const SymbolChar: CharMatchSet = completeCharSet({ name: "SymbolChar", sub_nodes: [Letter, Digit] });

// SpaceChar= \oneof " \t\v\r\n";
export const SpaceChar: CharMatchSet = completeCharSet({ name: "SpaceChar", sub_nodes: " \t\v\r\n" });

// Delimiter=";";
export const Delimiter = completeCharSeq({ name: "Delimiter", literal: ";" });

// LineDelimiter={"\n";"\r\n"};
export const LineDelimiter: PatternSet = completePatternSet({
  name: "LineDelimiter",
  sub_nodes: [completeCharSeq({ literal: "\n" }), completeCharSeq({ literal: "\r\n" })],
});

// CommentPrefix="\\\\";
export const CommentPrefix = completeCharSeq({ name: "CommentPrefix", literal: "\\\\" });

// StringEscapePrefix="\\";
export const StringEscapePrefix = completeCharSeq({ name: "StringEscapePrefix", literal: "\\" });

// Space=SpaceChar+;
export const Space: PatternSeq = completePatternSeq({
  name: "Space",
  sub_nodes: [SpaceChar],
  sub_quantifiers: "+",
});

// DigitLiteral=Digit+;
export const DigitLiteral: PatternSeq = completePatternSeq({
  name: "DigitLiteral",
  sub_nodes: [Digit],
  sub_quantifiers: "+",
  raw: true,
});

// Symbol=\raw (Letter,SymbolChar*);
export const Symbol: PatternSeq = completePatternSeq({
  name: "Symbol",
  sub_nodes: [Letter, SymbolChar],
  sub_quantifiers: " *",
  raw: true,
});

// SymbolDotChain=(symbols:Symbol+ \sep ".")=>symbols;
export const SymbolDotChain: PatternSeq = completePatternSeq({
  name: "SymbolDotChain",
  sub_nodes: [Symbol],
  sub_quantifiers: "+",
  sep: completeCharSeq({ literal: "." }),
  sub_node_bindings: ["symbols"],
  assignment_map: "symbols",
});

// GeneralSymbol={Symbol;SymbolDotChain};
export const GeneralSymbol: PatternSet = completePatternSet({
  name: "GeneralSymbol",
  sub_nodes: [Symbol, SymbolDotChain],
});

// Comment=(CommentPrefix,comment:AnyChar*,LineDelimiter?)=>comment;
export const Comment: PatternSeq = completePatternSeq({
  name: "Comment",
  sub_nodes: [CommentPrefix, AnyChar, LineDelimiter],
  sub_quantifiers: " *?",
  sub_node_bindings: [null, "comment", null],
  assignment_map: "comment",
});

// Ignorable={Space;Comment};
export const Ignorable: PatternSet = completePatternSet({
  name: "Ignorable",
  sub_nodes: [Space, Comment],
});

// Recursive grammar placeholders.
export const Expr = { name: "Expr", sub_nodes: [], neg_flags: [] } as unknown as PatternSet;
export const Pattern = {
  name: "Pattern",
  sub_nodes: [],
  neg_flags: [],
  associateby: "()",
  ignore: Ignorable,
} as unknown as PatternSet;
export const CharSet = {
  name: "CharSet",
  sub_nodes: [],
  neg_flags: [],
  associateby: "()",
  ignore: Ignorable,
} as unknown as PatternSet;
// EscapeChar=("\\", c:AnyChar)=>c;
export const EscapeChar: PatternSeq = completePatternSeq({
  name: "EscapeChar",
  sub_nodes: [StringEscapePrefix, AnyChar],
  sub_quantifiers: "  ",
  sub_node_bindings: [null, "c"],
  assignment_map: "c",
});

// {-EscapeChar; -"\""; AnyChar}
export const NonEscapeChar: PatternSet = completePatternSet({
  name: "{-EscapeChar; -\"\\\"\"; AnyChar}",
  sub_nodes: [EscapeChar, completeCharSeq({ literal: "\"" }), AnyChar],
  neg_flags: [true, true, false],
});

export const NonEscapeText: PatternSeq = completePatternSeq({
  name: "{-EscapeChar; -\"\\\"\"; AnyChar}+",
  sub_nodes: [NonEscapeChar],
  sub_quantifiers: "+",
});

// StringLiteral=(text:{EscapeChar; {-EscapeChar; -"\""; AnyChar}+}* \enclosedby "\"\"")=>text;
export const StringTextPiece: PatternSet = completePatternSet({
  name: "{EscapeChar; {-EscapeChar; -\"\\\"\"; AnyChar}+}",
  sub_nodes: [EscapeChar, NonEscapeText],
});
export const StringLiteral: PatternSeq = completePatternSeq({
  name: "StringLiteral",
  sub_nodes: [StringTextPiece],
  sub_quantifiers: "*",
  enclosure: "\"\"",
  sub_node_bindings: ["text"],
  assignment_map: "text",
});

// GeneralChar={SymbolChar;StringLiteral};
export const GeneralChar: PatternSet = completePatternSet({
  name: "GeneralChar",
  sub_nodes: [SymbolChar, StringLiteral],
});

// CharRange=(first:GeneralChar, "~", last:GeneralChar)=>[.first=first, .last=last];
export const CharRange: PatternSeq = completePatternSeq({
  name: "CharRange",
  sub_nodes: [GeneralChar, completeCharSeq({ literal: "~" }), GeneralChar],
  sub_quantifiers: "   ",
  sub_node_bindings: ["first", null, "last"],
  assignment_map: new Map([
    ["first", "first"],
    ["last", "last"],
  ]),
});

// FieldAssignment=(".", symbol:Symbol, "=", expr:Expr \ignore Ignorable)=>[.target=symbol, .source=expr];
export const FieldAssignment: PatternSeq = completePatternSeq({
  name: "FieldAssignment",
  sub_nodes: [completeCharSeq({ literal: "." }), Symbol, completeCharSeq({ literal: "=" }), Expr],
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
  name: "Struct",
  sub_nodes: [FieldAssignment],
  sub_quantifiers: "*",
  sep: completeCharSeq({ literal: "," }),
  ignore: Ignorable,
  enclosure: "[]",
  sub_node_bindings: ["field_assignments"],
  assignment_map: "field_assignments",
});

// ("\\oneof", string:StringLiteral \sep Space)=>string
export const OneOfCharSet: PatternSeq = completePatternSeq({
  name: "(\"\\\\oneof\", string:StringLiteral \\sep Space)=>string",
  sub_nodes: [completeCharSeq({ literal: "\\oneof" }), StringLiteral],
  sub_quantifiers: "  ",
  sep: Space,
  sub_node_bindings: [null, "string"],
  assignment_map: "string",
});

// Option=(pattern:Pattern, "?")=>pattern;
export const Option: PatternSeq = completePatternSeq({
  name: "Option",
  sub_nodes: [Pattern, completeCharSeq({ literal: "?" })],
  sub_quantifiers: "  ",
  sub_node_bindings: ["pattern", null],
  assignment_map: "pattern",
});

// OneOrMany=(pattern:Pattern, "+")=>pattern;
export const OneOrMany: PatternSeq = completePatternSeq({
  name: "OneOrMany",
  sub_nodes: [Pattern, completeCharSeq({ literal: "+" })],
  sub_quantifiers: "  ",
  sub_node_bindings: ["pattern", null],
  assignment_map: "pattern",
});

// Many=(pattern:Pattern, "*")=>pattern;
export const Many: PatternSeq = completePatternSeq({
  name: "Many",
  sub_nodes: [Pattern, completeCharSeq({ literal: "*" })],
  sub_quantifiers: "  ",
  sub_node_bindings: ["pattern", null],
  assignment_map: "pattern",
});

// RawPattern=("\\raw", pattern:Pattern \ignore Ignorable)=>pattern;
export const RawPattern: PatternSeq = completePatternSeq({
  name: "RawPattern",
  sub_nodes: [completeCharSeq({ literal: "\\raw" }), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: "pattern",
});

// AssociateByPart=("\\associateby", pattern:Pattern \ignore Ignorable)=>pattern;
export const AssociateByPart: PatternSeq = completePatternSeq({
  name: "AssociateByPart",
  sub_nodes: [completeCharSeq({ literal: "\\associateby" }), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: "pattern",
});

// NegPattern=("-", pattern:Pattern \ignore Ignorable)=>[.pattern=pattern];
export const NegPattern: PatternSeq = completePatternSeq({
  name: "NegPattern",
  sub_nodes: [completeCharSeq({ literal: "-" }), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: new Map([["pattern", "pattern"]]),
});

// NonGreedyPattern=(pattern:Pattern, "^")=>pattern;
export const NonGreedyPattern: PatternSeq = completePatternSeq({
  name: "NonGreedyPattern",
  sub_nodes: [Pattern, completeCharSeq({ literal: "^" })],
  sub_quantifiers: "  ",
  sub_node_bindings: ["pattern", null],
  assignment_map: "pattern",
});

// sepPart=("\\sep", pattern:Pattern \ignore Ignorable)=>pattern;
export const SepPart: PatternSeq = completePatternSeq({
  name: "sepPart",
  sub_nodes: [completeCharSeq({ literal: "\\sep" }), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: "pattern",
});

// IgnorePart=({"\\ignore";"ignore_include_beginning"}, pattern:Pattern \ignore Ignorable)=>pattern;
export const IgnorePartKeyword: PatternSet = completePatternSet({
  name: "{\"\\\\ignore\";\"ignore_include_beginning\"}",
  sub_nodes: [
    completeCharSeq({ literal: "\\ignore" }),
    completeCharSeq({ literal: "ignore_include_beginning" }),
  ],
});
export const IgnorePart: PatternSeq = completePatternSeq({
  name: "IgnorePart",
  sub_nodes: [IgnorePartKeyword, Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: "pattern",
});

// EnclosedbyPart=("\\enclosedby", pattern:Pattern \ignore Ignorable)=>pattern;
export const EnclosedbyPart: PatternSeq = completePatternSeq({
  name: "EnclosedbyPart",
  sub_nodes: [completeCharSeq({ literal: "\\enclosedby" }), Pattern],
  sub_quantifiers: "  ",
  ignore: Ignorable,
  sub_node_bindings: [null, "pattern"],
  assignment_map: "pattern",
});

export const PatternSeqPatterns: PatternSeq = completePatternSeq({
  name: "(patterns:Pattern+ \\sep \",\" \\ignore Ignorable)",
  sub_nodes: [Pattern],
  sub_quantifiers: "+",
  sep: completeCharSeq({ literal: "," }),
  ignore: Ignorable,
  sub_node_bindings: ["patterns"],
  assignment_map: "patterns",
});

// PatternSeq=((patterns:Pattern+ \sep "," \ignore Ignorable), sep_part:sepPart?, ignore_part:IgnorePart?, enclosedby_part:EnclosedbyPart? \ignore Ignorable)=>...
export const PatternSeqNode: PatternSeq = completePatternSeq({
  name: "PatternSeq",
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
  name: "(patterns:Pattern* \\sep \";\" \\ignore Ignorable)",
  sub_nodes: [Pattern],
  sub_quantifiers: "*",
  sep: completeCharSeq({ literal: ";" }),
  ignore: Ignorable,
  sub_node_bindings: ["patterns"],
  assignment_map: "patterns",
});

// PatternSet=((patterns:Pattern* \sep ";" \ignore Ignorable), associateby_part:AssociateByPart?, ignore_part:IgnorePart? \ignore Ignorable \enclosedby "{}")=>...
export const PatternSetNode: PatternSeq = completePatternSeq({
  name: "PatternSet",
  sub_nodes: [PatternSetPatterns, AssociateByPart, IgnorePart],
  sub_quantifiers: " ??",
  ignore: Ignorable,
  enclosure: "{}",
  sub_node_bindings: ["patterns", "associateby_part", "ignore_part"],
  assignment_map: new Map([
    ["patterns", "patterns"],
    ["associateby", "associateby_part"],
    ["ignore", "ignore_part"],
  ]),
});

// PatternBinding=(symbol:Symbol,":",pattern:Pattern)=>[.symbol=symbol, .pattern=pattern];
export const PatternBinding: PatternSeq = completePatternSeq({
  name: "PatternBinding",
  sub_nodes: [Symbol, completeCharSeq({ literal: ":" }), Pattern],
  sub_quantifiers: "   ",
  sub_node_bindings: ["symbol", null, "pattern"],
  assignment_map: new Map([
    ["symbol", "symbol"],
    ["pattern", "pattern"],
  ]),
});

// Rule=(pattern:PatternSeq,"=>",returned:Expr)=>[.pattern=pattern, .returned=returned];
export const Rule: PatternSeq = completePatternSeq({
  name: "Rule",
  sub_nodes: [PatternSeqNode, completeCharSeq({ literal: "=>" }), Expr],
  sub_quantifiers: "   ",
  sub_node_bindings: ["pattern", null, "returned"],
  assignment_map: new Map([
    ["pattern", "pattern"],
    ["returned", "returned"],
  ]),
});

// List=(exprs:Expr* \sep "," \ignore Ignorable \enclosedby "[]")=>exprs;
export const List: PatternSeq = completePatternSeq({
  name: "List",
  sub_nodes: [Expr],
  sub_quantifiers: "*",
  sep: completeCharSeq({ literal: "," }),
  ignore: Ignorable,
  enclosure: "[]",
  sub_node_bindings: ["exprs"],
  assignment_map: "exprs",
});

// Assignment = { (symbol:Symbol, "=", expr:Expr \ignore Ignorable)=>[.target=symbol, .source=expr]; };
export const AssignmentPattern: PatternSeq = completePatternSeq({
  name: "(symbol:Symbol, \"=\", expr:Expr \\ignore Ignorable)=>[.target=symbol, .source=expr]",
  sub_nodes: [Symbol, completeCharSeq({ literal: "=" }), Expr],
  sub_quantifiers: "   ",
  ignore: Ignorable,
  sub_node_bindings: ["symbol", null, "expr"],
  assignment_map: new Map([
    ["target", "symbol"],
    ["source", "expr"],
  ]),
});
export const Assignment: PatternSet = completePatternSet({
  name: "Assignment",
  sub_nodes: [AssignmentPattern],
});

// Keyword={...};
export const Keyword: PatternSet = completePatternSet({
  name: "Keyword",
  sub_nodes: [
    completeCharSeq({ literal: "\\oneof" }),
    completeCharSeq({ literal: "\\sep" }),
    completeCharSeq({ literal: "\\ignore" }),
    completeCharSeq({ literal: "\\enclosedby" }),
    completeCharSeq({ literal: "ignore_include_beginning" }),
    completeCharSeq({ literal: "\\associateby" }),
    completeCharSeq({ literal: "\\raw" }),
  ],
});

// CharSet = { CharRange; ("\\oneof", string:StringLiteral \sep Space)=>string; \associateby "()"; \ignore Ignorable; };
CharSet.sub_nodes.push(CharRange, OneOfCharSet);
CharSet.neg_flags.push(false, false);
completePatternSet(CharSet);

// Pattern={NegPattern;Option;OneOrMany;Many;RawPattern;Rule;PatternBinding; PatternSeq;PatternSet;CharSet;StringLiteral;GeneralSymbol \associateby "()" \ignore Ignorable};
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
  GeneralSymbol,
);
Pattern.neg_flags.push(false, false, false, false, false, false, false, false, false, false, false, false);
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

// Synx=(expr:Expr* \sep ";" \ignore_include_beginning Ignorable);
export const Synx: PatternSeq = completePatternSeq({
  name: "Synx",
  sub_nodes: [Expr],
  sub_quantifiers: "*",
  sep: Delimiter,
  ignore: Ignorable,
  ignore_beginning: true,
  sub_node_bindings: ["expr"],
});
