-- The not-negative guard must read the level whoever inserts the movement
-- (e.g. service_role), like the low-stock trigger: run it as the owner.
-- (20261103200423_stock_guard_definer.sql was applied empty by mistake.)
alter function private.stock_movements_not_negative() security definer;
