#!/usr/bin/env python3
"""True PDF redaction — permanently remove sensitive content.

Fixes https://github.com/genspark-ai/genoffice/issues/295

Unlike annotation-only "black boxes" (which leave text searchable/copyable
underneath), this uses PyMuPDF redaction annotations + apply_redactions()
to:
  1. Remove text runs under each rectangle (not just cover them)
  2. Blank out overlapping image pixels
  3. Remove overlapping vector graphics
  4. Burn a black (or custom) fill box into the page content

Usage:
    python redact_pdf.py input.pdf -o output.pdf --rect "x,y,w,h"
    python redact_pdf.py input.pdf -o output.pdf --search "secret text"
    python redact_pdf.py input.pdf -o output.pdf --rect "50,100,200,30" --page 1
    python redact_pdf.py input.pdf --interactive

Coordinate system: PDF points (72 pts = 1 inch), origin at TOP-LEFT
(as seen in viewers). Format: x,y,width,height.
Requires: pip install PyMuPDF
"""

import argparse
import os
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF is required. Install with: pip install PyMuPDF")
    sys.exit(1)


def parse_rect(s):
    """Parse 'x,y,w,h' into a tuple of floats."""
    parts = [p.strip() for p in s.split(",")]
    if len(parts) != 4:
        raise ValueError(f"expected 'x,y,width,height', got '{s}'")
    x, y, w, h = map(float, parts)
    if w <= 0 or h <= 0:
        raise ValueError(f"width/height must be > 0, got '{s}'")
    return (x, y, w, h)


def apply_page_redactions(page, fill=(0, 0, 0)):
    """Apply pending redact annots on one page with full content removal."""
    try:
        # Preferred: method form (most versions)
        return page.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_PIXELS,
            graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
            text=fitz.PDF_REDACT_TEXT_REMOVE,
        )
    except (AttributeError, TypeError):
        # Fallback: module-level function form
        return fitz.apply_redactions(
            page,
            images=fitz.PDF_REDACT_IMAGE_PIXELS,
            graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
            text=fitz.PDF_REDACT_TEXT_REMOVE,
        )


def redact_pdf(input_path, output_path=None, rects=None, pages=None,
               search_terms=None, fill=(0, 0, 0)):
    """Apply TRUE redactions to a PDF. Returns output path.

    Args:
        input_path: source PDF
        output_path: destination (default: <name>_redacted.pdf)
        rects: list of (x, y, w, h) in points, top-left origin.
            Applied to every selected page.
        pages: list of 1-indexed page numbers to target (None = all pages).
        search_terms: list of strings; every match is redacted.
        fill: RGB fill for the redaction box, 0-1 floats. Default black.
    """
    if output_path is None:
        base, _ = os.path.splitext(input_path)
        output_path = f"{base}_redacted.pdf"

    rects = rects or []
    search_terms = search_terms or []

    if not rects and not search_terms:
        raise ValueError("nothing to redact: provide --rect and/or --search")

    doc = fitz.open(input_path)

    if pages is None:
        target = list(range(len(doc)))
    else:
        target = []
        for p in pages:
            if 1 <= p <= len(doc):
                target.append(p - 1)
            else:
                print(f"Warning: page {p} out of range (1-{len(doc)}), skipped")

    total_annots = 0
    for pno in target:
        page = doc[pno]

        # 1. Explicit rectangles
        for (x, y, w, h) in rects:
            rect = fitz.Rect(x, y, x + w, y + h)
            # Clip to page so oversized rects don't error
            rect = rect & page.rect
            if rect.is_empty or rect.width <= 0 or rect.height <= 0:
                print(f"Warning: rect {(x, y, w, h)} outside page {pno + 1}, skipped")
                continue
            page.add_redact_annot(rect, fill=fill)
            total_annots += 1

        # 2. Search-term matches (true text redaction)
        for term in search_terms:
            for inst in page.search_for(term):
                # Slight padding so glyph edges are fully covered
                inst.x0 -= 1
                inst.y0 -= 1
                inst.x1 += 1
                inst.y1 += 1
                page.add_redact_annot(inst, fill=fill)
                total_annots += 1

        if total_annots:
            apply_page_redactions(page)

    if total_annots == 0:
        print("Warning: no redaction areas matched (check coords / search text)")
    else:
        print(f"Applied {total_annots} redaction(s) across {len(target)} page(s)")

    # garbage=4 + deflate = clean rewrite, no duplicated pages, no leftover text
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    print(f"Redaction complete: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Permanently redact sensitive content from PDFs (fixes genspark-ai/genoffice#295)"
    )
    parser.add_argument("input", help="Input PDF file")
    parser.add_argument("--output", "-o", help="Output PDF (default: input_redacted.pdf)")
    parser.add_argument("--rect", "-r", action="append", default=[],
                        help="Redaction rectangle as 'x,y,width,height' (points, top-left origin). Repeatable.")
    parser.add_argument("--page", "-p", action="append", type=int, default=None,
                        help="1-indexed page to redact (default: all pages). Repeatable.")
    parser.add_argument("--search", "-s", action="append", default=[],
                        help="Redact every occurrence of this text. Repeatable.")
    parser.add_argument("--interactive", "-i", action="store_true",
                        help="Prompt for rects per page on the command line")
    parser.add_argument("--fill", default="0,0,0",
                        help="Box fill as 'r,g,b' 0-1 floats (default: 0,0,0 black)")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input file '{args.input}' not found.")
        sys.exit(1)

    try:
        fill = tuple(float(c) for c in args.fill.split(","))
        if len(fill) != 3:
            raise ValueError
    except ValueError:
        print(f"Error: --fill must be 'r,g,b', got '{args.fill}'")
        sys.exit(1)

    rects = []
    if args.rect:
        for r in args.rect:
            try:
                rects.append(parse_rect(r))
            except ValueError as e:
                print(f"Warning: invalid --rect '{r}': {e}")

    if args.interactive:
        print("Interactive mode — enter 'x,y,width,height' per line, 'done' to finish.")
        print("Coords in points (72/inch), origin top-left as seen on screen.")
        while True:
            try:
                line = input("> ").strip()
            except EOFError:
                break
            if line.lower() in ("done", "quit", "q", ""):
                break
            try:
                rects.append(parse_rect(line))
                print(f"  added {rects[-1]}")
            except ValueError as e:
                print(f"  invalid: {e}")

    output_path = args.output or f"{os.path.splitext(args.input)[0]}_redacted.pdf"

    try:
        redact_pdf(args.input, output_path, rects=rects or None,
                   pages=args.page, search_terms=args.search or None, fill=fill)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
