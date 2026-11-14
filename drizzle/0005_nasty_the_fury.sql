CREATE TABLE `attendance_batch_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`valid` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "attendance_batch_valid" CHECK("attendance_batch_requests"."valid" = 1)
);
