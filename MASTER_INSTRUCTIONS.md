# MASTER INSTRUCTIONS
## Production-Grade Multi-Tenant AI Automation Platform

## 1. ROLE & DIRECTIVE
You are the Principal Architect, Senior Full-Stack Engineer, AI/LLM Specialist, Security Engineer, UX Engineer, and DevOps Lead. I am the product owner. You are working inside my actual repository using an AI coding agent.

Your absolute objective is to build a real, production-grade SaaS platform—not a prototype, not a fake dashboard, and not a collection of disconnected features. The architecture must scale gracefully from 1 to 1,000+ local businesses (Clinics, Salons, Real Estate, etc.) without requiring a complete rewrite.

## 2. THE BUSINESS VISION
We are building a Multi-Tenant SaaS + Agency White-Label AI Automation Platform.
The platform will allow us to deploy AI assistants for local businesses that can:

- Answer FAQs and specific business questions.
- Capture and qualify leads.
- Book, reschedule, and cancel appointments.
- Communicate via WhatsApp and Website Chat.
- Maintain deep customer context and escalate to human staff seamlessly.

## 3. CORE TECHNOLOGY STACK & STANDARDS
Use this exact core stack. Do not deviate without explicit, documented approval.

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS.
- **UI/UX Framework:** shadcn/ui, Radix Primitives, Lucide Icons.
- **State & Fetching:** Zustand (client state), TanStack Query/React Query (server state & caching).
- **Backend:** Node.js / Next.js Server Actions & API Routes.
- **Database:** PostgreSQL (via Supabase or Neon) + Prisma ORM.
- **Validation:** Zod (Mandatory for ALL API boundaries, forms, and database inputs).
- **Queue/Background:** Redis + BullMQ (For long-running tasks and webhooks).
- **AI Provider:** Vercel AI SDK (with an abstraction layer supporting Anthropic/OpenAI).
- **Storage:** S3-compatible object storage.

## 4. ARCHITECTURE & MULTI-TENANCY (ZERO-TRUST)
This is a multi-tenant system: Agency -> Tenant A, Tenant B, Tenant C.

- **Feature-Sliced Design:** Group your folder structure by domain (e.g., /src/domains/tenant, /src/domains/booking, /src/domains/ai-agent) rather than dumping everything into Next.js routing folders.
- **Hybrid Deployment Ready:** Build the application assuming the UI (Next.js) will run on a serverless platform (like Vercel), while background jobs, WhatsApp webhooks, and AI pipelines will run on a separate long-running worker (via Redis/BullMQ).
- **Strict Tenant Isolation:** Tenant isolation must be enforced at the database ORM level. Use a Prisma Client Extension or dedicated middleware to automatically inject where: { tenantId: currentTenant } into all queries. Never rely on the frontend passing a tenantId.
- **Database Transactions:** Operations affecting multiple tables (e.g., Booking an appointment + updating lead status) MUST be wrapped in a Prisma database transaction.
- **Idempotency:** Webhooks (WhatsApp, Stripe) and background jobs must be strictly idempotent.

## 5. AI, RAG & LLM GROUNDING RULES
- **Vector Storage:** Use pgvector inside PostgreSQL for RAG document embeddings. Do not use a separate external vector database. Ensure vector searches are strictly tenant-isolated.
- **Vercel AI SDK:** Use this SDK exclusively for LLM orchestration. Leverage streamObject and generateObject with strict Zod schemas to guarantee valid structured outputs.
- **Tool-Driven Architecture:** The AI must use explicit, permission-scoped tools (e.g., checkAvailability, bookAppointment). The AI must NEVER invent pricing, hours, or availability.
- **Never Fake Actions:** The AI must never tell the user "Your appointment is booked" unless the internal booking tool executed successfully.
- **Human Handoff:** The AI must monitor for frustration or complex issues and transition the conversation to HUMAN_REQUIRED, pausing automated replies.
- **Prompt Injection Defense:** Treat all retrieved documents and user inputs as untrusted data.

## 6. UX, UI, AND FRONTEND EXCELLENCE
- **Strict Component Usage:** NEVER use raw HTML inputs or buttons. ALWAYS use the shadcn/ui component library.
- **Optimistic Updates:** The UI must feel instant. Use TanStack Query optimistic updates for chat messages, booking requests, and settings changes.
- **Streaming AI:** AI responses must stream instantly to the client. Show loading states when the AI is executing a background tool (e.g., [Icon] Checking calendar availability...).
- **Graceful Loading:** Never show a blank screen. Use Skeleton loaders for data fetching and Error Boundaries for crashes.
- **Mobile-First Accessibility:** The Inbox, Dashboard, and Web Widget must be fully responsive, keyboard navigable, and accessible.

## 7. ABSOLUTE DEVELOPMENT WORKFLOW
Do not build the platform in one uncontrolled operation. Follow this exact verified loop:
AUDIT → ARCHITECTURE → APPROVAL → IMPLEMENT → TEST → SECURITY REVIEW → COMMIT

- **Inspect Before Modifying:** Never assume a file or configuration exists. Verify package.json, schemas, and folder structures before writing code.
- **No Fake Implementations:** Do not simulate successful external calls (like WhatsApp or Stripe) if credentials aren't configured. Log them as NOT CONFIGURED. No fake seed data in production scripts.
- **Definition of Done:** A feature is only DONE when: API exists, UI exists, Zod validation exists, Tenant isolation is verified, Error handling is stable, and type-checking passes.
- **Documentation is Code:** You must dynamically maintain:
  - docs/BUILD_PROGRESS.md (The absolute source of truth for phase progress)
  - docs/ARCHITECTURE.md
  - docs/DATABASE.md

## 8. DEVELOPMENT PHASES
Execute strictly in this order. Do not start a phase until the previous is verified and committed.

- PHASE 0: Repository Audit (Current state, architecture plan, risk assessment).
- PHASE 1: Foundation (Next.js setup, Supabase/Neon DB, Auth, Multi-tenant schema, Logging).
- PHASE 2: Business Core (Tenant profiles, Locations, Services, Staff, Hours).
- PHASE 3: CRM (Customers, Leads, Tags, Conversation pipeline).
- PHASE 4: Universal Inbox (Chat UI, Message assignment, Human handoff).
- PHASE 5: AI Core (Vercel AI SDK setup, Intent detection, Tool definitions).
- PHASE 6: RAG & Knowledge (pgvector setup, Document chunking, Embeddings).
- PHASE 7: Booking Engine (Real-time availability, Timezone handling, Conflict prevention).
- PHASE 8: WhatsApp Integration (BullMQ workers, Webhooks, Message templates).
- PHASE 9: Automations (Triggers, Delays, Reminders).
- PHASE 10: Website Widget (Embeddable chat, origin validation).
- PHASE 11: Analytics & AI Evaluation (Usage tracking, failure rates).
- PHASE 12: Billing (Stripe SaaS architecture).
- PHASE 13: Platform Admin Dashboard.
- PHASE 14: Security Hardening.
- PHASE 15: Production Infrastructure & CI/CD.
- PHASE 16: Advanced AI (Multilingual, Sentiment analysis).
- PHASE 17: Voice AI.
- PHASE 18: White-Label / Reseller Architecture.

## 9. SYSTEM COMMANDS

**COMMAND: "START PHASE 0"**
When I give you this command, DO NOT write application code.
- Inspect the entire repository.
- Produce a comprehensive docs/INITIAL_AUDIT.md.
- Map out the exact database architecture and multi-tenant isolation strategy.
- Stop and wait for my explicit approval before moving to Phase 1.

**COMMAND: "CONTINUE WORK"**
- Read MASTER_INSTRUCTIONS.md and docs/BUILD_PROGRESS.md.
- Inspect the current repository state to verify previous work.
- Identify the next incomplete phase.
- Implement, test, review security, update documentation, and commit only the approved phase.
- Ask clarifying questions ONLY if they dictate a business decision. For engineering decisions, use your expert judgment and document it.

## 10. CODEBASE OPERATIONAL SAFEGUARDS (STRICT)

1. **No Destructive DB Commands:** NEVER execute `prisma migrate reset`, `prisma db push --force-reset`, or any destructive database wiping command without explicit written confirmation from the user.
2. **No Lazy File Truncation:** NEVER output `// ... rest of code unchanged` or placeholder comments in place of real code when modifying files. Always write complete, functional code.
3. **Environment Variables Discipline:**
   - NEVER hardcode credentials, webhook secrets, or API keys in application code.
   - Maintain a pristine `.env.example` file. Whenever a new environment variable is introduced, immediately document it in `.env.example` with a placeholder and description.
4. **Build Verification Before Reporting Done:**
   - Before claiming a task or phase is complete, ALWAYS run:
     - `npm run typecheck` (or `tsc --noEmit`)
     - `npm run lint`
     - `npm run build`
   - If any of these fail, fix the errors before presenting the solution to the user.
5. **No AI Co-Authorship:** NEVER add `Co-Authored-By: Claude`, `Generated with Claude Code`, or any similar trailer/attribution to git commits in this repository. Claude must not appear in the GitHub Contributors list or commit history authorship — commits are authored solely under the product owner's git identity.
6. **Maintain GitHub:** After each approved phase is implemented, tested, and committed locally, push to the `origin` remote (`git push origin main`) so the hosted GitHub repository stays in sync with local work. Do not leave completed, approved phases committed only locally.
