"""
Cifrado simétrico de secretos por vehículo (contraseña de comandos SMS).

Se deriva una clave Fernet de SECRET_KEY (el mismo secreto que firma los JWT)
para no introducir un segundo secreto que gestionar. Suficiente para este
campo: la amenaza que se mitiga es un dump de la base de datos, no un
adversario con acceso al proceso (que de todas formas vería SECRET_KEY).
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from server.auth import SECRET_KEY


def _fernet() -> Fernet:
    key = hashlib.sha256(SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("No se pudo descifrar el secreto (¿cambió SECRET_KEY?)") from exc
