-- Local development seed SQL for Flare Stack.
-- This file is executed ONLY against local development D1 state.

INSERT OR IGNORE INTO items (id, name, created_at)
VALUES
  ('seed-item-1', 'First local item', 1700000000),
  ('seed-item-2', 'Second local item', 1700000001);
