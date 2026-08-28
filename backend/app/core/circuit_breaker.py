import time
import logging
from enum import Enum
from typing import Callable, Any, Dict, Optional

from backend.app.core.config import settings

logger = logging.getLogger("catauth.circuit_breaker")


class CircuitState(str, Enum):
    CLOSED = "CLOSED"       # Normal operation (healthy)
    OPEN = "OPEN"           # Tripped / failing fast (bypass straight to DLQ)
    HALF_OPEN = "HALF_OPEN" # Testing recovery


class CircuitBreakerOpenException(Exception):
    """Raised when an operation is attempted while the circuit breaker is OPEN."""
    pass


class CircuitBreaker:
    """
    PyBreaker Circuit Breaker Engine (Node 64 / node-68).
    Protects worker runtime starvation by failing fast to DLQ when partner webhooks are down.
    """

    def __init__(
        self,
        name: str = "webhook_circuit_breaker",
        fail_max: int = 3,
        reset_timeout: float = 10.0
    ):
        self.name = name
        self.fail_max = fail_max
        self.reset_timeout = reset_timeout
        self.state: CircuitState = CircuitState.CLOSED
        self.failure_count: int = 0
        self.last_failure_time: float = 0.0
        self.last_state_change: float = time.time()
        self.success_count: int = 0

    def is_available(self) -> bool:
        """Evaluates whether the circuit allows calls or is tripped."""
        now = time.time()
        if self.state == CircuitState.OPEN:
            if now - self.last_failure_time > self.reset_timeout:
                logger.info(f"Circuit Breaker '{self.name}' transition: OPEN -> HALF_OPEN (Testing recovery)")
                self.state = CircuitState.HALF_OPEN
                self.last_state_change = now
                return True
            return False
        return True

    def record_success(self):
        """Records a successful call, resetting state to CLOSED."""
        if self.state == CircuitState.HALF_OPEN:
            logger.info(f"Circuit Breaker '{self.name}' transition: HALF_OPEN -> CLOSED (Recovered)")
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count += 1
        self.last_state_change = time.time()

    def record_failure(self):
        """Records a failed call, potentially tripping the circuit to OPEN."""
        now = time.time()
        self.last_failure_time = now
        self.failure_count += 1

        if self.state == CircuitState.HALF_OPEN:
            logger.warning(f"Circuit Breaker '{self.name}' transition: HALF_OPEN -> OPEN (Immediate trip)")
            self.state = CircuitState.OPEN
            self.last_state_change = now
        elif self.failure_count >= self.fail_max:
            logger.warning(
                f"Circuit Breaker '{self.name}' tripped: CLOSED -> OPEN (Failure count {self.failure_count}/{self.fail_max})"
            )
            self.state = CircuitState.OPEN
            self.last_state_change = now

    def force_state(self, new_state: CircuitState):
        """Manually force state for administrative testing."""
        self.state = new_state
        self.last_state_change = time.time()
        if new_state == CircuitState.CLOSED:
            self.failure_count = 0
        logger.info(f"Circuit Breaker '{self.name}' manually set to {new_state}")

    def get_status(self) -> Dict[str, Any]:
        """Returns diagnostic metrics for Prometheus and dashboard."""
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "fail_max": self.fail_max,
            "reset_timeout_seconds": self.reset_timeout,
            "time_in_current_state_seconds": round(time.time() - self.last_state_change, 2),
            "is_available": self.is_available()
        }


# Global circuit breaker registry for partner webhooks
circuit_breakers: Dict[str, CircuitBreaker] = {}

def get_circuit_breaker(client_id: str = "global_webhook") -> CircuitBreaker:
    if client_id not in circuit_breakers:
        circuit_breakers[client_id] = CircuitBreaker(
            name=f"webhook_{client_id}",
            fail_max=settings.CIRCUIT_BREAKER_FAIL_MAX,
            reset_timeout=settings.CIRCUIT_BREAKER_RESET_TIMEOUT_SEC
        )
    return circuit_breakers[client_id]
