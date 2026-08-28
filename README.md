# NUBYX

**Your world. Anywhere.**

NUBYX is a cloud-first personal digital environment designed to feel like a phone in the browser while evolving into a complete cloud workspace.

## Product vision

A user creates a NUBYX ID and receives a persistent personal environment accessible from phone, tablet or desktop. Files, apps, preferences and workspace state follow the account instead of staying tied to one physical device.

## Core modules

- NUBYX ID — authentication, profile, PIN and account recovery
- NUBYX Home — lock screen, launcher, folders, widgets and notifications
- NUBYX Drive — private cloud files, uploads and recent files
- NUBYX Store — installable PWAs and compatible web apps
- NUBYX AI — assistant for search, organization and actions
- NUBYX Vault — protected area for sensitive files
- NUBYX Continuity — synced settings and workspace state across devices
- NUBYX Desktop — windowed desktop experience on larger screens
- NUBYX Business — managed workspaces for companies and teams

## Architecture direction

PWA frontend + Supabase Auth/Postgres/Storage/Realtime. Keep service boundaries clean so NUBYX can later integrate a proprietary backend layer and, in a separate infrastructure phase, remote Android instances.

## Important product boundary

The PWA phase installs and runs compatible web applications/PWAs. Running arbitrary Android APKs requires a separate remote Android/cloud-device infrastructure and is not claimed by the PWA.

## MVP

1. Sign up / sign in
2. Persistent user profile
3. Lock screen and home launcher
4. Installable PWA shell
5. File manager and private storage
6. App catalog
7. User settings and personalization
8. Cross-device synchronization
9. Notifications center
10. Foundation for NUBYX AI

## Roadmap

### Phase 1 — NUBYX OS PWA
Build a polished installable web experience with identity, launcher, storage and synchronization.

### Phase 2 — NUBYX Intelligence
Add AI search, file organization, contextual assistance and user-controlled memory.

### Phase 3 — NUBYX Business
Provision managed workspaces, app policies, roles, access revocation and organization administration.

### Phase 4 — NUBYX Cloud Device
Evaluate isolated remote Android infrastructure, streaming, security, licensing and unit economics before offering native Android app execution.

## Principles

- Mobile-first
- PWA-first
- Secure by default
- User data isolation
- Fast onboarding
- Progressive enhancement
- No fake capabilities
- Scalable multi-tenant architecture
