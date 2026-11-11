CREATE TABLE `quality_evaluations` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`spec_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`user_id` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_asset_owner` ON `feedback` (`asset_id`,`user_id`,`created_at`);