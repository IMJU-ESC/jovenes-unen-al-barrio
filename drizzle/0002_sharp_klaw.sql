CREATE TABLE `activity_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`object_key` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hour_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`category` text NOT NULL,
	`hours` integer NOT NULL,
	`reason` text NOT NULL,
	`assigned_at` text NOT NULL,
	`assigned_by` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `site_logos` (
	`slot` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`object_key` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `students` ADD `photo_key` text;