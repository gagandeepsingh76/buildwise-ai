from fastapi import APIRouter, Depends

from app.dependencies import Services, get_services
from app.models.schemas import FeedbackCreate, FeedbackRecord


router = APIRouter(tags=["feedback"])


@router.post("/feedback", response_model=FeedbackRecord)
async def add_feedback(payload: FeedbackCreate, services: Services = Depends(get_services)) -> FeedbackRecord:
    record_payload = payload.model_dump()
    record = (
        await services.repository.add_feedback(record_payload)
        if services.repository.enabled
        else services.store.add_feedback(record_payload)
    )
    return FeedbackRecord(**record)
