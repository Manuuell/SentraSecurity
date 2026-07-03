"""
Tests del parser Totem/Tianqin del ST-907L.
Referencia de bits: docs/protocolo-st907l.md §2 (Apéndice 1). Lógica negativa: bit=0 = activo.
"""

from server.parser import parse_packet, get_active_alarms


def _v8(vstatus: str) -> str:
    """Trama V8 válida en Cartagena con el vehicle_status indicado."""
    return (
        f"*HQ,9171000001,V8,143005,A,1023.4600,N,07528.7640,W,"
        f"012.3,045,030726,{vstatus},732,101,1234,5678,09,24,410,82#"
    )


def test_v8_campos_basicos():
    p = parse_packet(_v8("FFFFFFFF"))
    assert p is not None
    assert p.device_id == "9171000001"
    assert p.packet_type == "V8"
    assert p.valid is True
    assert round(p.latitude, 4) == round(10 + 23.4600 / 60, 4)
    assert round(p.longitude, 4) == round(-(75 + 28.7640 / 60), 4)
    assert p.speed_kmh == round(12.3 * 1.852, 2)
    assert p.direction == 45
    assert p.satellites == 9
    assert p.gsm_signal == 24
    assert p.voltage == 41.0
    assert p.battery_pct == 82


def test_todo_neutro_sin_alarmas():
    # Byte 3 tiene bit0=0 de fábrica -> estado neutro no es FFFFFFFF sino FFFFFEFF
    p = parse_packet(_v8("FFFFFEFF"))
    assert get_active_alarms(p) == []
    assert p.vehicle_status.acc_off is False


def test_vibracion_byte2_bit1():
    # Byte 2 bit1 = 0 -> vibración activa.  0xFF & ~(1<<1) = 0xFD
    p = parse_packet(_v8("FFFDFEFF"))
    assert p.vehicle_status.vibration_alarm is True
    assert "VIBRATION" in get_active_alarms(p)


def test_vibracion_no_confunde_bit0():
    # Byte 2 bit0 = 0 (0xFE) NO debe marcar vibración (regresión del bug B12)
    p = parse_packet(_v8("FFFEFEFF"))
    assert p.vehicle_status.vibration_alarm is False
    assert "VIBRATION" not in get_active_alarms(p)


def test_bateria_baja_bit5_o_bit6():
    # Byte 4 bit5=0 (0xDF) o bit6=0 (0xBF) -> batería baja
    assert "LOW_BATTERY" in get_active_alarms(parse_packet(_v8("FFFFFEDF")))
    assert "LOW_BATTERY" in get_active_alarms(parse_packet(_v8("FFFFFEBF")))


def test_emergencia_y_exceso_velocidad():
    # Byte 4 bit1=0 (emergencia) y bit2=0 (exceso): 0xFF & ~0b0110 = 0xF9
    p = parse_packet(_v8("FFFFFEF9"))
    alarms = get_active_alarms(p)
    assert "EMERGENCY" in alarms
    assert "OVERSPEED" in alarms


def test_acc_off_byte3_bit2():
    # Byte 3 bit2 = 0 (0xFA) -> ACC apagado
    p = parse_packet(_v8("FFFFFAFF"))
    assert p.vehicle_status.acc_off is True


def test_desplazamiento_byte1_bit1():
    # Byte 1 bit1 = 0 (0xFD) -> desplazamiento
    p = parse_packet(_v8("FDFFFEFF"))
    assert "DISPLACEMENT" in get_active_alarms(p)


def test_v6_incluye_iccid():
    raw = (
        "*HQ,9171000001,V6,143005,A,1023.4600,N,07528.7640,W,000.0,000,"
        "030726,FFFFFEFF,732,101,1234,5678,8931082100073456789#"
    )
    p = parse_packet(raw)
    assert p.packet_type == "V6"
    assert p.iccid == "8931082100073456789"


def test_paquete_invalido_v():
    p = parse_packet(_v8("FFFFFEFF").replace(",A,", ",V,"))
    assert p.valid is False


def test_basura_no_totem():
    assert parse_packet("hola mundo#") is None
    assert parse_packet("") is None
