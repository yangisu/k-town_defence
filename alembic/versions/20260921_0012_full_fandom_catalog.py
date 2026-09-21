"""Seed the fandoms behind the rest of the playable artist roster."""

from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import UUID

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260921_0012"
down_revision: str | None = "20260921_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The web roster (web/lib/demo-preview/artists.ts) has offered these artists
# since the preview shipped, but only ARMY, BLINK and CARAT ever existed as
# fandoms here — so choosing any of the others reached an API that had nothing
# to select, and the season membership silently stayed where it was. Each name
# below is the `fandomName` that roster keys on, which is what ties an artist
# to the fandom a member actually joins.
ADDED_FANDOMS: tuple[tuple[str, str, str], ...] = (
    ("10000000-0000-4000-8000-000000000004", "REMINE", "리센느"),
    ("10000000-0000-4000-8000-000000000005", "COER", "코르티스"),
    ("10000000-0000-4000-8000-000000000006", "MELODY", "비투비"),
    ("10000000-0000-4000-8000-000000000007", "DIVE", "아이브"),
    ("10000000-0000-4000-8000-000000000008", "TiiiKiii", "키키"),
    ("10000000-0000-4000-8000-000000000009", "BRIIZE", "라이즈"),
    ("10000000-0000-4000-8000-000000000010", "ZEROSE", "제로베이스원"),
    ("10000000-0000-4000-8000-000000000011", "ONEDOOR", "보이넥스트도어"),
    ("10000000-0000-4000-8000-000000000012", "FEARNOT", "르세라핌"),
    ("10000000-0000-4000-8000-000000000013", "MY", "에스파"),
    ("10000000-0000-4000-8000-000000000014", "Bunnies", "뉴진스"),
    ("10000000-0000-4000-8000-000000000015", "UAENA", "아이유"),
)


def _fandom_table() -> sa.TableClause:
    return sa.table(
        "fandoms",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name_ko", sa.String),
        sa.column("artist_name_ko", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    op.bulk_insert(
        _fandom_table(),
        [
            {
                "id": UUID(fandom_id),
                "name_ko": name,
                "artist_name_ko": artist_name,
                "is_active": True,
                "created_at": now,
            }
            for fandom_id, name, artist_name in ADDED_FANDOMS
        ],
    )


def downgrade() -> None:
    # Memberships point at fandoms with ON DELETE RESTRICT, so anyone who
    # joined one of these keeps it from being removed — which is the right
    # answer: dropping the fandom would erase the season they are playing.
    op.execute(
        sa.text("DELETE FROM fandoms WHERE id IN :ids").bindparams(
            sa.bindparam("ids", tuple(UUID(item[0]) for item in ADDED_FANDOMS), expanding=True)
        )
    )
