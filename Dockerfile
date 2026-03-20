FROM rust:1.93-slim AS builder
RUN apt-get update && apt-get install -y musl-tools && rm -rf /var/lib/apt/lists/*
RUN rustup target add x86_64-unknown-linux-musl
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/
RUN cargo build --release --target x86_64-unknown-linux-musl -p scemas-server

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/scemas-server /scemas-server
COPY data/ /data/
ENV DEVICE_CATALOG_PATH=/data/hamilton-sensors.json
ENTRYPOINT ["/scemas-server"]
