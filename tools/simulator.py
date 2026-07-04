"""Simulador de trackers ST-907L (protocolo Totem/HQ) para demo local.

Envía tramas V8 reales al TCP server (localhost:8090):
 - Moto 1: recorre una ruta REAL por calles (Bocagrande -> Centro, generada
   con OSRM y guardada en route_calles.json), ida y vuelta sin saltos.
 - Moto 2: detenida cerca de la Torre del Reloj, ACC off; a los ~20 s emite
   una alarma de vibración (byte2 bit1 = 0 -> 0xFD).
 - Moto 3: un solo paquete con timestamp de hace 1 h -> aparece "Sin señal".
"""

from __future__ import annotations

import json
import math
import os
import socket
import time
from datetime import datetime, timedelta, timezone

HOST, PORT = "127.0.0.1", 8090

ROUTE = json.load(open(os.path.join(os.path.dirname(__file__), "route_calles.json")))


def to_ddmm(dec: float) -> str:
    dec = abs(dec)
    deg = int(dec)
    minutes = (dec - deg) * 60
    return f"{deg:02d}{minutes:07.4f}"


def bearing(a, b) -> int:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    y = math.sin(lo2 - lo1) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(lo2 - lo1)
    return int(math.degrees(math.atan2(y, x)) % 360)


def dist_m(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def v8(dev: str, lat: float, lon: float, knots: float, heading: int,
       vstatus: str = "FFFFFEFF", when: datetime | None = None,
       sats: int = 9, gsm: int = 24, volt: int = 41, bat: int = 82) -> bytes:
    now = when or datetime.now(timezone.utc)
    t, d = now.strftime("%H%M%S"), now.strftime("%d%m%y")
    pkt = (f"*HQ,{dev},V8,{t},A,{to_ddmm(lat)},N,{to_ddmm(lon)},W,"
           f"{knots:05.1f},{heading:03d},{d},{vstatus},732,101,1234,5678,"
           f"{sats},{gsm},{volt},{bat}#")
    return pkt.encode()


def main() -> None:
    s1 = socket.create_connection((HOST, PORT))
    s2 = socket.create_connection((HOST, PORT))
    s3 = socket.create_connection((HOST, PORT))

    # Moto 3: reportó hace 1 hora -> offline (en tierra, Bocagrande)
    old = datetime.now(timezone.utc) - timedelta(hours=1)
    s3.sendall(v8("9171000003", 10.40530, -75.55250, 0.0, 0,
                  vstatus="FFFFFAFF", when=old, bat=34, volt=38))
    s3.close()

    TICK = 3.0
    # ROUTE es un circuito legal cerrado: ida Bocagrande->Centro por una vía y
    # regreso por las calles del sentido contrario. Se recorre en bucle modular
    # (nada de reproducir la misma geometría al revés: eso sería contravía y el
    # map matching lo "corrige" con desvíos falsos alrededor de las manzanas).
    i = 0
    tick = 0
    while True:
        p = ROUTE[i]
        nxt = ROUTE[(i + 1) % len(ROUTE)]
        hdg = bearing(p, nxt) if nxt != p else 0
        # velocidad coherente con la distancia real al siguiente punto
        speed_kmh = dist_m(p, nxt) / TICK * 3.6
        knots = min(speed_kmh / 1.852, 60.0)
        s1.sendall(v8("9171000001", p[0], p[1], knots, hdg, bat=82))
        i = (i + 1) % len(ROUTE)

        if tick % 3 == 0:
            # Moto 2 detenida cerca de la Torre del Reloj, ACC off
            vst = "FFFDFAFF" if tick == 6 else "FFFFFAFF"
            s2.sendall(v8("9171000002", 10.42277, -75.54873, 0.0, 180,
                          vstatus=vst, bat=64, volt=39, gsm=19))
        tick += 1
        time.sleep(TICK)


if __name__ == "__main__":
    main()
