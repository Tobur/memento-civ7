-- Unlock All Mementos mod
-- NOTE: An earlier SQL approach (DELETE FROM Rewards WHERE
-- Type='UNLOCKABLEREWARD_TYPE_MEMENTO') turned every memento grey —
-- the `Rewards` table is the catalog of awardable items, not a gate.
-- Removing rows tells the game those mementos do not exist as
-- rewards at all, so they cannot be selected.
--
-- Unlock state is determined elsewhere (DNA blob / Online
-- Metaprogression earned-rewards list). The mod now relies solely
-- on the JS runtime patch in scripts/unlock-all-mementos.js to
-- mark every memento as DISPLAY_UNLOCKED.
--
-- This file is kept as a no-op so the UpdateDatabase action still
-- has something to load.

SELECT 1;
