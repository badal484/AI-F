export { getTenantDb, getPlatformDb, type TenantDb } from "./tenant";
export { setChunkEmbedding, searchChunks, type ChunkSearchResult } from "./vector";
// Value export (not `export type`) — callers need runtime access to things
// like Prisma.TransactionIsolationLevel.Serializable, not just the types.
export { Prisma } from "./generated/prisma/client";
export type {
  Role,
  Agency,
  Tenant,
  User,
  Location,
  LocationHours,
  Service,
  StaffMember,
  Customer,
  Lead,
  LeadStage,
  LeadSource,
  Tag,
  Conversation,
  ConversationChannel,
  ConversationStatus,
  Message,
  MessageSender,
  KnowledgeDocument,
  DocumentStatus,
  DocumentChunk,
  Appointment,
  AppointmentStatus,
  WhatsAppTemplate,
  AutomationRule,
  AutomationTrigger,
  AutomationActionType,
  AutomationRun,
  AutomationRunStatus,
  Reminder,
  AiInteractionLog,
} from "./generated/prisma/client";
