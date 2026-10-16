# Template beta.68 compatibility

The baseline was beta.54, commit 2bfd8d1fc4d28b23c54c214c3aef1ecfd1729a31. The public beta.68 tarball is the target. Public npm no longer carries beta.54, so the baseline source comes from the NocoBase beta.54 release commit 6f38530b0.

## Retained capabilities

NocoHR uses AI employees, workflow, avatars and Hub publishing, even though Default no longer includes them. Keep their dependencies, registrations, AI/workflow configuration and application-owned source. Hub CLI is retained at its existing release; the upstream template no longer maintains it.

AI employee 3.0.0-beta.2 and workflow 2.0.0-beta.1 still call the removed client-2 Settings/Dev route declarations. The version-specific patches in `../../patches/` translate them to client-3 `defineAppRoutes`, preserve `/settings` and `/dev` paths and explicit authorization, and omit dev loaders in production. The two dependency overrides in `../../pnpm-workspace.yaml` bind these adapted plugins to the application's single client-3 service-token identity. Recheck and remove the patches/overrides together when both upstream plugins support client 3.

Application-owned Settings/Dev helpers live in `../../client/routing/surface-routes.ts`. Existing shell routing, header controls and mobile tabs are retained; settings navigation derives from runtime.routes. Keep the deep-link authentication gates and markdown/CSP protections.

The template's homepage and generic inbox do not replace NocoHR's redirecting homepage or `/talent/inbox`. Business migrations and seeds are preserved byte for byte. Template-owned system copy now lives in `../../client/locales/system/`; application overrides and business translations remain in the original locale files.

The application retains the @ path alias for business source alongside the template's # imports, workflow build/typecheck includes, and its custom theme palette and density. Add new required theme tokens without resetting the application palette.

## Configuration and rollout

The new `secrets` configuration and Secrets/Mailer providers support encrypted plugin credentials. Existing live configuration and secrets must never be printed or replaced. Use the public configuration diagnostics and secret-migration commands before production rollout; validate device authorization and mail with the migrated configuration. Do not rotate keys or rewrite migration history merely to make startup pass.
