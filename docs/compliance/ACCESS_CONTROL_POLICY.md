# Access Control Policy

## 1. Purpose & Scope
The Access Control Policy defines the rules and guidelines for managing access to QuarkBox systems, networks, and data. It ensures that access is granted based on the principle of least privilege.

## 2. User Provisioning & De-provisioning
- **Provisioning:** Access is granted following a formal request and approval process aligned with the user's role.
- **De-provisioning:** Access must be revoked on the same day for offboarded employees. Automated processes will handle immediate token revocation and account disabling.

## 3. Role-Based Access Control (RBAC) Specification
Access is strictly controlled via RBAC with the following predefined roles:
- **Admin:** Full configuration capabilities, user management, and authorization to export SOC2 audit logs.
- **Operator:** Authorized for cluster creation, template publishing, and global sandbox management.
- **User:** Restricted to managing self-owned sandboxes and personal snapshots.
- **Readonly:** Authorized exclusively for viewing read-only telemetry and monitoring dashboards.

## 4. Multi-Factor Authentication (MFA)
- MFA is **mandatory** for Admin and Operator roles.
- MFA implementation must utilize RFC 6238 compliant Time-Based One-Time Passwords (TOTP).

## 5. Password Policy
- Minimum length: 12 characters.
- Complexity: Must include a mix of uppercase, lowercase, numbers, and special characters.
- Storage: Passwords must be hashed and salted using bcrypt with a minimum cost factor of 12.
- Protection: Strict rate-limiting mechanisms must be in place to prevent brute-force attacks on authentication endpoints.

## 6. User Access Review (UAR)
- A comprehensive User Access Review (UAR) procedure will be conducted on a quarterly basis.
- The review ensures that all user access rights remain appropriate and aligned with their current roles. Discrepancies must be remediated immediately.
