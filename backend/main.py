import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from db.database import init_db
from routes.chat import router as chat_router
from routes.documents import router as documents_router
from routes.academic import router as academic_router
from routes.dashboard import router as dashboard_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite Database on startup
    logger.info("Initializing SQLite database...")
    init_db()
    
    # Ensure uploads directory exists
    os.makedirs("uploads", exist_ok=True)
    logger.info("Uploads directory verified.")
    
    yield
    logger.info("Shutting down CampusPilot API...")

app = FastAPI(
    title="CampusPilot AI API",
    description="FastAPI backend for CampusPilot AI - Smart Academic Assistant.",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS for local development
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "*"  # Allow all for development flexibility
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(chat_router)
app.include_router(documents_router)
app.include_router(academic_router)
app.include_router(dashboard_router)

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "CampusPilot AI backend is running."}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
