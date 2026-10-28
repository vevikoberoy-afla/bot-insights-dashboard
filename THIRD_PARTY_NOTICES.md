# Third-party notices for embedded email delivery

The bulk-email implementation uses packages installed from npm rather than copied source. Their upstream license files remain in each package and npm lock data pins the installed versions.

| Package | Installed purpose | License |
| --- | --- | --- |
| `nodemailer` | MIME compilation and optional SMTP transport | MIT-0 |
| `@upstash/qstash` | Signed scheduling and bounded worker fan-out | MIT |
| `@upstash/redis` | Campaign pause/circuit-breaker state | MIT |
| `@aws-sdk/client-sesv2` | AWS SES HTTPS delivery | Apache-2.0 |
| `libphonenumber-js` | Country-aware E.164 parsing and validation | MIT |
| `zod` | Runtime validation for WhatsApp campaign inputs | MIT |

The editor, segment validator, renderer, tracking-token implementation, campaign orchestration, and dashboard UI are implemented directly in this repository. No Maily or Dittofeed application code is copied or bundled.

Apache-2.0 is permissive and compatible with a proprietary SaaS distribution, but it is not the MIT license. Keep this notice and the dependency’s included `LICENSE`/`NOTICE` files when redistributing dependencies.
