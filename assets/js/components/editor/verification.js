function normalized(value) {
    if (typeof value === 'string') {
        return value.replace(/\r\n?/g,'\n').trim();
    }

    if (Array.isArray(value)) {
        return value.map(normalized);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key,normalized(value[key])]));
    }

    return value;
}

export function sameContent(left,right) {
    return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

function attachedPath(ticket) {
    const claims = JSON.parse(atob(ticket.split('.')[0].replaceAll('-','+').replaceAll('_','/')));

    return claims.path.replace(/^pending[/]/,'uploads/');
}

export async function verifyMutation(client, operation) {
    const {action,payload,expected,operationId,context = {}} = operation;
    const access = await client.read('access');
    const settled = Date.parse(access.server_time) > operation.expiresAt + 8000;
    let result;
    let matches = false;

    if (action.endsWith('.create') || action.endsWith('.update') || action.endsWith('.visibility') || action.endsWith('.delete')) {
        const kind = action.startsWith('project.') ? 'project' : 'vacancy';
        let record;

        if (action.endsWith('.create')) {
            record = (await client.read('creation-result',{entity:kind === 'project' ? 'projects' : 'vacancies',id:operationId})).record;
        } else {
            try {
                record = (await client.read(kind,{id:context.id})).record;
            } catch (error) {
                if (error.status !== 404) {
                    throw error;
                }

                record = null;
            }
        }

        const identity = record && (action.endsWith('.create') || record.record_token === expected.record_token);

        if (action.endsWith('.delete')) {
            matches = !record || record.record_token !== expected.record_token;
            result = {result:'deleted',record_token:expected.record_token};
        } else if (identity) {
            const wanted = Object.fromEntries(Object.entries(payload).filter(([key]) => !['base_slug','cover','cover_ticket'].includes(key)));
            matches = sameContent(wanted,Object.fromEntries(Object.keys(wanted).map(key => [key,record[key]])));

            if (payload.cover_ticket || payload.cover?.mode === 'replace') {
                matches &&= record.image_path === attachedPath(payload.cover_ticket || payload.cover.ticket);
            } else if (payload.cover?.mode === 'keep') {
                matches &&= record.image_path === context.coverBefore;
            }

            result = {record,result:'saved'};
        }
    } else if (action === 'catalog.reorder') {
        const actual = await client.catalog(payload.entity);
        matches = sameContent(actual.records.map(record => [record.id,record.record_token]),payload.ordered_ids.map(id => [id,context.tokens[id]]));
        result = {order_digest:actual.order_digest};
    } else if (action === 'collection.replace') {
        const actual = (await client.read('collections'))[payload.collection];
        const projects = await client.catalog('projects');
        const liveTokens = Object.fromEntries(projects.records.map(record => [record.id,record.record_token]));
        matches = sameContent(actual.items,payload.items) && payload.items.every(item => liveTokens[item.project_id] === context.tokens[item.project_id]);
        result = {collection:actual};
    }

    return {matches,settled,result};
}

