# My Contributions – SCEMAS

> **SCEMAS (Smart City Environmental Monitoring and Alert System)** is a 3-month Large System Design course project (SFWRENG 3A04) completed by a team of 5 across 4 structured deliverables. I acknowledge the mentorship of the course instructor, who is also a licensed P.Eng. and a Teaching Assistant running weekly in-person tutorials and evaluating submitted deliverables. My team members were Mithu Anura, Aaron Pham, Han Zhang and Arsia Khorramijam. All of our continuous effort brought life to this project.

---

## Deliverable 1 – Software Requirements Specification

- Provided definitions of all terms, acronyms, and abbreviations required to properly interpret the specification
- Brainstormed as a team the modules and functions the platform will have
- Provided a summary of the major functions that the software will perform using a UML state diagram
- Brainstormed different business events (usage scenarios) and viewpoints (key stakeholders) as a team
- Individually wrote 2 complete business events — **user authentication** and **managing personalized alert subscriptions** — including:
  - Preconditions
  - Main success scenarios and secondary/exceptional usage scenarios for all viewpoints
  - One global scenario for each business event
- Individually wrote **Cultural & Political Requirements** and **Legal Requirements** as non-functional requirements, with proper identifiers for traceability
- Migrated full document from Word to **Overleaf LaTeX** with consistent formatting

---

## Deliverable 2 – High-Level Architectural Design

- Brainstormed and modeled the **Analysis Class Diagram** showing:
  - Entity classes (data elements)
  - Boundary classes (interfaces between SCEMAS and the outside world)
  - Controller classes (coordinating interactions among boundary and entity classes)
- Collaboratively identified 3 subsystems and selected and justified their architectures:
  - **Overall: PAC** — main concern is visualization of data with different structures; different user dashboard components map to different PAC agents
  - **Telemetry Management: Pipe-and-Filter** — main concern is collecting raw sensor data and transforming it as it flows through each filter
  - **Alerting Management: Blackboard** — different knowledge sources contribute partial information to non-deterministically classify alerts as critical, moderate, or low
  - **Access Management: Repository** — different agents read/write to a passive data store containing user information as needed
- Added a **high-level system architecture diagram** illustrating all subsystems, data storage, and communication directions
- Revised all **CRC (Classes-Responsibilities-Collaborators) cards** to capture missing classes, functions, and supporting classes
- Migrated full document from Word to **Overleaf LaTeX** with consistent formatting

---

## Deliverable 3 – Detailed Design

- Authored the **Sign-Up & Login sequence diagram** capturing the flow of steps for user registration and authentication
- Created the initial draft of the **Detailed Class Diagram** based on CRC cards from Deliverable 2
- Integrated all diagrams into LaTeX with figure captions and sizing adjustments for readability

---

## Deliverable 4 – Working Implementation

- Produced the **platform demo video** demonstrating how SCEMAS satisfies various functional and non-functional requirements
- Completed the final **PowerPoint presentation** covering:
  - The problem the system addresses
  - Highlights of key functional and non-functional requirements
  - Subsystem architecture diagrams
  - PAC agent map to different user dashboard components
  - System architecture diagram and analysis class diagram
- Analyzed the codebase using **GitDiagram** to understand the overall file structure
- Authored the full **localhost installation and operation guide** covering:
  - Prerequisites
  - Steps to start the platform
  - How to seed sample data
  - Shell helpers
  - Installation verification
  - Complete tech stack list


