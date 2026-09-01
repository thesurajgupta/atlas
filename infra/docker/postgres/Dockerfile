# ATLAS primary datastore (ADR-001): PostgreSQL 16 + PostGIS + H3 + TimescaleDB.
#
# Base is `postgres:16-bookworm`, not `postgis/postgis`, for two reasons:
#   1. postgres:16-bookworm is MULTI-ARCH (arm64 + amd64). The postgis/postgis
#      tags are amd64-only, which means Rosetta/QEMU emulation on Apple Silicon
#      dev machines — slow, and a different architecture in dev than in CI.
#   2. Bookworm ships gcc-12. Bullseye's gcc-10 fails to link h3-pg under LTO.
#
# h3-pg is pinned by COMMIT SHA, not tag: tags can be moved, and reproducibility
# is an acceptance criterion (master spec §48).
FROM postgres:16-bookworm

# h3-pg 4.2.3
ARG H3_PG_SHA=04227cb62a7338eb2a655fff875b125de2f043f4

# --- PostGIS + build toolchain --------------------------------------------
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        postgresql-16-postgis-3 postgresql-16-postgis-3-scripts \
        build-essential cmake git ca-certificates \
        postgresql-server-dev-16 libcurl4-openssl-dev \
        gnupg lsb-release wget; \
    rm -rf /var/lib/apt/lists/*

# --- h3-pg (CMake FetchContent pulls the H3 core library) ------------------
# LTO is disabled via CMAKE_INTERPROCEDURAL_OPTIMIZATION only.
# Do NOT set CMAKE_C_FLAGS here: it REPLACES the flags PGXS injects, producing a
# .so without the PG_MODULE_MAGIC block, which then fails at CREATE EXTENSION
# with a misleading "Extension libraries are required..." hint.
RUN set -eux; \
    mkdir -p /tmp/h3-pg; cd /tmp/h3-pg; \
    git init -q .; \
    git remote add origin https://github.com/zachasme/h3-pg.git; \
    git fetch --depth 1 -q origin "${H3_PG_SHA}"; \
    git checkout -q FETCH_HEAD; \
    cmake -B build -S . \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INTERPROCEDURAL_OPTIMIZATION=OFF; \
    cmake --build build --parallel "$(nproc)"; \
    cmake --install build; \
    cd /; rm -rf /tmp/h3-pg

# --- TimescaleDB from the upstream apt repository --------------------------
RUN set -eux; \
    echo "deb https://packagecloud.io/timescale/timescaledb/debian/ $(lsb_release -cs) main" \
        > /etc/apt/sources.list.d/timescaledb.list; \
    wget -qO- https://packagecloud.io/timescale/timescaledb/gpgkey \
        | gpg --dearmor -o /etc/apt/trusted.gpg.d/timescaledb.gpg; \
    apt-get update; \
    apt-get install -y --no-install-recommends timescaledb-2-postgresql-16; \
    rm -rf /var/lib/apt/lists/*

# --- drop the toolchain, keep the extensions -------------------------------
RUN set -eux; \
    apt-get purge -y --auto-remove \
        build-essential cmake git postgresql-server-dev-16 wget gnupg lsb-release; \
    rm -rf /var/lib/apt/lists/*

RUN echo "shared_preload_libraries = 'timescaledb'" >> /usr/share/postgresql/postgresql.conf.sample

# Storage is always UTC (master spec §4). Presentation-layer IST is an app concern.
ENV TZ=UTC PGTZ=UTC
