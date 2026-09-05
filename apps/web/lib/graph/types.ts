/**
 * Money-trail graph contract (master spec §14, §14.2).
 *
 * Two layers live in this file and they are deliberately different shapes:
 *
 * 1. **Wire types** — `TrailHop`, `TrailPath`. A field-for-field mirror of the
 *    backend dataclasses in `apps/api/atlas/graph/trail.py`. These keep the
 *    backend's `snake_case` names so a drift between the two is a type error
 *    rather than a silently `undefined` field at runtime.
 * 2. **View types** — `MoneyTrail*`. What the Cytoscape layer renders. These use
 *    idiomatic `camelCase` and the graph-library vocabulary (`source`/`target`),
 *    because they are ours, not the backend's.
 *
 * The mixed casing is the rule, not an accident: if a name is `snake_case` here
 * it came off the wire, and changing it means changing the backend too.
 *
 * ## Serialisation assumptions
 *
 * There is no HTTP layer for the trail yet — `trail.py` returns Python objects
 * and nothing serialises them. These aliases record what this module assumes the
 * eventual response body looks like, so that when the endpoint lands the
 * disagreement surfaces here instead of in a chart:
 *
 * - `uuid.UUID` → string
 * - `datetime`  → ISO-8601 string with offset (the backend columns are `timestamptz`)
 * - `Decimal`   → **string**, never a JSON number (see `DecimalString`)
 *
 * ## What is deliberately absent
 *
 * No confidence, score, likelihood or risk field appears anywhere below.
 * `TrailPath` has none, and its docstring explains why: there is no labelled
 * ground truth to calibrate one against, and an uncalibrated number rendered as
 * "confidence: 0.82" is a claim the system cannot support. A frontend inventing
 * one — even as a layout weight or an opacity ramp — would put that claim on
 * screen anyway.
 *
 * All data behind these types is synthetic (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md).
 */

/** ISO-8601 instant with UTC offset, e.g. `2026-03-14T09:21:00+05:30`. */
export type IsoDateTime = string;

/** A canonical entity UUID (`entity.canonical_entity.id`). */
export type EntityId = string;

/** A transaction-edge UUID (`graph.transaction_edge.id`). */
export type EdgeId = string;

/**
 * A fixed-point decimal carried as a string, e.g. `"200000.00"`.
 *
 * The column is `NUMERIC(14, 2)`. Parsing that into a JS `number` loses exact
 * rupee arithmetic — `0.1 + 0.2` is the standard example, and a money trail is
 * exactly where it would surface, as sums along a path that no longer add up.
 * Format for display, compare as decimal; never `parseFloat` for arithmetic.
 */
export type DecimalString = string;

/**
 * How value leaves the traceable banking system (master spec §8.1).
 *
 * Mirrors `atlas.core.enums.CashOutChannel`. Only ever set on a `WITHDREW_AT`
 * hop — a transfer between accounts has no cash-out channel, and rendering a
 * default for one would invent a fact.
 *
 * `CRYPTO_P2P` has no physical endpoint. It is a real cash-out that the
 * geospatial tiers structurally cannot place on a map, so a map view must
 * exclude it rather than draw it at a fallback coordinate.
 */
export type CashOutChannel =
  | 'ATM'
  | 'AEPS_BC'
  | 'BANK_BRANCH'
  | 'POS_CASHBACK'
  | 'MERCHANT_QR'
  | 'PREPAID_GIFT'
  | 'CRYPTO_P2P';

/**
 * Closed vocabulary of graph edge types (master spec §14.1).
 *
 * Mirrors `atlas.core.enums.EdgeType`. Closed and labelled on purpose: an
 * unlabelled edge is a picture of a hairball, not an intelligence product.
 */
export type EdgeType =
  | 'TRANSFERRED_TO'
  | 'WITHDREW_AT'
  | 'OWNS'
  | 'HOLDS'
  | 'SUBJECT_OF'
  | 'LINKED_ALERT'
  | 'RELATED_CASE'
  | 'PREDICTED_FOR'
  | 'ACTED_ON'
  | 'SHARES_DEVICE'
  | 'SHARES_BENEFICIARY';

/**
 * The edge types along which value actually moved — `EdgeType.moves_money`.
 *
 * Trail reconstruction follows only these, so every hop the backend returns is
 * one of them. Typed as the subset rather than the full vocabulary so a view
 * branching on hop type need not handle a `SHARES_DEVICE` case that cannot
 * occur: that edge links two accounts plausibly sharing an operator, which is
 * strong intelligence and a terrible trail hop, because following it yields a
 * "money trail" along which no money travelled.
 */
export type MoneyEdgeType = Extract<EdgeType, 'TRANSFERRED_TO' | 'WITHDREW_AT'>;

/**
 * Closed vocabulary of graph node types (master spec §14.1).
 *
 * Mirrors `atlas.core.enums.NodeKind` in full, artefact node types included,
 * because a partial copy of a shared vocabulary is how two layers quietly come
 * to disagree about what a value means.
 *
 * A money trail only ever traverses the financial objects; the artefact types
 * (`COMPLAINT` … `INTERVENTION`) are reached through non-money edges and are
 * authorization-scoped (§29) — a traversal may reveal that a link exists, while
 * the linked case's contents still require authorization in the owning
 * jurisdiction.
 */
export type GraphNodeType =
  // Financial objects — the only kinds reachable on a money trail.
  | 'ACCOUNT'
  | 'WALLET'
  | 'ENTITY'
  | 'MERCHANT'
  | 'CASH_OUT_ENDPOINT'
  | 'BC_AGENT'
  | 'FINANCIAL_INSTITUTION'
  | 'DEVICE'
  | 'NETWORK_INDICATOR'
  | 'GEOGRAPHIC_ZONE'
  // Artefact nodes.
  | 'COMPLAINT'
  | 'CASE'
  | 'ALERT'
  | 'PREDICTION'
  | 'INTERVENTION';

/**
 * One edge on a reconstructed path. Mirrors `trail.TrailHop`.
 *
 * `occurred_at` is when the money moved, and hops on a path are non-decreasing
 * in it. That ordering is what makes a path physically possible rather than
 * merely connected, so anything that re-sorts hops — a layout pass, a sortable
 * table header, an assumption about `Map` iteration — breaks the claim the view
 * is making.
 *
 * The sibling timestamp, `observed_at`, is absent by design: it bounds the
 * traversal server-side (nothing observed after `as_of` may be walked) and is
 * not re-litigated client-side. `MoneyTrailGraph.asOf` records the bound the
 * result was produced under.
 */
export interface TrailHop {
  readonly edge_id: EdgeId;
  readonly from_entity_id: EntityId;
  readonly to_entity_id: EntityId;
  readonly edge_type: MoneyEdgeType;
  readonly amount: DecimalString;
  /** When the money moved. Hops are ordered by this, not by observation time. */
  readonly occurred_at: IsoDateTime;
  /** Set only on a `WITHDREW_AT` hop; `null` on a transfer. */
  readonly channel: CashOutChannel | null;
  /** UPI / IMPS / NEFT / RTGS / AEPS / CARD. Free-form: rails outpace releases. */
  readonly rail: string | null;
  /** 1-based hop count from the origin entity. */
  readonly depth: number;
}

/**
 * A reconstructed path, presented as a hypothesis with its evidence.
 * Mirrors `trail.TrailPath`.
 *
 * `truncated` separates "the money stopped here" from "the search stopped
 * here", and those two facts warrant opposite investigative responses. It has
 * to reach the screen: a truncated trail rendered like a complete one is a
 * wrong answer that looks like a finished one.
 *
 * The backend's derived properties (`origin_entity_id`, `terminal_entity_id`,
 * `reaches_cash_out`, `elapsed`, `longest_dwell`, `retained_fraction`) are
 * Python `@property` values and are not part of the payload. Deriving them here
 * from `hops` keeps one definition; declaring them as fields would assume a
 * serialiser that does not exist yet.
 *
 * There is no `confidence` field. See the module docstring.
 */
export interface TrailPath {
  /**
   * Non-empty by construction: the backend indexes `hops[0]` and `hops[-1]`
   * unguarded, so a zero-hop path is not a value it can produce. Encoded as a
   * non-empty tuple so first/last access needs no runtime check.
   */
  readonly hops: readonly [TrailHop, ...TrailHop[]];
  /** True when `max_depth` cut the search short, not when the money stopped. */
  readonly truncated: boolean;
}

/**
 * An entity rendered as a graph node.
 *
 * Progressive disclosure lives on `expansion`: an investigator opens one hop at
 * a time, so a node has to know whether its successors are drawn and — when
 * they are not — whether that is because there are none or because nobody has
 * looked yet.
 */
export interface MoneyTrailNode {
  readonly id: EntityId;
  /**
   * `null` until resolved separately. `TrailHop` carries entity *ids* only, so
   * a trail alone cannot say what kind of thing a node is. One case is
   * inferable — the target of a `WITHDREW_AT` hop is a cash-out endpoint. Every
   * other node stays `null` rather than being defaulted to `ACCOUNT`.
   */
  readonly type: GraphNodeType | null;
  /**
   * Shallowest hop depth at which this entity appears; the origin is 0.
   * Shallowest rather than first-seen, because two paths can reach the same
   * account and the shorter one is what an investigator can act on soonest.
   */
  readonly depth: number;
  /**
   * Where the node sits on the trail. `CASH_OUT` means an incoming
   * `WITHDREW_AT` hop — value left the traceable system here.
   */
  readonly role: 'ORIGIN' | 'INTERMEDIARY' | 'CASH_OUT';
  /**
   * Progressive-disclosure state.
   *
   * - `COLLAPSED` — successors are known and not yet drawn.
   * - `EXPANDED` — successors are drawn.
   * - `TERMINAL` — the money went no further; there is nothing to expand.
   * - `SEARCH_TRUNCATED` — the traversal hit `maxDepth` here, so whether more
   *   hops exist is unknown. Distinct from `TERMINAL` on purpose: the two look
   *   identical on a canvas and mean opposite things.
   */
  readonly expansion: 'COLLAPSED' | 'EXPANDED' | 'TERMINAL' | 'SEARCH_TRUNCATED';
  /** Synthetic display label; `null` when only the id is known. */
  readonly label: string | null;
}

/**
 * A hop rendered as a graph edge.
 *
 * `from_entity_id`/`to_entity_id` become `source`/`target` because that is what
 * Cytoscape's element contract calls them; `id` is the hop's `edge_id`
 * unchanged, so an edge on the canvas maps back to exactly one backend row.
 */
export interface MoneyTrailEdge {
  readonly id: EdgeId;
  readonly source: EntityId;
  readonly target: EntityId;
  readonly edgeType: MoneyEdgeType;
  readonly amount: DecimalString;
  readonly occurredAt: IsoDateTime;
  /** Set only on a `WITHDREW_AT` edge; `null` on a transfer. */
  readonly channel: CashOutChannel | null;
  readonly rail: string | null;
  readonly depth: number;
  /**
   * Deterministic caption, derived from this edge's own fields — see
   * `edgeCaption` in `./reducer`. Carries no currency symbol and no locale
   * formatting: `TrailHop` does not project a currency, and formatting money
   * needs a `Number`, which `DecimalString` exists to keep out of the data
   * layer. The view can render something richer from the fields above.
   */
  readonly label: string;
}

/**
 * The de-duplicated union of one or more `TrailPath`s, ready to render.
 *
 * Paths overlap — several trails routinely share a leading account — so nodes
 * and edges are sets keyed by id rather than per-path lists. An edge appears
 * once even when it lies on four paths; drawing it four times would show a
 * fan-out that does not exist.
 */
export interface MoneyTrailGraph {
  readonly originEntityId: EntityId;
  /**
   * The point-in-time bound this trail was reconstructed under: no edge
   * observed after this instant contributed to it. Carried on the graph because
   * the view has to be able to state what was known and when — the same graph
   * rebuilt at a later `asOf` is a different answer, not a refreshed one.
   */
  readonly asOf: IsoDateTime;
  /** Traversal depth ceiling, needed to explain a `SEARCH_TRUNCATED` node. */
  readonly maxDepth: number;
  readonly nodes: readonly MoneyTrailNode[];
  readonly edges: readonly MoneyTrailEdge[];
  /** True when any contributing path was cut short by `maxDepth`. */
  readonly truncated: boolean;
}
