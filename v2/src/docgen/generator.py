from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from src.docgen.schemas import get_template_schemas


@dataclass(frozen=True)
class GeneratedDocument:
    template_type: str
    fields: dict[str, Any]
    items: list[dict[str, Any]]
    images: list[dict[str, Any]]
    total: float
    markdown: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "template_type": self.template_type,
            "fields": self.fields,
            "items": self.items,
            "images": self.images,
            "total": self.total,
            "markdown": self.markdown,
        }


def decimal_value(value: Any) -> Decimal:
    try:
        return Decimal(str(value or "0").replace(" ", "").replace(",", "."))
    except InvalidOperation:
        return Decimal("0")


def generate_document(
    template_type: str,
    fields: dict[str, Any],
    items: list[dict[str, Any]],
    images: list[dict[str, Any]] | None = None,
) -> GeneratedDocument:
    schemas = get_template_schemas()
    if template_type not in schemas:
        raise ValueError(f"Unknown template type: {template_type}")
    normalized_items: list[dict[str, Any]] = []
    total = Decimal("0")
    for index, item in enumerate(items, 1):
        quantity = decimal_value(item.get("количество"))
        price = decimal_value(item.get("цена"))
        line_total = quantity * price
        total += line_total
        normalized_items.append(
            {
                **item,
                "no": index,
                "количество": float(quantity),
                "цена": float(price),
                "сумма": float(line_total),
            }
        )
    schema = schemas[template_type]
    lines = [f"# {schema.title}", "", "ДЕМОНСТРАЦИОННЫЙ ЧЕРНОВИК", ""]
    for spec in schema.fields:
        value = fields.get(spec.name, spec.default)
        if value not in (None, ""):
            lines.append(f"- **{spec.label}:** {value}")
    if normalized_items:
        lines.extend(["", "## Позиции", ""])
        for item in normalized_items:
            lines.append(
                f"{item['no']}. {item.get('наименование', '')} — "
                f"{item['количество']} × {item['цена']:.2f} = {item['сумма']:.2f} руб."
            )
        lines.extend(["", f"**Итого:** {float(total):.2f} руб."])
    lines.extend(["", "Документ создан на синтетических данных и требует проверки юристом."])
    return GeneratedDocument(
        template_type=template_type,
        fields=fields,
        items=normalized_items,
        images=images or [],
        total=float(total),
        markdown="\n".join(lines),
    )
