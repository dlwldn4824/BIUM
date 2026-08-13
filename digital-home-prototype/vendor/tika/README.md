# Apache Tika

- Artifact: `tika-app-3.3.2.jar`
- Source: https://dlcdn.apache.org/tika/3.3.2/
- License: Apache License 2.0
- SHA-512: stored in `tika-app-3.3.2.jar.sha512`

BIUM invokes this JAR locally to extract text from supported documents. The
extracted text is passed only to the on-device multilingual MiniLM embedding
runtime and is not uploaded to a BIUM server.
