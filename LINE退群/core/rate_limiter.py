"""
core/rate_limiter.py
防限流隨機延遲控制器
- 每次退群/踢人操作之間注入可設定的隨機延遲
- 支援緊急停止 (Kill Switch) 旗標
"""
from __future__ import annotations

import random
import threading
import time

from loguru import logger


class RateLimiter:
    """
    隨機延遲速率控制器

    使用方式：
        limiter = RateLimiter(min_sec=1.5, max_sec=3.5)
        for group in groups:
            if limiter.is_stopped():
                break
            limiter.wait()
            do_action(group)
    """

    def __init__(self, min_sec: float = 1.5, max_sec: float = 3.5):
        if min_sec > max_sec:
            raise ValueError(f"min_sec ({min_sec}) 必須 <= max_sec ({max_sec})")
        self._min = min_sec
        self._max = max_sec
        self._stop_event = threading.Event()
        self._total_waited = 0.0
        self._wait_count = 0

    # ──────────────────────────────────────────────
    # 核心方法
    # ──────────────────────────────────────────────

    def wait(self) -> bool:
        """
        等待隨機延遲，每 0.1 秒檢查一次是否被中止。
        回傳 True：正常等待完成；回傳 False：已被中止
        """
        delay = random.uniform(self._min, self._max)
        logger.debug(f"速率控制：等待 {delay:.2f} 秒")
        start = time.monotonic()
        elapsed = 0.0
        while elapsed < delay:
            if self._stop_event.is_set():
                logger.info("速率控制：偵測到緊急停止，中斷等待")
                return False
            time.sleep(0.1)
            elapsed = time.monotonic() - start
        self._total_waited += elapsed
        self._wait_count += 1
        return True

    def stop(self) -> None:
        """觸發緊急停止旗標"""
        logger.warning("緊急停止已觸發")
        self._stop_event.set()

    def reset(self) -> None:
        """重置停止旗標（開始新一輪批次作業前呼叫）"""
        self._stop_event.clear()
        self._total_waited = 0.0
        self._wait_count = 0
        logger.info("速率控制器已重置")

    def is_stopped(self) -> bool:
        """是否已觸發緊急停止"""
        return self._stop_event.is_set()

    # ──────────────────────────────────────────────
    # 統計資訊
    # ──────────────────────────────────────────────

    @property
    def stats(self) -> dict:
        return {
            "wait_count": self._wait_count,
            "total_waited_sec": round(self._total_waited, 2),
            "avg_delay_sec": round(self._total_waited / max(1, self._wait_count), 2),
        }

    def set_range(self, min_sec: float, max_sec: float) -> None:
        """動態更新延遲範圍"""
        if min_sec > max_sec:
            raise ValueError(f"min_sec ({min_sec}) 必須 <= max_sec ({max_sec})")
        self._min = min_sec
        self._max = max_sec
        logger.info(f"延遲範圍已更新：{min_sec}s ~ {max_sec}s")
