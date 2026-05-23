-- Unlock All Mementos mod
-- Removes the unlock-gating rows for every memento from the
-- frontend `Rewards` table (loaded from
-- base-standard/config/unlockableRewards.xml). Slot gating
-- (UNLOCKABLEREWARD_TYPE_SLOT rows) is intentionally left in place.
--
-- Table name = the XML child element of <Database>, NOT the xmlns
-- attribute. The original mod (claude-jkc/memento-civ7) referenced
-- "UnlockableRewards" which does not exist as a SQL table — Civ VII
-- loads it under the name `Rewards`, matching the <Rewards> element.

DELETE FROM Rewards WHERE Type = 'UNLOCKABLEREWARD_TYPE_MEMENTO';
