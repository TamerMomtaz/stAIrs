"""ST.AIRS — WebSocket Connection Manager & Endpoint"""

import asyncio
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.helpers import decode_jwt

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, dict[str, list[WebSocket]]] = {}

    async def connect(self, ws: WebSocket, org_id: str, user_id: str):
        await ws.accept()
        self.connections.setdefault(org_id, {}).setdefault(user_id, []).append(ws)

    def disconnect(self, ws: WebSocket, org_id: str, user_id: str):
        if org_id in self.connections and user_id in self.connections[org_id]:
            self.connections[org_id][user_id] = [
                c for c in self.connections[org_id][user_id] if c is not ws
            ]

    async def broadcast_to_org(self, org_id: str, message: dict):
        if org_id not in self.connections:
            return
        for user_id, sockets in self.connections[org_id].items():
            dead = []
            for ws in sockets:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                sockets.remove(ws)

    async def send_to_user(self, org_id: str, user_id: str, message: dict):
        sockets = self.connections.get(org_id, {}).get(user_id, [])
        dead = []
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            sockets.remove(ws)


ws_manager = ConnectionManager()


@router.websocket("/ws/{org_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, org_id: str, user_id: str, token: Optional[str] = Query(None)):
    from fastapi import HTTPException
    if token:
        try:
            payload = decode_jwt(token)
            if payload["org"] != org_id:
                await websocket.close(code=4003, reason="Org mismatch"); return
        except HTTPException:
            await websocket.close(code=4001, reason="Invalid token"); return
    await ws_manager.connect(websocket, org_id, user_id)
    try:
        await websocket.send_json({"event": "connected", "data": {"org_id": org_id, "user_id": user_id}})
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30)
                if data.get("event") == "ping":
                    await websocket.send_json({"event": "pong"})
            except asyncio.TimeoutError:
                await websocket.send_json({"event": "ping"})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, org_id, user_id)
    except Exception:
        ws_manager.disconnect(websocket, org_id, user_id)
