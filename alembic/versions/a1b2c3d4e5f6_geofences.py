"""geofences

Revision ID: a1b2c3d4e5f6
Revises: 501e969235ef
Create Date: 2026-07-06 10:40:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '501e969235ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('geofences',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('color', sa.String(length=20), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('geometry', sa.JSON(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('geofence_vehicles',
    sa.Column('geofence_id', sa.Integer(), nullable=False),
    sa.Column('vehicle_id', sa.String(length=10), nullable=False),
    sa.Column('notify_enter', sa.Boolean(), nullable=False),
    sa.Column('notify_exit', sa.Boolean(), nullable=False),
    sa.Column('last_inside', sa.Boolean(), nullable=True),
    sa.ForeignKeyConstraint(['geofence_id'], ['geofences.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('geofence_id', 'vehicle_id')
    )


def downgrade() -> None:
    op.drop_table('geofence_vehicles')
    op.drop_table('geofences')
