CREATE TABLE `canvas_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`node_count` integer DEFAULT 0 NOT NULL,
	`preview` text
);
--> statement-breakpoint
CREATE TABLE `canvas_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canvas_id` text NOT NULL,
	`node_id` text NOT NULL,
	`node_title` text NOT NULL,
	`canvas_title` text NOT NULL,
	`prompt_preview` text NOT NULL,
	`model` text NOT NULL,
	`size` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`mime_type` text,
	`created_at` text NOT NULL,
	`finished_at` text
);
