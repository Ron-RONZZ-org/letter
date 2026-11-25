from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Party(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(default="", max_length=200)
    title: str = Field(default="", max_length=200)
    organization: str = Field(default="", max_length=200)
    street: str = Field(default="", max_length=200)
    postal_code: str = Field(default="", max_length=40)
    city: str = Field(default="", max_length=120)
    region: str = Field(default="", max_length=120)
    country: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=80)
    email: str = Field(default="", max_length=254)
    website: str = Field(default="", max_length=300)


class LetterRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    style: Literal["fr-formal", "en-formal", "minimal"] = "fr-formal"
    mode: Literal["letter", "email"] = "letter"
    paper: Literal["a4", "us-letter"] = "a4"

    sender: Party = Field(default_factory=Party)
    recipient: Party = Field(default_factory=Party)

    place: str = Field(default="", max_length=120)
    date: str = Field(default="", max_length=60)
    subject: str = Field(default="", max_length=300)
    reference: str = Field(default="", max_length=120)
    your_ref: str = Field(default="", max_length=120)
    our_ref: str = Field(default="", max_length=120)
    salutation: str = Field(default="", max_length=200)
    body: str = Field(default="", max_length=50_000)
    closing: str = Field(default="", max_length=200)
    enclosures: str = Field(default="", max_length=1_000)
    cc: str = Field(default="", max_length=1_000)
    attach_pdf: bool = True

    @model_validator(mode="after")
    def _require_content(self) -> "LetterRequest":
        if not self.body:
            raise ValueError("body is required")
        if not (self.sender.name or self.sender.organization):
            raise ValueError("sender name or organization is required")
        if not (self.recipient.name or self.recipient.organization):
            raise ValueError("recipient name or organization is required")
        return self
