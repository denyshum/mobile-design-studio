import { backend } from './config.js';
import { createCoverCache } from './editor-covers.js';

export const editorSessionKey = 'mobilevision.editor.auth:' + backend.apiUrl;
export const editorEventsKey = 'mobilevision.editor.events:' + backend.apiUrl;

class EditorRequestError extends Error {
    constructor(message, { status = 0, code = 'SOURCE_UNAVAILABLE', committed = false } = {}) {
        super(message);
        this.status = status;
        this.code = code;
        this.committed = committed;
    }
}


function sessionIdentity(token) {
    try {
        const payload = token?.split('.')[1];

        if (!payload) {
            return null;
        }

        const claims = JSON.parse(atob(payload.replaceAll('-','+').replaceAll('_','/')));

        return typeof claims.sub === 'string' && typeof claims.session_id === 'string' ? JSON.stringify([claims.sub,claims.session_id]) : null;
    } catch {
        return null;
    }
}

export function createEditorClient() {
    const { apiUrl, publicKey } = backend;

    if (!apiUrl || !publicKey || !globalThis.supabase?.createClient) {
        throw new EditorRequestError('Редактор поки недоступний');
    }

    const storageKey = editorSessionKey;
    let logoutToken;
    let identity = null;
    let privateVersion = 0;
    let permit;
    let permitRequest;
    let readVersion = 0;
    const readCache = new Map();
    const readRefreshes = new Map();
    const readListeners = new Set();
    const covers = createCoverCache(request);
    const resetListeners = new Set();
    const sdk = globalThis.supabase.createClient(apiUrl, publicKey, {
        auth: {
            persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
            storageKey,
        },
        global: {
            fetch:(input,init = {}) => fetch(input,{
                ...init,signal:init.signal ? AbortSignal.any([init.signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
            }),
        },
    });

    function clearReadCache() {
        readVersion += 1;
        readCache.clear();
        readRefreshes.clear();
    }

    function clearPrivateState() {
        clearReadCache();
        privateVersion += 1;
        permit = null;
        permitRequest = null;
        covers.clear();

        for (const listener of resetListeners) {
            listener();
        }
    }

    function setIdentity(current) {
        const next = sessionIdentity(current?.access_token);

        if (next !== identity) {
            clearPrivateState();
            identity = next;
        }
    }

    sdk.auth.onAuthStateChange?.((_event, current) => {
        setIdentity(current);
    });

    function rememberPermit(value, current, startedAt) {
        const claims = JSON.parse(atob(value.mutation_permit.split('.')[0].replaceAll('-', '+').replaceAll('_', '/')));
        const remaining = Date.parse(claims.expires_at) - Date.parse(value.server_time);
        const matches = claims.actor === JSON.parse(sessionIdentity(current.access_token) || '[]')[0];
        permit = matches && Number.isFinite(remaining) && remaining > 5000 ? {
            value: value.mutation_permit, claims,
            deadline: startedAt + Math.min(remaining, 60000) - 5000,
        } : null;
    }

    async function session() {
        const result = await sdk.auth.getSession();

        if (result.error) {
            clearPrivateState();
            throw new EditorRequestError('Увійдіть знову', {status:401, code:'SESSION_EXPIRED'});
        }

        setIdentity(result.data.session);

        return result.data.session;
    }

    async function request(route, { method = 'GET', body, headers = {}, signal, write = false } = {}) {
        const current = await session();

        if (!current) {
            throw new EditorRequestError('Увійдіть знову', {status:401, code:'SESSION_EXPIRED'});
        }

        if (write) {
            clearReadCache();
        }

        const version = privateVersion;
        const startedAt = performance.now();
        let response;

        try {
            response = await fetch(apiUrl + '/functions/v1/' + route, {
                method, body, headers:{apikey:publicKey, Authorization:'Bearer ' + current.access_token, ...headers},
                cache:'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
            });

            if (response.ok && route.startsWith('project-cover?')) {
                return response;
            }

            const value = await response.json();

            if (!response.ok) {
                permit = null;

                if ([401, 403].includes(response.status)) {
                    clearPrivateState();
                }

                throw new EditorRequestError(value.message || 'Не вдалося виконати дію', {
                    status:response.status, code:value.code, committed:write ? value.committed === false ? false : null : false,
                });
            }

            if (route === 'editor-content?view=access' && version === privateVersion) {
                rememberPermit(value, current, startedAt);
            }

            return value;
        } catch (error) {
            if (error instanceof EditorRequestError) {
                throw error;
            }

            if (signal?.aborted) {
                throw signal.reason;
            }

            throw new EditorRequestError(write ? 'Не вдалося підтвердити результат' : 'Не вдалося отримати дані', { committed:write ? null : false });
        } finally {
            if (write) {
                clearReadCache();
            }
        }
    }

    function rememberRead(key, value, expires = performance.now() + 10000) {
        if (value?.record === null || (Array.isArray(value?.records) && value.records.length > 200)) {
            return;
        }
        if (readCache.size >= 32 && !readCache.has(key)) {
            readCache.delete(readCache.keys().next().value);
        }
        readCache.set(key, { value: structuredClone(value), expires });
    }

    async function refreshRead(key, load, signal, previous, background = false) {
        const version = readVersion;
        const owner = identity;
        try {
            const value = await load(background);
            signal?.throwIfAborted();
            if (version === readVersion) {
                rememberRead(key, value);
                if (background) {
                    const changed = JSON.stringify(previous) !== JSON.stringify(value);
                    readListeners.forEach(listener => listener({ key, changed }));
                }
            }
            return value;
        } catch (error) {
            if (!background) {
                throw error;
            }
            if (owner === identity && (version === readVersion || [401, 403].includes(error.status))) {
                readListeners.forEach(listener => listener({ key, error }));
            }
        }
    }

    async function cachedRead(key, load, signal, { fresh = false } = {}, source) {
        const current = await session();
        if (!current) {
            throw new EditorRequestError('Увійдіть знову', { status: 401, code: 'SESSION_EXPIRED' });
        }
        signal?.throwIfAborted();
        if (fresh) {
            readVersion += 1;
            readRefreshes.clear();
            readCache.delete(key);
        }
        const cached = readCache.get(key) || source?.();
        if (!fresh && cached) {
            if (cached.expires <= performance.now() && !readRefreshes.has(key)) {
                const pending = refreshRead(key, load, undefined, cached.value, true);
                readRefreshes.set(key, pending);
                pending.finally(() => {
                    if (readRefreshes.get(key) === pending) {
                        readRefreshes.delete(key);
                    }
                });
            }
            return structuredClone(cached.value);
        }
        return refreshRead(key, load, signal);
    }

    function rememberMutation(action, result, previous) {
        const entity = action.startsWith('project.') ? 'projects' : action.startsWith('vacancy.') ? 'vacancies' : null;
        for (const [key, entry] of previous) {
            if (key === 'read:view=collections' && (entity === 'projects' || action === 'collection.replace')) {
                continue;
            }
            if (key === 'catalog:' + entity) {
                if (!result.record || !action.match(/\.(update|visibility)$/)) {
                    continue;
                }
                const value = structuredClone(entry.value);
                value.records = value.records.map(record => record.id === result.record.id ? result.record : record);
                rememberRead(key, value, 0);
            } else if (key.startsWith('read:view=' + (entity === 'projects' ? 'project' : 'vacancy') + '&') && entity) {
                const query = new URLSearchParams(key.slice(5));
                if (query.get('id') === result.record?.id) {
                    rememberRead(key, { record: result.record });
                } else if (!action.endsWith('.delete')) {
                    rememberRead(key, entry.value, 0);
                }
            } else if (action !== 'catalog.reorder' || !key.startsWith('catalog:')) {
                rememberRead(key, entry.value, 0);
            }
        }
        if (entity && result.record) {
            rememberRead('read:' + new URLSearchParams({ view: entity === 'projects' ? 'project' : 'vacancy', id: result.record.id }), { record: result.record });
        }
    }

    async function read(view, parameters = {}, signal, options) {
        const query = new URLSearchParams({view, ...parameters});
        const load = background => request('editor-content?' + query, {signal:background ? undefined : signal});

        if (view === 'access' && !options?.retainReads) {
            clearReadCache();
        }

        const source = () => {
            if (!['project', 'vacancy'].includes(view) || Object.keys(parameters).length !== 1 || typeof parameters.id !== 'string') {
                return null;
            }

            const catalog = readCache.get('catalog:' + (view === 'project' ? 'projects' : 'vacancies'));
            const record = catalog?.value.records.find(record => record.id === parameters.id);

            return record ? { value: { record }, expires: catalog.expires } : null;
        };

        return ['project', 'vacancy', 'collections'].includes(view)
            ? cachedRead('read:' + query, load, signal, options, source)
            : load();
    }

    function catalog(entity, signal, options) {
        return ['projects', 'vacancies'].includes(entity)
            ? cachedRead('catalog:' + entity, background => loadCatalog(entity, background ? undefined : signal), signal, options)
            : loadCatalog(entity, signal);
    }

    async function loadCatalog(entity, signal) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const records = [];
            let next;
            let snapshot;
            let digest;
            const cursors = new Set();

            try {
                do {
                    const page = await read(entity, {...(next ? {cursor:JSON.stringify(next),snapshot} : {})}, signal);

                    if (!Array.isArray(page.records) || !page.snapshot_digest || !page.order_digest || (snapshot && snapshot !== page.snapshot_digest)) {
                        throw new EditorRequestError('Список змінився. Оновіть сторінку');
                    }

                    snapshot = page.snapshot_digest;
                    digest = page.order_digest;
                    records.push(...page.records);
                    next = page.next_cursor;

                    if (next) {
                        const key = JSON.stringify(next);

                        if (cursors.has(key) || records.length > 100000) {
                            throw new EditorRequestError('Не вдалося отримати повний список');
                        }

                        cursors.add(key);
                    }
                } while (next);

                if (new Set(records.map(item => item.id)).size !== records.length) {
                    throw new EditorRequestError('Не вдалося отримати повний список');
                }

                return {records, order_digest:digest, snapshot_digest:snapshot};
            } catch (error) {
                if (error.code !== 'SNAPSHOT_CHANGED' || attempt === 1) {
                    throw error;
                }
            }
        }
    }

    async function briefs(filter = 'active', signal) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const records = [];
            const cursors = new Set();
            let cursor;
            let snapshot;
            let counts;
            try {
                do {
                    const page = await read('briefs', { filter, ...(cursor ? { cursor: JSON.stringify(cursor), snapshot } : {}) }, signal);
                    if (!Array.isArray(page.records) || typeof page.snapshot_digest !== 'string' || !page.counts || (snapshot && page.snapshot_digest !== snapshot)) {
                        throw new EditorRequestError('Список змінився. Спробуйте ще раз', { code: 'SNAPSHOT_CHANGED' });
                    }
                    snapshot = page.snapshot_digest;
                    counts = page.counts;
                    records.push(...page.records);
                    cursor = page.next_cursor;
                    if (cursor) {
                        const encoded = JSON.stringify(cursor);
                        if (cursors.has(encoded)) {
                            throw new EditorRequestError('Не вдалося отримати повний список');
                        }
                        cursors.add(encoded);
                    }
                } while (cursor);
                if (new Set(records.map(record => record.id)).size !== records.length) {
                    throw new EditorRequestError('Не вдалося отримати повний список');
                }
                return { records, counts, snapshot_digest: snapshot };
            } catch (error) {
                if (error.code !== 'SNAPSHOT_CHANGED' || attempt === 2) {
                    throw error;
                }
            }
        }
    }

    async function prepareMutation({ fresh = false } = {}) {
        await session();
        const version = privateVersion;
        let access = !fresh && permit?.deadline > performance.now() ? permit : null;

        if (!access) {
            if (!permitRequest) {
                const pending = request('editor-content?view=access').then(value => ({
                    value: value.mutation_permit,
                    claims: JSON.parse(atob(value.mutation_permit.split('.')[0].replaceAll('-', '+').replaceAll('_', '/'))),
                }));
                permitRequest = pending;
                const settled = () => {
                    if (permitRequest === pending) {
                        permitRequest = null;
                    }
                };
                pending.then(settled, settled);
            }

            access = await permitRequest;
        }

        if (version !== privateVersion) {
            throw new EditorRequestError('Увійдіть знову', { status: 401, code: 'SESSION_EXPIRED' });
        }

        return access;
    }

    async function mutate(action, payload, expected = null, { operationId = crypto.randomUUID(), onSent } = {}) {
        await session();
        const version = privateVersion;
        const previousReads = new Map(readCache);
        const uploadedCover = Boolean(payload.cover_ticket || payload.cover?.mode === 'replace');
        const access = await prepareMutation({ fresh: uploadedCover });

        if (version !== privateVersion) {
            throw new EditorRequestError('Увійдіть знову', { status: 401, code: 'SESSION_EXPIRED' });
        }

        const { claims } = access;
        onSent?.({operationId, expiresAt:Date.parse(claims.expires_at)});

        const send = value => request('editor-content', {
            method:'POST', write:true, headers:{'Content-Type':'application/json'},
            body:JSON.stringify({action,payload,expected,operation_id:operationId,permit:value}),
        });

        const finish = async value => {
            const result = await send(value);
            if (version === privateVersion) {
                rememberMutation(action, result, previousReads);
            }
            return result;
        };

        try {
            return await finish(access.value);
        } catch (error) {
            if (uploadedCover || error.code !== 'PERMIT_EXPIRED' || error.committed !== false) {
                throw error;
            }

            const fresh = await read('access');

            if (version !== privateVersion) {
                throw new EditorRequestError('Увійдіть знову', { status: 401, code: 'SESSION_EXPIRED' });
            }

            const renewed = JSON.parse(atob(fresh.mutation_permit.split('.')[0].replaceAll('-', '+').replaceAll('_', '/')));
            onSent?.({operationId, expiresAt:Date.parse(renewed.expires_at)});

            return await finish(fresh.mutation_permit);
        } finally {
            if (action.endsWith('.delete')) {
                permit = null;
            }
        }
    }

    async function upload(blob, context) {
        return request('project-cover-upload', {
            method:'POST', body:blob, headers:{'Content-Type':'image/webp','X-Cover-Context':JSON.stringify(context)},
        });
    }

    async function signOutLocal() {
        clearPrivateState();
        const current = logoutToken ? null : await session();
        const token = logoutToken || current?.access_token;

        try {
            if (logoutToken) {
                const response = await fetch(apiUrl + '/auth/v1/logout?scope=local',{
                    method:'POST',headers:{apikey:publicKey,Authorization:'Bearer ' + logoutToken},
                    signal:AbortSignal.timeout(30000),
                });
                await response.arrayBuffer();

                if (!response.ok && ![401,403,404].includes(response.status)) {
                    throw new EditorRequestError('Не вдалося підтвердити вихід');
                }
            } else {
                const {error} = await sdk.auth.signOut({scope:'local'});

                if (error) {
                    throw new EditorRequestError('Не вдалося підтвердити вихід');
                }
            }

            logoutToken = null;
        } catch (error) {
            logoutToken = token;
            throw error;
        } finally {
            await sdk.auth.stopAutoRefresh();
            let saved;

            try {
                saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
            } catch {
                localStorage.removeItem(storageKey);
            }

            const identity = sessionIdentity(token);

            if (!saved || saved.access_token === token || (identity && sessionIdentity(saved.access_token) === identity)) {
                localStorage.removeItem(storageKey);
                localStorage.removeItem(storageKey + '-code-verifier');
            }
        }
    }

    return {
        auth:sdk.auth,session,read,catalog,briefs,mutate,upload,request,signOutLocal,clearPrivateState,clearReadCache,

        prepareMutation,

        onReadRefresh(listener) {
            readListeners.add(listener);
            return () => readListeners.delete(listener);
        },

        onPrivateStateClear(listener) {
            resetListeners.add(listener);

            return () => resetListeners.delete(listener);
        },

        async cover(record, signal) {
            await session();

            return covers.load(record, signal);
        },

        forgetCover(record) {
            covers.forget(record);
        },

        async rememberCover(record, blob, token) {
            await session();

            if (identity && identity === sessionIdentity(token)) {
                covers.remember(record, blob);
            }
        },

        cancelLogoutRetry() { logoutToken = null; },
    };
}


