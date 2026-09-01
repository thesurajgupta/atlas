# ADR-003 — Redis Streams, not Kafka

**Status:** Accepted · **Date:** 2026-09-01

## Context

The predecessor brief mandated "Kafka-compatible system for production architecture, Redpanda locally".
That was asserted, not derived. Deriving it from the stated volume gives a different answer.

The problem statement states **~8,000 complaints/day**. That is:

- **~0.09 events/sec mean.**
- With a 10× diurnal peaking factor and ~20 derived events per complaint (transactions, features,
  predictions, alerts), a realistic peak is **~20–50 events/sec**.
- Designing at the mandated 5× headroom (spec §38): **~100–250 events/sec peak.**

Kafka comfortably handles hundreds of thousands of events/sec. We are provisioning for roughly three
orders of magnitude less than its design point, on a system that must also run on a demo laptop.

## Decision

**Redis Streams with consumer groups** as the event bus, behind an `EventBus` port.

- Consumer groups give at-least-once delivery, acknowledgement and pending-entry recovery.
- Dead-letter stream for poison messages.
- Consumers are **idempotent by construction** (spec §10.2), so at-least-once is safe.
- Redis is already required for cache and rate limiting, so this adds **zero new infrastructure**.
- The `EventBus` port has one production implementation (Redis) and a documented Kafka adapter design.

## Alternatives considered

- **Kafka / Redpanda.** Rejected at this volume. Costs: JVM or a large binary in the demo, ZooKeeper or
  KRaft operational surface, partition and consumer-group tuning, and a container that makes offline
  demo startup materially slower. Buys: throughput headroom we cannot use and durability guarantees
  Redis AOF plus an idempotent consumer already covers for this workload.
- **PostgreSQL as a queue** (`SELECT … FOR UPDATE SKIP LOCKED`). Genuinely viable and briefly preferred;
  rejected because it couples ingestion backpressure to the primary store, which is the component we
  most want to protect under load.
- **RabbitMQ.** Rejected: another new dependency for no advantage over Redis Streams here.

## Consequences

- Simpler local development and a demo that starts fast and offline.
- Redis becomes a critical path component; it must be persistent (AOF), monitored and backed up.
- Retention is memory-bound, not disk-bound. Mitigated by trimming policy plus archival of processed
  events to the primary store.
- **This decision must be stated to judges, not concealed.** "We sized the transport to the actual load
  and kept the migration seam" is a stronger engineering answer than an idle Kafka container.

## Revisit trigger

Sustained throughput above ~5,000 events/sec, a genuine multi-consumer replay requirement measured in
days, or a mandated integration with an existing Kafka estate at I4C.
