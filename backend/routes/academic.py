import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db, Document, Activity
from models.schemas import (
    NotesGenerateRequest,
    NotesGenerateResponse,
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizQuestion,
)
from services.llm import (
    generate_notes,
    generate_quiz,
    generate_study_plan,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


class StudyPlanRequest(BaseModel):
    document_id: int


# ==========================
# Generate Notes
# ==========================
@router.post("/notes/generate", response_model=NotesGenerateResponse)
async def generate_document_notes(
    payload: NotesGenerateRequest,
    db: Session = Depends(get_db),
):
    try:
        doc = db.query(Document).filter(Document.id == payload.document_id).first()

        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        if not doc.text_content or not doc.text_content.strip():
            raise HTTPException(
                status_code=400,
                detail="This document has no readable text content.",
            )

        logger.info(f"Generating notes for {doc.filename}")

        notes = await generate_notes(doc.text_content)

        activity = Activity(
            activity_type="notes",
            detail=f"Generated notes for '{doc.filename}'",
        )

        db.add(activity)
        db.commit()

        return NotesGenerateResponse(notes=notes)

    except HTTPException:
        raise

    except Exception as e:
        logger.error(str(e))
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ==========================
# Generate Quiz
# ==========================
@router.post("/quiz/generate", response_model=QuizGenerateResponse)
async def generate_document_quiz(
    payload: QuizGenerateRequest,
    db: Session = Depends(get_db),
):
    try:
        doc = db.query(Document).filter(Document.id == payload.document_id).first()

        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        if not doc.text_content or not doc.text_content.strip():
            raise HTTPException(
                status_code=400,
                detail="This document has no readable text content.",
            )

        logger.info(f"Generating quiz for {doc.filename}")

        quiz = await generate_quiz(
            doc.text_content,
            payload.num_questions,
        )

        validated_questions = []

        for q in quiz:

            answer = q.get("answer", "a").lower().strip()

            if answer.startswith("a"):
                answer = "a"
            elif answer.startswith("b"):
                answer = "b"
            elif answer.startswith("c"):
                answer = "c"
            elif answer.startswith("d"):
                answer = "d"

            validated_questions.append(
                QuizQuestion(
                    question=q.get("question", ""),
                    options=q.get("options", []),
                    answer=answer,
                )
            )

        activity = Activity(
            activity_type="quiz",
            detail=f"Generated quiz for '{doc.filename}'",
        )

        db.add(activity)
        db.commit()

        return QuizGenerateResponse(
            quiz=validated_questions
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(str(e))
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ==========================
# AI Study Coach ⭐
# ==========================
@router.post("/study-plan")
async def generate_document_study_plan(
    payload: StudyPlanRequest,
    db: Session = Depends(get_db),
):
    try:

        doc = db.query(Document).filter(
            Document.id == payload.document_id
        ).first()

        if not doc:
            raise HTTPException(
                status_code=404,
                detail="Document not found",
            )

        if not doc.text_content or not doc.text_content.strip():
            raise HTTPException(
                status_code=400,
                detail="Document has no readable text.",
            )

        study_plan = await generate_study_plan(
            doc.text_content
        )

        activity = Activity(
            activity_type="study_plan",
            detail=f"Generated study plan for '{doc.filename}'",
        )

        db.add(activity)
        db.commit()

        return {
            "study_plan": study_plan
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.error(str(e))
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))