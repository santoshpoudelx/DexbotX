CREATE POLICY "backend_access_policy" ON "guilds" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "backend_access_policy" ON "guild_settings" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "backend_access_policy" ON "guild_channels" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "backend_access_policy" ON "guild_roles" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "backend_access_policy" ON "guild_templates" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "backend_access_policy" ON "audit_logs" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "backend_access_policy" ON "admin_audit" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "backend_access_policy" ON "mod_actions" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE INDEX "audit_logs_user_created_idx" ON "audit_logs" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "mod_actions_target_created_idx" ON "mod_actions" USING btree ("target_id", "created_at");
