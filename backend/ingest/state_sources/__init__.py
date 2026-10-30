from . import ca, mo
from .base import StateCandidate, StateSource

# Registry: state -> (module, StateSource). Add new states here (see base.py for the contract).
ADAPTERS = [ca, mo]

__all__ = ["ADAPTERS", "StateCandidate", "StateSource"]
