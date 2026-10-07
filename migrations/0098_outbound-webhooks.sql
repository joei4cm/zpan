CREATE TABLE `outbound_webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint_id` text NOT NULL,
	`event_type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_status_code` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`delivered_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbound_webhook_deliveries_endpoint_key_uniq` ON `outbound_webhook_deliveries` (`endpoint_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `outbound_webhook_deliveries_status_next_idx` ON `outbound_webhook_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `outbound_webhook_deliveries_endpoint_created_idx` ON `outbound_webhook_deliveries` (`endpoint_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `outbound_webhook_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`secret` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`event_types` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outbound_webhook_endpoints_enabled_idx` ON `outbound_webhook_endpoints` (`enabled`);