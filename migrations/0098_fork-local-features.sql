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
CREATE INDEX `music_app_credentials_status_idx` ON `music_app_credentials` (`status`);--> statement-breakpoint
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
CREATE INDEX `outbound_webhook_endpoints_enabled_idx` ON `outbound_webhook_endpoints` (`enabled`);--> statement-breakpoint
CREATE TABLE `store_credit_balances` (
	`org_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`delta` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `store_credit_ledger_org_created_idx` ON `store_credit_ledger` (`org_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `store_credit_ledger_source_uniq` ON `store_credit_ledger` (`source`,`source_id`);--> statement-breakpoint
CREATE TABLE `store_customers` (
	`org_id` text PRIMARY KEY NOT NULL,
	`stripe_customer_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_gift_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`code_last4` text NOT NULL,
	`storage_bytes` integer NOT NULL,
	`traffic_bytes` integer DEFAULT 0 NOT NULL,
	`credit_amount` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer,
	`redeemed_org_id` text,
	`redeemed_at` integer,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_gift_cards_code_hash_uniq` ON `store_gift_cards` (`code_hash`);--> statement-breakpoint
CREATE INDEX `store_gift_cards_status_idx` ON `store_gift_cards` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `store_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`storage_bytes` integer NOT NULL,
	`traffic_bytes` integer DEFAULT 0 NOT NULL,
	`credit_amount` integer DEFAULT 0 NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`interval` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`stripe_session_id` text,
	`stripe_subscription_id` text,
	`stripe_customer_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `store_orders_org_created_idx` ON `store_orders` (`org_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `store_orders_stripe_session_uniq` ON `store_orders` (`stripe_session_id`) WHERE "store_orders"."stripe_session_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `store_products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'plan' NOT NULL,
	`storage_bytes` integer NOT NULL,
	`traffic_bytes` integer DEFAULT 0 NOT NULL,
	`credit_amount` integer DEFAULT 0 NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`interval` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `store_products_active_sort_idx` ON `store_products` (`active`,`sort_order`,`created_at`);--> statement-breakpoint
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
CREATE INDEX `sync_object_changes_occurred_idx` ON `sync_object_changes` (`occurred_at`);--> statement-breakpoint
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
CREATE INDEX `upload_policies_enabled_priority_idx` ON `upload_policies` (`enabled`,`priority`);--> statement-breakpoint
ALTER TABLE `account` DROP COLUMN `issuer`;