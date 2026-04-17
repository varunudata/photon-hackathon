from __future__ import annotations
from typing import AsyncIterator

import google.generativeai as genai

from app.config import get_settings

settings = get_settings()

genai.configure(api_key=settings.gemini_api_key)


async def stream_answer(prompt: str, question: str) -> AsyncIterator[str]:
    """
    Stream tokens from Gemini using the chat/generate API.
    Yields individual text chunks as they arrive.
    """
    model = genai.GenerativeModel(settings.gemini_chat_model)

    # Use streaming generation
    response = await model.generate_content(
        prompt,
        generation_config=genai.types.GenerationConfig(
            temperature=0.2,
            max_output_tokens=2048,
        ),
        stream=True,
    )

    for chunk in response:
        text = chunk.text if hasattr(chunk, "text") else ""
        if text:
            yield text
