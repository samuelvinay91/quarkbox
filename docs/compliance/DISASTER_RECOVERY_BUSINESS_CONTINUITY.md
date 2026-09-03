# Disaster Recovery & Business Continuity Plan

## 1. Purpose & Scope
This plan details the strategies, procedures, and resources required to ensure QuarkBox's continuous operation and rapid recovery of critical systems in the event of a catastrophic failure or natural disaster.

## 2. Recovery Objectives
- **Recovery Point Objective (RPO):**
  - <= 1 hour for transactional database data.
  - <= 1 day for audit logs and cold storage data.
- **Recovery Time Objective (RTO):**
  - <= 4 hours for a full cluster rebuild and restoration of core services.

## 3. Backup Strategy
- **Database:** Automated daily snapshots of the PostgreSQL database with a strict 30-day retention policy.
- **Replication:** Continuous archiving of Write-Ahead Logs (WAL) for point-in-time recovery.
- **Audit Logs:** Immutable cold archival of audit logs, executed via a weekly cron job to a secured and locked S3/GCS bucket.

## 4. High Availability Architecture
- **Deployment:** Multi-zone Kubernetes deployment to tolerate zone-level failures.
- **Compute:** Stateless API pods enabling rapid scaling and seamless rescheduling.
- **Storage:** Persistent volume replication across availability zones to ensure data durability.

## 5. Annual DR Testing Protocol
- Disaster recovery procedures must be tested at least annually.
- Testing includes simulation checklists, tabletop exercises, and full failover drills.
- Results and identified gaps must be documented, leading to continuous improvement of the DR plan.
