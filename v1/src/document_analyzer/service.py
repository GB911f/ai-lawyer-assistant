import re


def summarize(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return "Текст документа не извлечён. Проверьте формат файла или подключите OCR."
    preview = cleaned[:500]
    risks: list[str] = []
    lowered = cleaned.lower()
    if "срок" not in lowered:
        risks.append("не найдено явное условие о сроке")
    if "ответствен" not in lowered and "неустой" not in lowered:
        risks.append("не найден блок ответственности")
    if "прием" not in lowered and "приём" not in lowered:
        risks.append("не найден порядок приёмки")
    risk_text = "; ".join(risks) if risks else "явных структурных пропусков по базовым маркерам не найдено"
    return f"Краткое содержание: {preview}\n\nАвтоматические проверки: {risk_text}."
