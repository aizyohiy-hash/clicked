ALTER TABLE "conversation_members" ADD COLUMN "is_muted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;
