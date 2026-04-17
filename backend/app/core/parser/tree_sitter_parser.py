from __future__ import annotations
import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Symbol:
    name: str
    kind: str          # function | class | method | variable
    start_line: int
    end_line: int
    docstring: str = ""


@dataclass
class ParsedFile:
    path: str
    language: str
    raw_text: str
    symbols: list[Symbol] = field(default_factory=list)
    imports: list[str] = field(default_factory=list)


# ── Language-specific regex parsers ─────────────────────────────────────────

def _parse_python(text: str) -> tuple[list[Symbol], list[str]]:
    symbols: list[Symbol] = []
    imports: list[str] = []
    lines = text.splitlines()
    n = len(lines)

    for i, line in enumerate(lines):
        stripped = line.strip()

        # Imports
        if stripped.startswith("import ") or stripped.startswith("from "):
            imports.append(stripped)
            continue

        # Class definition
        m = re.match(r"^class\s+(\w+)", line)
        if m:
            name = m.group(1)
            end = _find_block_end_python(lines, i)
            doc = _extract_docstring_python(lines, i + 1)
            symbols.append(Symbol(name=name, kind="class", start_line=i + 1, end_line=end, docstring=doc))
            continue

        # Function / method definition
        m = re.match(r"^(\s*)(?:async\s+)?def\s+(\w+)", line)
        if m:
            indent = len(m.group(1))
            name = m.group(2)
            kind = "method" if indent > 0 else "function"
            end = _find_block_end_python(lines, i)
            doc = _extract_docstring_python(lines, i + 1)
            symbols.append(Symbol(name=name, kind=kind, start_line=i + 1, end_line=end, docstring=doc))

    return symbols, imports


def _find_block_end_python(lines: list[str], start: int) -> int:
    """Return 1-based end line of the indented block starting at `start`."""
    if start >= len(lines):
        return start + 1
    header = lines[start]
    base_indent = len(header) - len(header.lstrip())
    for i in range(start + 1, len(lines)):
        l = lines[i]
        if l.strip() == "":
            continue
        indent = len(l) - len(l.lstrip())
        if indent <= base_indent:
            return i  # 1-based: line i is the first line AFTER the block
    return len(lines)


def _extract_docstring_python(lines: list[str], start: int) -> str:
    """Try to extract a docstring from the line(s) immediately after a def/class."""
    for i in range(start, min(start + 3, len(lines))):
        stripped = lines[i].strip()
        if stripped.startswith('"""') or stripped.startswith("'''"):
            quote = stripped[:3]
            content = stripped[3:]
            if content.endswith(quote):
                return content[:-3].strip()
            # Multi-line: collect until closing quote
            parts = [content]
            for j in range(i + 1, min(i + 20, len(lines))):
                seg = lines[j].strip()
                if seg.endswith(quote):
                    parts.append(seg[:-3])
                    break
                parts.append(seg)
            return " ".join(parts).strip()
    return ""


def _parse_js_ts(text: str) -> tuple[list[Symbol], list[str]]:
    symbols: list[Symbol] = []
    imports: list[str] = []
    lines = text.splitlines()

    for i, line in enumerate(lines):
        stripped = line.strip()

        # Imports
        if stripped.startswith("import ") or stripped.startswith("require("):
            imports.append(stripped)
            continue

        # Named function declaration: function foo(
        m = re.match(r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(", line)
        if m:
            end = _find_block_end_brace(lines, i)
            symbols.append(Symbol(name=m.group(1), kind="function", start_line=i + 1, end_line=end))
            continue

        # Arrow function: const foo = (...) =>  or  export const foo =
        m = re.match(r"^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(", line)
        if m and "=>" in line:
            end = _find_block_end_brace(lines, i)
            symbols.append(Symbol(name=m.group(1), kind="function", start_line=i + 1, end_line=end))
            continue

        # Class
        m = re.match(r"^(?:export\s+)?(?:default\s+)?class\s+(\w+)", line)
        if m:
            end = _find_block_end_brace(lines, i)
            symbols.append(Symbol(name=m.group(1), kind="class", start_line=i + 1, end_line=end))

    return symbols, imports


def _find_block_end_brace(lines: list[str], start: int) -> int:
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count("{") - lines[i].count("}")
        if depth > 0 and i > start:
            if depth == 0:
                return i + 1
        if depth <= 0 and i > start:
            return i + 1
    return len(lines)


def _parse_generic(text: str) -> tuple[list[Symbol], list[str]]:
    """Minimal fallback: no symbols, no imports."""
    return [], []


_PARSERS = {
    "python": _parse_python,
    "javascript": _parse_js_ts,
    "typescript": _parse_js_ts,
    "tsx": _parse_js_ts,
    "jsx": _parse_js_ts,
}


def parse_file(abs_path: str, language: str) -> ParsedFile:
    """
    Parse a source file and return a ParsedFile with symbols and imports.
    Falls back gracefully if the file can't be read or parsed.
    """
    try:
        text = Path(abs_path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        text = ""

    parser_fn = _PARSERS.get(language, _parse_generic)
    try:
        syms, imps = parser_fn(text)
    except Exception:
        syms, imps = [], []

    return ParsedFile(
        path=abs_path,
        language=language,
        raw_text=text,
        symbols=syms,
        imports=imps,
    )
