# Information Security Policy

## 1. Purpose
The purpose of this Information Security Policy is to establish the overarching framework for managing and protecting the information assets of QuarkBox in alignment with the SOC2 Type II Trust Services Criteria: Security, Availability, Processing Integrity, Confidentiality, and Privacy.

## 2. Scope
This policy applies to all systems, networks, applications, and personnel (including full-time employees, contractors, and third parties) involved in the operation and delivery of QuarkBox services.

## 3. Roles & Responsibilities
- **CISO/Security Lead:** Responsible for the strategic direction, implementation, and continuous monitoring of the Information Security Management System (ISMS).
- **Engineering:** Responsible for implementing secure coding practices, conducting code reviews, and adhering to the Secure Software Development Life Cycle (SDLC).
- **Operations:** Responsible for the secure configuration, maintenance, and monitoring of production infrastructure.

## 4. Core Security Principles
- **Least Privilege:** Access rights for users, applications, and processes are restricted to the minimum required to perform their authorized functions.
- **Defense-in-Depth:** Multiple layers of security controls (administrative, technical, and physical) are implemented to protect assets.
- **Zero Trust Architecture:** No entity (user, device, or network) is inherently trusted, requiring continuous verification and authentication.

## 5. Access Control & Identification
All access to QuarkBox systems and data must be uniquely identifiable. Authentication mechanisms and strict access control lists (ACLs) enforce appropriate access levels. Further details are outlined in the Access Control Policy.

## 6. Cryptographic Standards
QuarkBox mandates robust encryption for data at rest and in transit:
- **In Transit:** TLS 1.2 or TLS 1.3 is required for all external and internal communications.
- **At Rest:** AES-256-GCM is used for encrypting stored data.
- **Data Integrity:** HMAC-SHA256 is utilized for cryptographic integrity verification.
- **Passwords:** Hashed and salted using bcrypt with a work factor of 12.

## 7. Network Security & Micro-segmentation
- **Kubernetes:** NetworkPolicy is utilized to enforce micro-segmentation between application components.
- **Docker:** Isolated bridge networks ensure container-level isolation.
- **Metadata Protection:** Implement SSRF mitigation via metadata sinkholing to block unauthorized access to cloud metadata services.

## 8. Change Management & Secure SDLC
- **Code Review:** All code changes require mandatory peer review and approval prior to merging.
- **CI/CD:** Automated testing (unit, integration, and security scans) is integrated into the CI/CD pipeline.
- **Versioning:** Semantic versioning must be used for all software releases to ensure traceability.

## 9. Review Frequency
This policy must be reviewed and updated at least annually or upon any material change in the QuarkBox architecture or business context.
