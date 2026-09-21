import pytest

from app.services import cost


def test_per_image_limit_exceeded():
    with pytest.raises(ValueError):
        cost.check_cost_limit(0.4)  # 超过单次上限 0.3


def test_within_per_image_limit():
    # 单次 0.3 通过（月度累计远未到 300）
    cost.check_cost_limit(0.3)
