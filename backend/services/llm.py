import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise Exception("GEMINI_API_KEY not found")

genai.configure(api_key=API_KEY)

# Latest supported Flash model
model = genai.GenerativeModel("gemini-2.5-flash")
from typing import List, Dict, Optional


async def generate_response(
    message: str,
    history: List[Dict[str, str]],
    document_context: Optional[str] = None,
) -> str:
    """
    Generate a response using Gemini.
    """

    prompt = """
You are CampusPilot AI, an intelligent academic assistant.

Answer clearly and accurately.

Use markdown formatting.

"""

    if document_context:
        prompt += f"""

Use this uploaded document while answering:

{document_context}

"""

    if history:
        prompt += "\nConversation History:\n"

        for msg in history:
            prompt += f"{msg['sender']}: {msg['content']}\n"

    prompt += f"\nUser Question:\n{message}\n"

    try:
        response = model.generate_content(prompt)
        return response.text

    except Exception as e:
        return f"Gemini Error: {str(e)}"


async def generate_response_stream(
    message,
    history,
    document_context=None,
):
    """Fake streaming for now."""

    text = await generate_response(
        message,
        history,
        document_context,
    )

    for word in text.split():
        yield word + " "
async def generate_notes(document_context: str) -> str:
    """
    Generate structured study notes.
    """

    prompt = f"""
You are an expert professor.

Read the following study material and generate:

# Title

## Important Concepts

## Key Definitions

## Examples

## Formulas (if any)

## Interview Questions

## Summary

Study Material:

{document_context}
"""

    try:
        response = model.generate_content(prompt)
        return response.text

    except Exception as e:
        return f"Gemini Error: {str(e)}"
import json

async def generate_quiz(document_context: str, num_questions: int = 5):
    """
    Generate MCQs from document.
    """

    prompt = f"""
Generate {num_questions} multiple-choice questions from the following study material.

Return ONLY valid JSON.

Example:

[
 {{
   "question":"...",
   "options":["A","B","C","D"],
   "answer":"A"
 }}
]

Study Material:

{document_context}
"""

    try:
        response = model.generate_content(prompt)

        text = response.text.strip()

        if text.startswith("```json"):
            text = text.replace("```json", "").replace("```", "").strip()

        return json.loads(text)

    except Exception:
        return [
            {
                "question": "Quiz generation failed",
                "options": [
                    "Retry",
                    "Check API",
                    "Restart",
                    "Ignore"
                ],
                "answer": "Retry"
            }
        ]
async def generate_study_plan(document_context: str):
    """
    CampusPilot AI Study Coach
    """

    prompt = f"""
You are an AI Study Coach.

Analyze this study material.

Return markdown containing:

# Subject

# Difficulty

# Important Topics

# Weak Areas

# Estimated Study Time

# 3 Day Study Plan

# Revision Tips

# Exam Readiness Score (0-100)

Study Material:

{document_context}
"""

    response = model.generate_content(prompt)

    return response.text