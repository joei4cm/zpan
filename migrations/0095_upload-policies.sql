CREATE TABLE `upload_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`selector_json` text DEFAULT '{}' NOT NULL,
	`storage_ids_json` text DEFAULT '[]' NOT NULL,
	`selection_mode` text DEFAULT 'ordered' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `upload_policies_enabled_priority_idx` ON `upload_policies` (`enabled`,`priority`);