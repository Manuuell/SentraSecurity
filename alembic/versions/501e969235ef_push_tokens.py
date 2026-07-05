"""push tokens

Revision ID: 501e969235ef
Revises: e73c3182e7da
Create Date: 2026-07-05 13:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '501e969235ef'
down_revision: Union[str, None] = 'e73c3182e7da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('push_tokens',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('fcm_token', sa.String(length=255), nullable=False),
    sa.Column('platform', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('fcm_token')
    )
    with op.batch_alter_table('push_tokens', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_push_tokens_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('push_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_push_tokens_user_id'))

    op.drop_table('push_tokens')
