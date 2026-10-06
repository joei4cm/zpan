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
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`interval` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `store_products_active_sort_idx` ON `store_products` (`active`,`sort_order`,`created_at`);