import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from db.database import get_db, Document, Conversation, Activity
from models.schemas import DashboardStatsResponse, ActivityResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboard")

@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)):
    try:
        total_docs = db.query(Document).count()
        total_chats = db.query(Conversation).count()
        
        # Calculate generated counts based on activity records
        notes_gen = db.query(Activity).filter(Activity.activity_type == "notes").count()
        quizzes_gen = db.query(Activity).filter(Activity.activity_type == "quiz").count()
        
        return DashboardStatsResponse(
            total_documents=total_docs,
            total_chats=total_chats,
            notes_generated=notes_gen,
            quizzes_generated=quizzes_gen
        )
    except Exception as e:
        logger.error(f"Error fetching dashboard stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/activities", response_model=List[ActivityResponse])
def get_recent_activities(db: Session = Depends(get_db)):
    try:
        # Fetch the 15 most recent activities
        activities = db.query(Activity).order_by(Activity.timestamp.desc()).limit(15).all()
        return activities
    except Exception as e:
        logger.error(f"Error fetching recent activities: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
