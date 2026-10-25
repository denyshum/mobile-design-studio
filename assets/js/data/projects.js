import { readRows, coverUrl, validId, text, unique } from './client.js';
import { createResource } from './resource.js';

const fields = 'id,name,category,description,task,solution,result,image_path,image_alt,image_width,image_height,facts,display_order';
const query = { select: fields, published: 'eq.true', order: 'display_order.asc,id.asc' };
const details = new Map();
const collections = new Map();

function hasKnownProjects() {
    return [...collections.values()].some(resource => resource.value.status === 'success' && resource.value.data.records.length > 0);
}

function normalize(record) {
    if (!validId(record.id) || !Number.isSafeInteger(record.display_order) || !Array.isArray(record.facts) || typeof record.image_path !== 'string' || !/^[a-zA-Z0-9/_-]+\.webp$/.test(record.image_path) || !Number.isSafeInteger(record.image_width) || !Number.isSafeInteger(record.image_height) || record.image_width <= 0 || record.image_height <= 0) {
        throw new Error('Несумісний запис проєкту');
    }
    return {
        id: record.id,
        name: text(record.name),
        category: text(record.category),
        description: text(record.description),
        task: text(record.task),
        solution: text(record.solution),
        result: text(record.result),
        image: coverUrl(record.id),
        imageAlt: text(record.image_alt),
        imageWidth: record.image_width,
        imageHeight: record.image_height,
        facts: record.facts.map(fact => ({ label: text(fact.label), value: text(fact.value) })),
    };
}

export const catalogResource = createResource(async signal => unique((await readRows('projects', query, signal)).map(normalize)));
export const projectPresence = createResource(async signal => (await readRows('projects', { select: 'id', published: 'eq.true', order: 'id.asc' }, signal, { first: true })).length > 0);
export const navigationProjects = createResource(async signal => {
    const rows = await readRows('projects', { select: 'id,name', published: 'eq.true', id: 'in.(wingriders,trackee,worldcoin,audience-plus)', order: 'id.asc' }, signal);
    return unique(rows.map(record => {
        if (!validId(record.id)) {
            throw new Error('Некоректний ID');
        }
        return { id: record.id, name: text(record.name) };
    }));
});

export function projectResource(id) {
    if (!details.has(id)) {
        details.set(id, createResource(async signal => {
            if (!validId(id)) {
                return null;
            }
            const rows = await readRows('projects', { ...query, id: 'eq.' + id }, signal);
            if (rows.length > 1) {
                throw new Error('Повтор ID');
            }
            return rows.length ? normalize(rows[0]) : null;
        }));
    }
    return details.get(id);
}

export function collectionResource(collection) {
    if (!['home_featured', 'home_slider'].includes(collection)) {
        throw new Error('Невідома добірка');
    }
    if (!collections.has(collection)) {
        collections.set(collection, createResource(async signal => {
            const rows = await readRows('project_placements', { select: 'position,project:projects!inner(' + fields + ')', collection: 'eq.' + collection, 'project.published': 'eq.true', order: 'position.asc' }, signal);
            const positions = new Set();
            const records = rows.map(row => {
                if (!Number.isSafeInteger(row.position) || row.position < 1 || (collection === 'home_featured' && row.position > 4) || positions.has(row.position)) {
                    throw new Error('Некоректна позиція добірки');
                }
                positions.add(row.position);
                return { ...normalize(row.project), position: row.position };
            });
            unique(records);
            let hasProjects = true;
            if (!records.length && !hasKnownProjects()) {
                const presence = await projectPresence.load();
                if (!hasKnownProjects()) {
                    if (presence.status !== 'success') {
                        throw new Error('Наявність проєктів невідома');
                    }
                    hasProjects = presence.data;
                }
            }
            return { records, hasProjects };
        }));
    }
    return collections.get(collection);
}
