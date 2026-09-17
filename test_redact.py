#!/usr/bin/env python3
"""Create a simple test PDF and apply redactions."""

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
import os

# Create test PDF
doc = SimpleDocTemplate(
    "test_document.pdf",
    pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm,
    topMargin=2*cm, bottomMargin=2*cm
)

styles = getSampleStyleSheet()
elements = []

# Add some content
elements.append(Paragraph("Confidential Budget Proposal", styles["Title"]))
elements.append(Spacer(1, 0.5*cm))
elements.append(Paragraph("This document contains sensitive financial information.", styles["Normal"]))
elements.append(Spacer(1, 0.5*cm))
elements.append(Paragraph("**Total Budget: RM 500,000**", styles["Normal"]))
elements.append(Spacer(1, 0.5*cm))
elements.append(Paragraph("Employee salaries and benefits details.", styles["Normal"]))

doc.build(elements)
print('[OK] Test PDF created: test_document.pdf')

# Now apply redaction
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject, NameObject, NumberObject, ArrayObject, DictionaryObject

reader = PdfReader("test_document.pdf")
writer = PdfWriter()

for page in reader.pages:
    # Add redaction at specific coordinates (approximate)
    rects = [(2*72, 10*72, 150, 30)]  # x,y,width,height in points
    
    annots = []
    for i, (x, y, w, h) in enumerate(rects):
        rect = RectangleObject([x, y, x + w, y + h])
        
        annot = DictionaryObject()
        annot.update({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Rect"): rect,
            NameObject("/P"): page.indirect_reference,
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/F"): NumberObject(4)
        })
        
        annots.append(annot)
    
    if "/Annots" not in page:
        page[NameObject("/Annots")] = ArrayObject(annots)

writer.add_page(reader.pages[0])

with open("test_redacted.pdf", "wb") as f:
    writer.write(f)

print('[OK] Redaction applied: test_redacted.pdf')
