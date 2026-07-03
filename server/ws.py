"""
WebSocket connection manager con difusión filtrada por permisos:
cada conexión registra el conjunto de vehículos que su usuario puede ver
(None = todos, para roles de empresa). Un cliente B2C solo recibe eventos
de sus motos.
"""

from __future__ import annotations
import json
import logging
from typing import Any, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        # ws -> vehículos permitidos (None = sin restricción)
        self._connections: dict[WebSocket, Optional[set[str]]] = {}

    def register(self, ws: WebSocket, allowed_vehicles: Optional[set[str]]) -> None:
        self._connections[ws] = allowed_vehicles
        logger.info("WS client connected. Total: %d", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        if self._connections.pop(ws, None) is not None or True:
            logger.info("WS client disconnected. Total: %d", len(self._connections))

    async def broadcast(self, payload: dict[str, Any], vehicle_id: Optional[str] = None) -> None:
        if not self._connections:
            return
        text = json.dumps(payload, default=str)
        dead: list[WebSocket] = []
        for ws, allowed in list(self._connections.items()):
            if vehicle_id is not None and allowed is not None and vehicle_id not in allowed:
                continue
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.pop(ws, None)


manager = ConnectionManager()
