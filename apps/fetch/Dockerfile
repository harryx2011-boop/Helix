# helix-fetch — Rust TLS-impersonating fetch tier.

FROM rust:1.83-slim AS build
WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
      pkg-config libssl-dev cmake perl make \
    && rm -rf /var/lib/apt/lists/*

# Cache dependencies separately from source.
COPY Cargo.toml ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && \
    cargo build --release 2>/dev/null || true && \
    rm -rf src

COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /build/target/release/helix-fetch /usr/local/bin/helix-fetch

EXPOSE 7401

RUN useradd --create-home --shell /bin/bash helix
USER helix

CMD ["/usr/local/bin/helix-fetch"]
