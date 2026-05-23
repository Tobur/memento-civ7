// Unlock All Mementos v2 - JS runtime patch
// Forces every memento and slot to DISPLAY_UNLOCKED so the create-game
// memento selector shows all entries as selectable, regardless of
// player progression (Foundation level, leader level, etc).
//
// Strategy:
//   1) Wait for `Online.Metaprogression` to exist (it is initialised
//      after the online subsystem boots).
//   2) Wrap `getMementosData()` and `getMementoSlotData()` so every
//      record's `displayType` is `DisplayType.DISPLAY_UNLOCKED` and
//      `unlockTitle`/`unlockReason` are cleared.
//   3) Wrap `supportsMemento` to always return true (defensive — the
//      engine may query this on equip).
//
// DB-side: `config/unlockMementos.sql` also strips
// UnlockableRewards rows so engine domain.possibleValues is widened.

(function applyUnlockAllMementos() {
    const TAG = '[UnlockAllMementos]';

    function patchMetaprogression() {
        if (typeof Online === 'undefined' || !Online.Metaprogression) {
            return false;
        }
        const mp = Online.Metaprogression;
        if (mp.__unlockAllMementosPatched) {
            return true;
        }

        // Resolve DisplayType.DISPLAY_UNLOCKED — DisplayType is a
        // global enum; fall back to numeric 1 if name lookup fails.
        const unlockedValue =
            (typeof DisplayType !== 'undefined' && DisplayType.DISPLAY_UNLOCKED)
                ? DisplayType.DISPLAY_UNLOCKED
                : 1;

        const force = (rec) => {
            if (!rec || typeof rec !== 'object') return rec;
            try {
                rec.displayType = unlockedValue;
                rec.unlockTitle = '';
                rec.unlockReason = '';
                rec.isNewAndUnseenByPlayer = false;
            } catch (e) {
                // Object may be frozen — return a clone.
                return Object.assign({}, rec, {
                    displayType: unlockedValue,
                    unlockTitle: '',
                    unlockReason: '',
                    isNewAndUnseenByPlayer: false
                });
            }
            return rec;
        };

        if (typeof mp.getMementosData === 'function') {
            const orig = mp.getMementosData.bind(mp);
            mp.getMementosData = function () {
                const data = orig();
                if (!Array.isArray(data)) return data;
                return data.map(force);
            };
        }

        if (typeof mp.getMementoSlotData === 'function') {
            const orig = mp.getMementoSlotData.bind(mp);
            mp.getMementoSlotData = function () {
                const data = orig();
                if (!Array.isArray(data)) return data;
                return data.map(force);
            };
        }

        if (typeof mp.supportsMemento === 'function') {
            const orig = mp.supportsMemento.bind(mp);
            mp.supportsMemento = function () {
                try { orig.apply(mp, arguments); } catch (e) { /* swallow */ }
                return true;
            };
        }

        mp.__unlockAllMementosPatched = true;
        console.log(`${TAG} patched Online.Metaprogression`);
        return true;
    }

    if (patchMetaprogression()) return;

    // Online subsystem not ready yet — retry on a short interval.
    let attempts = 0;
    const maxAttempts = 200; // ~10s at 50ms
    const handle = setInterval(() => {
        attempts++;
        if (patchMetaprogression() || attempts >= maxAttempts) {
            clearInterval(handle);
            if (attempts >= maxAttempts) {
                console.warn(`${TAG} gave up after ${attempts} attempts`);
            }
        }
    }, 50);
})();
