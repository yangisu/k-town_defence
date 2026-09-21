"""Snapshot season, fandom, and territory attribution on submissions."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260921_0009"
down_revision: str | None = "20260921_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = postgresql.UUID(as_uuid=True)
    op.add_column("checkin_submissions", sa.Column("season_id", uuid_type))
    op.add_column("checkin_submissions", sa.Column("fandom_id", uuid_type))
    op.add_column("checkin_submissions", sa.Column("territory_id", sa.String(40)))
    # Preserve already-awarded points. Before this migration attribution was
    # inferred from the user's membership at read time; this is the one-time
    # conversion of that best available attribution into an immutable fact.
    op.execute(
        """
        UPDATE checkin_submissions AS submission
        SET season_id = membership.season_id,
            fandom_id = membership.fandom_id,
            territory_id = CASE
                WHEN place.address_ko LIKE '%부산%' THEN 'busan'
                WHEN place.address_ko LIKE '%대구%' THEN 'daegu'
                WHEN place.address_ko LIKE '%광주%' THEN 'gwangju'
                WHEN place.address_ko LIKE '%군포%' THEN 'gunpo'
                WHEN place.address_ko LIKE '%성남%' THEN 'seongnam'
                WHEN place.address_ko LIKE '%거제%' THEN 'geoje'
                WHEN place.address_ko LIKE '%수원%' THEN 'suwon'
                WHEN place.address_ko LIKE '%경주%' THEN 'gyeongju'
                WHEN place.address_ko LIKE '%대전%' THEN 'daejeon'
                WHEN place.address_ko LIKE '%서울%' THEN 'seoul'
                WHEN place.address_ko LIKE '%용인%' THEN 'yongin'
                WHEN place.address_ko LIKE '%고양%' THEN 'goyang'
                WHEN place.address_ko LIKE '%인천%' THEN 'incheon'
                WHEN place.address_ko LIKE '%제주%' THEN 'jeju'
                WHEN place.address_ko LIKE '%울산%' THEN 'ulsan'
                WHEN place.address_ko LIKE '%시흥%' THEN 'siheung'
                WHEN place.address_ko LIKE '%천안%' THEN 'cheonan'
                WHEN place.address_ko LIKE '%포항%' THEN 'pohang'
                WHEN place.address_ko LIKE '%원주%' THEN 'wonju'
                WHEN place.address_ko LIKE '%춘천%' THEN 'chuncheon'
                WHEN place.address_ko LIKE '%의정부%' THEN 'uijeongbu'
                WHEN place.address_ko LIKE '%남양주%' THEN 'namyangju'
                WHEN place.address_ko LIKE '%영월%' THEN 'yeongwol'
                ELSE NULL
            END
        FROM checkin_sessions AS checkin
        JOIN users AS app_user ON app_user.platform_subject = checkin.user_id
        JOIN season_memberships AS membership ON membership.user_id = app_user.id
        JOIN seasons AS season ON season.id = membership.season_id
        JOIN places AS place ON place.id = checkin.place_id
        WHERE submission.session_id = checkin.id
          AND submission.submitted_at >= season.starts_at
          AND submission.submitted_at < season.ends_at
        """
    )
    op.create_foreign_key(
        "fk_checkin_submissions_season_id", "checkin_submissions", "seasons", ["season_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_foreign_key(
        "fk_checkin_submissions_fandom_id", "checkin_submissions", "fandoms", ["fandom_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_index("ix_checkin_submissions_season_id", "checkin_submissions", ["season_id"])
    op.create_index("ix_checkin_submissions_fandom_id", "checkin_submissions", ["fandom_id"])
    op.create_index("ix_checkin_submissions_territory_id", "checkin_submissions", ["territory_id"])


def downgrade() -> None:
    op.drop_index("ix_checkin_submissions_territory_id", table_name="checkin_submissions")
    op.drop_index("ix_checkin_submissions_fandom_id", table_name="checkin_submissions")
    op.drop_index("ix_checkin_submissions_season_id", table_name="checkin_submissions")
    op.drop_constraint("fk_checkin_submissions_fandom_id", "checkin_submissions", type_="foreignkey")
    op.drop_constraint("fk_checkin_submissions_season_id", "checkin_submissions", type_="foreignkey")
    op.drop_column("checkin_submissions", "territory_id")
    op.drop_column("checkin_submissions", "fandom_id")
    op.drop_column("checkin_submissions", "season_id")
