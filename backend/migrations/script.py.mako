"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

SQL-first: write plain SQL. One new numbered file per package; never edit another package's file.
"""

from __future__ import annotations

from alembic import op

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}

UP = """
"""

DOWN = """
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)  # plain SQL, no bind-parameter parsing


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
