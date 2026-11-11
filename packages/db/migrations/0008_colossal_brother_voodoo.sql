CREATE TABLE `auth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`code` text NOT NULL,
	`http_status` integer,
	`created_at` integer NOT NULL
);
