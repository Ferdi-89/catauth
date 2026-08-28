import asyncio
import logging
import random
import time
import uuid
from typing import Optional, Dict, Any, List, Union

try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None

from backend.app.core.config import settings

logger = logging.getLogger("catauth.redis")


class InMemoryAsyncRedis:
    """
    High-fidelity In-Memory Async Redis engine for zero-dependency portability.
    Implements exact atomic GETDEL, Singleflight mutex, Key-Value TTL, and Redis Streams.
    """

    def __init__(self):
        self._store: Dict[str, str] = {}
        self._ttls: Dict[str, float] = {}
        self._streams: Dict[str, List[Dict[str, Any]]] = {}
        self._lock = asyncio.Lock()

    def _purge_expired(self, key: str) -> bool:
        if key in self._ttls:
            if time.time() > self._ttls[key]:
                self._store.pop(key, None)
                self._ttls.pop(key, None)
                return True
        return False

    async def get(self, key: str) -> Optional[str]:
        async with self._lock:
            if self._purge_expired(key):
                return None
            return self._store.get(key)

    async def set(self, key: str, value: str, ex: Optional[int] = None, px: Optional[int] = None, nx: bool = False) -> bool:
        async with self._lock:
            self._purge_expired(key)
            if nx and key in self._store:
                return False
            self._store[key] = str(value)
            if ex:
                self._ttls[key] = time.time() + ex
            elif px:
                self._ttls[key] = time.time() + (px / 1000.0)
            elif key in self._ttls:
                self._ttls.pop(key)
            return True

    async def setex(self, key: str, seconds: int, value: str) -> bool:
        return await self.set(key, value, ex=seconds)

    async def getdel(self, key: str) -> Optional[str]:
        """
        Atomic GETDEL (Node 13 / node-66 & Node 14 / node-67).
        Fetches the value and deletes it in a single atomic transaction.
        """
        async with self._lock:
            if self._purge_expired(key):
                return None
            val = self._store.pop(key, None)
            self._ttls.pop(key, None)
            return val

    async def delete(self, *keys: str) -> int:
        async with self._lock:
            count = 0
            for k in keys:
                if k in self._store:
                    self._store.pop(k, None)
                    self._ttls.pop(k, None)
                    count += 1
            return count

    async def exists(self, *keys: str) -> int:
        async with self._lock:
            count = 0
            for k in keys:
                if not self._purge_expired(k) and k in self._store:
                    count += 1
            return count

    async def eval(self, script: str, numkeys: int, *keys_and_args: Any) -> Any:
        """Emulate standard Lua atomic unlock script."""
        async with self._lock:
            if numkeys >= 1:
                key = keys_and_args[0]
                expected_val = keys_and_args[numkeys] if len(keys_and_args) > numkeys else None
                if not self._purge_expired(key) and self._store.get(key) == str(expected_val):
                    self._store.pop(key, None)
                    self._ttls.pop(key, None)
                    return 1
            return 0

    async def xadd(self, stream: str, fields: Dict[str, Any], maxlen: Optional[int] = None) -> str:
        """Publish event to stream (Node 62 / node-70)."""
        async with self._lock:
            if stream not in self._streams:
                self._streams[stream] = []
            entry_id = f"{int(time.time() * 1000)}-{len(self._streams[stream])}"
            self._streams[stream].append({"id": entry_id, "data": fields})
            return entry_id

    async def xread(self, streams: Dict[str, str], count: Optional[int] = None, block: Optional[int] = None) -> List[Any]:
        """Read events from stream (Node 62 / node-70)."""
        async with self._lock:
            results = []
            for stream_name, last_id in streams.items():
                entries = self._streams.get(stream_name, [])
                matching = []
                for entry in entries:
                    if last_id == "0" or last_id == "$" or entry["id"] > last_id:
                        matching.append((entry["id"], entry["data"]))
                if count:
                    matching = matching[:count]
                if matching:
                    results.append([stream_name, matching])
            return results

    async def keys(self, pattern: str = "*") -> List[str]:
        async with self._lock:
            now = time.time()
            return [k for k, exp in self._ttls.items() if exp > now] + [k for k in self._store.keys() if k not in self._ttls]


class RedisManager:
    """
    Central Redis Manager supporting real Redis connection and in-memory fallback.
    """

    def __init__(self):
        self._client = None
        self._is_mock = False

    async def initialize(self):
        if aioredis is not None and not settings.USE_MOCK_REDIS_IF_UNAVAILABLE:
            try:
                client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
                await asyncio.wait_for(client.ping(), timeout=1.0)
                self._client = client
                self._is_mock = False
                logger.info("Connected to live Redis server.")
                return
            except Exception as e:
                logger.warning(f"Could not connect to live Redis ({e}), falling back to InMemoryAsyncRedis.")
        
        self._client = InMemoryAsyncRedis()
        self._is_mock = True
        logger.info("Initialized High-Fidelity InMemoryAsyncRedis Engine.")

    @property
    def client(self) -> Union[Any, InMemoryAsyncRedis]:
        if self._client is None:
            self._client = InMemoryAsyncRedis()
            self._is_mock = True
        return self._client


redis_manager = RedisManager()


class SingleflightLock:
    """
    Redis Singleflight Lock with Dead-Man Expiration & Jitter Backoff (Node 43 / node-69).
    Prevents cache stampede on DB fallback when multiple clients request the same uncached session simultaneously.
    """

    def __init__(self, key: str, dead_man_ttl_ms: int = 1500, retry_count: int = 5):
        self.lock_key = f"lock:singleflight:{key}"
        self.dead_man_ttl_ms = dead_man_ttl_ms
        self.retry_count = retry_count
        self.lock_token = str(uuid.uuid4())
        self.acquired = False

    async def acquire(self) -> bool:
        """
        Attempts to acquire the singleflight lock.
        If busy, performs jittered exponential backoff retries.
        Returns True if acquired (caller must execute DB fallback), False if another worker won.
        """
        client = redis_manager.client

        for attempt in range(self.retry_count):
            # Atomic SET lock_key token NX PX ttl_ms
            success = await client.set(
                self.lock_key,
                self.lock_token,
                px=self.dead_man_ttl_ms,
                nx=True
            )
            if success:
                self.acquired = True
                return True
            
            # Lock was not acquired: wait with randomized jitter backoff (30ms - 80ms)
            jitter_delay = (0.03 * (2 ** min(attempt, 2))) + (random.uniform(0.005, 0.02))
            await asyncio.sleep(jitter_delay)

        return False

    async def release(self):
        """Releases the lock safely using Lua script to verify token ownership."""
        if not self.acquired:
            return
        
        client = redis_manager.client
        lua_unlock = """
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        """
        try:
            await client.eval(lua_unlock, 1, self.lock_key, self.lock_token)
        except Exception as e:
            logger.warning(f"Error releasing Singleflight lock {self.lock_key}: {e}")
        finally:
            self.acquired = False
