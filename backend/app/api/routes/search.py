from fastapi import APIRouter, Depends

from app.dependencies import Services, get_services
from app.models.schemas import SearchRequest, SearchResponse


router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest, services: Services = Depends(get_services)) -> SearchResponse:
    results = await services.retrieval.search(request)
    return SearchResponse(results=services.retrieval.public_sources(results))
