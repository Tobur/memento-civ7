// Unlock All Mementos - runtime patch
//
// Strategy:
//   Hook into the Online.Metaprogression API used by the create-game
//   memento selector. Force every memento and slot record to report
//   `displayType = DISPLAY_UNLOCKED` so the UI lets the player pick
//   any memento regardless of progression state.
//
// Diagnostics:
//   Because Civ VII does not pipe `console.*` calls to disk, this
//   script also writes a JSON diagnostics blob to `localStorage`
//   under the `__unlockAllMementos_diag` key after each patch
//   attempt. The keys / values can be inspected via
//   `~/Library/Application Support/Civilization VII/LocalStorage.sqlite`:
//
//     sqlite3 LocalStorage.sqlite 'SELECT value FROM "Values" \
//       WHERE key = "modSettings";'
//
//   (Civ stores everything under the `modSettings` key.)

(function applyUnlockAllMementos() {
    const TAG = '[UnlockAllMementos]';
    const diag = {
        startedAt: Date.now(),
        attempts: 0,
        onlineSeen: false,
        metaprogressionSeen: false,
        patched: false,
        patchedAt: null,
        displayTypeResolved: null,
        wrappedFunctions: [],
        errors: []
    };

    function persistDiag() {
        try {
            const raw = localStorage.getItem('modSettings') || '{}';
            const all = JSON.parse(raw);
            all.__unlockAllMementos_diag = diag;
            localStorage.setItem('modSettings', JSON.stringify(all));
        } catch (e) {
            // ignore — localStorage might be unavailable in some scopes
        }
    }

    function patchMetaprogression() {
        diag.attempts++;

        if (typeof Online === 'undefined') {
            persistDiag();
            return false;
        }
        diag.onlineSeen = true;

        if (!Online.Metaprogression) {
            persistDiag();
            return false;
        }
        diag.metaprogressionSeen = true;

        const mp = Online.Metaprogression;
        if (mp.__unlockAllMementosPatched) {
            return true;
        }

        // Resolve DISPLAY_UNLOCKED enum value. The native binding
        // exposes `DisplayType` as a global object with numeric keys.
        let unlockedValue = null;
        if (typeof DisplayType !== 'undefined' && DisplayType !== null) {
            unlockedValue = DisplayType.DISPLAY_UNLOCKED;
        }
        if (unlockedValue === null || unlockedValue === undefined) {
            // Common enum order in Civ VII: HIDDEN=0, UNLOCKED=1, LOCKED=2
            unlockedValue = 1;
        }
        diag.displayTypeResolved = unlockedValue;

        const force = (rec) => {
            if (!rec || typeof rec !== 'object') return rec;
            try {
                rec.displayType = unlockedValue;
                rec.unlockTitle = '';
                rec.unlockReason = '';
                rec.isNewAndUnseenByPlayer = false;
                return rec;
            } catch (e) {
                // Frozen object — return shallow clone with overrides
                return Object.assign({}, rec, {
                    displayType: unlockedValue,
                    unlockTitle: '',
                    unlockReason: '',
                    isNewAndUnseenByPlayer: false
                });
            }
        };

        const wrap = (name) => {
            if (typeof mp[name] !== 'function') return;
            const orig = mp[name].bind(mp);
            try {
                mp[name] = function () {
                    let result;
                    try {
                        result = orig.apply(this, arguments);
                    } catch (e) {
                        diag.errors.push(`${name} threw: ${e && e.message}`);
                        return result;
                    }
                    if (Array.isArray(result)) {
                        return result.map(force);
                    }
                    return result;
                };
                diag.wrappedFunctions.push(name);
            } catch (e) {
                diag.errors.push(`failed to wrap ${name}: ${e && e.message}`);
            }
        };

        wrap('getMementosData');

        // Also relax supportsMemento — defensive in case engine calls
        // it on equip to verify ownership.
        if (typeof mp.supportsMemento === 'function') {
            const origSupports = mp.supportsMemento.bind(mp);
            try {
                mp.supportsMemento = function () {
                    try { origSupports.apply(this, arguments); } catch (_) {}
                    return true;
                };
                diag.wrappedFunctions.push('supportsMemento');
            } catch (e) {
                diag.errors.push(`failed to wrap supportsMemento: ${e && e.message}`);
            }
        }

        mp.__unlockAllMementosPatched = true;
        diag.patched = true;
        diag.patchedAt = Date.now();
        persistDiag();
        console.log(`${TAG} patched ${diag.wrappedFunctions.join(', ')}`);
        return true;
    }

    persistDiag();
    if (patchMetaprogression()) return;

    // Retry while engine subsystems boot. 50 ms × 400 = 20 s window.
    let attempts = 0;
    const maxAttempts = 400;
    const handle = setInterval(() => {
        attempts++;
        try {
            if (patchMetaprogression() || attempts >= maxAttempts) {
                clearInterval(handle);
                if (attempts >= maxAttempts) {
                    diag.errors.push(`gave up after ${attempts} attempts`);
                    persistDiag();
                    console.warn(`${TAG} gave up after ${attempts} attempts`);
                }
            }
        } catch (e) {
            diag.errors.push(`interval tick: ${e && e.message}`);
            persistDiag();
        }
    }, 50);

    // Also hook DNAUserProfileCacheReady — the canonical event for
    // metaprogression data becoming available.
    try {
        if (typeof engine !== 'undefined' && typeof engine.on === 'function') {
            engine.on('DNAUserProfileCacheReady', () => {
                if (patchMetaprogression()) {
                    clearInterval(handle);
                }
            });
        }
    } catch (e) {
        diag.errors.push(`engine.on hook: ${e && e.message}`);
        persistDiag();
    }
})();
