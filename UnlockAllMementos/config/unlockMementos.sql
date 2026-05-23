-- Unlock All Mementos mod
-- Removes unlock requirements so every memento is selectable from the
-- start of game setup. Slot gating (Foundation Path levels) is left
-- untouched.

DELETE FROM UnlockableRewards WHERE Type = 'UNLOCKABLEREWARD_TYPE_MEMENTO';
