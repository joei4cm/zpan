CREATE TABLE `sync_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`platform` text DEFAULT 'unknown' NOT NULL,
	`app_version` text DEFAULT 'unknown' NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_devices_user_idx` ON `sync_devices` (`user_id`);--> statement-breakpoint
CREATE INDEX `sync_devices_org_idx` ON `sync_devices` (`org_id`);--> statement-breakpoint
CREATE INDEX `sync_devices_token_hash_idx` ON `sync_devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sync_devices_status_idx` ON `sync_devices` (`status`);--> statement-breakpoint
CREATE TABLE `sync_object_changes` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`org_id` text NOT NULL,
	`object_id` text NOT NULL,
	`parent` text DEFAULT '' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`change_type` text NOT NULL,
	`actor_device_id` text,
	`metadata` text,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_object_changes_org_sequence_idx` ON `sync_object_changes` (`org_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `sync_object_changes_object_idx` ON `sync_object_changes` (`object_id`);--> statement-breakpoint
CREATE INDEX `sync_object_changes_occurred_idx` ON `sync_object_changes` (`occurred_at`);