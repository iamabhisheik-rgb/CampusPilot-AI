import os
import io
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from pypdf import PdfReader

from db.database import get_db, Document, Activity
from models.schemas import DocumentResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # Validate file extension
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    try:
        # Save file to uploads folder
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        file_bytes = await file.read()
        
        with open(file_path, "wb") as f:
            f.write(file_bytes)
            
        file_size = len(file_bytes)

        # Parse text content from PDF using pypdf
        logger.info(f"Parsing PDF text content for {file.filename} ({file_size} bytes)")
        pdf_file = io.BytesIO(file_bytes)
        reader = PdfReader(pdf_file)
        
        extracted_text = ""
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                extracted_text += text + "\n"
                
        # Handle cases where PDF contains no selectable text (scanned image, etc.)
        if not extracted_text.strip():
            extracted_text = "This PDF file contains no selectable text (it may be scanned or empty)."
            logger.warning(f"No selectable text found in PDF: {file.filename}")

        # Save metadata to DB
        doc = Document(
            filename=file.filename,
            filepath=file_path,
            file_size=file_size,
            text_content=extracted_text
        )
        db.add(doc)
        
        # Log activity to DB
        size_kb = round(file_size / 1024, 1)
        activity = Activity(
            activity_type="upload",
            detail=f"Uploaded document '{file.filename}' ({size_kb} KB)"
        )
        db.add(activity)
        
        db.commit()
        db.refresh(doc)
        
        logger.info(f"Successfully uploaded and parsed document: {file.filename}")
        return doc
        
    except Exception as e:
        logger.error(f"Error uploading document {file.filename}: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

@router.get("", response_model=List[DocumentResponse])
def list_documents(db: Session = Depends(get_db)):
    try:
        docs = db.query(Document).order_by(Document.upload_date.desc()).all()
        return docs
    except Exception as e:
        logger.error(f"Error listing documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
            
        # Delete file from filesystem if it exists
        if os.path.exists(doc.filepath):
            try:
                os.remove(doc.filepath)
            except Exception as fe:
                logger.error(f"Failed to delete file from disk: {doc.filepath}, error: {str(fe)}")

        # Log activity
        activity = Activity(
            activity_type="delete",
            detail=f"Deleted document '{doc.filename}'"
        )
        db.add(activity)

        # Delete database entry
        db.delete(doc)
        db.commit()
        
        return {"status": "ok", "message": f"Successfully deleted document {doc_id}."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document {doc_id}: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
