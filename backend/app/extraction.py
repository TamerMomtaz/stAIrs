"""ST.AIRS — Document Text Extraction"""

import csv
import io


def extract_text(file_bytes: bytes, filename: str, content_type: str) -> tuple:
    """Extract text from a document. Returns (text, extra_metadata)."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    try:
        if ext == "pdf" or content_type == "application/pdf":
            return _extract_pdf(file_bytes)
        elif ext == "docx" or "wordprocessingml" in content_type:
            return _extract_docx(file_bytes)
        elif ext == "xlsx" or "spreadsheetml" in content_type:
            return _extract_xlsx(file_bytes)
        elif ext == "csv" or content_type == "text/csv":
            return _extract_csv(file_bytes)
        elif ext == "txt" or content_type.startswith("text/"):
            return _extract_txt(file_bytes)
        elif content_type.startswith("image/"):
            return "", {"note": "Image file — no text extraction"}
        else:
            return "", {"note": "Unsupported format for extraction"}
    except Exception as e:
        return "extraction_failed", {"extraction_error": str(e)}


def _extract_pdf(file_bytes: bytes) -> tuple:
    from PyPDF2 import PdfReader
    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)
    full_text = "\n\n".join(pages).strip()
    return full_text or "extraction_failed", {"page_count": len(reader.pages)}


def _extract_docx(file_bytes: bytes) -> tuple:
    from docx import Document
    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    full_text = "\n".join(paragraphs).strip()
    return full_text or "extraction_failed", {"paragraph_count": len(paragraphs)}


def _extract_xlsx(file_bytes: bytes) -> tuple:
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    lines = []
    sheet_count = len(wb.sheetnames)
    for sheet in wb.worksheets:
        lines.append(f"--- Sheet: {sheet.title} ---")
        for row in sheet.iter_rows(values_only=True):
            cells = [str(c) if c is not None else "" for c in row]
            if any(cells):
                lines.append("\t".join(cells))
    wb.close()
    full_text = "\n".join(lines).strip()
    return full_text or "extraction_failed", {"sheet_count": sheet_count}


def _extract_csv(file_bytes: bytes) -> tuple:
    text = file_bytes.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    lines = ["\t".join(row) for row in rows]
    full_text = "\n".join(lines).strip()
    return full_text or "extraction_failed", {"row_count": len(rows)}


def _extract_txt(file_bytes: bytes) -> tuple:
    text = file_bytes.decode("utf-8", errors="replace").strip()
    return text or "extraction_failed", {}
