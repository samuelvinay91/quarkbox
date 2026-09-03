# Incident Response Plan

## 1. Purpose & Scope
This Incident Response Plan outlines the organized approach that QuarkBox will take to address and manage a security breach, operational outage, or cyberattack. The scope includes all systems, data, and personnel.

## 2. Incident Severity Classification Matrix

| Severity | Description | Response Time SLA |
|----------|-------------|-------------------|
| **SEV-0 (Critical)** | Core service outage, active data breach, or critical vulnerability exploitation. | < 15 minutes |
| **SEV-1 (High)** | Severe performance degradation or significant component failure impacting multiple users. | < 1 hour |
| **SEV-2 (Medium)** | Minor service disruption, non-critical component failure, or localized issue. | < 4 hours |
| **SEV-3 (Low)** | Negligible impact, cosmetic issue, or low-risk anomaly. | < 24 hours |

## 3. Incident Response Lifecycle (6 Phases)

### Phase 1: Preparation
- Maintenance of audit trails, OTel (OpenTelemetry) alerting configurations, and up-to-date emergency contact lists.
- Regular training and tabletop exercises for the Incident Response Team (IRT).

### Phase 2: Identification & Detection
- Continuous monitoring to detect anomalies such as unexpected cgroup resource spikes, failed authentication surges, or HMAC validation chain breaks.
- Automated alerts trigger the initiation of the incident response workflow.

### Phase 3: Containment
- Immediate execution of short-term containment measures, including forced termination of compromised containers (kill), network isolation, and session token revocation.
- Preservation of volatile data for forensic analysis.

### Phase 4: Eradication
- Identification and removal of the root cause.
- Deployment of necessary patches, system reconfigurations, or removal of malicious artifacts.

### Phase 5: Recovery & Validation
- Restoration of systems from clean snapshots or backups.
- Comprehensive integrity verification to ensure normal operations and the absence of vulnerabilities.
- Gradual reintroduction of the affected system into production.

### Phase 6: Post-Mortem & Lessons Learned
- Conduction of a blameless post-mortem review to document the timeline, root cause, and response effectiveness.
- Customer notification within a 48-hour SLA for any incidents impacting customer data.
- Implementation of corrective actions to prevent recurrence.

## 4. Emergency Contacts & Reporting
- Detailed internal emergency contact roles (Incident Commander, Lead Engineer, Communications Lead).
- Protocols for external reporting to law enforcement, regulatory bodies, and affected customers as required by law and contractual obligations.
