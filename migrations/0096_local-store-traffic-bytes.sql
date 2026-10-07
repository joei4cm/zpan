ALTER TABLE `store_gift_cards` ADD `traffic_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `store_orders` ADD `traffic_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `store_products` ADD `traffic_bytes` integer DEFAULT 0 NOT NULL;