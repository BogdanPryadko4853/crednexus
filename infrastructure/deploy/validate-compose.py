"""Validate public exposure and essential deployment invariants; print no secrets."""
import json
import sys

configuration = json.load(sys.stdin)
services = configuration["services"]
assert set(services) == {"postgres", "keycloak", "minio", "minio-init", "ml", "backend", "frontend"}
expected_ports = {"frontend": (18080, 8080), "keycloak": (18081, 8080)}
for name, service in services.items():
    assert not service.get("build"), f"{name}: production must use prebuilt images"
    assert not service.get("privileged"), f"{name}: privileged container"
    assert service.get("network_mode") != "host", f"{name}: host network"
    assert all(path.split(":", 1)[0].startswith("/") for path in service.get("tmpfs", [])), f"{name}: invalid tmpfs path"
    assert service["logging"]["driver"] == "local", f"{name}: log rotation missing"
    ports = service.get("ports", [])
    if name in expected_ports:
        assert len(ports) == 1, f"{name}: unexpected ports"
        port = ports[0]
        assert port.get("host_ip") == "127.0.0.1", f"{name}: non-loopback port"
        assert (int(port["published"]), port["target"]) == expected_ports[name]
    else:
        assert not ports, f"{name}: internal service exposed"
assert services["ml"]["environment"]["CREDNEXUS_DEVICE"] == "cpu"
assert services["backend"]["environment"]["SCORING_PROVIDER"] == "ml"
assert services["backend"]["environment"]["KEYCLOAK_ISSUER_URI"] == (
    "https://auth.155.212.216.26.sslip.io/realms/crednexus"
)
assert configuration["volumes"]["postgres-data"]["name"] == "crednexus-production-postgres"
assert configuration["volumes"]["minio-data"]["name"] == "crednexus-production-minio"
print("Production Compose invariants: OK")
