-- Unlock All Mementos mod
-- Removes unlock requirements so all mementos and both memento slots
-- are available from the start of game setup.

-- Remove unlock requirements for all individual mementos
-- This makes every memento selectable regardless of progression
DELETE FROM UnlockableRewards WHERE Type = 'UNLOCKABLEREWARD_TYPE_MEMENTO';

-- Remove unlock requirements for memento slots
-- This ensures BOTH slots are available (vanilla locks them behind
-- Foundation Path levels 2 and 5)
DELETE FROM UnlockableRewards WHERE Type = 'UNLOCKABLEREWARD_TYPE_SLOT';
