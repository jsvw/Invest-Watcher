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

### Data Model
The application tracks three main entities:
1. **Platforms**: Investment sources (e.g., "Coinbase", "Fidelity", "Chase Bank")
2. **Investments**: Individual deposit/contribution records tied to platforms
3. **Valuations**: Point-in-time value snapshots for each platform

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