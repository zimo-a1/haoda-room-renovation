"""照片内存暂存：照片不落库、不留存，仅在本次出图流程内暂存，用完即删。"""

_store: dict[str, bytes] = {}


def put(photo_id: str, data: bytes) -> None:
    _store[photo_id] = data


def get(photo_id: str) -> bytes | None:
    return _store.get(photo_id)


def pop(photo_id: str) -> bytes | None:
    return _store.pop(photo_id, None)


def clear() -> None:
    _store.clear()
