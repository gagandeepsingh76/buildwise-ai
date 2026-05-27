from fastapi import APIRouter, Depends

from app.dependencies import Services, get_services
from app.models.schemas import AskRequest, AskResponse


router = APIRouter(tags=["assistant"])


@router.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest, services: Services = Depends(get_services)) -> AskResponse:
    return await services.assistant.ask(request)
