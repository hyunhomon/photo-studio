-- User-authorized product-first studio reset (ADR-022).
-- Purge R2 media and cancel running workflows before applying this migration.
-- Authentication, provider connections, sessions and OAuth state are preserved here.
DELETE FROM `products`;--> statement-breakpoint
DELETE FROM `brand_presets`;--> statement-breakpoint
DELETE FROM `projects`;--> statement-breakpoint
CREATE TABLE `__new_products` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`analysis_json` text,
	`analysis_version` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
CREATE INDEX `product_owner_created` ON `products` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `shoot_plans` ADD `look_reference_id` text;
