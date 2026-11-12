CREATE TABLE `reference_retrievals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`asset_id` text,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`query` text NOT NULL,
	`metadata_json` text NOT NULL,
	`failure_code` text,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `retrieval_owner_product` ON `reference_retrievals` (`user_id`,`product_id`);