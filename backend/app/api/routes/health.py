from fastapi import APIRouter, Depends

from app.dependencies import Services, get_services


router = APIRouter(tags=["health"])


@router.get("/health")
async def health(services: Services = Depends(get_services)):
    database = await services.repository.health()
    return {
        "status": "ok",
        "app": services.settings.app_name,
        "environment": services.settings.app_env,
        "database": database,
        "embedding_provider": services.settings.embedding_provider,
        "llm_provider": services.settings.llm_provider,
    }
