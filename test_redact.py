#!/usr/bin/env python3
"""End-to-end verification for true PDF redaction (issue #295).

Creates a test PDF, redacts it two ways (explicit rect + text search),
then asserts:
  1. Page count is unchanged (no duplication bug)
  2. Redacted text is GONE from extraction (not just covered)
  3. Unredacted text survives
  4. Output is a valid PDF

Run:  python test_redact.py
Requires: pip install PyMuPDF reportlab
"""
import os
import sys

import fitz
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from redact_pdf import redact_pdf

SECRET = "Salary RM500000 CONFIDENTIAL"
PUBLIC = "Welcome to the company picnic"


def build_test_pdf(path):
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(path, pagesize=A4,
                            leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm)
    elements = [
        Paragraph("Budget Proposal", styles["Title"]),
        Spacer(1, 0.5 * cm),
        Paragraph(f"Budget line: {SECRET}.", styles["Normal"]),
        Spacer(1, 0.5 * cm),
        Paragraph(PUBLIC + ".", styles["Normal"]),
    ]
    doc.build(elements)
    print(f"[OK] Test PDF created: {path}")


def extract_all_text(path):
    doc = fitz.open(path)
    text = "\n".join(page.get_text() for page in doc)
    n = len(doc)
    doc.close()
    return text, n


def main():
    src = "test_document.pdf"
    out_search = "test_redacted_search.pdf"
    out_rect = "test_redacted_rect.pdf"
    for f in (src, out_search, out_rect):
        if os.path.exists(f):
            os.remove(f)

    build_test_pdf(src)
    before_text, before_pages = extract_all_text(src)
    assert SECRET in before_text, "setup failed: secret not in source PDF"
    print(f"[OK] Source has {before_pages} page(s), secret present")

    failures = []

    # --- Test 1: search-based redaction removes the text ---
    redact_pdf(src, out_search, search_terms=[SECRET])
    after_text, after_pages = extract_all_text(out_search)
    if after_pages != before_pages:
        failures.append(f"search: page count changed {before_pages} -> {after_pages}")
    if SECRET in after_text or "RM500000" in after_text:
        failures.append("search: secret text still extractable after redaction!")
    else:
        print("[OK] Search redaction: secret text removed")
    if "picnic" not in after_text:
        failures.append("search: public text was destroyed!")
    else:
        print("[OK] Search redaction: public text preserved")

    # --- Test 2: rect-based redaction removes text in the box ---
    # Find where the secret sits, then cover it with a rect.
    doc = fitz.open(src)
    page = doc[0]
    hits = page.search_for(SECRET)
    doc.close()
    if not hits:
        failures.append("rect: could not locate secret text for rect test")
    else:
        r = hits[0]
        rect_str = (r.x0 - 2, r.y0 - 2, r.width + 4, r.height + 4)
        redact_pdf(src, out_rect, rects=[rect_str])
        rect_text, rect_pages = extract_all_text(out_rect)
        if rect_pages != before_pages:
            failures.append(f"rect: page count changed {before_pages} -> {rect_pages}")
        if "RM500000" in rect_text:
            failures.append("rect: secret text still extractable after rect redaction!")
        else:
            print("[OK] Rect redaction: secret text removed")
        if "picnic" not in rect_text:
            failures.append("rect: public text was destroyed!")
        else:
            print("[OK] Rect redaction: public text preserved")

    if failures:
        print("\nFAIL:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("\nPASS: true redaction verified (text removed, pages intact)")


if __name__ == "__main__":
    main()
