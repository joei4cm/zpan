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
ALTER TABLE `store_gift_cards` ADD `credit_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `store_orders` ADD `credit_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `store_products` ADD `credit_amount` integer DEFAULT 0 NOT NULL;