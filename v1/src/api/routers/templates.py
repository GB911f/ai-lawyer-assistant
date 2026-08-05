from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from src.auth.deps import current_user
from src.db.models import User
from src.docgen.exporters import export_docx, export_pdf
from src.docgen.generator import generate_document
from src.docgen.schemas import schemas_as_dict

router = APIRouter()


class GenerateRequest(BaseModel):
    template_type: str
    fields: dict[str, Any] = Field(default_factory=dict)
    items: list[dict[str, Any]] = Field(default_factory=list)
    images: list[dict[str, Any]] = Field(default_factory=list)


@router.get("/schemas")
async def schemas(user: User = Depends(current_user)) -> dict:
    return schemas_as_dict()


def build(request: GenerateRequest):
    try:
        return generate_document(request.template_type, request.fields, request.items, request.images)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/generate")
async def generate(request: GenerateRequest, user: User = Depends(current_user)) -> dict:
    return build(request).as_dict()


@router.post("/export/docx")
async def docx(request: GenerateRequest, user: User = Depends(current_user)) -> Response:
    payload = export_docx(build(request))
    return Response(
        payload,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=jarvis-demo-document.docx"},
    )


@router.post("/export/pdf")
async def pdf(request: GenerateRequest, user: User = Depends(current_user)) -> Response:
    payload = export_pdf(build(request))
    return Response(
        payload,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=jarvis-demo-document.pdf"},
    )
