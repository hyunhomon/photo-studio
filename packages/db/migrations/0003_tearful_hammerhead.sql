CREATE TABLE `generation_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`stage` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`request_hash` text NOT NULL,
	`prompt_version` text NOT NULL,
	`provider_request_id` text,
	`output_json` text,
	`duration_ms` integer,
	`tokens_in` integer,
	`tokens_out` integer,
	`actual_cost_usd` real,
	`estimated_cost_usd` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_job_stage` ON `generation_attempts` (`job_id`,`stage`);--> statement-breakpoint
CREATE INDEX `attempt_owner` ON `generation_attempts` (`user_id`);--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`request_json` text NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_idempotency` ON `generation_jobs` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `job_owner_product` ON `generation_jobs` (`user_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `shoot_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`spec_json` text NOT NULL,
	`source_ids_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_owner_product` ON `shoot_plans` (`user_id`,`product_id`);