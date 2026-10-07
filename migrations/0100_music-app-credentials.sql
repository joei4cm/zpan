CREATE TABLE `music_app_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`username` text NOT NULL,
	`token` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_app_credentials_username_uniq` ON `music_app_credentials` (`username`);--> statement-breakpoint
CREATE INDEX `music_app_credentials_user_idx` ON `music_app_credentials` (`user_id`);--> statement-breakpoint
CREATE INDEX `music_app_credentials_status_idx` ON `music_app_credentials` (`status`);