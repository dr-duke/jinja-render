from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

DataFormat = Literal["auto", "yaml", "json"]
RenderMode = Literal["base", "ansible", "salt"]


class RenderOptionsIn(BaseModel):
    trim: bool = True
    lstrip: bool = False


class RenderRequest(BaseModel):
    template: str = Field(default="")
    data: str = Field(default="")
    data_format: DataFormat = "auto"
    render_mode: RenderMode = "base"
    options: RenderOptionsIn = Field(default_factory=RenderOptionsIn)


class RenderMeta(BaseModel):
    data_format_detected: str
    render_mode_applied: str
    filters_enabled: list[str]
    duration_ms: int


class RenderResponse(BaseModel):
    success: bool = True
    rendered: str
    data_parsed: Any
    meta: RenderMeta
    warnings: list[str] = []


class CapabilitiesResponse(BaseModel):
    render_modes: list[str]
    options: list[str]
    # Union of all filters across modes (backward-compatible flat list).
    filters: list[str]
    # Filters available per render mode (ansible exposes the emulated set).
    filters_by_mode: dict[str, list[str]] = {}
    # Name -> one-line description for project/emulated filters (autocomplete).
    filter_descriptions: dict[str, str] = {}
    # Emulated ansible fact variable names injected in ansible mode.
    ansible_facts: list[str] = []
    data_formats: list[str]


class Example(BaseModel):
    id: str
    title: str
    render_mode: str
    data_format: str
    template: str
    data: str


class ExamplesResponse(BaseModel):
    examples: list[Example]
    default: Example


class InfoResponse(BaseModel):
    name: str
    description: str
    version: str
    repository: str
    license: str
