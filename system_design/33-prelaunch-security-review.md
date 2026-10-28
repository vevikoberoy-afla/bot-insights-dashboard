# Local pre-launch security review

Reviewed the supplied startup cybersecurity playbook against the current Next.js/Supabase application. This report records local evidence; it is not a certification that the deployed system cannot be breached.

## Confirmed issues fixed

- Outbound connector redirects retained authorization headers and request bodies across origins. Cross-origin redirects now fail closed; same-origin redirects still receive DNS and address checks.
- Hexadecimal IPv4-mapped IPv6 addresses could bypass the private-address filter. Mapped private addresses are now decoded and rejected before connecting.
- Local redirect validation admitted control characters which URL parsers can normalize into external redirects. Raw and decoded control characters are now rejected.
- Several customer dashboard and authentication pages lacked frame protection. Static response headers now block framing while preserving widget embedding.
- Media uploads trusted a caller-provided upload-enable flag. Bot configuration is authoritative now, and the authenticated token supplies the default bot scope. Token verification happens before multipart parsing, oversized declared bodies are rejected, and image errors no longer expose internal exception messages. A reverse-proxy body-size limit remains necessary for chunked requests.
- Login bootstrap could change a suspended/rejected onboarding record back to approved through an existing membership. Migration 095 preserves explicit restrictions and blocks direct browser execution of the underlying implementation.
- IP rate limiting trusted arbitrary forwarded headers. It now uses a deployment-selected proxy header and a conservative shared bucket when no trusted proxy is configured.

## Deployment

Apply `supabase/095_onboarding_security_boundaries.sql` after 094. Do not rerun older onboarding migrations after 095: their function definitions precede the restriction wrapper.

Vercel uses its platform-provided IP header. For Cloudflare set `TRUSTED_PROXY=cloudflare` only when the origin rejects direct traffic. For another reverse proxy, set `TRUSTED_PROXY=reverse-proxy` only if it overwrites `X-Real-IP`. Without this configuration traffic shares a conservative rate-limit bucket. Set the proxy's upload-body limit to 6 MiB, including chunked requests.

## Verification

- 52 local PostgreSQL integration tests passed, including tenant isolation, role restrictions, quotas, invitation seats, and suspension preservation.
- Executable boundary tests passed for redirect control characters, private mapped IPv6, token tampering, and token-purpose isolation: `node --experimental-strip-types --no-warnings scripts/test-prelaunch-boundaries.mts`.
- No tracked non-template environment files were found.
- Compared configured private secret values with 392 files in the existing production static bundle: no matches. This scan covers configured values, not every possible historical secret.
- TypeScript and boundary tests passed after the final proxy-header adjustment; `git diff --check` passed.

## Remaining launch checks and findings

The live npm advisory audit reports two high-severity entries in the Firecrawl dependency chain (`@mendable/firecrawl-js` and its Zod dependency), advisory GHSA-mrhx-c7xc-m3w5. The installed SDK requires Zod 3 and zod-to-json-schema 3; forcing Zod 4 or accepting npm's suggested SDK downgrade could break crawling. A compatible SDK migration and crawl integration tests are still required; dependency clearance has not passed.

Live Supabase PostgREST/RLS policies, storage ACLs, two real-user browser sessions, actual email recovery delivery, provider webhook credentials, cloud billing caps, backups, and edge network configuration have not been validated by this local review. Existing media magic-byte validation, image re-encoding/pixel limits, private signed media URLs, widget HMAC validation, and tenant quota integration tests were inspected; that does not establish their deployed configuration.

## Resource impact

No new dependency, background task, polling loop, cache, or per-chat database request was introduced. URL checks run only on outbound connectors. Added SQL restriction checks run on login/bootstrap. Headers and proxy IP selection use constant-size operations. CPU, RSS, and p95 latency under representative production load were not measured, so no zero-impact performance claim is made.
