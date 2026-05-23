// Unlock All Mementos - runtime patch
//
// Strategy (three layers):
//   1) Online.Metaprogression.getMementosData → force displayType to
//      DISPLAY_UNLOCKED so the create-game grid renders every memento
//      as colored / non-greyed.
//   2) GameSetup.getMementoFilteredPlayerParameters → for every slot
//      parameter, extend `domain.possibleValues` to include the full
//      memento catalog. This is the LIST that `setActiveMemento` in
//      memento-slot.js searches when the player clicks a memento; if
//      the value is not in the slot's domain, the click is silently
//      dropped. The engine-filtered domain only contains mementos the
//      player has actually unlocked, so we synthesize entries for the
//      rest using the shape of an existing entry as a template.
//   3) Online.UserProfile.isRewardUnlocked → always true. Defensive
//      against the leader-select-model.js line 51 check that resets
//      currentMemento to NONE when the player profile says the
//      memento is not yet earned.
//
// Diagnostics:
//   The script writes a JSON blob to localStorage key
//   `__unlockAllMementos_diag` (inside the shared `modSettings`
//   record). Inspect via
//     sqlite3 LocalStorage.sqlite \
//       'SELECT value FROM "Values" WHERE key="modSettings";'

(function applyUnlockAllMementos() {
    const TAG = '[UnlockAllMementos]';
    const diag = {
        startedAt: Date.now(),
        attempts: 0,
        onlineSeen: false,
        metaprogressionSeen: false,
        gameSetupSeen: false,
        userProfileSeen: false,
        patched: false,
        patchedAt: null,
        displayTypeResolved: null,
        wrappedFunctions: [],
        domainExtended: false,
        domainExtendedSlots: 0,
        domainAddedTotal: 0,
        errors: []
    };

    function persistDiag() {
        try {
            const raw = localStorage.getItem('modSettings') || '{}';
            const all = JSON.parse(raw);
            all.__unlockAllMementos_diag = diag;
            localStorage.setItem('modSettings', JSON.stringify(all));
        } catch (e) {
            // localStorage may be unavailable in some scopes
        }
    }

    function resolveUnlockedEnum() {
        if (typeof DisplayType !== 'undefined' && DisplayType !== null) {
            const v = DisplayType.DISPLAY_UNLOCKED;
            if (v !== null && v !== undefined) return v;
        }
        return 0; // empirically observed (logged earlier as displayTypeResolved: 0)
    }

    function patchMetaprogression() {
        if (typeof Online === 'undefined') return false;
        diag.onlineSeen = true;

        if (!Online.Metaprogression) return false;
        diag.metaprogressionSeen = true;

        const mp = Online.Metaprogression;
        if (!mp.__unlockAllMementosPatched) {
            const unlocked = resolveUnlockedEnum();
            diag.displayTypeResolved = unlocked;

            const force = (rec) => {
                if (!rec || typeof rec !== 'object') return rec;
                try {
                    rec.displayType = unlocked;
                    rec.unlockTitle = '';
                    rec.unlockReason = '';
                    rec.isNewAndUnseenByPlayer = false;
                    return rec;
                } catch (e) {
                    return Object.assign({}, rec, {
                        displayType: unlocked,
                        unlockTitle: '',
                        unlockReason: '',
                        isNewAndUnseenByPlayer: false
                    });
                }
            };

            const wrap = (obj, name, mapper) => {
                if (typeof obj[name] !== 'function') return;
                const orig = obj[name].bind(obj);
                try {
                    obj[name] = function () {
                        let result;
                        try {
                            result = orig.apply(this, arguments);
                        } catch (e) {
                            diag.errors.push(`${name} threw: ${e && e.message}`);
                            return result;
                        }
                        return mapper(result, arguments);
                    };
                    diag.wrappedFunctions.push(name);
                } catch (e) {
                    diag.errors.push(`failed to wrap ${name}: ${e && e.message}`);
                }
            };

            wrap(mp, 'getMementosData', (r) => Array.isArray(r) ? r.map(force) : r);

            if (typeof mp.supportsMemento === 'function') {
                const origSup = mp.supportsMemento.bind(mp);
                try {
                    mp.supportsMemento = function () {
                        try { origSup.apply(this, arguments); } catch (_) {}
                        return true;
                    };
                    diag.wrappedFunctions.push('supportsMemento');
                } catch (e) {
                    diag.errors.push(`failed to wrap supportsMemento: ${e && e.message}`);
                }
            }

            mp.__unlockAllMementosPatched = true;
        }

        // Patch Online.UserProfile.isRewardUnlocked → true
        if (Online.UserProfile && !Online.UserProfile.__unlockAllMementosPatched) {
            diag.userProfileSeen = true;
            const up = Online.UserProfile;
            if (typeof up.isRewardUnlocked === 'function') {
                const origIsUnlocked = up.isRewardUnlocked.bind(up);
                try {
                    up.isRewardUnlocked = function () {
                        try { origIsUnlocked.apply(this, arguments); } catch (_) {}
                        return true;
                    };
                    diag.wrappedFunctions.push('UserProfile.isRewardUnlocked');
                } catch (e) {
                    diag.errors.push(`failed to wrap isRewardUnlocked: ${e && e.message}`);
                }
            }
            up.__unlockAllMementosPatched = true;
        }

        // Patch GameSetup.getMementoFilteredPlayerParameters → extend
        // possibleValues with the full memento catalog so the per-slot
        // available set covers every memento.
        if (typeof GameSetup !== 'undefined' && GameSetup && !GameSetup.__unlockAllMementosPatched) {
            diag.gameSetupSeen = true;
            if (typeof GameSetup.getMementoFilteredPlayerParameters === 'function') {
                const origGet = GameSetup.getMementoFilteredPlayerParameters.bind(GameSetup);
                try {
                    GameSetup.getMementoFilteredPlayerParameters = function (playerId) {
                        const params = origGet(playerId);
                        try {
                            const allMementos = (typeof Online !== 'undefined' && Online.Metaprogression && Online.Metaprogression.getMementosData)
                                ? Online.Metaprogression.getMementosData()
                                : [];
                            if (Array.isArray(params) && allMementos.length > 0) {
                                for (const param of params) {
                                    if (!param || !param.domain || !Array.isArray(param.domain.possibleValues)) continue;
                                    const existing = new Set();
                                    for (const v of param.domain.possibleValues) {
                                        if (v && v.value != null) existing.add(v.value.toString());
                                    }
                                    const template = param.domain.possibleValues[param.domain.possibleValues.length - 1] || null;
                                    if (!template) continue;
                                    let added = 0;
                                    for (const m of allMementos) {
                                        const typeId = m && m.mementoTypeId;
                                        if (!typeId || existing.has(typeId.toString())) continue;
                                        param.domain.possibleValues.push({
                                            value: typeId,
                                            name: m.mementoName || template.name,
                                            description: m.flavorTextDesc || template.description,
                                            icon: m.icon || template.icon,
                                            additionalProperties: template.additionalProperties || [],
                                            invalidReason: 0 // 0 = Valid in GameSetupDomainValueInvalidReason
                                        });
                                        added++;
                                    }
                                    if (added > 0) {
                                        diag.domainExtendedSlots++;
                                        diag.domainAddedTotal += added;
                                    }
                                }
                                diag.domainExtended = true;
                            }
                        } catch (e) {
                            diag.errors.push(`domain extend: ${e && e.message}`);
                        }
                        return params;
                    };
                    diag.wrappedFunctions.push('GameSetup.getMementoFilteredPlayerParameters');
                } catch (e) {
                    diag.errors.push(`failed to wrap GameSetup.getMementoFilteredPlayerParameters: ${e && e.message}`);
                }
            }
            GameSetup.__unlockAllMementosPatched = true;
        }

        diag.patched = true;
        diag.patchedAt = Date.now();
        persistDiag();
        console.log(`${TAG} patched ${diag.wrappedFunctions.join(', ')}`);
        return true;
    }

    function attempt() {
        diag.attempts++;
        return patchMetaprogression();
    }

    persistDiag();
    if (attempt()) return;

    // Retry while engine subsystems boot. 50 ms × 400 = 20 s window.
    let attempts = 0;
    const maxAttempts = 400;
    const handle = setInterval(() => {
        attempts++;
        try {
            if (attempt() || attempts >= maxAttempts) {
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

    try {
        if (typeof engine !== 'undefined' && typeof engine.on === 'function') {
            engine.on('DNAUserProfileCacheReady', () => {
                if (attempt()) clearInterval(handle);
            });
        }
    } catch (e) {
        diag.errors.push(`engine.on hook: ${e && e.message}`);
        persistDiag();
    }
})();
