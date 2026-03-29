# scemas-platform documentation

smart city environmental monitoring for hamilton, ontario. PAC architecture, rust processing engine, postgres, next.js + tauri frontends.

## start here

| document                             | notes                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [architecture.md](./architecture.md) | system topology, PAC agent model, data model (ER diagram), request flows, deployment layout, server lifecycle    |
| [patterns.md](./patterns.md)         | deep dive into pipe-and-filter (telemetry), blackboard (alerting), lifecycle state machine (server coordination) |
| [codebase.md](./codebase.md)         | where every file lives, what each crate/package does, dependency graphs, route tables, configuration reference   |

## UML diagrams

in [diagrams/](./diagrams/): 11 PlantUML files covering class structure, state machines, and sequence diagrams. the class diagram (`class_diagram.puml`) is the source of truth for entity definitions.

## operational runbooks

in [runbooks/](./runbooks/): incident response for ingestion failures, database connection issues, alerting evaluation problems, and public API latency. see [runbooks/README.md](./runbooks/README.md) for the symptom-to-runbook matrix.

## design documents

- `D1.pdf` — requirements specification
- `D2.pdf` — architecture design
- `D3.pdf` — detailed design
