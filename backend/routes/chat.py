import json
import logging
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List, Optional

from db.database import get_db, Conversation, Message, Document, Activity, SessionLocal
from models.schemas import ChatRequest, ChatResponse, MessageResponse, ConversationResponse
from services.llm import generate_response, generate_response_stream

logger = logging.getLogger(__name__)

router = APIRouter()

def get_or_create_conversation(db: Session, session_id: str) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.session_id == session_id).first()
    if not conv:
        conv = Conversation(session_id=session_id, title="New Conversation")
        db.add(conv)
        db.commit()
        db.refresh(conv)
    return conv

def save_db_message(db: Session, session_id: str, sender: str, content: str) -> Message:
    conv = get_or_create_conversation(db, session_id)
    
    # Auto-generate title if this is the first message
    if sender == "user":
        message_count = db.query(Message).filter(Message.session_id == session_id).count()
        if message_count == 0:
            # First message! Update conversation title
            title_text = content[:35] + "..." if len(content) > 35 else content
            conv.title = title_text
            db.add(conv)
            
    msg = Message(session_id=session_id, sender=sender, content=content)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg

@router.get("/api/conversations", response_model=List[ConversationResponse])
def list_conversations(db: Session = Depends(get_db)):
    try:
        conversations = db.query(Conversation).order_by(Conversation.created_at.desc()).all()
        return conversations
    except Exception as e:
        logger.error(f"Error listing conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/conversations/{session_id}")
def delete_conversation(session_id: str, db: Session = Depends(get_db)):
    try:
        conv = db.query(Conversation).filter(Conversation.session_id == session_id).first()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        db.delete(conv)
        
        # Log activity
        activity = Activity(
            activity_type="delete",
            detail=f"Cleared conversation '{conv.title}'"
        )
        db.add(activity)
        db.commit()
        return {"status": "ok", "message": "Conversation successfully deleted."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest, db: Session = Depends(get_db)):
    try:
        # Save user message
        save_db_message(db, payload.session_id, "user", payload.message)
        
        # Fetch document context if document_id is provided
        doc_context = None
        if payload.document_id:
            doc = db.query(Document).filter(Document.id == payload.document_id).first()
            if doc:
                doc_context = doc.text_content
                logger.info(f"Chat grounded with document {doc.filename}")
                
        # Load conversation history (excluding the current user message)
        db_messages = db.query(Message).filter(Message.session_id == payload.session_id).order_by(Message.timestamp.asc()).all()
        history = []
        for msg in db_messages[:-1]:
            history.append({"sender": msg.sender, "content": msg.content})
            
        # Generate response from LLM
        reply_content = await generate_response(payload.message, history, doc_context)
        
        # Save bot response
        bot_msg = save_db_message(db, payload.session_id, "bot", reply_content)
        
        # Log activity
        activity = Activity(
            activity_type="chat",
            detail=f"Asked: '{payload.message[:35]}...'"
        )
        db.add(activity)
        db.commit()
        
        return ChatResponse(reply=reply_content, timestamp=bot_msg.timestamp)
    except Exception as e:
        logger.error(f"Error in HTTP chat endpoint: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/history/{session_id}", response_model=List[MessageResponse])
def get_history_endpoint(session_id: str, db: Session = Depends(get_db)):
    try:
        get_or_create_conversation(db, session_id)
        messages = db.query(Message).filter(Message.session_id == session_id).order_by(Message.timestamp.asc()).all()
        return messages
    except Exception as e:
        logger.error(f"Error fetching history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.websocket("/ws/chat/{session_id}")
async def websocket_chat_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    logger.info(f"WebSocket client connected for session {session_id}")
    
    db = SessionLocal()
    try:
        get_or_create_conversation(db, session_id)
        
        while True:
            data_str = await websocket.receive_text()
            try:
                data = json.loads(data_str)
                user_msg_content = data.get("message", "").strip()
                document_id = data.get("document_id", None)
            except json.JSONDecodeError:
                user_msg_content = data_str.strip()
                document_id = None

            if not user_msg_content:
                continue
                
            logger.info(f"WS message: {user_msg_content[:50]}... (doc_id={document_id})")
            
            # 1. Save user message
            save_db_message(db, session_id, "user", user_msg_content)
            
            # 2. Load grounding document context if any
            doc_context = None
            if document_id:
                doc = db.query(Document).filter(Document.id == document_id).first()
                if doc:
                    doc_context = doc.text_content
                    logger.info(f"WS Grounding with document {doc.filename}")
            
            # 3. Load history (excluding current user message)
            db_messages = db.query(Message).filter(Message.session_id == session_id).order_by(Message.timestamp.asc()).all()
            history = []
            for msg in db_messages[:-1]:
                history.append({"sender": msg.sender, "content": msg.content})
                
            # Send initial message to indicate generation start
            await websocket.send_json({
                "type": "start"
            })
            
            # 4. Stream response from LLM
            full_reply = ""
            async for chunk in generate_response_stream(user_msg_content, history, doc_context):
                full_reply += chunk
                await websocket.send_json({
                    "type": "chunk",
                    "content": chunk
                })
                
            # 5. Save assistant reply to database
            bot_msg = save_db_message(db, session_id, "bot", full_reply)
            
            # 6. Log activity to database
            activity = Activity(
                activity_type="chat",
                detail=f"Asked (via WS): '{user_msg_content[:35]}...'"
            )
            db.add(activity)
            db.commit()
            
            # Send completion event
            await websocket.send_json({
                "type": "done",
                "reply": full_reply,
                "timestamp": bot_msg.timestamp.isoformat()
            })
            
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"Error in WebSocket handler: {str(e)}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Server error: {str(e)}"
            })
        except Exception:
            pass
    finally:
        db.close()
