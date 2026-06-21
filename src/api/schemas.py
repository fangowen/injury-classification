from typing import Optional
from pydantic import BaseModel, Field


class AthleteContext(BaseModel):
    age: Optional[int] = Field(None, ge=0, le=120)
    sex: Optional[str] = None
    sport: Optional[str] = None
    training_frequency: Optional[str] = None
    symptom_duration: Optional[str] = None
    notes: Optional[str] = None

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
    user_query: str = Field(..., min_length=3)
    athlete_context: AthleteContext


class QueryStarted(BaseModel):
    run_id: str
