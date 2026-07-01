# Organization Module

Multi-member organization management for corporate and group investor accounts.

---

## Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `Organization` | `organizations` | Named organization owned by a single user |
| `OrganizationMember` | `organization_members` | User membership in an organization with a role string |

---

## Data model

```
Organization
  ├─ id
  ├─ name
  ├─ ownerUserId          ← the creating user; only they can add members
  └─ members: OrganizationMember[]

OrganizationMember
  ├─ id
  ├─ orgId
  ├─ userId
  └─ memberRole           ← free-form string: 'owner', 'member', 'viewer', etc.
```

---

## Creation flow

```
createOrganization(name)
  └─ OrganizationService.create(name, ownerUserId)
       ├─ INSERT INTO organizations (name, ownerUserId)
       └─ INSERT INTO organization_members (orgId, userId=ownerUserId, memberRole='owner')
```

The owner is automatically added as a member with the `'owner'` role on creation.

---

## Authorization rules

| Action | Who can perform |
|--------|----------------|
| Create organization | Any authenticated user |
| Add member | Only the organization owner (`ownerUserId`) |
| View own organizations | The owner only (via `myOrganizations`) |
| Look up by ID | Any caller with `OrganizationService.findById` (service-level, not exposed via resolver) |

---

## API

### GraphQL

| Operation | Type | Auth | Description |
|-----------|------|------|-------------|
| `createOrganization(input)` | Mutation | JWT | Creates an organization; caller becomes the owner and first member |
| `addOrgMember(input)` | Mutation | JWT | Adds a member to an org (owner only) |
| `myOrganizations` | Query | JWT | Returns organizations owned by the authenticated user, with members loaded |

### Input types

```graphql
input CreateOrganizationInput {
  name: String!
}

input AddOrgMemberInput {
  orgId: ID!
  userId: ID!
  memberRole: String!
}
```

---

## Notes

- `OrganizationService` is exported for use by other modules that need to resolve organizational context (e.g. permission checks for `company`-role accounts).
- There is currently no resolver endpoint to view an organization by ID — use `OrganizationService.findById` directly within other services.
- Member roles are free-form strings. Common values used in the codebase: `'owner'`, `'member'`, `'viewer'`.
