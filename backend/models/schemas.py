import datetime
from pydantic import BaseModel, ConfigDict
from typing import List, Optional

class MessageBase(BaseModel):
    sender: str  # "user" or "bot"
    content: str

class MessageCreate(MessageBase):
    pass

class MessageResponse(MessageBase):
    id: int
    session_id: str
    timestamp: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class ChatRequest(BaseModel):
    message: str
    session_id: str
    document_id: Optional[int] = None  # Optional document to ground the response

class ChatResponse(BaseModel):
    reply: str
    timestamp: datetime.datetime

class ConversationResponse(BaseModel):
    session_id: str
    title: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class DocumentResponse(BaseModel):
    id: int
    filename: str
    filepath: str
    file_size: int
    upload_date: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class ActivityResponse(BaseModel):
    id: int
    activity_type: str
    detail: str
    timestamp: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class DashboardStatsResponse(BaseModel):
    total_documents: int
    total_chats: int
    notes_generated: int
    quizzes_generated: int

class NotesGenerateRequest(BaseModel):
    document_id: int

class NotesGenerateResponse(BaseModel):
    notes: str

class QuizGenerateRequest(BaseModel):
    document_id: int
    num_questions: int = 5

class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    answer: str  # Option index/letter, e.g. "a", "b", "c", "d"

class QuizGenerateResponse(BaseModel):
    quiz: List[QuizQuestion]
