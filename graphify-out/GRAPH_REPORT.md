# Graph Report - bizone  (2026-11-02)

## Corpus Check
- 41 files · ~98,245 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 1 file(s) not represented in the graph (top: (none) 1)

## Summary
- 135 nodes · 154 edges · 27 communities (9 shown, 18 thin omitted)
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Architecture Patterns & Templates
- Payment Hub Core Engine
- API Gateway & Service Layer
- BizOne Platform Business Modules
- BizOne API Infrastructure
- Event-Driven & Payment Security
- BizOne SRS & Config
- POS Dual-Screen System
- Frontend Design Principles
- Dashboard & Reports
- CQRS & Event Sourcing
- Staff & Settings Module
- AI-Native Architecture
- Platform Engineering
- Polyglot Persistence
- Hexagonal Architecture
- CAP Theorem
- CRM Module API
- Order Module API
- Product Module API
- Warehouse Module API
- Supplier Module
- Performance NFR
- Payment Hub Admin Persona

## God Nodes (most connected - your core abstractions)
1. `BizOne and Payment Hub Build Plan` - 17 edges
2. `BizOne Platform` - 14 edges
3. `BizOne SRS Document` - 14 edges
4. `Software Architecture Design Skill` - 12 edges
5. `Payment Hub API Design Document` - 10 edges
6. `BizOne API Design Document` - 9 edges
7. `Payment Hub System` - 9 edges
8. `Data Architecture Patterns` - 7 edges
9. `BizOne URD Document` - 7 edges
10. `Payment Hub Route Engine` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Transaction State Machine (Created → Pending → Success/Failed/Expired → Refunded)` --semantically_similar_to--> `Saga Pattern for Distributed Transactions`  [INFERRED] [semantically similar]
  documents/API-Design-PaymentHub.md → .agents/skills/software-architecture-design/assets/patterns/event-driven-template.md
- `Transactional Outbox Pattern` --semantically_similar_to--> `Webhook Delivery with Retry (Exponential Backoff)`  [INFERRED] [semantically similar]
  .agents/skills/software-architecture-design/assets/patterns/event-driven-template.md → documents/API-Design-PaymentHub.md
- `API Rate Limiting (Redis-based)` --conceptually_related_to--> `System Scalability Checklist`  [INFERRED]
  documents/API-Design-BizOne.md → .agents/skills/software-architecture-design/assets/operations/scalability-checklist.md
- `Circuit Breaker Pattern` --conceptually_related_to--> `Payment Hub Route Engine`  [INFERRED]
  .agents/skills/software-architecture-design/references/scalability-reliability-guide.md → PLAN.md
- `POS WebSocket Real-time Sync` --implements--> `BizOne POS (NextJS + WebSocket)`  [INFERRED]
  documents/API-Design-BizOne.md → PLAN.md

## Hyperedges (group relationships)
- **Payment Hub Connector Routing Flow** — plan_md_payment_hub_txn_engine, plan_md_route_engine, plan_md_vnpay_connector, plan_md_momo_connector, plan_md_zalopay_connector [EXTRACTED 0.95]
- **BizOne Three-Layer Architecture** — plan_md_api_gateway_layer, plan_md_service_layer, plan_md_data_layer [EXTRACTED 1.00]
- **Distributed Data Consistency Patterns Cluster** — _agents_skills_software_architecture_design_references_data_architecture_patterns_md_cqrs, _agents_skills_software_architecture_design_references_data_architecture_patterns_md_event_sourcing, _agents_skills_software_architecture_design_assets_patterns_event_driven_template_md_saga_pattern [INFERRED 0.85]
- **BizOne Payment Flow Integration** — documents_brd_bizone_pos_module, documents_srs_paymenthub_payment_hub, documents_srs_paymenthub_webhook_engine, documents_srs_paymenthub_transaction_state_machine [INFERRED 0.85]
- **Connector Plugin System** — documents_srs_paymenthub_connector_architecture, documents_srs_paymenthub_connector_registry, documents_srs_paymenthub_connector_interface, documents_srs_paymenthub_mapping_layer, documents_srs_paymenthub_circuit_breaker [EXTRACTED 1.00]
- **BizOne Multi-Channel Sync Architecture** — documents_brd_bizone_omni_module, documents_srs_bizone_omni_channel_sync, documents_srs_bizone_bullmq, documents_srs_bizone_mariadb [INFERRED 0.75]

## Communities (27 total, 18 thin omitted)

### Community 0 - "Architecture Patterns & Templates"
Cohesion: 0.18
Nodes (17): System Scalability Checklist, Event-Driven Architecture Template, Microservices Architecture Template, Architecture Decision Record Template, Service Architecture Blueprint, API Gateway and Service Mesh Patterns, Architecture Trends 2026, Data Mesh Architecture (+9 more)

### Community 1 - "Payment Hub Core Engine"
Cohesion: 0.12
Nodes (16): Payment Hub Feature Overview, Audit Log System (Payment Hub), Circuit Breaker (Payment Hub), PaymentConnector Interface Contract, Connector Registry, Idempotency Key Pattern, Connector Mapping Layer (DTO), Payment Hub System (+8 more)

### Community 2 - "API Gateway & Service Layer"
Cohesion: 0.24
Nodes (15): Circuit Breaker Pattern, Payment Flow Sequence (Merchant → PaymentHub → Partner), API Gateway Layer (NextJS API Routes / tRPC / REST), BizOne POS (NextJS + WebSocket), BizOne and Payment Hub Build Plan, BizOne Web App (NextJS + tRPC), Connector Plugin Architecture, Data Layer (MariaDB, Redis, MinIO, BullMQ) (+7 more)

### Community 3 - "BizOne Platform Business Modules"
Cohesion: 0.13
Nodes (13): BizOne Platform, CRM Module (BRD), Marketing & Promotions Module (BRD), Omni Channel Module (BRD), Order Management Module (BRD), Product Management Module (BRD), BizOne Technology Stack, Warehouse Management Module (BRD) (+5 more)

### Community 4 - "BizOne API Infrastructure"
Cohesion: 0.17
Nodes (12): BizOne API Design Document, BullMQ Job Queue for Async Processing, Idempotency Key Pattern (Redis TTL 24h), JWT Authentication with Refresh Token Rotation, BizOne Omni Channel Module API, BizOne POS Module API, POS WebSocket Real-time Sync, API Rate Limiting (Redis-based) (+4 more)

### Community 5 - "Event-Driven & Payment Security"
Cohesion: 0.18
Nodes (9): Payment Hub Dispute Module API, HMAC-SHA256 Merchant API Authentication, Payment Hub API Design Document, Payment Hub Reconciliation Module API, Refund Flow (Partial and Full Refund), Transaction State Machine (Created → Pending → Success/Failed/Expired → Refunded), VietQR Payment QR Code Generation, Webhook Delivery with Retry (Exponential Backoff) (+1 more)

### Community 6 - "BizOne SRS & Config"
Cohesion: 0.24
Nodes (10): BizOne Feature Overview, Environment Configuration, Audit Log System (BizOne), BullMQ Job Queue, MariaDB Database, NextJS Frontend Framework, Omni Channel Sync Engine, RBAC Permission System (+2 more)

### Community 7 - "POS Dual-Screen System"
Cohesion: 0.24
Nodes (9): POS Module (BRD), POS Software Requirements, Admin Owner Persona (Anh Minh), End-to-End Sales Flow, Manager Persona (Chị Lan), POS Use Cases (URD), Seller Persona (Bạn Tuấn), BizOne URD Document (+1 more)

### Community 9 - "Dashboard & Reports"
Cohesion: 0.50
Nodes (4): Reports & Analytics Module (BRD), BizOne Dashboard Mockup, Reports Screen Mockup, BizOne Mockup Navigation Index

## Knowledge Gaps
- **60 isolated node(s):** `Apache License 2.0`, `Architecture Decision Record Template`, `Service Architecture Blueprint`, `Architecture Trends 2026`, `Platform Engineering and IDPs` (+55 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 67 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BizOne API Design Document` connect `BizOne API Infrastructure` to `API Gateway & Service Layer`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **What connects `Apache License 2.0`, `Architecture Decision Record Template`, `Service Architecture Blueprint` to the rest of the system?**
  _60 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Payment Hub Core Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Why does `BizOne and Payment Hub Build Plan` connect `API Gateway & Service Layer` to `BizOne API Infrastructure`, `Event-Driven & Payment Security`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Should `BizOne Platform Business Modules` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `BizOne Platform` connect `BizOne Platform Business Modules` to `Payment Hub Core Engine`, `BizOne SRS & Config`, `POS Dual-Screen System`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._