from fastapi import APIRouter, Depends

from app.dependencies import Services, get_services
from app.models.schemas import HistoryItem


router = APIRouter(tags=["history"])


@router.get("/history", response_model=list[HistoryItem])
async def history(limit: int = 25, services: Services = Depends(get_services)) -> list[HistoryItem]:
    if services.repository.enabled:
        records = await services.repository.history(limit)
    else:
        records = services.store.queries[:limit]
    return [
        HistoryItem(
            id=str(record["id"]),
            session_id=record.get("session_id"),
            query=record["query"],
            language=record.get("language", "en"),
            detected=record.get("detected") or {},
            answer=record.get("answer") or {},
            sources=record.get("sources") or [],
            confidence=record.get("confidence"),
            created_at=record.get("created_at"),
        )
        for record in records
    ]
