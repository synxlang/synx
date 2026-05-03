# Synx

Synx is a syntax definition language: you describe lexer/grammar with declarative rules, and parsers for target languages are generated from those rules.

# Development Status

**This project is in early, unfinished development. Use at this stage is not recommended.**

# Project Paths

- **`synx.synx`**: Synx’s own grammar definition (the Synx language described with Synx rules).
- **`synx-ts/`**: Parser implementation (TypeScript)—parses input per the grammar and produces ASTs and related results.
- **`synx-vscode/`**: VS Code language extension (syntax highlighting, language services, and other editor integration).

