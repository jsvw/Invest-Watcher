# InvestTrack - Portfolio Tracking Application

## Overview

InvestTrack is a full-stack investment portfolio tracking application that allows users to monitor their investments across multiple platforms (crypto, stocks, real estate, banks, etc.). Users can add investment platforms, record deposits/investments, track valuations over time, and view analytics with AI-powered insights.

The application follows a monorepo structure with a React frontend, Express backend, and PostgreSQL database using Drizzle ORM.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, bundled via Vite
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **Charts**: Recharts for data visualization (pie charts, area charts, bar charts)
- **Animations**: Framer Motion for smooth page transitions
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (compiled via tsx in development, esbuild for production)
- **API Design**: RESTful endpoints defined in a shared routes contract (`shared/routes.ts`)
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Validation**: Zod schemas with drizzle-zod integration

### Authentication & Security
- **Multi-user authentication**: Email/password registration and login
- **Password hashing**: bcrypt with secure salt rounds
- **Session management**: express-session with PostgreSQL storage via connect-pg-simple
- **Data isolation**: All data is scoped by userId; users cannot access other users' data
- **Route protection**: All API routes use requireAuth middleware
- **Ownership verification**: Storage layer methods verify resource ownership before access

Key files:
- `server/auth.ts`: Authentication setup, login/register/logout routes
- `server/storage.ts`: User-scoped data access methods with SQL-level filtering
- `client/src/App.tsx`: AuthContext provider with session-based auth check

### Data Model
The application tracks seven main entities:
1. **Users**: User accounts with email, hashed password, and optional name
2. **Platforms**: Investment sources with configurable tracking modes (scoped by userId)
3. **Investments**: Individual deposit/contribution records tied to platforms (standard mode)
4. **Valuations**: Point-in-time value snapshots for each platform (standard mode)
5. **Assets**: Individual investment items within a platform (asset_returns/item_valuations modes)
6. **AssetValuations**: Point-in-time value snapshots for individual assets
7. **ScraperConfigs**: Web scraping configurations per platform (credentials, scraper type, last status)
8. **Trading212Holdings**: Daily instrument-level snapshots for Trading 212 platforms (ticker, shares, prices, P/L, allocation)
9. **Trading212Dividends**: Per-ticker dividend payment records for Trading 212 platforms (amount, date, quantity); stored in DB to avoid re-fetching from API on every page load

### Web Scraping & API Integrations
- **Puppeteer + Chromium**: Headless browser automation for scraping login-protected investment platforms
- **Chromium path**: `/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium`
- **Supported scrapers**: Monefit SmartSaver (`server/scrapers/monefit.ts`), RoboCash (`server/scrapers/robocash.ts`), CrowdPear (`server/scrapers/crowdpear.ts`), GoldRepublic (`server/scrapers/goldrepublic.ts`), Trading 212 API (`server/scrapers/trading212.ts`)
- **Trading 212 Integration**: Uses HTTP Basic Auth (API Key + API Secret) to fetch pie portfolio data via REST API. Matches pies by name to platforms. Valuation-only mode. Rate-limited with 5-second delays between requests. Holdings tab uses `/equity/portfolio` endpoint to enrich instruments with currentPrice, averagePrice, quantity, and ppl data. Daily holdings snapshots stored in `trading212_holdings` table for historical tracking with stacked area chart and date-based snapshot browsing. Dividends are persisted in `trading212_dividends` table and served from DB on normal loads; only re-fetched from API on explicit refresh (`?refresh=true`) or when no DB records exist.
- **Startup scrape**: All enabled scrapers run automatically 10 seconds after app launch, ensuring data is fresh even if the daily 09:00 cron was missed due to app downtime
- **Flow**: Store credentials in `scraper_configs` table → Trigger scrape from UI → Scraper fetches data → Creates valuations automatically
- **CrowdPear Integration**: Puppeteer scraper that logs into crowdpear.com/en/client, extracts balance from `.Balance_balance__-D0Zw` span element (Ant Design). Valuation-only mode.
- **GoldRepublic Integration**: Puppeteer scraper that logs into goldrepublic.com/en-us/login with username/password. Extracts portfolio value from dashboard. Requires username, email, and password credentials. Valuation-only mode.
- **UI**: ScraperConfigDialog component accessible from platform details page ("Web Scraper" button). Shows different credential fields based on scraper type (email/password for Monefit/RoboCash/CrowdPear, username/email/password for GoldRepublic, API key/secret + optional pie name for Trading 212).
- **API routes**: `GET/POST/DELETE /api/platforms/:id/scraper-config`, `POST /api/platforms/:id/scrape`

### Platform Tracking Modes
Platforms support three tracking modes selected during creation:
- **standard**: Traditional platform-level tracking with investments and valuations
- **asset_returns**: Track individual assets with invested amounts and annual yields (ideal for real estate, loans)
- **item_valuations**: Track items with periodic valuation updates (ideal for collectibles, specific crypto holdings)

Each platform has its own currency setting and can operate independently with different tracking methodologies.

### API Contract Pattern
The project uses a typed API contract pattern where:
- Routes are defined in `shared/routes.ts` with input/output Zod schemas
- Frontend hooks consume these definitions for type-safe API calls
- Backend validates requests against the same schemas

### Build System
- Development: Vite dev server with HMR for frontend, tsx for backend
- Production: Vite builds frontend to `dist/public`, esbuild bundles backend to `dist/index.cjs`
- Database migrations: Drizzle Kit with `db:push` command

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connected via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management
- **connect-pg-simple**: Session storage (available but not currently used for auth)

### AI Integration
- **OpenAI API**: Used for generating portfolio insights
  - Configured via `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`
  - Supports chat completions and image generation via Replit AI Integrations
  - Chat conversations are persisted in database tables (`conversations`, `messages`)

### Frontend Libraries
- **Radix UI**: Accessible component primitives (dialogs, dropdowns, tabs, etc.)
- **Recharts**: Chart library for portfolio visualizations
- **date-fns**: Date formatting and manipulation
- **Lucide React**: Icon library

### Replit-Specific
- **@replit/vite-plugin-runtime-error-modal**: Error overlay in development
- **@replit/vite-plugin-cartographer**: Development tooling
- **@replit/vite-plugin-dev-banner**: Development environment indicator

## Versioning

The app uses semantic versioning (x.x.x) stored in `client/src/lib/version.ts`:
- **Major (x.0.0)**: Breaking changes or major feature overhauls
- **Minor (0.x.0)**: New features, significant improvements
- **Patch (0.0.x)**: Bug fixes, small tweaks, minor UI changes

Update the version in `client/src/lib/version.ts` before each publication. The version is displayed in the sidebar footer.