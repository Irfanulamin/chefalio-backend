# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

REST API for **Chefalio** — a marketplace where chefs publish recipes and sell
cookbooks. NestJS 11 + MongoDB (Mongoose) + Stripe Checkout + Cloudinary +
Resend. Package manager is **pnpm 11** (`packageManager` is pinned; Corepack is
enabled on Vercel via `vercel.json`).

## Commands

```bash
pnpm run start:dev          # watch mode, port from PORT (default 5000)
pnpm run build              # nest build → dist/
pnpm run start:prod         # node dist/main
pnpm run lint               # eslint --fix over src, apps, libs, test
pnpm run format             # prettier over src and test
pnpm test                   # jest (see "Tests" below — currently all suites fail to compile)
npx jest src/path/to.spec.ts  # single suite
npx tsc --noEmit -p tsconfig.build.json   # type-check without emitting
```

## Architecture

### Two bootstrap paths in one file

`src/main.ts` exports **both** a local `bootstrap()` (called only when
`process.env.VERCEL` is unset) and a default `handler` for Vercel serverless.
They configure the app separately — the same `ValidationPipe`, `cookieParser`,
and CORS setup is written twice with slightly different CORS origin logic.
**WebSockets only work on the local path**; Vercel serverless cannot hold socket
connections, so `NotificationGateway` broadcasts are a no-op in production.

### Module layout

One directory per domain concept, each with `*.module.ts`, `*.controller.ts`,
`*.service.ts`, `dto/`, and `schemas/`:

| Module              | Owns                                                        |
| ------------------- | ----------------------------------------------------------- |
| `auth`              | JWT issuing/refresh, email verification, password reset, Google OAuth, all guards |
| `user`              | User CRUD, admin user management, OAuth user creation       |
| `recipe`            | Recipe CRUD, catalogue listing, chef + admin analytics      |
| `recipe-interaction`| Save/love toggles, saved/loved lists, engagement analytics  |
| `cookbook`          | Cookbook CRUD, global discount                              |
| `cookbook-purchase` | Stripe Checkout, webhook fulfillment, earnings analytics    |
| `chef`              | Public chef directory, chef detail, related-chef discovery  |
| `chef-profile`      | Extended chef bio/genres/achievements                       |
| `chef-application`  | Apply → admin approve/reject → role promotion to `chef`     |
| `follow`            | Follower graph (drives notification scoping)                |
| `notifications`     | Notification store, socket gateway, orphan sweeping         |
| `ai`                | Anthropic-backed recipe suggestion from ingredients         |
| `services/`         | Shared `CloudinaryService` and `MailService` (not a module) |

`CloudinaryService` and `MailService` live in `src/services/` and are declared as
plain providers in each module that needs them, so there is **one instance per
consuming module**, not one shared instance.

### Auth model

Three roles: `user`, `chef`, `admin` (`src/auth/roles.decorator.ts`).

JWTs live in **httpOnly cookies** (`access_token` 15m, `refresh_token` 7d), with
a Bearer-header fallback. Four guards:

- **`AuthGuard`** — route-scoped. Verifies the access token, rejects `type: 'refresh'` tokens, populates `request.user` with the raw JWT payload (`{ sub, role, isDemo }`).
- **`RolesGuard`** — route-scoped, reads `@Roles(...)`. Must be listed *after* `AuthGuard` in `@UseGuards`, since it reads `request.user`.
- **`AlreadyLoggedInGuard`** — 403s an authenticated caller hitting login/register.
- **`DemoReadOnlyGuard`** — **global** (`APP_GUARD` in `app.module.ts`). Blocks every non-safe HTTP method for a token carrying `isDemo`. Because global guards run *before* route-scoped ones, it decodes the token itself rather than relying on `request.user`. `@SkipDemoGuard()` exempts logout/refresh.

`ThrottlerGuard` is also global (200 req/min); routes tighten it with `@Throttle`.

### Demo accounts

Seeded reviewer accounts carry `isDemo: true`. Two separate consequences:

1. `DemoReadOnlyGuard` blocks all their writes server-side, whatever their role.
2. Their content is **filtered out of public catalogues** — `RecipeService.getAllRecipes`, `CookbookService.findAll`, and `ChefService.getAllChefs` each exclude demo authors so a real visitor never browses seeded data, while the demo account's own dashboard still has something to show.

That second rule is implemented independently in each of those three services.
For chefs it lives in `publicChefFilter()` (`chef.service.ts`), which both
`getAllChefs` and `getChefCount` call — the count is the headline above that
very list, and the two used to disagree, so the page reported chefs it would
never show.

### Response envelope

Services return plain objects shaped `{ success, statusCode, message, data }`,
with `pagination` beside `data` on list endpoints. `src/common/api-response.ts`
owns that shape — `ok(data, message)` and `paginated(rows, message, total,
page, limit)`.

`data` is always the payload itself. Three endpoints used to nest it
(`data.recipes`, `data.cookbooks`, each with its own `data.pagination`) so a
client had to know which endpoint it was unwrapping; they now match the rest.

**This is still not enforced by an interceptor**, deliberately: an interceptor
would rewrite all ~70 endpoints at once and the live frontend reads several of
them by hand. Endpoints that have not been touched yet still build their
envelope inline — match `api-response.ts` when you add or edit one, and expect
`statusCode` to be missing from some older replies.

### The frontend is live, and it is in this repo's sibling

`../chefalio-frontend` is the deployed Next.js client. Treat its call sites as
the contract: before changing any response shape, grep it.

Changing a response shape means changing both repos in the same commit and
deploying them together. That has been done once, for the three list endpoints
described above: the backend now returns `data` as the array, and
`hooks/useRecipe.ts`, `hooks/useChef.ts`, `types/recipes.type.ts` and
`types/chef.type.ts` were updated to match. **Backend and frontend must ship
together for those three endpoints** — an old client against the new API reads
`undefined` where it expects a list.

If you normalise another endpoint, do the same: change the backend, run
`npx tsc --noEmit` in the frontend, and fix everything it flags. The frontend's
types are what make that sweep reliable — a grep alone missed a third of the
call sites.

Some rules are currently enforced **only** in the client. `chef/orders/columns.tsx`
decides which order-status moves it offers; `admin/cookbooks/page.tsx` bounds the
discount to 0–15. Both are now also enforced server-side, and the server rules
were written to match the client's exactly, so no legitimate UI action 400s.
When you add a rule the client already assumes, mirror it — don't invent a
stricter one.

### Notifications

`NotificationService` injects the raw Mongoose `Connection` instead of the
`Recipe`/`Cookbook` models — deliberately, because those modules already import
`NotificationModule` and injecting their models would create a cycle needing
`forwardRef`. Read the comment before "improving" it.

Notifications carry a denormalised copy of their subject, so deletes must clean
them up (`deleteByTarget`), and `getRecent` additionally verifies targets still
exist and sweeps orphans in the background.

The tray is scoped by the follow graph: `new_recipe`/`new_cookbook` carry a
`chefId` and only reach that chef's followers; `discount` has no `chefId` and
reaches everyone.

### Reading the session

`src/auth/session.ts` owns "who is calling" — `extractToken` (cookie first,
then a `Bearer` header) and `readSession` (verify, or `null`). All three guards
that need a token go through it; each used to do the work longhand, and they
had drifted: `AlreadyLoggedInGuard` read `authorization.split(' ')[1]` without
checking the scheme, so it treated `Basic` credentials as a token.

They are plain functions taking the `JwtService` the caller already holds, not
a provider. `AuthGuard` is applied route-scoped in a dozen modules; a new
constructor dependency would mean wiring it into every one of them.

`readSession` deliberately does **not** reject refresh tokens — that is
`AuthGuard`'s rule alone. `AlreadyLoggedInGuard` must treat a refresh-token
holder as logged in, and `DemoReadOnlyGuard` must never reject a bad token,
since it runs globally on unauthenticated routes too. `guards.spec.ts` pins all
three behaviours down; it was written before the extraction, against the old
implementations.

### Chef identity resolution

`/chefs/:id` and `/chef-profile/:id` accept **either** a 24-char hex ObjectId
**or** a username. The detection (`/^[0-9a-fA-F]{24}$/`) is implemented twice —
`ChefService.resolveChef` and `ChefProfileService.resolveChefId`. Note the
controller does **not** apply `ParseObjectIdPipe` to those params, by design.

### Payments

All Stripe access goes through **`StripeGateway`** (`stripe.gateway.ts`) — the
one place a `Stripe` client is constructed. It owns checkout-session creation,
webhook signature verification, and refunds. The service depends on it rather
than on the SDK, which is what makes `confirmPayment` testable without network.

`createCheckoutSession` stores `cookbookId`, `buyerId`, `receiptEmail`, and a
JSON-stringified `billingAddress` in Stripe **session metadata**; nothing is
written to Mongo until the webhook fires. `confirmPayment` is the fulfillment
path — it is idempotent on `stripeSessionId` (unique index) and decrements stock
with a conditional `findOneAndUpdate({ stockCount: { $gt: 0 } })` so overselling
can't race.

**Every refusal to fulfil a paid session refunds it.** A paid session is either
turned into an order or given back — never neither. Three paths reach that:
the buyer trips the daily cap in a race, the last copy sells between checkout
and the webhook, or the order write fails (which also restores the stock it had
claimed). Before this existed each path was a bare `return` that kept the money.

### Order lifecycle

`order-lifecycle.ts` owns the purchase rules as pure functions — no Nest, no
Mongoose, so it is tested directly:

- `EARNED_STATUSES` / `earnedStatusMatch()` — which statuses count as revenue (`paid`, `shipped`, `delivered`). Use this in aggregations rather than re-typing the array.
- `planTransition(from, to)` — whether a status move is legal and what stock it owes back. Refunds are the only transition that moves stock (+1). This is what stops a `pending` order being marked `delivered`.
- `roundMoney` / `chefProfit` / `adminProfit` — chef 80%, admin 20%.
- `DAILY_PURCHASE_LIMIT`, `startOfUTCDay()`.

`src/common/period-window.ts` owns the `daily|weekly|monthly|lifetime` window
shared by the earnings and engagement dashboards.

### Rate limits enforced in application code

Not throttler config — real business rules, each written inline in its service:

- 3 recipes per chef per **UTC** day (`RecipeService.createRecipe`)
- 2 cookbooks per chef per **UTC** day (`CookbookService.create`)
- 5 cookbook purchases per buyer per **UTC** day — checked at checkout-session creation, and again at webhook fulfillment to catch a buyer who opened several sessions before paying any. The second check refunds rather than dropping the order.

Analytics period windows, by contrast, use **local-time** day boundaries
(`resolvePeriod` in `src/common/period-window.ts`). That difference is
deliberate and documented in both files: caps are abuse limits that shouldn't
move with the server's timezone, dashboards are read by someone who expects
"today" to mean their today.

## Conventions

- **DTO validation** is global: `whitelist`, `forbidNonWhitelisted`, `transform`, `forbidUnknownValues`. Any field not on the DTO is rejected outright, so DTOs must be complete.
- A route body must be typed with a **DTO class**, never `@Body('field')` or an
  inline type literal. `ValidationPipe` works off the parameter's runtime
  metatype, and TypeScript types are erased — an inline literal silently
  disables validation for that route. `admin-cookbook.dto.spec.ts` reads
  `design:paramtypes` off the admin routes so a regression to an untyped body
  fails the suite rather than shipping.
- Writes that go through `$set` (`updateMany`, `findByIdAndUpdate`) need
  **`runValidators: true`** — Mongoose skips schema validators on updates by
  default, so `min`/`max` on the schema is not a backstop unless you ask.
- **`ParseObjectIdPipe`** (`src/common/pipes/`) on every `:id` param that is genuinely an ObjectId.
- **Multipart uploads** go through `FileInterceptor`/`FilesInterceptor` + `ParseFilePipeBuilder` with a 5 MB per-file cap, declared per-route.
- Recipes must have **exactly 3 images** — enforced in the schema validator, in `createRecipe`, and again in `updateRecipe`'s add/remove arithmetic.
- Cloudinary deletes go through `getCloudinaryPublicId(url)` first; it returns `null` for non-Cloudinary URLs, and callers must skip on `null`.
- Image cleanup is **not transactional**. `updateRecipe` deliberately validates everything before touching Cloudinary (see its `STEP 1..4` comments) — preserve that ordering.
- Best-effort side effects (notification dispatch, receipt email) are wrapped in `.catch()`/`try` and logged, never allowed to fail the request.
- `noImplicitAny` is **off** and `strictNullChecks` is **on**. Aggregation results come back as `any[]`, so analytics code casts fields at the point of read.

## Tests

`pnpm test` — 139 specs, all passing. Coverage is deliberately narrow: the
purchase flow and the pure rule modules, which is where the money is.

- `order-lifecycle.spec.ts` / `period-window.spec.ts` / `api-response.spec.ts` / `demo-visibility.spec.ts` — pure functions, no DI, no database.
- `guards.spec.ts` — characterization tests for the guard trio, written against the pre-refactor behaviour.
- `admin-cookbook.dto.spec.ts` — validation rules, plus a check that the routes actually declare the DTOs.
- `analytics-wiring.spec.ts` — reads module metadata, so a provider a controller injects but no module registers fails here instead of at boot.
- `cookbook-purchase.service.spec.ts` — the fulfillment path against stubbed models and a stubbed `StripeGateway`.
- `cookbook-purchase.module.spec.ts` — wiring only; catches a missing provider registration before a deploy does.

The 15 Nest CLI scaffold specs ("should be defined") were deleted — they
asserted nothing and none of them compiled, because `tsconfig.json` narrowed
`types` to `["node", "multer"]` and dropped the Jest globals. `"jest"` is now in
that list.

**When adding tests here, check they can fail.** These suites were validated by
mutation: each rule was deliberately broken and the suite confirmed to go red.
A test that passes against a broken implementation is worse than no test.

`test/jest-e2e.json` exists; there are no e2e specs.

## Gotchas

- `package.json` has a `seed:chef-profiles` script pointing at `src/seeds/seed-chef-profiles.ts`, which **does not exist**. The other seeds in `src/seeds/` are real, plain `.js`, and outside the TS project — so `pnpm run lint` reports a parsing error for each of them. That is pre-existing noise, not something you broke.
- `RecipeSchema` carries a stale comment block ("DELETE these from both schemas") above a text index that is still registered alongside a redundant `{ title: 1 }` index.
- `AuthService.refreshToken` reissues the access token using the **role from the old refresh token**, not the current DB role — a promoted chef keeps a stale role until they re-login.
- `main.ts`, `notification.gateway.ts`, `mail.service.ts`, and `auth.service.ts` read some config via `process.env` directly while the rest of the app uses `ConfigService`.
