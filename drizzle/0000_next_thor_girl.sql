CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`time` text DEFAULT '' NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`hours` integer DEFAULT 0 NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admins` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admins_username_unique` ON `admins` (`username`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`status` text NOT NULL,
	`hours` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`marked_at` text NOT NULL,
	`marked_by` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_student_activity` ON `attendance` (`student_id`,`activity_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`community` text DEFAULT '' NOT NULL,
	`cohort` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_username_unique` ON `students` (`username`);