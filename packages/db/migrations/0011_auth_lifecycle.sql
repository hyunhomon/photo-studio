CREATE TABLE `auth_lifecycle_events` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_hash` text NOT NULL,
	`event` text NOT NULL,
	`reason` text NOT NULL,
	`is_test` integer NOT NULL,
	`connections_affected` integer DEFAULT 0 NOT NULL,
	`sessions_affected` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_lifecycle_subject_time` ON `auth_lifecycle_events` (`subject_hash`,`created_at`);