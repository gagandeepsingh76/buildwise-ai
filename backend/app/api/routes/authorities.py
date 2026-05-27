from fastapi import APIRouter, Depends

from app.dependencies import Services, get_services
from app.models.schemas import Authority


router = APIRouter(tags=["authorities"])


@router.get("/authorities", response_model=list[Authority])
async def list_authorities(services: Services = Depends(get_services)) -> list[Authority]:
    return services.authorities.list()
