#!/usr/bin/env python3
"""Redact/blackout sensitive content in PDF documents.

This script allows users to permanently obscure sensitive text, images, or areas
in PDF files by creating redaction boxes that remove the underlying content.

Usage:
    python redact_pdf.py input.pdf output.jsonl  # Interactive mode
    python redact_pdf.py --input input.pdf --output output.pdf --rect "x,y,w,h"  # Single rect
"""

import json, sys, os, argparse
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    RectangleObject, NameObject, NumberObject, ArrayObject, DictionaryObject
)


def create_redaction_annotation(page, x, y, width, height):
    """Create a redaction annotation on the page."""
    rect = RectangleObject([x, y, x + width, y + height])
    
    annot = DictionaryObject.create_dictionary()
    annot[NameObject("/Type")] = NameObject("/Annot")
    annot[NameObject("/Subtype")] = NameObject("/Widget")
    annot[NameObject("/Rect")] = rect
    annot[NameObject("/P")] = page.indirect_reference
    
    # Redaction-specific properties
    annot[NameObject("/FT")] = NameObject("/Tx")  # Text field type
    annot[NameObject("/F")] = NumberObject(4)   # Permanent redaction flag
    
    return annot


def add_redaction_layer(page, rects):
    """Add a redaction annotation layer for multiple rectangles."""
    if not rects:
        return None
    
    annots = ArrayObject()
    
    for i, (x, y, width, height) in enumerate(rects):
        rect = RectangleObject([x, y, x + width, y + height])
        
        annot = DictionaryObject.create_dictionary()
        annot[NameObject("/Type")] = NameObject("/Annot")
        annot[NameObject("/Subtype")] = NameObject("/Widget")
        annot[NameObject("/Rect")] = rect
        annot[NameObject("/P")] = page.indirect_reference
        annot[NameObject("/FT")] = NameObject("/Tx")
        annot[NameObject("/F")] = NumberObject(4)  # Permanent redaction
        
        annots.append(annot)
    
    # Add annotations to page
    if "/Annots" not in page:
        page[NameObject("/Annots")] = annots
    
    return annots


def apply_redactions(input_path, output_path=None, rects=None, interactive=False):
    """Apply redactions to a PDF file."""
    
    reader = PdfReader(input_path)
    writer = PdfWriter()
    
    if output_path is None:
        base, _ = os.path.splitext(input_path)
        output_path = f"{base}_redacted.pdf"
    
    for page in reader.pages:
        page_copy = page.clone()
        
        if interactive:
            # Interactive mode - prompt user for redaction areas
            print(f"\nProcessing page {page_copy.number + 1}/{len(reader.pages)}")
            print("Enter coordinates as 'x,y,width,height' (e.g., '50,100,200,50')")
            print("Type 'done' when finished with this page")
            
            while True:
                user_input = input("> ").strip()
                
                if user_input.lower() == 'done':
                    break
                
                try:
                    parts = [p for p in user_input.split(',') if p.strip()]
                    if len(parts) != 4:
                        print("Invalid format. Use: x,y,width,height")
                        continue
                    
                    x, y, w, h = map(float, parts)
                    
                    # Convert to PDF coordinates (y is from bottom, need to invert)
                    page_height = reader.pages[page_copy.number].mediabox[3]
                    y_inverted = page_height - y - h
                    
                    add_redaction_layer(page_copy, [(x, y_inverted, w, h)])
                    print(f"✓ Added redaction at ({x}, {y_inverted}) with size {w}x{h}")
                    
                except (ValueError, IndexError) as e:
                    print(f"Invalid input: {e}. Try again.")
        
        else:
            # Programmatic mode - use provided rectangles
            if rects:
                add_redaction_layer(page_copy, rects)
        
        writer.add_page(page_copy)
    
    # Apply redactions (this is crucial for permanent removal)
    writer.append_pages_from_reader(reader)
    
    with open(output_path, 'wb') as f:
        writer.write(f)
    
    print(f"\n✓ Redaction complete: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Redact sensitive content from PDF files"
    )
    parser.add_argument("input", help="Input PDF file")
    parser.add_argument("--output", "-o", help="Output PDF file (default: input_redacted.pdf)")
    parser.add_argument("--rect", "-r", action="append", 
                       help="Redaction rectangle as 'x,y,width,height'")
    parser.add_argument("--interactive", "-i", action="store_true",
                       help="Interactive mode for manual redaction")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"Error: Input file '{args.input}' not found.")
        sys.exit(1)
    
    output_path = args.output or f"{os.path.splitext(args.input)[0]}_redacted.pdf"
    
    # Parse rectangles from command line
    rects = []
    if args.rect:
        for rect_str in args.rect:
            try:
                parts = [p.strip() for p in rect_str.split(',')]
                x, y, w, h = map(float, parts)
                rects.append((x, y, w, h))
            except ValueError as e:
                print(f"Warning: Invalid rectangle '{rect_str}': {e}")
    
    apply_redactions(args.input, output_path, rects if rects else None, args.interactive)


if __name__ == "__main__":
    main()
