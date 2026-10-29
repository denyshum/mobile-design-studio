import { backend } from './config.js';

export const validId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;

function configuration() {
    const { apiUrl, publicKey } = backend;
    const url = new URL(apiUrl);

    if (!publicKey || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Джерело даних не налаштоване');
    }

    return backend;
}

export async function readRows(table, parameters, signal, { first = false } = {}) {
    const { apiUrl, publicKey } = configuration();
    const rows = [];
    const pageSize = first ? 1 : 500;
    let total;

    for (let offset = 0; ; offset += pageSize) {
        const query = new URLSearchParams({ ...parameters, limit: String(pageSize), offset: String(offset) });
        const headers = { apikey: publicKey, Prefer: 'count=exact' };

        if (publicKey.startsWith('eyJ')) {
            headers.Authorization = 'Bearer ' + publicKey;
        }

        const response = await fetch(apiUrl + '/rest/v1/' + table + '?' + query, { headers, signal, cache: 'no-store' });

        if (!response.ok) {
            throw new Error('Дані наразі недоступні');
        }

        const data = await response.json();
        const range = response.headers.get('content-range')?.match(/^(\d+)-(\d+)\/(\d+)$|^\*\/(\d+)$/);
        const count = range && Number(range[3] ?? range[4]);

        if (!Array.isArray(data) || !range || !Number.isSafeInteger(count) || (total !== undefined && total !== count)) {
            throw new Error('Несумісна відповідь джерела');
        }

        total = count;

        if (data.length && (Number(range[1]) !== offset || Number(range[2]) !== offset + data.length - 1)) {
            throw new Error('Неповна відповідь джерела');
        }

        rows.push(...data);

        if ((!data.length && total !== 0) || rows.length > total || rows.length > 100000) {
            throw new Error('Неповна відповідь джерела');
        }

        if (first || rows.length === total) {
            return rows;
        }

        offset += data.length - pageSize;
    }
}

export function coverUrl(id) {
    configuration();

    if (!validId(id)) {
        throw new Error('Некоректний ID');
    }

    return backend.apiUrl + '/functions/v1/project-cover?id=' + encodeURIComponent(id);
}

export function text(value, optional = false) {
    if (optional && (value === null || value === undefined)) {
        return '';
    }

    if (typeof value !== 'string' || (!optional && !value.trim())) {
        throw new Error('Некоректне текстове поле');
    }

    return value;
}

export function unique(records) {
    if (new Set(records.map(record => record.id)).size !== records.length) {
        throw new Error('Повтор запису у відповіді');
    }

    return records;
}
