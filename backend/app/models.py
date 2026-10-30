"""Relational model. Offices are separate from the people who hold them; candidacies hang off
elections; every status change of a candidacy is kept in candidacy_history."""
from __future__ import annotations

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Party(Base):
    __tablename__ = "parties"
    code: Mapped[str] = mapped_column(String(2), primary_key=True)
    name_en: Mapped[str] = mapped_column(String(80))
    name_ar: Mapped[str] = mapped_column(String(80))
    group: Mapped[str] = mapped_column(String(2))  # D | R | I | O | U  (coloring group)
    color: Mapped[str] = mapped_column(String(9))


class State(Base):
    __tablename__ = "states"
    fips: Mapped[str] = mapped_column(String(2), primary_key=True)
    abbr: Mapped[str] = mapped_column(String(2), unique=True, index=True)
    name_en: Mapped[str] = mapped_column(String(60))
    name_ar: Mapped[str] = mapped_column(String(60))
    capital_en: Mapped[str] = mapped_column(String(60))
    capital_ar: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(20))  # state | federal_district | territory


class Source(Base):
    __tablename__ = "sources"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name_ar: Mapped[str] = mapped_column(String(200))
    name_en: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20))  # official | announced | estimate | hypothetical
    verified_at: Mapped[str | None] = mapped_column(String(30))  # last successful check by us
    valid_as_of: Mapped[str | None] = mapped_column(String(30))  # date the source itself reports
    note: Mapped[str] = mapped_column(Text, default="")


class DatasetStatus(Base):
    """Freshness and health of each dataset; a failed refresh keeps the last success visible."""
    __tablename__ = "dataset_status"
    name: Mapped[str] = mapped_column(String(40), primary_key=True)
    label: Mapped[str] = mapped_column(String(120))
    updated_at: Mapped[str | None] = mapped_column(String(30))  # effective date of the data
    verified_at: Mapped[str | None] = mapped_column(String(30))  # last successful verification
    last_attempt_at: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(10), default="ok")  # ok | failed
    message: Mapped[str] = mapped_column(Text, default="")
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    source_ids: Mapped[list] = mapped_column(JSON, default=list)


class Person(Base):
    __tablename__ = "persons"
    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    name_en: Mapped[str] = mapped_column(String(120))
    name_ar: Mapped[str | None] = mapped_column(String(120))
    bioguide: Mapped[str | None] = mapped_column(String(10))
    wikipedia: Mapped[str | None] = mapped_column(String(200))
    photo_url: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(Text)
    fec_ids: Mapped[list | None] = mapped_column(JSON)


class Office(Base):
    __tablename__ = "offices"
    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    kind: Mapped[str] = mapped_column(String(10), index=True)  # governor | senate | house
    state: Mapped[str] = mapped_column(String(2), ForeignKey("states.abbr"), index=True)
    senate_class: Mapped[int | None] = mapped_column(Integer)
    district: Mapped[int | None] = mapped_column(Integer)
    geoid: Mapped[str | None] = mapped_column(String(4), index=True)
    map_version: Mapped[int | None] = mapped_column(Integer)  # 119 (current) | 120 (2026 election maps)
    next_election_year: Mapped[int | None] = mapped_column(Integer)


class Holding(Base):
    """A person holding an office for a term."""
    __tablename__ = "holdings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    office_id: Mapped[str] = mapped_column(ForeignKey("offices.id"), index=True)
    person_id: Mapped[str | None] = mapped_column(ForeignKey("persons.id"))
    party: Mapped[str | None] = mapped_column(String(2))
    term_start: Mapped[str | None] = mapped_column(String(10))
    term_end: Mapped[str | None] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10), default="current")  # current | vacant | former
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"))
    data_type: Mapped[str] = mapped_column(String(12))
    completeness: Mapped[str] = mapped_column(String(10))
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    first_seen: Mapped[str | None] = mapped_column(String(30))
    last_seen: Mapped[str | None] = mapped_column(String(30))
    office = relationship("Office")
    person = relationship("Person")


class Election(Base):
    __tablename__ = "elections"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    office_id: Mapped[str] = mapped_column(ForeignKey("offices.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # general | special
    cycle: Mapped[int] = mapped_column(Integer)
    election_date: Mapped[str] = mapped_column(String(10))
    primary_date: Mapped[str | None] = mapped_column(String(10))
    runoff_date: Mapped[str | None] = mapped_column(String(10))
    filing_deadline: Mapped[str | None] = mapped_column(String(10))
    incumbent_status: Mapped[str] = mapped_column(String(14))
    status_text: Mapped[str | None] = mapped_column(Text)
    incumbents: Mapped[list] = mapped_column(JSON, default=list)
    defending_party: Mapped[str | None] = mapped_column(String(2))
    pvi: Mapped[str | None] = mapped_column(String(10))
    is_open: Mapped[bool] = mapped_column(Boolean, default=False)
    candidates_undetermined: Mapped[bool] = mapped_column(Boolean, default=False)
    uncontested: Mapped[bool] = mapped_column(Boolean, default=False)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"))
    office = relationship("Office")


class Candidacy(Base):
    __tablename__ = "candidacies"
    __table_args__ = (UniqueConstraint("election_id", "key"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    election_id: Mapped[str] = mapped_column(ForeignKey("elections.id"), index=True)
    key: Mapped[str] = mapped_column(String(120))  # normalized name (stable identity within an election)
    name_en: Mapped[str] = mapped_column(String(120))
    name_ar: Mapped[str | None] = mapped_column(String(120))
    party: Mapped[str] = mapped_column(String(2))
    party_label: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20))  # declared | potential | withdrawn | not_listed
    stage: Mapped[str] = mapped_column(String(20))
    is_incumbent: Mapped[bool] = mapped_column(Boolean, default=False)
    fec_id: Mapped[str | None] = mapped_column(String(12))
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"))
    data_type: Mapped[str] = mapped_column(String(12))
    first_seen: Mapped[str] = mapped_column(String(30))
    last_changed: Mapped[str] = mapped_column(String(30))
    history = relationship("CandidacyHistory", back_populates="candidacy", cascade="all, delete-orphan")


class CandidacyHistory(Base):
    __tablename__ = "candidacy_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidacy_id: Mapped[int] = mapped_column(ForeignKey("candidacies.id"), index=True)
    status: Mapped[str] = mapped_column(String(20))
    party: Mapped[str] = mapped_column(String(2))
    recorded_at: Mapped[str] = mapped_column(String(30))
    candidacy = relationship("Candidacy", back_populates="history")


class Forecast(Base):
    """A third-party rating. Qualitative categories only; numeric probabilities are never fabricated."""
    __tablename__ = "forecasts"
    __table_args__ = (UniqueConstraint("election_id", "forecaster", "published_on"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    election_id: Mapped[str] = mapped_column(ForeignKey("elections.id"), index=True)
    forecaster: Mapped[str] = mapped_column(String(20))
    forecaster_name: Mapped[str] = mapped_column(String(80))
    forecaster_url: Mapped[str | None] = mapped_column(Text)
    rating_label: Mapped[str] = mapped_column(String(30))
    rating_party: Mapped[str | None] = mapped_column(String(2))
    rating_level: Mapped[int] = mapped_column(Integer)  # 4 solid/safe .. 0 tossup
    flip: Mapped[bool] = mapped_column(Boolean, default=False)
    published_on: Mapped[str] = mapped_column(String(10))
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"))
    data_type: Mapped[str] = mapped_column(String(12), default="estimate")


class KeyValue(Base):
    """Small blobs produced by ingestion: data-quality report, constitutional constants."""
    __tablename__ = "key_values"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
