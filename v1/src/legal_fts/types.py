from dataclasses import dataclass


@dataclass(frozen=True)
class LegalSearchHit:
    title: str
    path: str
    text: str
    score: float
