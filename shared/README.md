# Orbspeak Shared IPC Contract (v1)

This project defines the canonical IPC contract between the Orbspeak Engine and UI.

- Transport: JSON messages over a Windows named pipe.
- Message types: requests, responses, and events.
- Versioning: all messages include `\"v\": 1`. Changes within v1 must be additive and backward compatible.

Forward-compatibility rules:

- Clients and Engine must ignore unknown fields when deserializing.
- New fields must be optional.
- Breaking changes require a new protocol version (`v=2`, etc.) implemented side by side.

