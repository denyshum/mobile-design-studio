import { readRows, validId, text, unique } from './client.js';
import { createResource } from './resource.js';

export const vacancyResource = createResource(async signal => {
    const rows = await readRows('vacancies', { select: 'id,name,intro,format,employment,responsibilities,expectations,collaboration,salary,experience,display_order', status: 'eq.open', order: 'display_order.asc,id.asc' }, signal);
    return unique(rows.map(row => {
        if (!validId(row.id) || !Number.isSafeInteger(row.display_order)) {
            throw new Error('Несумісний запис вакансії');
        }
        const record = { id: row.id };
        for (const field of ['name', 'intro', 'format', 'employment', 'salary', 'experience']) {
            record[field] = text(row[field], ['salary', 'experience'].includes(field));
        }
        for (const field of ['responsibilities', 'expectations', 'collaboration']) {
            if (!Array.isArray(row[field])) {
                throw new Error('Некоректний список');
            }
            record[field] = row[field].map(value => text(value));
        }
        return record;
    }));
});
