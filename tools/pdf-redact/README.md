# PDF Redaction Feature (fixes genspark-ai/genoffice#295)

Permanently removes sensitive content (text, images, areas) from PDFs —
not just a black overlay. Uses PyMuPDF redaction annotations +
`apply_redactions()` so the underlying text is **removed from the file**
and is no longer searchable, selectable, or copyable.

## Requirements

```bash
pip install PyMuPDF
# test only:
pip install reportlab
```

## Usage

```bash
# Redact every occurrence of a phrase (recommended for text)
python redact_pdf.py input.pdf -o output.pdf --search "RM 500,000"

# Redact explicit areas (points, 72/inch, origin top-left as seen on screen)
python redact_pdf.py input.pdf -o output.pdf --rect "100,200,300,50" --rect "400,150,200,75"

# Target specific pages (1-indexed, default: all pages)
python redact_pdf.py input.pdf -o output.pdf --search "secret" --page 1 --page 3

# Interactive mode
python redact_pdf.py input.pdf --interactive
```

## Verify

```bash
python test_redact.py
# PASS: true redaction verified (text removed, pages intact)
```

The test asserts: page count unchanged, redacted text gone from
extraction, surrounding text preserved.

## How it works

1. `page.add_redact_annot(rect, fill=(0,0,0))` marks each area/search hit
2. `page.apply_redactions(images=IMAGE_PIXELS, graphics=REMOVE_IF_TOUCHED, text=REMOVE)` deletes text runs, blanks image pixels, removes covered vector graphics, and burns the fill box into the content
3. Save with `garbage=4, deflate=True` for a clean rewrite (no duplicated pages)

## Security notes

- Always re-open the output and try to search/select the redacted text before sharing.
- Scanned-image PDFs: the pixels are blanked, but run OCR-check if the scan contains embedded text layers.
- Coordinates are top-left origin. If you measured from the bottom (PDF raw coords), convert with `y_top = page_height - y_bottom - height`.
