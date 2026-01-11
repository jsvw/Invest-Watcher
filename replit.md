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
The application tracks six main entities:
1. **Users**: User accounts with email, hashed password, and optional name
2. **Platforms**: Investment sources with configurable tracking modes (scoped by userId)
3. **Investments**: Individual deposit/contribution records tied to platforms (standard mode)
4. **Valuations**: Point-in-time value snapshots for each platform (standard mode)
5. **Assets**: Individual investment items within a platform (asset_returns/item_valuations modes)
6. **AssetValuations**: Point-in-time value snapshots for individual assets

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