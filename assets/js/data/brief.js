import { backend } from './config.js';

class BriefRequestError extends Error {
    constructor(message, { status = 0, fields, retryAfter = 0 } = {}) {
        super(message);
        this.status = status;
        this.fields = fields;
        this.retryAfter = retryAfter;
    }
}

export function createBriefSubmission({
    apiUrl = backend.apiUrl,
    publicKey = backend.publicKey,
    fetch: upstream = globalThis.fetch,
} = {}) {
    let attempt;
    let busy = false;

    async function request(body) {
        if (!apiUrl || !publicKey) {
            throw new BriefRequestError('Надсилання тимчасово недоступне');
        }
        let response;
        try {
            response = await upstream(apiUrl + '/functions/v1/brief-submit', {
                method: 'POST',
                credentials: 'omit',
                cache: 'no-store',
                redirect: 'error',
                headers: { apikey: publicKey, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(20000),
            });
            const value = await response.json();
            if (!response.ok) {
                throw new BriefRequestError(value.message || 'Не вдалося надіслати запит', {
                    status: response.status,
                    fields: value.fields,
                    retryAfter: Math.max(0, Number(response.headers.get('Retry-After')) || 0),
                });
            }
            return value;
        } catch (error) {
            if (error instanceof BriefRequestError) {
                throw error;
            }
            throw new BriefRequestError('Не вдалося отримати відповідь сервера');
        }
    }

    async function check() {
        if (!attempt) {
            return { outcome: 'not_saved' };
        }
        const result = await request({ action: 'result', receipt: attempt.receipt });
        if (
            result.operation_id !== attempt.operation_id ||
            !['accepted', 'unknown', 'not_saved'].includes(result.outcome)
        ) {
            throw new BriefRequestError('Не вдалося підтвердити отримання');
        }
        if (result.outcome !== 'unknown') {
            attempt = null;
        }
        return result;
    }

    async function submit(data) {
        if (busy) {
            throw new BriefRequestError('Зачекайте завершення поточної дії');
        }
        busy = true;
        try {
            if (attempt) {
                try {
                    return await check();
                } catch (error) {
                    return { outcome: 'unknown', retryAfter: error.retryAfter || 0 };
                }
            }
            const snapshot = Object.freeze({ ...data });
            const prepared = await request({ action: 'prepare', data: snapshot });
            if (
                typeof prepared.receipt !== 'string' ||
                typeof prepared.permit !== 'string' ||
                typeof prepared.operation_id !== 'string'
            ) {
                throw new BriefRequestError('Не вдалося підготувати надсилання');
            }
            attempt = prepared;
            try {
                const result = await request({
                    action: 'submit',
                    operation_id: prepared.operation_id,
                    permit: prepared.permit,
                    data: snapshot,
                });
                if (result.operation_id !== prepared.operation_id || result.outcome !== 'accepted') {
                    throw new BriefRequestError('Не вдалося підтвердити отримання');
                }
                attempt = null;
                return result;
            } catch (error) {
                if ([400, 409, 410, 422].includes(error.status)) {
                    attempt = null;
                    throw error;
                }
                try {
                    return await check();
                } catch (error) {
                    return { outcome: 'unknown', retryAfter: error.retryAfter || 0 };
                }
            }
        } finally {
            busy = false;
        }
    }

    return {
        submit,
        check,
        get pending() {
            return Boolean(attempt);
        },
    };
}
