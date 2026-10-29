import { backend } from './config.js';

export const editorSessionKey = 'mobilevision.editor.auth:' + backend.apiUrl;
export const editorEventsKey = 'mobilevision.editor.events:' + backend.apiUrl;

export class EditorRequestError extends Error {
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

    async function session() {
        const result = await sdk.auth.getSession();

        if (result.error) {
            throw new EditorRequestError('Увійдіть знову', {status:401, code:'SESSION_EXPIRED'});
        }

        return result.data.session;
    }

    async function request(route, { method = 'GET', body, headers = {}, signal, write = false } = {}) {
        const current = await session();

        if (!current) {
            throw new EditorRequestError('Увійдіть знову', {status:401, code:'SESSION_EXPIRED'});
        }

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
                throw new EditorRequestError(value.message || 'Не вдалося виконати дію', {
                    status:response.status, code:value.code, committed:write ? value.committed === false ? false : null : false,
                });
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
        }
    }

    async function read(view, parameters = {}, signal) {
        const query = new URLSearchParams({view, ...parameters});

        return request('editor-content?' + query, {signal});
    }

    async function catalog(entity, signal) {
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

    async function mutate(action, payload, expected = null, { operationId = crypto.randomUUID(), onSent } = {}) {
        const access = await read('access');
        const claims = JSON.parse(atob(access.mutation_permit.split('.')[0].replaceAll('-','+').replaceAll('_','/')));
        onSent?.({operationId, expiresAt:Date.parse(claims.expires_at)});

        return request('editor-content', {
            method:'POST', write:true, headers:{'Content-Type':'application/json'},
            body:JSON.stringify({action,payload,expected,operation_id:operationId,permit:access.mutation_permit}),
        });
    }

    async function upload(blob, context) {
        return request('project-cover-upload', {
            method:'POST', body:blob, headers:{'Content-Type':'image/webp','X-Cover-Context':JSON.stringify(context)},
        });
    }

    async function signOutLocal() {
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
        auth:sdk.auth,session,read,catalog,mutate,upload,request,signOutLocal,

        cancelLogoutRetry() { logoutToken = null; },
    };
}


