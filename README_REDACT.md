# PDF Redaction Feature

Permanently obscure sensitive content (text, images, or areas) in PDF documents.

## Usage

### Command Line

```bash
# Interactive mode - manually select redaction areas
python redact_pdf.py input.pdf --interactive

# Programmatic mode with specific coordinates
python redact_pdf.py input.pdf --output output.pdf --rect "100,200,300,50" --rect "400,150,200,75"
```

### As part of GenOffice workflow

```bash
# Convert markdown to PDF first, then redact
python make_pdf.py budget_proposal.md
python redact_pdf.py budget_proposal.pdf --output budget_redacted.pdf --rect "50,100,200,30"
```

## How It Works

This feature creates permanent redaction boxes that:
1. Remove the underlying content from the PDF
2. Replace it with a black box (or custom appearance)
3. Ensure compliance with security standards

### Coordinate System

- Coordinates are in **PDF points** (72 points = 1 inch)
- Format: `x,y,width,height`
- Y-axis is measured from the bottom of the page

## Security Notes

⚠️ **Important**: Redactions must be applied correctly to ensure permanent removal. This implementation uses PDF standard redaction annotations with the permanent flag set.

For maximum security, always preview the redacted output before sharing sensitive documents.
