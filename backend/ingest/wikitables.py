"""Helpers for turning Wikipedia-rendered HTML tables into grids."""
from __future__ import annotations

from bs4 import BeautifulSoup, Tag


def clean(s: str) -> str:
    return " ".join(s.replace("\xa0", " ").split())


def cell_text(td: Tag) -> str:
    for sup in td.find_all("sup"):
        sup.decompose()
    for s in td.find_all(["style"]):
        s.decompose()
    return clean(td.get_text(" "))


def table_grid(table: Tag) -> list[list[Tag]]:
    """Expand rowspan/colspan into a rectangular grid of cell Tags."""
    grid: list[list[Tag | None]] = []
    pending: dict[tuple[int, int], Tag] = {}
    rows = table.find_all("tr")
    for r, tr in enumerate(rows):
        row: list[Tag | None] = []
        c = 0
        cells = tr.find_all(["td", "th"], recursive=False)
        ci = 0
        while ci < len(cells) or (r, c) in pending:
            if (r, c) in pending:
                row.append(pending.pop((r, c)))
                c += 1
                continue
            cell = cells[ci]
            ci += 1
            rs = int(cell.get("rowspan", 1) or 1)
            cs = int(cell.get("colspan", 1) or 1)
            for k in range(cs):
                row.append(cell)
                for dr in range(1, rs):
                    pending[(r + dr, c + k)] = cell
            c += cs
        grid.append(row)
    return grid  # type: ignore[return-value]


def load(path: str) -> BeautifulSoup:
    with open(path, encoding="utf-8") as f:
        return BeautifulSoup(f.read(), "lxml")
