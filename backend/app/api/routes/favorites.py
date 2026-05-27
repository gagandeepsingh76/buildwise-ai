from fastapi import APIRouter, Depends, Response, status

from app.dependencies import Services, get_services
from app.models.schemas import FavoriteCreate, FavoriteRecord


router = APIRouter(tags=["favorites"])


@router.get("/favorites", response_model=list[FavoriteRecord])
async def list_favorites(limit: int = 50, services: Services = Depends(get_services)) -> list[FavoriteRecord]:
    records = await services.repository.list_favorites(limit) if services.repository.enabled else services.store.favorites[:limit]
    return [FavoriteRecord(**record) for record in records]


@router.post("/favorites", response_model=FavoriteRecord)
async def add_favorite(payload: FavoriteCreate, services: Services = Depends(get_services)) -> FavoriteRecord:
    record_payload = payload.model_dump()
    record = (
        await services.repository.add_favorite(record_payload)
        if services.repository.enabled
        else services.store.add_favorite(record_payload)
    )
    return FavoriteRecord(**record)


@router.delete(
    "/favorites/{favorite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_favorite(favorite_id: str, services: Services = Depends(get_services)):
    if services.repository.enabled:
        await services.repository.delete_favorite(favorite_id)
    else:
        services.store.delete_favorite(favorite_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
