import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';

export const projects=sqliteTable('canvas_projects',{
  id:text('id').primaryKey(),userId:text('user_id').notNull(),title:text('title').notNull(),
  createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
  nodeCount:integer('node_count').notNull().default(0),preview:text('preview')
});

export const tasks=sqliteTable('canvas_tasks',{
  id:text('id').primaryKey(),userId:text('user_id').notNull(),canvasId:text('canvas_id').notNull(),
  nodeId:text('node_id').notNull(),nodeTitle:text('node_title').notNull(),
  canvasTitle:text('canvas_title').notNull(),promptPreview:text('prompt_preview').notNull(),
  model:text('model').notNull(),size:text('size').notNull(),status:text('status').notNull(),
  error:text('error'),mimeType:text('mime_type'),createdAt:text('created_at').notNull(),finishedAt:text('finished_at')
});
