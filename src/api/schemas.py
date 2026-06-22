from typing import Optional
from pydantic import BaseModel, Field, field_validator


def _clean(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    return v or None


class AthleteContext(BaseModel):
    age: Optional[int] = Field(None, ge=0, le=120)
    sex: Optional[str] = Field(None, max_length=20)
    sport: Optional[str] = Field(None, max_length=80)
    training_frequency: Optional[str] = Field(None, max_length=80)
    symptom_duration: Optional[str] = Field(None, max_length=80)
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("sex", "sport", "training_frequency", "symptom_duration", "notes", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v) if isinstance(v, str) else v

    def to_text(self) -> str:
        bits: list[str] = []
        if self.age is not None and self.sex:
            bits.append(f"{self.age}-year-old {self.sex.lower()}")
        elif self.age is not None:
            bits.append(f"{self.age} years old")
        elif self.sex:
            bits.append(self.sex)
        if self.sport:
            bits.append(self.sport)
        if self.training_frequency:
            bits.append(f"trains {self.training_frequency}")
        if self.symptom_duration:
            bits.append(f"symptoms for {self.symptom_duration}")
        if self.notes:
            bits.append(self.notes)
        return ", ".join(bits) if bits else "no context provided"


class QueryRequest(BaseModel):
    user_query: str = Field(..., min_length=3, max_length=1000)
    athlete_context: AthleteContext

    @field_validator("user_query", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


class QueryStarted(BaseModel):
    run_id: str
