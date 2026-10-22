"""Execution policy for the shipped ONNX TreeEnsemble models."""
from dataclasses import asdict, dataclass
import os

import onnxruntime as ort


@dataclass(frozen=True)
class RuntimeInfo:
    requested_device: str
    device: str
    provider: str
    available_providers: tuple[str, ...]
    cuda_provider_available: bool
    fallback_reason: str | None

    def as_dict(self):
        return asdict(self)


def resolve_runtime(device: str | None = None) -> RuntimeInfo:
    requested = (device if device is not None else os.environ.get("CREDNEXUS_DEVICE", "auto")).lower()
    if requested not in ("auto", "cpu", "cuda"):
        raise ValueError("CREDNEXUS_DEVICE must be auto, cpu or cuda")
    available = tuple(ort.get_available_providers())
    if "CPUExecutionProvider" not in available:
        raise RuntimeError("ONNX Runtime CPUExecutionProvider is required")
    cuda_available = "CUDAExecutionProvider" in available
    reason = None
    if requested != "cpu":
        reason = "tree_ensemble_cpu_policy" if cuda_available else "cuda_provider_unavailable"
    # The exported ai.onnx.ml TreeEnsemble graphs are validated on CPU. A CUDA
    # provider being installed does not mean these operators execute on a GPU.
    return RuntimeInfo(requested, "cpu", "CPUExecutionProvider", available, cuda_available, reason)
