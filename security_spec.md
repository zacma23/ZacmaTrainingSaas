# ZACMA Multi-Tenant SaaS Platform — Security Specification & Dirty Dozen Invariants

## Core Data Invariants
1. **Strict Two-Layer RBAC**:
   - **Platform Roles** (`SUPER_ADMIN`, `PLATFORM_ADMIN`, `PLATFORM_SUPPORT`, `PLATFORM_FINANCE`) stored on `/profiles/{uid}.platformRole` govern the ZACMA Super Admin Control Center and cross-tenant provisioning/billing/support.
   - **Institute Roles** (`ADMIN`, `MANAGER`, `ACCOUNTANT`, `INSTRUCTOR`, `RECEPTIONIST`, `HR_OFFICER`, `GENERAL_STAFF`, `STUDENT`) are strictly scoped to their own `tenantId`.
2. **Strict Multi-Tenant Isolation**: Every tenant-owned record carries `tenantId` (legacy ZACMA records without `tenantId` default safely to `'zacma_default'`). Institute users can NEVER read, list, create, update, or delete records belonging to another `tenantId`, nor mutate `tenantId` on existing documents.
3. **Suspended Tenant Lock**: When `/tenants/{tenantId}.status == 'SUSPENDED'`, restricted operational writes (students, staff, courses, enrollments, payments, expenses, attendance) are blocked at the Firestore Security Rules layer.
4. **Two Separate Financial Systems**: Platform SaaS subscription billing (`/platform_subscriptions`, `/platform_invoices`, `/platform_payments`, `/subscription_plans`) is strictly isolated from institute student tuition payments (`/payments`, `/receipts`, `/chapa_transactions`). Institute Admins have read-only access to their own tenant's subscription/invoices only.
5. **No Silent Impersonation**: Platform Support access into a tenant workspace requires creating an auditable, time-limited `/support_access_sessions/{sessionId}` document plus an immutable `/audit_logs/{logId}` entry.
6. **Secure Invitation Claiming**: Newly provisioned Institute Admins claim their role via `/tenant_invitations/{inviteId}` strictly matched to their verified email and invited `tenantId`; self-assigning `platformRole` or claiming another tenant's invitation is impossible.
7. **Preserved Institutional Financial & Identity Guards**: Instructor financial isolation, Maker-Checker payment verification, duplicate transaction/ID locks, AES-256-GCM ID vault isolation, and Admin-only staff salary isolation remain strictly enforced within every tenant.

## Dirty Dozen Adversarial Payloads (Must All Be Denied)
1. **Cross-Tenant Data Snooping**: Admin of `inst_alpha` attempts `get` or `list` on `/students/{id}` or `/payments/{id}` belonging to `inst_beta` or `zacma_default`.
2. **Tenant Hijack via Update**: Institute Admin attempts to update `/students/{id}` changing `tenantId` from `inst_alpha` to `inst_beta`.
3. **Platform Role Self-Escalation**: Institute Admin or new user attempts to set `platformRole: 'SUPER_ADMIN'` in `/profiles/{uid}`.
4. **Cross-Tenant Invitation Spoofing**: User with email `attacker@evil.com` tries to claim `/tenant_invitations/{inviteId}` issued for `director@abc-institute.edu.et`.
5. **Suspended Institute Bypass**: Admin of a `SUSPENDED` institute attempts to create a new student, course, or payment.
6. **Platform Revenue Tampering**: Institute Admin attempts to create or update `/platform_payments/{id}` or `/platform_invoices/{id}` to mark their subscription as `PAID`.
7. **Subscription Limit / Module Self-Upgrade**: Institute Admin attempts to update `/tenants/{tenantId}` changing `enabledModules`, `studentLimit`, `status`, or `subscriptionExpiresAt`.
8. **Accountant Self-Approval**: Accountant updates `/payments/{id}` or `/students/{id}` changing status to `'APPROVED'`.
9. **Accountant Salary / ID Vault Snooping**: Accountant attempts `get` or `list` on `/staff_compensation/{staffId}` or `/identity_documents/{docId}` of another user.
10. **Audit Log Deletion / Tampering**: Any user (including Super Admin) attempts `update` or `delete` on `/audit_logs/{logId}`.
11. **Unverified Bootstrap Email Spoofing**: Request with `zekimuluken@gmail.com` where `email_verified == false`.
12. **Shadow Field & Oversized ID Poisoning**: Document creation with unauthorized ghost keys (`isSuperAdmin: true`) or 200-character invalid document IDs.
